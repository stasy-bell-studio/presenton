import asyncio
import uuid
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from openai import AuthenticationError, BadRequestError, RateLimitError

from models.image_prompt import ImagePrompt
from models.sql.slide import SlideModel
from services.image_generation_service import ImageGenerationService
from utils.image_generation_error import normalize_image_generation_error
from utils.llm_client_error_handler import handle_llm_client_exceptions
from utils.process_slides import (
    process_old_and_new_slides_and_fetch_assets,
    process_slide_and_fetch_assets,
)
from utils.provider_error_messages import (
    IMAGE_MODERATION_MESSAGE,
    INVALID_API_KEY_MESSAGE,
)


def _quota_error() -> RateLimitError:
    request = httpx.Request("POST", "https://api.openai.com/v1/images/generations")
    response = httpx.Response(429, request=request)
    return RateLimitError(
        "You exceeded your current quota.",
        response=response,
        body={
            "error": {
                "message": "You exceeded your current quota.",
                "code": "insufficient_quota",
            }
        },
    )


def _auth_error() -> AuthenticationError:
    request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
    response = httpx.Response(401, request=request)
    return AuthenticationError(
        "Error code: 401 - Incorrect API key provided: sk-proj-secret",
        response=response,
        body={
            "error": {
                "message": "Incorrect API key provided: sk-proj-secret",
                "type": "authentication_error",
                "code": "invalid_api_key",
            }
        },
    )


def _moderation_error() -> BadRequestError:
    request = httpx.Request("POST", "https://api.openai.com/v1/images/generations")
    response = httpx.Response(400, request=request)
    return BadRequestError(
        "Error code: 400 - moderation_blocked public-figure",
        response=response,
        body={
            "error": {
                "message": "Your request was rejected by the safety system.",
                "type": "image_generation_user_error",
                "code": "moderation_blocked",
                "moderation_details": {
                    "moderation_stage": "input",
                    "categories": ["public-figure"],
                },
            }
        },
    )


def test_normalize_image_generation_error_preserves_openai_quota_status():
    normalized = normalize_image_generation_error(_quota_error())

    assert normalized.status_code == 429
    assert "API quota is unavailable" in normalized.detail
    assert "billing" in normalized.detail


def test_normalize_openai_auth_error_hides_raw_provider_response():
    normalized = normalize_image_generation_error(_auth_error())

    assert normalized.status_code == 401
    assert normalized.detail == INVALID_API_KEY_MESSAGE
    assert "sk-proj" not in normalized.detail
    assert "invalid_api_key" not in normalized.detail


def test_normalize_openai_moderation_error_hides_raw_provider_response():
    normalized = normalize_image_generation_error(_moderation_error())

    assert normalized.status_code == 400
    assert normalized.detail == IMAGE_MODERATION_MESSAGE
    assert "moderation_blocked" not in normalized.detail
    assert "public-figure" not in normalized.detail


def test_llm_error_handler_preserves_openai_quota_status():
    normalized = handle_llm_client_exceptions(_quota_error())

    assert normalized.status_code == 429
    assert "API quota is unavailable" in normalized.detail


def test_llm_error_handler_hides_openai_auth_raw_provider_response():
    normalized = handle_llm_client_exceptions(_auth_error())

    assert normalized.status_code == 401
    assert normalized.detail == INVALID_API_KEY_MESSAGE
    assert "sk-proj" not in normalized.detail
    assert "invalid_api_key" not in normalized.detail


def test_image_generation_service_raises_provider_error_instead_of_placeholder():
    service = object.__new__(ImageGenerationService)
    service.output_directory = "/tmp"
    service.is_image_generation_disabled = False
    service.is_stock_provider_selected = lambda: False
    service.image_gen_func = AsyncMock(side_effect=_quota_error())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(service.generate_image(ImagePrompt(prompt="business dashboard")))

    assert exc.value.status_code == 429
    assert "billing" in exc.value.detail


def test_image_generation_service_preserves_existing_http_exception():
    service = object.__new__(ImageGenerationService)
    service.output_directory = "/tmp"
    service.is_image_generation_disabled = False
    service.is_stock_provider_selected = lambda: False
    provider_error = HTTPException(status_code=401, detail="Invalid provider key")
    service.image_gen_func = AsyncMock(side_effect=provider_error)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(service.generate_image(ImagePrompt(prompt="business dashboard")))

    assert exc.value is provider_error


def test_slide_asset_processing_can_fallback_with_visible_warning():
    slide = SlideModel(
        presentation=uuid.uuid4(),
        layout_group="general",
        layout="layout-1",
        index=0,
        content={
            "image": {
                "__image_prompt__": "business dashboard",
                "__image_url__": "/static/images/placeholder.jpg",
            }
        },
        properties=None,
    )
    image_generation_service = AsyncMock()
    image_generation_service.generate_image.side_effect = normalize_image_generation_error(
        _quota_error()
    )
    warnings: list[dict] = []

    assets = asyncio.run(
        process_slide_and_fetch_assets(
            image_generation_service=image_generation_service,
            slide=slide,
            allow_image_fallback=True,
            image_warnings=warnings,
        )
    )

    assert assets == []
    assert slide.content["image"]["__image_url__"].endswith(
        "/static/images/placeholder.jpg"
    )
    assert warnings == [
        {
            "status_code": 429,
            "detail": (
                "OpenAI image generation failed because API quota is unavailable. "
                "Check OpenAI API billing and the limits for the project that owns this API key."
            ),
            "code": "insufficient_quota",
        }
    ]


def test_slide_asset_processing_moderation_warning_is_user_friendly():
    slide = SlideModel(
        presentation=uuid.uuid4(),
        layout_group="general",
        layout="layout-1",
        index=0,
        content={
            "image": {
                "__image_prompt__": "public figure portrait",
                "__image_url__": "/static/images/placeholder.jpg",
            }
        },
        properties=None,
    )
    image_generation_service = AsyncMock()
    image_generation_service.generate_image.side_effect = normalize_image_generation_error(
        _moderation_error()
    )
    warnings: list[dict] = []

    assets = asyncio.run(
        process_slide_and_fetch_assets(
            image_generation_service=image_generation_service,
            slide=slide,
            allow_image_fallback=True,
            image_warnings=warnings,
        )
    )

    assert assets == []
    assert warnings[0]["detail"] == IMAGE_MODERATION_MESSAGE
    assert "moderation_blocked" not in warnings[0]["detail"]
    assert "public-figure" not in warnings[0]["detail"]


def test_slide_edit_asset_processing_can_fallback_with_visible_warning():
    old_content = {}
    new_content = {
        "image": {
            "__image_prompt__": "public figure portrait",
            "__image_url__": "/static/images/placeholder.jpg",
        }
    }
    image_generation_service = AsyncMock()
    image_generation_service.generate_image.side_effect = normalize_image_generation_error(
        _moderation_error()
    )
    warnings: list[dict] = []

    assets = asyncio.run(
        process_old_and_new_slides_and_fetch_assets(
            image_generation_service=image_generation_service,
            old_slide_content=old_content,
            new_slide_content=new_content,
            allow_image_fallback=True,
            image_warnings=warnings,
        )
    )

    assert assets == []
    assert new_content["image"]["__image_url__"].endswith(
        "/static/images/placeholder.jpg"
    )
    assert warnings[0]["detail"] == IMAGE_MODERATION_MESSAGE
