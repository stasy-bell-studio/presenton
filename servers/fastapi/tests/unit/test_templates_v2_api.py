import asyncio
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import HTTPException

from api.v2.templates.router import (
    CreateTemplateV2LayoutsRequest,
    CreateTemplateV2Request,
    GenerateTemplateV2BlocksRequest,
    InitTemplateV2Request,
    PatchTemplateV2SlideLayoutRequest,
    create_template_v2_slide_layouts,
    create_template_v2,
    delete_template_v2,
    generate_template_v2_blocks,
    get_template_v2,
    init_template_v2,
    list_templates_v2,
    patch_template_v2_slide_layout,
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


def _two_template_layouts():
    return {
        "layouts": [
            TEMPLATE_LAYOUTS["layouts"][0],
            {
                **TEMPLATE_LAYOUTS["layouts"][0],
                "id": "slide_2",
                "description": "Full slide layout converted from PPTX slide 2.",
            },
        ]
    }


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
                    {
                        "slide_image_urls": [
                            "/app_data/images/slide-1.png",
                            "/app_data/images/slide-2.png",
                        ]
                    },
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
    raw_layouts_arg, slide_images_arg, fonts_arg = generate_mock.call_args.args
    assert len(raw_layouts_arg.layouts) == 1
    assert slide_images_arg == ["/app_data/images/slide-1.png"]
    assert fonts_arg == {"Inter": "Inter"}
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


def test_create_template_v2_caps_raw_layouts_to_preview_images(tmp_path, fake_async_session):
    pptx_path = tmp_path / "slidesgo.pptx"
    pptx_path.write_bytes(b"pptx")
    raw_layouts = {
        "layouts": [
            RAW_LAYOUTS["layouts"][0],
            {
                **RAW_LAYOUTS["layouts"][0],
                "id": "slide_2",
                "description": "Full slide layout converted from PPTX slide 2.",
            },
        ]
    }
    with patch(
        "api.v2.templates.router.resolve_app_path_to_filesystem",
        return_value=str(pptx_path),
    ), patch(
        "api.v2.templates.router.EXPORT_TASK_SERVICE.convert_pptx_to_json",
        new=AsyncMock(return_value=PptxToJsonDocument(**raw_layouts)),
    ), patch(
        "api.v2.templates.router.generate_template",
        new=Mock(return_value=GENERATED_LAYOUTS),
    ) as generate_mock, patch(
        "api.v2.templates.router.merge_similar_components",
        new=Mock(return_value=MERGED_COMPONENTS),
    ), patch(
        "api.v2.templates.router.random.randint",
        return_value=4801,
    ):
        template = asyncio.run(
            create_template_v2(
                CreateTemplateV2Request(
                    pptx_url="/app_data/uploads/slidesgo.pptx",
                    slide_image_urls=["/app_data/images/slide-1.png"],
                ),
                sql_session=fake_async_session,
            )
        )

    raw_layouts_arg = generate_mock.call_args.args[0]
    assert [layout.id for layout in raw_layouts_arg.layouts] == ["slide_1"]
    assert template.raw_layouts == RAW_LAYOUTS
    assert template.assets["slide_image_urls"] == ["/app_data/images/slide-1.png"]


def test_create_template_v2_persists_when_component_dedup_fails(
    tmp_path,
    fake_async_session,
):
    pptx_path = tmp_path / "dedup-fails.pptx"
    pptx_path.write_bytes(b"pptx")
    with patch(
        "api.v2.templates.router.resolve_app_path_to_filesystem",
        return_value=str(pptx_path),
    ), patch(
        "api.v2.templates.router.EXPORT_TASK_SERVICE.convert_pptx_to_json",
        new=AsyncMock(return_value=PptxToJsonDocument(**RAW_LAYOUTS)),
    ), patch(
        "api.v2.templates.router.generate_template",
        new=Mock(return_value=GENERATED_LAYOUTS),
    ), patch(
        "api.v2.templates.router.merge_similar_components",
        new=Mock(side_effect=ValueError("bad clusters")),
    ), patch(
        "api.v2.templates.router.random.randint",
        return_value=4801,
    ):
        template = asyncio.run(
            create_template_v2(
                CreateTemplateV2Request(
                    pptx_url="/app_data/uploads/dedup-fails.pptx",
                    slide_image_urls=["/app_data/images/slide-1.png"],
                ),
                sql_session=fake_async_session,
            )
        )

    assert template.merged_components == {"components": []}
    assert template.layouts["layouts"][0]["id"] == "slide_1_4801"
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


def test_init_template_v2_persists_assets_without_layouts(tmp_path, fake_async_session):
    pptx_path = tmp_path / "quarterly-review.pptx"
    pptx_path.write_bytes(b"pptx")
    with patch(
        "api.v2.templates.router.resolve_app_path_to_filesystem",
        return_value=str(pptx_path),
    ), patch(
        "api.v2.templates.router.EXPORT_TASK_SERVICE.convert_pptx_to_json",
        new=AsyncMock(return_value=PptxToJsonDocument(**RAW_LAYOUTS)),
    ) as convert_mock:
        template_id = asyncio.run(
            init_template_v2(
                InitTemplateV2Request(
                    pptx_url="/app_data/uploads/quarterly-review.pptx",
                    slide_image_urls=["/app_data/images/slide-1.png"],
                    fonts={"Inter": "https://example.com/inter.css"},
                    name="Quarterly Review",
                    description="Board deck template",
                ),
                sql_session=fake_async_session,
            )
        )

    assert isinstance(template_id, uuid.UUID)
    convert_mock.assert_awaited_once_with(str(pptx_path))
    template = fake_async_session.added[0]
    assert template.name == "Quarterly Review"
    assert template.description == "Board deck template"
    assert template.raw_layouts == RAW_LAYOUTS
    assert template.layouts is None
    assert template.assets == {
        "pptx_url": "/app_data/uploads/quarterly-review.pptx",
        "fonts": {"Inter": "https://example.com/inter.css"},
        "slide_image_urls": ["/app_data/images/slide-1.png"],
        "images": ["/app_data/pptx-to-json/session/images/photo.png"],
        "layout_indexes": [],
    }
    assert fake_async_session.commit_count == 1


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
    assert response.items[0].thumbnail == "/app_data/images/slide-1.png"


def test_create_template_v2_slide_layouts_returns_generated_layout(
    fake_async_session,
):
    template_id = uuid.uuid4()
    template = TemplateV2(
        name="Custom",
        raw_layouts=RAW_LAYOUTS,
        layouts=TEMPLATE_LAYOUTS,
        assets={
            "fonts": {"Inter": "https://example.com/inter.css"},
            "slide_image_urls": ["/app_data/images/slide-1.png"],
        },
    )
    fake_async_session._get_results[template_id] = template
    request = CreateTemplateV2LayoutsRequest.model_validate(
        {"id": str(template_id), "indices": [0]}
    )

    with patch(
        "api.v2.templates.router.generate_slide_layout",
        new=Mock(return_value=GENERATED_LAYOUTS.layouts[0]),
    ) as generate_mock, patch(
        "api.v2.templates.router.random.randint",
        return_value=4801,
    ):
        response = asyncio.run(
            create_template_v2_slide_layouts(
                request,
                sql_session=fake_async_session,
            )
        )

    generate_mock.assert_called_once()
    source_layout, slide_index, slide_image_url, fonts = generate_mock.call_args.args
    assert source_layout.id == "slide_1"
    assert slide_index == 0
    assert slide_image_url == "/app_data/images/slide-1.png"
    assert fonts == {"Inter": "https://example.com/inter.css"}
    assert response.layouts[0].index == 0
    response_layout = response.layouts[0].layout.model_dump(
        mode="json", exclude_none=True
    )
    assert response_layout == {
        **TEMPLATE_LAYOUTS["layouts"][0],
        "id": "slide_1_4801",
    }


def test_create_template_v2_slide_layouts_rejects_invalid_index(
    fake_async_session,
):
    template_id = uuid.uuid4()
    fake_async_session._get_results[template_id] = TemplateV2(
        name="Custom",
        raw_layouts=RAW_LAYOUTS,
        layouts=TEMPLATE_LAYOUTS,
        assets={"slide_image_urls": ["/app_data/images/slide-1.png"]},
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            create_template_v2_slide_layouts(
                CreateTemplateV2LayoutsRequest(
                    template_id=template_id,
                    indices=[1],
                ),
                sql_session=fake_async_session,
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "Invalid slide index"


def test_create_template_v2_slide_layouts_requires_slide_image(
    fake_async_session,
):
    template_id = uuid.uuid4()
    fake_async_session._get_results[template_id] = TemplateV2(
        name="Custom",
        raw_layouts=RAW_LAYOUTS,
        layouts=TEMPLATE_LAYOUTS,
        assets={"slide_image_urls": []},
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            create_template_v2_slide_layouts(
                CreateTemplateV2LayoutsRequest(
                    template_id=template_id,
                    indices=[0],
                ),
                sql_session=fake_async_session,
            )
        )

    assert exc.value.status_code == 400
    assert (
        exc.value.detail == "Slide image URL is unavailable for requested slide index"
    )


def test_create_template_v2_slide_layouts_preserves_image_url_indexes(
    fake_async_session,
):
    template_id = uuid.uuid4()
    raw_layouts = {
        "layouts": [
            RAW_LAYOUTS["layouts"][0],
            {
                **RAW_LAYOUTS["layouts"][0],
                "id": "slide_2",
                "description": "Full slide layout converted from PPTX slide 2.",
            },
        ]
    }
    fake_async_session._get_results[template_id] = TemplateV2(
        name="Custom",
        raw_layouts=raw_layouts,
        layouts=TEMPLATE_LAYOUTS,
        assets={"slide_image_urls": ["", "/app_data/images/slide-2.png"]},
    )

    with patch(
        "api.v2.templates.router.generate_slide_layout",
        new=Mock(return_value=GENERATED_LAYOUTS.layouts[0]),
    ) as generate_mock:
        asyncio.run(
            create_template_v2_slide_layouts(
                CreateTemplateV2LayoutsRequest(
                    template_id=template_id,
                    indices=[1],
                ),
                sql_session=fake_async_session,
            )
        )

    source_layout, slide_index, slide_image_url, _fonts = generate_mock.call_args.args
    assert source_layout.id == "slide_2"
    assert slide_index == 1
    assert slide_image_url == "/app_data/images/slide-2.png"


def test_create_template_v2_slide_layouts_returns_404_for_missing_template(
    fake_async_session,
):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            create_template_v2_slide_layouts(
                CreateTemplateV2LayoutsRequest(
                    template_id=uuid.uuid4(),
                    indices=[0],
                ),
                sql_session=fake_async_session,
            )
        )

    assert exc.value.status_code == 404
    assert exc.value.detail == "Template not found"


def test_generate_template_v2_blocks_clusters_and_persists(fake_async_session):
    template_id = uuid.uuid4()
    template = TemplateV2(
        name="Custom",
        layouts=TEMPLATE_LAYOUTS,
        raw_layouts=RAW_LAYOUTS,
    )
    fake_async_session._get_results[template_id] = template

    with patch(
        "api.v2.templates.router.merge_similar_components",
        new=Mock(return_value=MERGED_COMPONENTS),
    ) as merge_mock:
        response = asyncio.run(
            generate_template_v2_blocks(
                GenerateTemplateV2BlocksRequest.model_validate(
                    {"id": str(template_id)}
                ),
                sql_session=fake_async_session,
            )
        )

    merge_mock.assert_called_once()
    layouts_arg = merge_mock.call_args.args[0]
    assert layouts_arg.layouts[0].id == "slide_1"
    assert response == template
    assert template.merged_components == MERGED_COMPONENTS.model_dump(
        mode="json", exclude_none=True
    )
    assert fake_async_session.commit_count == 1


def test_generate_template_v2_blocks_requires_layouts(fake_async_session):
    template_id = uuid.uuid4()
    fake_async_session._get_results[template_id] = TemplateV2(
        name="Custom",
        layouts=None,
        raw_layouts=RAW_LAYOUTS,
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            generate_template_v2_blocks(
                GenerateTemplateV2BlocksRequest(template_id=template_id),
                sql_session=fake_async_session,
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "Template layouts are unavailable"
    assert fake_async_session.commit_count == 0


def test_patch_template_v2_slide_layout_updates_stored_layouts(fake_async_session):
    template_id = uuid.uuid4()
    template = TemplateV2(
        name="Custom",
        layouts=_two_template_layouts(),
        raw_layouts=RAW_LAYOUTS,
    )
    fake_async_session._get_results[template_id] = template
    patched_layout = {
        **TEMPLATE_LAYOUTS["layouts"][0],
        "id": "slide_2_updated",
        "description": "Updated full slide layout converted from PPTX slide 2.",
    }

    response = asyncio.run(
        patch_template_v2_slide_layout(
            template_id,
            PatchTemplateV2SlideLayoutRequest(
                index=1,
                layout=patched_layout,
            ),
            sql_session=fake_async_session,
        )
    )

    assert response == template
    assert template.layouts["layouts"][0]["id"] == "slide_1"
    assert template.layouts["layouts"][1] == patched_layout
    assert template.assets == {"layout_indexes": [0, 1]}
    assert fake_async_session.commit_count == 1


def test_patch_template_v2_slide_layout_merges_out_of_order_init_saves(
    fake_async_session,
):
    template_id = uuid.uuid4()
    raw_layouts = {
        "layouts": [
            RAW_LAYOUTS["layouts"][0],
            {
                **RAW_LAYOUTS["layouts"][0],
                "id": "slide_2",
                "description": "Full slide layout converted from PPTX slide 2.",
            },
        ]
    }
    template = TemplateV2(
        name="Custom",
        raw_layouts=raw_layouts,
        layouts=None,
        assets={"layout_indexes": []},
    )
    fake_async_session._get_results[template_id] = template
    second_layout = {
        **TEMPLATE_LAYOUTS["layouts"][0],
        "id": "slide_2",
        "description": "Full slide layout converted from PPTX slide 2.",
    }

    asyncio.run(
        patch_template_v2_slide_layout(
            template_id,
            PatchTemplateV2SlideLayoutRequest(
                layouts=[{"index": 1, "layout": second_layout}],
            ),
            sql_session=fake_async_session,
        )
    )
    asyncio.run(
        patch_template_v2_slide_layout(
            template_id,
            PatchTemplateV2SlideLayoutRequest(
                layouts=[{"index": 0, "layout": TEMPLATE_LAYOUTS["layouts"][0]}],
            ),
            sql_session=fake_async_session,
        )
    )

    assert template.assets == {"layout_indexes": [0, 1]}
    assert template.layouts["layouts"][0]["id"] == "slide_1"
    assert template.layouts["layouts"][1]["id"] == "slide_2"
    assert fake_async_session.commit_count == 2


def test_patch_template_v2_slide_layout_rejects_invalid_index(fake_async_session):
    template_id = uuid.uuid4()
    fake_async_session._get_results[template_id] = TemplateV2(
        name="Custom",
        layouts=TEMPLATE_LAYOUTS,
        raw_layouts=RAW_LAYOUTS,
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            patch_template_v2_slide_layout(
                template_id,
                PatchTemplateV2SlideLayoutRequest(
                    index=1,
                    layout=TEMPLATE_LAYOUTS["layouts"][0],
                ),
                sql_session=fake_async_session,
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "Invalid slide index"
    assert fake_async_session.commit_count == 0


def test_patch_template_v2_slide_layout_rejects_duplicate_layout_ids(
    fake_async_session,
):
    template_id = uuid.uuid4()
    fake_async_session._get_results[template_id] = TemplateV2(
        name="Custom",
        layouts=_two_template_layouts(),
        raw_layouts=RAW_LAYOUTS,
    )
    duplicate_layout = {
        **TEMPLATE_LAYOUTS["layouts"][0],
        "id": "slide_1",
        "description": "Duplicate ID full slide layout converted from PPTX slide 2.",
    }

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            patch_template_v2_slide_layout(
                template_id,
                PatchTemplateV2SlideLayoutRequest(
                    index=1,
                    layout=duplicate_layout,
                ),
                sql_session=fake_async_session,
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "Patched template layouts are invalid"
    assert fake_async_session.commit_count == 0


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
