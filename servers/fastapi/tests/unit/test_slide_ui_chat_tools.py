import asyncio
import json
import uuid
from unittest.mock import AsyncMock, patch

from llmai.shared import AssistantToolCall  # type: ignore[import-not-found]

from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.slide import SlideModel
from services.chat.memory_layer import PresentationChatMemoryLayer
from services.chat.tools import ChatTools


def _run(coro):
    return asyncio.run(coro)


def _slide_ui():
    return {
        "id": "intro",
        "description": "Intro slide layout for chat ui testing.",
        "components": [
            {
                "id": "hero",
                "description": "Hero title component for testing.",
                "position": {"x": 0, "y": 0},
                "size": {"width": 100, "height": 40},
                "elements": [
                    {
                        "type": "text",
                        "decorative": False,
                        "name": "Title",
                        "max_length": 100,
                        "min_length": 1,
                        "runs": [
                            {
                                "text": "Old title",
                                "font": {"size": 20, "family": "Inter"},
                            }
                        ],
                    }
                ],
            },
            {
                "id": "body",
                "description": "Body list component for testing.",
                "position": {"x": 0, "y": 50},
                "size": {"width": 100, "height": 60},
                "elements": [
                    {
                        "type": "text-list",
                        "decorative": False,
                        "name": "Bullets",
                        "max_items": 6,
                        "min_items": 1,
                        "max_item_length": 80,
                        "min_item_length": 1,
                        "items": [[{"text": "First point"}]],
                    }
                ],
            },
        ],
    }


def _slide():
    return SlideModel(
        id=uuid.uuid4(),
        presentation=uuid.uuid4(),
        layout_group="template-v2-x",
        layout="intro",
        index=0,
        content={},
        properties=None,
        ui=_slide_ui(),
    )


class _FakeSlideSession:
    def __init__(self, slide: SlideModel):
        self.slide = slide
        self.commit_count = 0
        self.added: list = []

    async def scalar(self, *_args, **_kwargs):
        return self.slide

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commit_count += 1

    async def refresh(self, _obj):
        return None


def _tools(slide: SlideModel) -> tuple[ChatTools, _FakeSlideSession]:
    session = _FakeSlideSession(slide)
    memory = PresentationChatMemoryLayer(session, slide.presentation)
    return ChatTools(memory), session


def _call(tools: ChatTools, name: str, arguments: dict):
    return _run(
        tools.execute_tool_call(
            AssistantToolCall(id="call_1", name=name, arguments=json.dumps(arguments))
        )
    )


def test_get_slide_elements_reports_editable_layout():
    slide = _slide()
    tools, _ = _tools(slide)

    result = _call(tools, "getSlideAtIndex", {"index": 0, "includeFullContent": True})

    assert result["ok"] is True
    payload = result["result"]["slide"]["ui_summary"]
    assert payload["editable"] is True
    assert payload["component_count"] == 2
    assert payload["editable_count"] == 2
    paths = {element["path"] for element in payload["elements"]}
    assert "components[0].elements[0]" in paths


def test_update_slide_element_edits_ui_text():
    slide = _slide()
    tools, session = _tools(slide)

    result = _call(
        tools,
        "updateElement",
        {
            "index": 0,
            "elementPath": "components[0].elements[0]",
            "text": "New title",
        },
    )

    assert result["ok"] is True
    assert result["result"]["updated"] is True
    element = slide.ui["components"][0]["elements"][0]
    assert element["runs"][0]["text"] == "New title"
    # The renderer reads the flattened top-level `text` in preference to `runs`,
    # so it must be kept in sync or the edit is invisible / gets reverted.
    assert element["text"] == "New title"
    assert session.commit_count == 1


def _slide_with_image():
    slide = _slide()
    slide.ui["components"].append(
        {
            "id": "visual",
            "description": "Hero image component.",
            "position": {"x": 0, "y": 120},
            "size": {"width": 100, "height": 80},
            "elements": [
                {
                    "type": "image",
                    "decorative": False,
                    "name": "Hero image",
                    "data": "/static/images/placeholder.jpg",
                    "is_icon": False,
                }
            ],
        }
    )
    return slide


def test_update_slide_element_moves_image_without_content_fields():
    slide = _slide_with_image()
    tools, session = _tools(slide)

    result = _call(
        tools,
        "updateElement",
        {
            "index": 0,
            "elementPath": "components[2].elements[0]",
            "text": None,
            "items": None,
            "tableCell": None,
            "chart": None,
            "table": None,
            "position": {"x": 12, "y": 34},
            "size": None,
        },
    )

    image = slide.ui["components"][2]["elements"][0]
    assert result["ok"] is True
    assert result["result"]["updated"] is True
    assert image["position"] == {"x": 12.0, "y": 34.0}
    assert image["data"] == "/static/images/placeholder.jpg"
    assert session.commit_count == 1


def test_update_slide_element_sets_image_url_from_text():
    slide = _slide_with_image()
    tools, session = _tools(slide)

    result = _call(
        tools,
        "updateElement",
        {
            "index": 0,
            "elementPath": "components[2].elements[0]",
            "text": "/app_data/images/glacier.png",
        },
    )

    image = slide.ui["components"][2]["elements"][0]
    assert result["ok"] is True
    assert image["data"].endswith("/app_data/images/glacier.png")
    assert session.commit_count == 1


@patch.object(PresentationChatMemoryLayer, "generate_image", new_callable=AsyncMock)
def test_update_slide_element_generates_image_from_prompt(mock_generate_image):
    mock_generate_image.return_value = "/app_data/images/generated.png"
    slide = _slide_with_image()
    tools, session = _tools(slide)

    result = _call(
        tools,
        "updateElement",
        {
            "index": 0,
            "elementPath": "components[2].elements[0]",
            "text": "Melting glacier aerial photo",
        },
    )

    image = slide.ui["components"][2]["elements"][0]
    assert result["ok"] is True
    assert image["data"] == "/app_data/images/generated.png"
    assert image["prompt"] == "Melting glacier aerial photo"
    mock_generate_image.assert_awaited_once_with("Melting glacier aerial photo")
    assert session.commit_count == 1


def test_update_slide_element_edits_ui_size():
    slide = _slide()
    tools, session = _tools(slide)

    result = _call(
        tools,
        "updateElement",
        {
            "index": 0,
            "elementPath": "components[0].elements[0]",
            "size": {"width": 80, "height": 24},
        },
    )

    assert result["ok"] is True
    assert result["result"]["updated"] is True
    assert slide.ui["components"][0]["elements"][0]["size"] == {
        "width": 80.0,
        "height": 24.0,
    }
    assert session.commit_count == 1


def test_update_slide_element_applies_toolbar_style_patch():
    slide = _slide()
    slide.ui["components"].append(
        {
            "id": "shape-block",
            "description": "Shape block.",
            "position": {"x": 0, "y": 120},
            "size": {"width": 100, "height": 80},
            "elements": [
                {
                    "type": "rectangle",
                    "position": {"x": 0, "y": 0},
                    "size": {"width": 100, "height": 80},
                    "fill": {"color": "#FFFFFF", "opacity": 1},
                    "stroke": {"color": "#111111", "width": 0},
                }
            ],
        }
    )
    tools, session = _tools(slide)

    result = _call(
        tools,
        "updateElement",
        {
            "index": 0,
            "elementPath": "components[2].elements[0]",
            "element": json.dumps(
                {
                    "fill": {"color": "#FF0000", "opacity": 0.5},
                    "stroke": {"width": 2},
                }
            ),
        },
    )

    element = slide.ui["components"][2]["elements"][0]
    assert result["ok"] is True
    assert result["result"]["updated"] is True
    assert element["fill"] == {"color": "#FF0000", "opacity": 0.5}
    assert element["stroke"] == {"color": "#111111", "width": 2}
    assert session.commit_count == 1


def test_get_slide_elements_reports_visible_flex_and_resizes_it():
    slide = _slide()
    slide.ui["components"].append(
        {
            "id": "cards",
            "description": "Visible card row.",
            "elements": [
                {
                    "type": "flex",
                    "name": "Cards",
                    "direction": "row",
                    "min_children": 1,
                    "max_children": 3,
                    "position": {"x": 10, "y": 20},
                    "size": {"width": 300, "height": 120},
                    "children": [
                        {
                            "type": "text",
                            "decorative": False,
                            "name": "Card title",
                            "min_length": 1,
                            "max_length": 80,
                            "runs": [{"text": "Old card"}],
                        }
                    ],
                }
            ],
        }
    )
    tools, session = _tools(slide)

    elements = _call(
        tools,
        "getSlideAtIndex",
        {"index": 0, "includeFullContent": True},
    )["result"]["slide"]["ui_summary"]["elements"]
    by_path = {element["path"]: element for element in elements}

    flex = by_path["components[2].elements[0]"]
    child = by_path["components[2].elements[0].children[0]"]
    assert flex["type"] == "flex"
    assert flex["content_editable"] is False
    assert flex["geometry_editable"] is True
    assert child["type"] == "text"
    assert child["content_editable"] is True

    result = _call(
        tools,
        "updateElement",
        {
            "index": 0,
            "elementPath": "components[2].elements[0]",
            "size": {"width": 280, "height": 100},
        },
    )

    assert result["ok"] is True
    assert slide.ui["components"][2]["elements"][0]["size"] == {
        "width": 280.0,
        "height": 100.0,
    }
    assert session.commit_count == 1


def test_update_slide_element_accepts_chart_data_alias_and_type():
    slide = _slide()
    slide.ui["components"].append(
        {
            "id": "chart-block",
            "description": "Chart block.",
            "elements": [
                {
                    "type": "chart",
                    "decorative": False,
                    "name": "Emissions chart",
                    "chart_type": "bar",
                    "categories": ["CO2"],
                    "series": [{"name": "2024", "values": [36.4]}],
                }
            ],
        }
    )
    tools, session = _tools(slide)

    result = _call(
        tools,
        "updateElement",
        {
            "index": 0,
            "elementPath": "components[2].elements[0]",
            "chart": {
                "type": "bar",
                "title": "GHG Emissions 2024-2025",
                "categories": ["CO2", "CH4", "N2O"],
                "series": [
                    {"name": "2024 Gt", "data": [36.4, 2.1, 0.8]},
                    {"name": "2025 Gt", "data": [36.7, 2.3, 0.84]},
                ],
            },
        },
    )

    chart = slide.ui["components"][2]["elements"][0]
    assert result["ok"] is True
    assert chart["title"] == "GHG Emissions 2024-2025"
    assert chart["series"][0]["values"] == [36.4, 2.1, 0.8]
    assert "data" not in chart["series"][0]
    assert session.commit_count == 1


def test_update_slide_element_accepts_whole_table_payload():
    slide = _slide()
    slide.ui["components"].append(
        {
            "id": "table-block",
            "description": "Table block.",
            "elements": [
                {
                    "type": "table",
                    "decorative": False,
                    "name": "Emissions table",
                    "columns": [
                        {"runs": [{"text": "Old metric", "font": {"size": 12}}]},
                        {"runs": [{"text": "Old value", "font": {"size": 12}}]},
                    ],
                    "rows": [[{"runs": [{"text": "Old"}]}, {"runs": [{"text": "0"}]}]],
                    "min_columns": 2,
                    "max_columns": 3,
                    "min_rows": 1,
                    "max_rows": 4,
                }
            ],
        }
    )
    tools, session = _tools(slide)

    result = _call(
        tools,
        "updateElement",
        {
            "index": 0,
            "elementPath": "components[2].elements[0]",
            "table": {
                "headers": ["Metric", "2024 Gt", "2025 Gt"],
                "rows": [
                    ["CO2", "36.4", "36.7"],
                    ["CH4", "2.1", "2.3"],
                    ["N2O", "0.8", "0.84"],
                ],
            },
        },
    )

    table = slide.ui["components"][2]["elements"][0]
    assert result["ok"] is True
    assert [cell["runs"][0]["text"] for cell in table["columns"]] == [
        "Metric",
        "2024 Gt",
        "2025 Gt",
    ]
    assert table["rows"][2][2]["runs"][0]["text"] == "0.84"
    assert table["columns"][0]["runs"][0]["font"] == {"size": 12}
    assert session.commit_count == 1


def test_update_slide_component_edits_ui_size():
    slide = _slide()
    tools, session = _tools(slide)

    result = _call(
        tools,
        "updateComponent",
        {
            "index": 0,
            "componentId": "hero",
            "size": {"width": 70, "height": 30},
        },
    )

    assert result["ok"] is True
    assert result["result"]["updated"] is True
    assert slide.ui["components"][0]["size"] == {
        "width": 70.0,
        "height": 30.0,
    }
    assert session.commit_count == 1


def test_update_component_groups_components():
    slide = _slide()
    tools, session = _tools(slide)

    result = _call(
        tools,
        "updateComponent",
        {
            "index": 0,
            "componentId": "hero",
            "action": "group",
            "componentIds": ["hero", "body"],
        },
    )

    component = slide.ui["components"][0]
    assert result["ok"] is True
    assert result["result"]["updated"] is True
    assert result["result"]["action"] == "grouped"
    assert component["id"] == "hero"
    assert component["position"] == {"x": 0.0, "y": 0.0}
    assert component["size"] == {"width": 100.0, "height": 110.0}
    assert len(component["elements"]) == 2
    assert [item["id"] for item in slide.ui["components"]] == ["hero"]
    assert session.commit_count == 1


def test_update_component_ungroups_component():
    slide = _slide()
    slide.ui["components"] = [
        {
            "id": "combo",
            "description": "Two element group.",
            "position": {"x": 10, "y": 20},
            "size": {"width": 200, "height": 100},
            "elements": [
                {
                    "type": "text",
                    "name": "Heading",
                    "position": {"x": 0, "y": 0},
                    "size": {"width": 120, "height": 30},
                    "runs": [{"text": "Heading"}],
                },
                {
                    "type": "text",
                    "name": "Body",
                    "position": {"x": 0, "y": 40},
                    "size": {"width": 180, "height": 40},
                    "runs": [{"text": "Body"}],
                },
            ],
        }
    ]
    tools, session = _tools(slide)

    result = _call(
        tools,
        "updateComponent",
        {"index": 0, "componentId": "combo", "action": "ungroup"},
    )

    assert result["ok"] is True
    assert result["result"]["updated"] is True
    assert result["result"]["action"] == "ungrouped"
    assert result["result"]["created_component_ids"] == ["combo_part_1", "combo_part_2"]
    assert [item["id"] for item in slide.ui["components"]] == [
        "combo_part_1",
        "combo_part_2",
    ]
    assert slide.ui["components"][1]["position"] == {"x": 10.0, "y": 60.0}
    assert session.commit_count == 1


def test_update_component_ungroups_container_child():
    slide = _slide()
    slide.ui["components"] = [
        {
            "id": "card",
            "description": "Container card.",
            "position": {"x": 20, "y": 30},
            "size": {"width": 240, "height": 120},
            "elements": [
                {
                    "type": "container",
                    "fill": {"color": "#FFFFFF"},
                    "padding": {"left": 12, "top": 8, "right": 12, "bottom": 8},
                    "position": {"x": 0, "y": 0},
                    "size": {"width": 240, "height": 120},
                    "child": {
                        "type": "text",
                        "name": "Card title",
                        "runs": [{"text": "Nested title"}],
                    },
                }
            ],
        }
    ]
    tools, session = _tools(slide)

    result = _call(
        tools,
        "updateComponent",
        {"index": 0, "componentId": "card", "action": "ungroup"},
    )

    assert result["ok"] is True
    assert result["result"]["updated"] is True
    assert result["result"]["created_component_ids"] == [
        "card_part_1",
        "card_part_2",
    ]
    assert slide.ui["components"][1]["position"] == {"x": 32.0, "y": 38.0}
    assert slide.ui["components"][1]["size"] == {"width": 216.0, "height": 104.0}
    assert session.commit_count == 1


def test_update_component_duplicates_component():
    slide = _slide()
    tools, session = _tools(slide)

    result = _call(
        tools,
        "updateComponent",
        {"index": 0, "componentId": "hero", "action": "duplicate"},
    )

    assert result["ok"] is True
    assert result["result"]["updated"] is True
    assert result["result"]["action"] == "duplicated"
    assert result["result"]["component_id"] == "hero_copy"
    assert [item["id"] for item in slide.ui["components"]] == [
        "hero",
        "hero_copy",
        "body",
    ]
    assert slide.ui["components"][1]["position"] == {"x": 16.0, "y": 16.0}
    assert session.commit_count == 1


def test_update_component_reorders_layer():
    slide = _slide()
    tools, session = _tools(slide)

    result = _call(
        tools,
        "updateComponent",
        {"index": 0, "componentId": "hero", "action": "bringToFront"},
    )

    assert result["ok"] is True
    assert result["result"]["updated"] is True
    assert result["result"]["action"] == "bring-to-front"
    assert [item["id"] for item in slide.ui["components"]] == ["body", "hero"]
    assert result["result"]["component_index"] == 1
    assert session.commit_count == 1


def test_delete_slide_component_removes_block_from_ui():
    slide = _slide()
    tools, _ = _tools(slide)

    result = _call(tools, "deleteComponent", {"index": 0, "componentId": "body"})

    assert result["ok"] is True
    assert result["result"]["deleted"] is True
    assert [c["id"] for c in slide.ui["components"]] == ["hero"]


def test_delete_slide_element_removes_indexed_element():
    slide = _slide()
    tools, _ = _tools(slide)

    result = _call(
        tools,
        "deleteElement",
        {"index": 0, "elementPath": "components[1].elements[0]"},
    )

    assert result["ok"] is True
    assert result["result"]["deleted"] is True
    assert slide.ui["components"][1]["elements"] == []


def test_add_slide_component_appends_block():
    slide = _slide()
    tools, _ = _tools(slide)

    component = {
        "id": "note",
        "description": "A short callout note component.",
        "position": {"x": 0, "y": 80},
        "size": {"width": 100, "height": 20},
        "elements": [
            {
                "type": "text",
                "decorative": False,
                "name": "Note",
                "runs": [{"text": "Added note", "font": {"size": 14}}],
            }
        ],
    }

    result = _call(
        tools,
        "addComponent",
        {"index": 0, "component": json.dumps(component)},
    )

    assert result["ok"] is True
    assert result["result"]["added"] is True
    assert [c["id"] for c in slide.ui["components"]] == ["hero", "body", "note"]


def test_add_slide_component_clamps_to_visible_stage():
    slide = _slide()
    tools, _ = _tools(slide)
    component = {
        "id": "offscreen",
        "description": "Bad geometry component.",
        "position": {"x": 1400, "y": -40},
        "size": {"width": 2000, "height": 900},
        "elements": [
            {
                "type": "text",
                "name": "Offscreen",
                "runs": [{"text": "Visible now"}],
            }
        ],
    }

    result = _call(
        tools,
        "addComponent",
        {"index": 0, "component": json.dumps(component)},
    )

    added = slide.ui["components"][-1]
    assert result["ok"] is True
    assert added["position"] == {"x": 0.0, "y": 0.0}
    assert added["size"] == {"width": 1280.0, "height": 720.0}


def test_add_slide_component_expands_tiny_chart_block():
    slide = _slide()
    tools, _ = _tools(slide)
    component = {
        "id": "tiny-chart",
        "description": "A chart block with bad assistant geometry.",
        "position": {"x": 0.25, "y": 0.2},
        "size": {"width": 0.6, "height": 0.5},
        "elements": [
            {
                "type": "chart",
                "decorative": False,
                "name": "Model chart",
                "position": {"x": 0, "y": 0},
                "size": {"width": 0.6, "height": 0.5},
                "chart_type": "bar",
                "categories": ["GPT OSS 20B", "GPT OSS 120B"],
                "series": [{"name": "Score", "values": [20, 120]}],
            }
        ],
    }

    result = _call(
        tools,
        "addComponent",
        {"index": 0, "component": json.dumps(component)},
    )

    chart_component = slide.ui["components"][-1]
    chart = chart_component["elements"][0]
    assert result["ok"] is True
    assert chart_component["position"] == {"x": 128.0, "y": 108.0}
    assert chart_component["size"] == {"width": 1024.0, "height": 460.0}
    assert chart["position"] == {"x": 0, "y": 0}
    assert chart["size"] == {"width": 1024.0, "height": 460.0}


def test_add_slide_component_expands_tiny_table_block():
    slide = _slide()
    tools, _ = _tools(slide)
    cell = {"runs": [{"text": "Metric", "font": {"size": 12}}]}
    component = {
        "id": "tiny-table",
        "description": "A table block with bad assistant geometry.",
        "position": {"x": 0.25, "y": 0.2},
        "size": {"width": 0.6, "height": 0.5},
        "elements": [
            {
                "type": "table",
                "decorative": False,
                "name": "Metrics table",
                "position": {"x": 0, "y": 0},
                "size": {"width": 0.6, "height": 0.5},
                "columns": [cell, {"runs": [{"text": "Value"}]}],
                "rows": [[{"runs": [{"text": "Temperature rise"}]}, {"runs": [{"text": "0.2 C"}]}]],
                "min_columns": 2,
                "max_columns": 2,
                "min_rows": 1,
                "max_rows": 3,
            }
        ],
    }

    result = _call(
        tools,
        "addComponent",
        {"index": 0, "component": json.dumps(component)},
    )

    table_component = slide.ui["components"][-1]
    table = table_component["elements"][0]
    assert result["ok"] is True
    assert table_component["position"] == {"x": 128.0, "y": 120.0}
    assert table_component["size"] == {"width": 1024.0, "height": 410.0}
    assert table["position"] == {"x": 0, "y": 0}
    assert table["size"] == {"width": 1024.0, "height": 410.0}


def test_ui_tool_reports_non_ui_slide():
    slide = _slide()
    slide.ui = None
    tools, _ = _tools(slide)

    result = _call(tools, "getSlideAtIndex", {"index": 0, "includeFullContent": True})

    assert result["ok"] is True
    assert "ui_summary" not in result["result"]["slide"]


def _template_v2_presentation(presentation_id: uuid.UUID) -> PresentationModel:
    return PresentationModel(
        id=presentation_id,
        version=PresentationVersion.V1_STANDARD,
        content="deck",
        n_slides=0,
        language="English",
        layout={
            "layouts": [
                {
                    "id": "thanks",
                    "description": "Thank you slide layout for chat-created slides.",
                    "components": [
                        {
                            "id": "hero",
                            "description": "Hero title component for chat save tests.",
                            "position": {"x": 0, "y": 0},
                            "size": {"width": 100, "height": 40},
                            "elements": [
                                {
                                    "type": "text",
                                    "decorative": False,
                                    "name": "Title",
                                    "max_length": 100,
                                    "min_length": 1,
                                    "runs": [
                                        {
                                            "text": "Old title",
                                            "font": {"size": 20, "family": "Inter"},
                                        }
                                    ],
                                }
                            ],
                        }
                    ],
                }
            ]
        },
    )


class _FakeSaveSlideSession:
    def __init__(self, presentation: PresentationModel):
        self.presentation = presentation
        self.slides: list[SlideModel] = []
        self.added: list = []
        self.added_all: list = []
        self.commit_count = 0

    async def get(self, model, key):
        if model is PresentationModel and key == self.presentation.id:
            return self.presentation
        return None

    async def scalars(self, *_args, **_kwargs):
        return list(self.slides)

    def add(self, obj):
        self.added.append(obj)
        if isinstance(obj, SlideModel) and obj not in self.slides:
            self.slides.append(obj)

    def add_all(self, values):
        self.added_all.extend(values)

    async def commit(self):
        self.commit_count += 1

    async def refresh(self, _obj):
        return None


def test_save_slide_for_template_v2_payload_persists_renderable_ui():
    presentation_id = uuid.uuid4()
    presentation = _template_v2_presentation(presentation_id)
    session = _FakeSaveSlideSession(presentation)
    memory = PresentationChatMemoryLayer(session, presentation_id)

    with patch.object(
        memory,
        "_get_presentation_icon_weight",
        new=AsyncMock(return_value="regular"),
    ), patch(
        "services.chat.memory_layer.get_images_directory",
        return_value="/tmp",
    ), patch(
        "services.chat.memory_layer.MEM0_PRESENTATION_MEMORY_SERVICE.store_slide_edit",
        new=AsyncMock(),
    ):
        result = _run(
            memory.save_slide(
                content={"hero": {"Title": "Thank You"}},
                layout_id="thanks",
                index=0,
                replace_old_slide_at_index=False,
            )
        )

    assert result["saved"] is True
    assert len(session.slides) == 1
    saved_slide = session.slides[0]
    assert saved_slide.layout_group == "template-v2"
    assert saved_slide.layout == "thanks"
    assert saved_slide.ui["id"] == "thanks"
    title_element = saved_slide.ui["components"][0]["elements"][0]
    assert title_element["runs"][0]["text"] == "Thank You"
    assert title_element["text"] == "Thank You"
