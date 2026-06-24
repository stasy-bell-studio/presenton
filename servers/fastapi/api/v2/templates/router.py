import asyncio
import logging
import os
import random
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from functools import partial
from typing import Any, Optional
from urllib.parse import unquote, urlparse
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query, Response
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.sql.template_v2 import TemplateV2
from services.database import get_async_session
from services.export_task_service import EXPORT_TASK_SERVICE
from templates.v2.generation import (
    generate_slide_layout,
    generate_template,
    merge_similar_components,
)
from templates.v2.models.layouts import (
    MergedComponents,
    RawSlideLayouts,
    SlideLayout,
    SlideLayouts,
)
from utils.asset_directory_utils import resolve_app_path_to_filesystem
from utils.file_utils import get_original_file_name


TEMPLATES_V2_ROUTER = APIRouter(prefix="/templates", tags=["Templates V2"])
LOGGER = logging.getLogger(__name__)


class CreateTemplateV2Request(BaseModel):
    pptx_url: str
    slide_image_urls: list[str]
    fonts: dict[str, Any] = Field(default_factory=dict)
    name: Optional[str] = None
    description: Optional[str] = None


class ReconstructTemplateV2LayoutRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    template_id: uuid.UUID = Field(validation_alias=AliasChoices("template_id", "id"))
    index: int = Field(ge=0)


class PatchTemplateV2SlideLayoutRequest(BaseModel):
    index: int = Field(ge=0)
    layout: SlideLayout


class TemplateV2ListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: Optional[str] = None
    layout_count: int = 0
    created_at: datetime
    updated_at: datetime


class TemplateV2ListResponse(BaseModel):
    items: list[TemplateV2ListItem]
    total: int
    page: int
    page_size: int


class TemplateV2Response(TemplateV2ListItem):
    raw_layouts: Optional[dict[str, Any]] = None
    components: Optional[dict[str, Any]] = None
    merged_components: Optional[dict[str, Any]] = None
    layouts: dict[str, Any]
    assets: Optional[dict[str, Any]] = None


def _derive_template_name(pptx_url: str, pptx_path: str) -> str:
    source = pptx_path or unquote(urlparse(pptx_url).path) or pptx_url
    basename = os.path.basename(source.rstrip("/"))
    if "----" in basename:
        basename = get_original_file_name(basename)
    name = os.path.splitext(basename)[0].strip()
    return name or "Untitled template"


def _collect_image_urls_from_layouts(layouts_json: dict[str, Any]) -> list[str]:
    images: list[str] = []
    seen: set[str] = set()

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            if value.get("type") == "image":
                image_data = value.get("data")
                if isinstance(image_data, str):
                    image_url = image_data.strip()
                    if image_url and image_url not in seen:
                        seen.add(image_url)
                        images.append(image_url)

            for child_value in value.values():
                visit(child_value)
            return

        if isinstance(value, list):
            for item in value:
                visit(item)

    visit(layouts_json)
    return images


def _count_layouts(layouts_json: Any) -> int:
    if isinstance(layouts_json, dict):
        layouts = layouts_json.get("layouts")
        return len(layouts) if isinstance(layouts, list) else 0
    if isinstance(layouts_json, list):
        return len(layouts_json)
    return 0


async def _generate_slide_layouts(
    raw_layouts: RawSlideLayouts,
    slide_image_urls: list[str],
) -> SlideLayouts:
    LOGGER.info(
        "[templates.v2.create] slide layout generation start slides=%d",
        len(raw_layouts.layouts),
    )
    try:
        generated_layouts = await _run_template_generation_thread(
            generate_template,
            raw_layouts,
            slide_image_urls,
        )
        layouts = _coerce_generated_slide_layouts(generated_layouts)
    except (ValidationError, ValueError) as exc:
        LOGGER.exception(
            "[templates.v2.create] slide layout generation produced invalid output "
            "slides=%d",
            len(raw_layouts.layouts),
        )
        raise HTTPException(
            status_code=500,
            detail="Slide layout generation produced invalid output",
        ) from exc

    LOGGER.info(
        "[templates.v2.create] slide layout generation complete slides=%d "
        "components=%d",
        len(layouts.layouts),
        sum(len(layout.components) for layout in layouts.layouts),
    )
    return layouts


async def _merge_generated_components(layouts: SlideLayouts) -> MergedComponents:
    LOGGER.info(
        "[templates.v2.create] component de-duplication start components=%d",
        sum(len(layout.components) for layout in layouts.layouts),
    )
    try:
        merged_components = await _run_template_generation_thread(
            merge_similar_components,
            layouts,
        )
    except (ValidationError, ValueError) as exc:
        LOGGER.exception(
            "[templates.v2.create] component de-duplication produced invalid output"
        )
        raise HTTPException(
            status_code=500,
            detail="Component de-duplication produced invalid output",
        ) from exc

    LOGGER.info(
        "[templates.v2.create] component de-duplication complete merged_components=%d",
        len(merged_components.components),
    )
    return merged_components


async def _run_template_generation_thread(func: Any, *args: Any) -> Any:
    loop = asyncio.get_running_loop()
    with ThreadPoolExecutor(
        max_workers=1,
        thread_name_prefix="template-v2-generation",
    ) as executor:
        return await loop.run_in_executor(executor, partial(func, *args))


def _coerce_generated_slide_layouts(generated_layouts: Any) -> SlideLayouts:
    if isinstance(generated_layouts, SlideLayouts):
        return generated_layouts
    return SlideLayouts.model_validate(generated_layouts)


def _coerce_template_slide_layouts(layouts_json: Any) -> SlideLayouts:
    if isinstance(layouts_json, SlideLayouts):
        return layouts_json
    if isinstance(layouts_json, list):
        return SlideLayouts.model_validate({"layouts": layouts_json})
    return SlideLayouts.model_validate(layouts_json)


def _with_randomized_layout_ids(layouts: SlideLayouts) -> SlideLayouts:
    return SlideLayouts(
        layouts=[
            layout.model_copy(
                deep=True,
                update={
                    "id": f"{layout.id}_{random.randint(1000, 9999)}",
                },
            )
            for layout in layouts.layouts
        ]
    )


def _get_template_slide_image_urls(template: TemplateV2) -> list[str | None]:
    if not isinstance(template.assets, dict):
        return []

    slide_image_urls = template.assets.get("slide_image_urls")
    if not isinstance(slide_image_urls, list):
        return []

    return [
        slide_image_url.strip()
        if isinstance(slide_image_url, str) and slide_image_url.strip()
        else None
        for slide_image_url in slide_image_urls
    ]


@TEMPLATES_V2_ROUTER.get("", response_model=TemplateV2ListResponse)
async def list_templates_v2(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sql_session: AsyncSession = Depends(get_async_session),
):
    offset = (page - 1) * page_size
    total = await sql_session.scalar(select(func.count()).select_from(TemplateV2))
    result = await sql_session.execute(
        select(
            TemplateV2.id,
            TemplateV2.name,
            TemplateV2.description,
            TemplateV2.layouts,
            TemplateV2.created_at,
            TemplateV2.updated_at,
        )
        .order_by(TemplateV2.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )

    items = [
        TemplateV2ListItem(
            id=template_id,
            name=name,
            description=description,
            layout_count=_count_layouts(layouts),
            created_at=created_at,
            updated_at=updated_at,
        )
        for template_id, name, description, layouts, created_at, updated_at in result.all()
    ]
    return TemplateV2ListResponse(
        items=items,
        total=total or 0,
        page=page,
        page_size=page_size,
    )


@TEMPLATES_V2_ROUTER.post(
    "",
    status_code=201,
    response_model=TemplateV2Response,
)
async def create_template_v2(
    request: CreateTemplateV2Request = Body(...),
    sql_session: AsyncSession = Depends(get_async_session),
):
    LOGGER.info(
        "[templates.v2.create] request received pptx_url=%s slide_images=%d "
        "font_count=%d has_name=%s",
        request.pptx_url,
        len(request.slide_image_urls),
        len(request.fonts or {}),
        bool((request.name or "").strip()),
    )
    if not request.slide_image_urls:
        LOGGER.warning(
            "[templates.v2.create] rejected request without slide images "
            "pptx_url=%s",
            request.pptx_url,
        )
        raise HTTPException(
            status_code=400, detail="At least one slide image is required"
        )

    pptx_path = resolve_app_path_to_filesystem(request.pptx_url)
    if not pptx_path or not os.path.isfile(pptx_path):
        LOGGER.warning(
            "[templates.v2.create] rejected request; PPTX file not found "
            "pptx_url=%s resolved_path=%s",
            request.pptx_url,
            pptx_path,
        )
        raise HTTPException(status_code=400, detail="PPTX file not found")

    LOGGER.info(
        "[templates.v2.create] converting PPTX to JSON pptx_path=%s",
        pptx_path,
    )
    pptx_json = await EXPORT_TASK_SERVICE.convert_pptx_to_json(pptx_path)
    try:
        raw_layouts = RawSlideLayouts.model_validate(
            pptx_json.model_dump(mode="json")
        )
    except ValidationError as exc:
        LOGGER.exception(
            "[templates.v2.create] PPTX-to-JSON export produced invalid slide "
            "layout JSON pptx_path=%s",
            pptx_path,
        )
        raise HTTPException(
            status_code=500,
            detail="PPTX-to-JSON export produced invalid slide layout JSON",
        ) from exc
    LOGGER.info(
        "[templates.v2.create] PPTX-to-JSON validation complete pptx_path=%s "
        "slides=%d",
        pptx_path,
        len(raw_layouts.layouts),
    )

    if len(request.slide_image_urls) != len(raw_layouts.layouts):
        raise HTTPException(
            status_code=400,
            detail="Exactly one slide image is required for each slide layout",
        )

    generated_layouts = await _generate_slide_layouts(
        raw_layouts,
        request.slide_image_urls,
    )
    generated_layouts = _with_randomized_layout_ids(generated_layouts)
    merged_components = await _merge_generated_components(generated_layouts)
    raw_layouts_json = pptx_json.model_dump(mode="json", exclude_none=True)
    template = TemplateV2(
        name=(request.name or "").strip() or _derive_template_name(
            request.pptx_url, pptx_path
        ),
        description=request.description,
        raw_layouts=raw_layouts_json,
        merged_components=merged_components.model_dump(
            mode="json", exclude_none=True
        ),
        layouts=generated_layouts.model_dump(mode="json", exclude_none=True),
        assets={
            "fonts": request.fonts or {},
            "slide_image_urls": request.slide_image_urls,
            "images": _collect_image_urls_from_layouts(raw_layouts_json),
        },
    )
    LOGGER.info(
        "[templates.v2.create] persisting template name=%s slides=%d images=%d",
        template.name,
        len(raw_layouts.layouts),
        len(template.assets.get("images", [])),
    )
    sql_session.add(template)
    await sql_session.commit()
    await sql_session.refresh(template)
    LOGGER.info(
        "[templates.v2.create] template persisted template_id=%s name=%s",
        template.id,
        template.name,
    )
    return template


@TEMPLATES_V2_ROUTER.post(
    "/layouts/reconstruct",
    response_model=SlideLayout,
)
async def reconstruct_template_v2_slide_layout(
    request: ReconstructTemplateV2LayoutRequest = Body(...),
    sql_session: AsyncSession = Depends(get_async_session),
):
    template = await sql_session.get(TemplateV2, request.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if not isinstance(template.raw_layouts, dict):
        raise HTTPException(
            status_code=400,
            detail="Template raw layouts are unavailable",
        )

    try:
        raw_layouts = RawSlideLayouts.model_validate(template.raw_layouts)
    except ValidationError as exc:
        LOGGER.exception(
            "[templates.v2.reconstruct] template has invalid raw layouts "
            "template_id=%s",
            request.template_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Template raw layouts are invalid",
        ) from exc

    if request.index >= len(raw_layouts.layouts):
        raise HTTPException(status_code=400, detail="Invalid slide index")

    slide_image_urls = _get_template_slide_image_urls(template)
    slide_image_url = (
        slide_image_urls[request.index]
        if request.index < len(slide_image_urls)
        else None
    )
    if slide_image_url is None:
        raise HTTPException(
            status_code=400,
            detail="Slide image URL is unavailable for requested slide index",
        )

    LOGGER.info(
        "[templates.v2.reconstruct] slide layout reconstruction start "
        "template_id=%s slide=%d/%d",
        request.template_id,
        request.index + 1,
        len(raw_layouts.layouts),
    )
    try:
        generated_layout = await _run_template_generation_thread(
            generate_slide_layout,
            raw_layouts.layouts[request.index],
            request.index,
            slide_image_url,
        )
        layout = (
            generated_layout
            if isinstance(generated_layout, SlideLayout)
            else SlideLayout.model_validate(generated_layout)
        )
    except (ValidationError, ValueError) as exc:
        LOGGER.exception(
            "[templates.v2.reconstruct] slide layout reconstruction produced "
            "invalid output template_id=%s slide=%d",
            request.template_id,
            request.index + 1,
        )
        raise HTTPException(
            status_code=500,
            detail="Slide layout reconstruction produced invalid output",
        ) from exc

    LOGGER.info(
        "[templates.v2.reconstruct] slide layout reconstruction complete "
        "template_id=%s slide=%d components=%d",
        request.template_id,
        request.index + 1,
        len(layout.components),
    )
    return layout


@TEMPLATES_V2_ROUTER.patch(
    "/{template_id}/layouts",
    response_model=TemplateV2Response,
)
async def patch_template_v2_slide_layout(
    template_id: uuid.UUID = Path(...),
    request: PatchTemplateV2SlideLayoutRequest = Body(...),
    sql_session: AsyncSession = Depends(get_async_session),
):
    template = await sql_session.get(TemplateV2, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    try:
        existing_layouts = _coerce_template_slide_layouts(template.layouts)
    except ValidationError as exc:
        LOGGER.exception(
            "[templates.v2.patch_layout] template has invalid layouts "
            "template_id=%s",
            template_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Template layouts are invalid",
        ) from exc

    if request.index >= len(existing_layouts.layouts):
        raise HTTPException(status_code=400, detail="Invalid slide index")

    patched_layouts = list(existing_layouts.layouts)
    patched_layouts[request.index] = request.layout
    try:
        updated_layouts = SlideLayouts(layouts=patched_layouts)
    except ValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail="Patched template layouts are invalid",
        ) from exc

    template.layouts = updated_layouts.model_dump(mode="json", exclude_none=True)
    await sql_session.commit()
    await sql_session.refresh(template)
    LOGGER.info(
        "[templates.v2.patch_layout] slide layout patched template_id=%s "
        "slide=%d/%d layout_id=%s",
        template_id,
        request.index + 1,
        len(updated_layouts.layouts),
        request.layout.id,
    )
    return template


@TEMPLATES_V2_ROUTER.get("/{template_id}", response_model=TemplateV2Response)
async def get_template_v2(
    template_id: uuid.UUID = Path(...),
    sql_session: AsyncSession = Depends(get_async_session),
):
    template = await sql_session.get(TemplateV2, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@TEMPLATES_V2_ROUTER.delete("/{template_id}", status_code=204)
async def delete_template_v2(
    template_id: uuid.UUID = Path(...),
    sql_session: AsyncSession = Depends(get_async_session),
):
    template = await sql_session.get(TemplateV2, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    await sql_session.delete(template)
    await sql_session.commit()
    return Response(status_code=204)
