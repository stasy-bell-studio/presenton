import asyncio
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import HTTPException

from api.v2.templates.router import (
    CreateTemplateV2Request,
    create_template_v2,
    delete_template_v2,
    get_template_v2,
    list_templates_v2,
)
from models.sql.template_v2 import TemplateV2
from services.export_task_service import PptxToJsonDocument
from templates.v2.models.layouts import MergedComponents, SlideLayouts


RAW_LAYOUTS = {
    "layouts": [
        {
            "id": "slide_1",
            "description": "Full slide layout converted from PPTX slide 1.",
            "elements": [
                {
                    "type": "rectangle",
                    "position": {"x": 0, "y": 0},
                    "size": {"width": 1280, "height": 720},
                    "fill": {"color": "#FFFFFF"},
                },
                {
                    "type": "image",
                    "position": {"x": 100, "y": 120},
                    "size": {"width": 320, "height": 180},
                    "data": "/app_data/pptx-to-json/session/images/photo.png",
                    "decorative": True,
                    "name": "photo",
                    "is_icon": False,
                }
            ],
        }
    ]
}

TEMPLATE_LAYOUTS = {
    "layouts": [
        {
            "id": "slide_1",
            "description": "Full slide layout converted from PPTX slide 1.",
            "components": [
                {
                    "id": "photo_component",
                    "description": "Reusable image component.",
                    "position": {"x": 100, "y": 120},
                    "size": {"width": 320, "height": 180},
                    "elements": [
                        {
                            "type": "image",
                            "position": {"x": 0, "y": 0},
                            "size": {"width": 320, "height": 180},
                            "data": "/app_data/pptx-to-json/session/images/photo.png",
                            "decorative": True,
                            "name": "photo",
                            "is_icon": False,
                        }
                    ],
                }
            ],
        }
    ]
}

GENERATED_LAYOUTS = SlideLayouts.model_validate(TEMPLATE_LAYOUTS)
MERGED_COMPONENTS = MergedComponents.model_validate(
    {
        "components": [
            {
                "id": "photo_component",
                "description": "Reusable image component.",
                "variants": TEMPLATE_LAYOUTS["layouts"][0]["components"],
            }
        ]
    }
)


class _RowsResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _ListSession:
    async def scalar(self, *_args, **_kwargs):
        return 1

    async def execute(self, *_args, **_kwargs):
        now = datetime(2026, 6, 8, tzinfo=timezone.utc)
        return _RowsResult(
            [
                (
                    uuid.UUID("00000000-0000-0000-0000-000000000001"),
                    "Quarterly Review",
                    "Board deck template",
                    TEMPLATE_LAYOUTS,
                    now,
                    now,
                )
            ]
        )


def test_create_template_v2_converts_generates_and_persists(tmp_path, fake_async_session):
    pptx_path = tmp_path / "quarterly-review.pptx"
    pptx_path.write_bytes(b"pptx")
    with patch(
        "api.v2.templates.router.resolve_app_path_to_filesystem",
        return_value=str(pptx_path),
    ), patch(
        "api.v2.templates.router.EXPORT_TASK_SERVICE.convert_pptx_to_json",
        new=AsyncMock(return_value=PptxToJsonDocument(**RAW_LAYOUTS)),
    ) as convert_mock, patch(
        "api.v2.templates.router.generate_template",
        new=Mock(return_value=GENERATED_LAYOUTS),
    ) as generate_mock, patch(
        "api.v2.templates.router.merge_similar_components",
        new=Mock(return_value=MERGED_COMPONENTS),
    ) as merge_mock, patch(
        "api.v2.templates.router.random.randint",
        return_value=4801,
    ) as randint_mock:
        template = asyncio.run(
            create_template_v2(
                CreateTemplateV2Request(
                    pptx_url="/app_data/uploads/quarterly-review.pptx",
                    slide_image_urls=["/app_data/images/slide-1.png"],
                    fonts={"Inter": "Inter"},
                ),
                sql_session=fake_async_session,
            )
        )

    convert_mock.assert_awaited_once_with(str(pptx_path))
    generate_mock.assert_called_once()
    randint_mock.assert_called_once_with(1000, 9999)
    merge_mock.assert_called_once()
    merged_layouts_arg = merge_mock.call_args.args[0]
    assert merged_layouts_arg.layouts[0].id == "slide_1_4801"
    assert template.name == "quarterly-review"
    assert template.raw_layouts == RAW_LAYOUTS
    assert template.components is None
    assert template.merged_components == MERGED_COMPONENTS.model_dump(
        mode="json", exclude_none=True
    )
    assert GENERATED_LAYOUTS.layouts[0].id == "slide_1"
    expected_layouts = {
        "layouts": [
            {
                **TEMPLATE_LAYOUTS["layouts"][0],
                "id": "slide_1_4801",
            }
        ]
    }
    assert template.layouts == expected_layouts
    assert template.assets == {
        "fonts": {"Inter": "Inter"},
        "slide_image_urls": ["/app_data/images/slide-1.png"],
        "images": ["/app_data/pptx-to-json/session/images/photo.png"],
    }
    assert fake_async_session.added == [template]
    assert fake_async_session.commit_count == 1


def test_create_template_v2_requires_slide_images(fake_async_session):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            create_template_v2(
                CreateTemplateV2Request(
                    pptx_url="/app_data/uploads/template.pptx",
                    slide_image_urls=[],
                ),
                sql_session=fake_async_session,
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "At least one slide image is required"


def test_list_templates_v2_returns_paginated_summary():
    response = asyncio.run(
        list_templates_v2(page=1, page_size=20, sql_session=_ListSession())
    )

    assert response.total == 1
    assert response.page == 1
    assert response.page_size == 20
    assert response.items[0].id == uuid.UUID("00000000-0000-0000-0000-000000000001")
    assert response.items[0].name == "Quarterly Review"
    assert response.items[0].description == "Board deck template"
    assert response.items[0].layout_count == 1


def test_get_template_v2_returns_template(fake_async_session):
    template_id = uuid.uuid4()
    template = TemplateV2(name="Custom", layouts=RAW_LAYOUTS)
    fake_async_session._get_results[template_id] = template

    response = asyncio.run(
        get_template_v2(template_id, sql_session=fake_async_session)
    )

    assert response == template


def test_delete_template_v2_deletes_template(fake_async_session):
    template_id = uuid.uuid4()
    template = TemplateV2(name="Custom", layouts=RAW_LAYOUTS)
    fake_async_session._get_results[template_id] = template

    response = asyncio.run(
        delete_template_v2(template_id, sql_session=fake_async_session)
    )

    assert response.status_code == 204
    assert fake_async_session.deleted == [template]
    assert fake_async_session.commit_count == 1


def test_get_template_v2_returns_404_for_missing_template(fake_async_session):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_template_v2(uuid.uuid4(), sql_session=fake_async_session))

    assert exc.value.status_code == 404
    assert exc.value.detail == "Template not found"
