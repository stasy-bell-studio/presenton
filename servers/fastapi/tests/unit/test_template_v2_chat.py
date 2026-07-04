import asyncio
import json
import uuid
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import HTTPException
from llmai.shared import AssistantToolCall  # type: ignore[import-not-found]

from models.sql.template_v2 import TemplateV2
from services.chat.v2.context_store import TemplateV2ContextStore
from services.chat.v2.prompts import build_template_v2_system_prompt
from services.chat.v2.service import TemplateV2ChatService
from services.chat.v2.tools import TemplateV2ChatTools


def _run(coro):
    return asyncio.run(coro)


def _layout_json():
    return {
        "layouts": [
            {
                "id": "intro",
                "description": "Intro slide layout for TemplateV2 chat testing.",
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
                                "max_items": 5,
                                "min_items": 1,
                                "max_item_length": 80,
                                "min_item_length": 1,
                                "items": [[{"text": "First point"}]],
                            }
                        ],
                    },
                ],
            }
        ]
    }


class _FakeTemplateSession:
    def __init__(self, template=None):
        self.template = template
        self.added = []
        self.commit_count = 0

    async def get(self, _model, key):
        if self.template is not None and key == self.template.id:
            return self.template
        return None

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commit_count += 1

    async def refresh(self, _obj):
        return None


def _template():
    return TemplateV2(id=uuid.uuid4(), name="Template", layouts=_layout_json())


def test_template_v2_context_store_loads_layouts():
    template = _template()
    context = TemplateV2ContextStore(_FakeTemplateSession(template), template.id)

    layouts = _run(context.get_slide_layouts())

    assert len(layouts.layouts) == 1
    assert layouts.layouts[0].id == "intro"


def test_template_v2_context_store_rejects_missing_template():
    template_id = uuid.uuid4()
    context = TemplateV2ContextStore(_FakeTemplateSession(), template_id)

    with pytest.raises(HTTPException) as exc_info:
        _run(context.get_template())

    assert exc_info.value.status_code == 404


def test_template_v2_prompt_requires_inspect_choose_add_update_for_new_slides():
    prompt = build_template_v2_system_prompt(
        template_context="",
        chat_memory_context="",
    )
    add_tool = next(
        tool
        for tool in TemplateV2ChatTools(Mock()).get_tool_definitions()
        if tool.name == "addSlideLayout"
    )
    add_component_tool = next(
        tool
        for tool in TemplateV2ChatTools(Mock()).get_tool_definitions()
        if tool.name == "addComponent"
    )

    assert "Follow these steps in order, every time" in prompt
    assert "getSlideLayout with includeFullJson=true" in prompt
    assert "calling addSlideLayout and stopping there is never enough" in prompt
    assert "create a new component with addComponent" in prompt
    assert "Pie and donut charts are supported" in prompt
    assert "Before calling this, inspect" in add_tool.description
    assert "before treating the new slide as complete" in add_tool.description
    assert "chart_type/chartType" in add_component_tool.description
    assert "pie" in add_component_tool.description


def test_template_v2_tool_updates_text_content_and_persists_layout():
    template = _template()
    session = _FakeTemplateSession(template)
    tools = TemplateV2ChatTools(TemplateV2ContextStore(session, template.id))

    result = _run(
        tools.execute_tool_call(
            AssistantToolCall(
                id="call_1",
                name="updateElementContent",
                arguments=json.dumps(
                    {
                        "slideIndex": 0,
                        "elementPath": "components[0].elements[0]",
                        "text": "New title",
                        "items": None,
                        "tableCell": None,
                        "chart": None,
                    }
                ),
            )
        )
    )

    assert result["ok"] is True
    assert result["result"]["slide_index"] == 0
    assert (
        template.layouts["layouts"][0]["components"][0]["elements"][0]["runs"][0][
            "text"
        ]
        == "New title"
    )
    assert session.commit_count == 1


def test_template_v2_tool_adds_slide_layout_from_existing_layout():
    template = _template()
    session = _FakeTemplateSession(template)
    tools = TemplateV2ChatTools(TemplateV2ContextStore(session, template.id))

    result = _run(
        tools.execute_tool_call(
            AssistantToolCall(
                id="call_1",
                name="addSlideLayout",
                arguments=json.dumps(
                    {
                        "sourceSlideIndex": 0,
                        "insertIndex": None,
                        "layoutId": "demand-gen-kpis",
                        "description": "Demand Gen KPIs and Metrics Outlook slide.",
                    }
                ),
            )
        )
    )

    assert result["ok"] is True
    assert result["result"]["slide_index"] == 1
    assert result["result"]["layout_id"] == "demand-gen-kpis"
    assert len(template.layouts["layouts"]) == 2
    assert template.layouts["layouts"][1]["id"] == "demand-gen-kpis"
    assert (
        template.layouts["layouts"][1]["description"]
        == "Demand Gen KPIs and Metrics Outlook slide."
    )
    assert session.commit_count == 1


def test_template_v2_tool_adds_pie_chart_component_to_any_layout():
    template = _template()
    session = _FakeTemplateSession(template)
    tools = TemplateV2ChatTools(TemplateV2ContextStore(session, template.id))

    result = _run(
        tools.execute_tool_call(
            AssistantToolCall(
                id="call_1",
                name="addComponent",
                arguments=json.dumps(
                    {
                        "slideIndex": 0,
                        "component": json.dumps(
                            {
                                "id": "market-share-pie",
                                "description": "Market share pie chart block.",
                                "position": {"x": 140, "y": 120},
                                "size": {"width": 520, "height": 360},
                                "elements": [
                                    {
                                        "type": "chart",
                                        "position": {"x": 0, "y": 0},
                                        "size": {"width": 520, "height": 360},
                                        "chart_type": "pie",
                                        "title": "Market Share",
                                        "categories": ["Product A", "Product B"],
                                        "series": [
                                            {"name": "Share", "values": [62, 38]}
                                        ],
                                        "decorative": False,
                                        "name": "Market share pie chart",
                                    }
                                ],
                            }
                        ),
                        "insertIndex": None,
                    }
                ),
            )
        )
    )

    component = template.layouts["layouts"][0]["components"][2]
    chart = component["elements"][0]
    assert result["ok"] is True
    assert result["result"]["component_id"] == "market-share-pie"
    assert component["id"] == "market-share-pie"
    assert chart["chart_type"] == "pie"
    assert chart["series"][0]["values"] == [62.0, 38.0]
    assert session.commit_count == 1


def test_template_v2_tool_rejects_chart_request_on_image_element():
    template = _template()
    template.layouts["layouts"][0]["components"].append(
        {
            "id": "hero-visual",
            "description": "Large radial visual block.",
            "position": {"x": 140, "y": 120},
            "size": {"width": 520, "height": 360},
            "elements": [
                {
                    "type": "image",
                    "decorative": False,
                    "name": "Radial visual",
                    "data": "/static/images/placeholder.jpg",
                    "is_icon": False,
                }
            ],
        }
    )
    session = _FakeTemplateSession(template)
    tools = TemplateV2ChatTools(TemplateV2ContextStore(session, template.id))

    result = _run(
        tools.execute_tool_call(
            AssistantToolCall(
                id="call_1",
                name="updateElementContent",
                arguments=json.dumps(
                    {
                        "slideIndex": 0,
                        "elementPath": "components[2].elements[0]",
                        "text": "Pie chart with dummy climate metrics",
                    }
                ),
            )
        )
    )

    assert result["ok"] is False
    assert "chart element" in str(result["error"]).lower()
    assert session.commit_count == 0


def test_template_v2_prompt_forbids_chart_images():
    prompt = build_template_v2_system_prompt(
        template_context="",
        chat_memory_context="",
    )

    assert "never generate" in prompt.lower() or "not static pictures" in prompt.lower()
    assert "chart image" in prompt.lower()


def test_template_v2_tool_accepts_chart_and_whole_table_payloads():
    template = _template()
    template.layouts["layouts"][0]["components"].extend(
        [
            {
                "id": "chart-block",
                "description": "Chart block.",
                "position": {"x": 0, "y": 120},
                "size": {"width": 100, "height": 60},
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
            },
            {
                "id": "table-block",
                "description": "Table block.",
                "position": {"x": 0, "y": 190},
                "size": {"width": 100, "height": 60},
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
            },
        ]
    )
    session = _FakeTemplateSession(template)
    tools = TemplateV2ChatTools(TemplateV2ContextStore(session, template.id))

    chart_result = _run(
        tools.execute_tool_call(
            AssistantToolCall(
                id="call_1",
                name="updateElementContent",
                arguments=json.dumps(
                    {
                        "slideIndex": 0,
                        "elementPath": "components[2].elements[0]",
                        "chart": {
                            "type": "bar",
                            "chartType": "pie",
                            "title": "GHG Emissions 2024-2025",
                            "categories": ["CO2", "CH4", "N2O"],
                            "series": [
                                {"name": "2024 Gt", "data": [36.4, 2.1, 0.8]},
                                {"name": "2025 Gt", "data": [36.7, 2.3, 0.84]},
                            ],
                        },
                    }
                ),
            )
        )
    )
    table_result = _run(
        tools.execute_tool_call(
            AssistantToolCall(
                id="call_2",
                name="updateElementContent",
                arguments=json.dumps(
                    {
                        "slideIndex": 0,
                        "elementPath": "components[3].elements[0]",
                        "table": {
                            "headers": ["Metric", "2024 Gt", "2025 Gt"],
                            "rows": [
                                ["CO2", "36.4", "36.7"],
                                ["CH4", "2.1", "2.3"],
                                ["N2O", "0.8", "0.84"],
                            ],
                        },
                    }
                ),
            )
        )
    )

    chart = template.layouts["layouts"][0]["components"][2]["elements"][0]
    table = template.layouts["layouts"][0]["components"][3]["elements"][0]
    assert chart_result["ok"] is True
    assert table_result["ok"] is True
    assert chart["chart_type"] == "pie"
    assert chart["series"][1]["values"] == [36.7, 2.3, 0.84]
    assert [cell["runs"][0]["text"] for cell in table["columns"]] == [
        "Metric",
        "2024 Gt",
        "2025 Gt",
    ]
    assert table["rows"][2][2]["runs"][0]["text"] == "0.84"


def test_template_v2_tool_invalid_path_returns_tool_error():
    template = _template()
    tools = TemplateV2ChatTools(TemplateV2ContextStore(_FakeTemplateSession(template), template.id))

    result = _run(
        tools.execute_tool_call(
            AssistantToolCall(
                id="call_1",
                name="updateElementContent",
                arguments=json.dumps(
                    {
                        "slideIndex": 0,
                        "elementPath": "components[9].elements[0]",
                        "text": "New title",
                        "items": None,
                        "tableCell": None,
                        "chart": None,
                    }
                ),
            )
        )
    )

    assert result["ok"] is False
    assert "Invalid element path" in result["error"]


def test_template_v2_tool_deletes_component_by_id_only():
    template = _template()
    session = _FakeTemplateSession(template)
    tools = TemplateV2ChatTools(TemplateV2ContextStore(session, template.id))

    result = _run(
        tools.execute_tool_call(
            AssistantToolCall(
                id="call_1",
                name="deleteComponent",
                arguments=json.dumps({"slideIndex": 0, "componentId": "body"}),
            )
        )
    )

    component_ids = [
        component["id"]
        for component in template.layouts["layouts"][0]["components"]
    ]
    assert result["ok"] is True
    assert component_ids == ["hero"]


def test_template_v2_tool_ungroups_positioned_group_component():
    template = _template()
    template.layouts["layouts"][0]["components"].append(
        {
            "id": "stack",
            "description": "Stacked visual component for ungroup testing.",
            "position": {"x": 10, "y": 20},
            "size": {"width": 80, "height": 40},
            "elements": [
                {
                    "type": "group",
                    "name": "Stack",
                    "position": {"x": 1, "y": 2},
                    "size": {"width": 50, "height": 20},
                    "children": [
                        {
                            "type": "rectangle",
                            "position": {"x": 3, "y": 4},
                            "size": {"width": 20, "height": 10},
                            "fill": {"color": "#000000"},
                        },
                        {
                            "type": "text",
                            "decorative": False,
                            "name": "Label",
                            "position": {"x": 8, "y": 6},
                            "size": {"width": 30, "height": 12},
                            "max_length": 100,
                            "min_length": 1,
                            "runs": [{"text": "Overlapped"}],
                        },
                    ],
                }
            ],
        }
    )
    session = _FakeTemplateSession(template)
    tools = TemplateV2ChatTools(TemplateV2ContextStore(session, template.id))

    result = _run(
        tools.execute_tool_call(
            AssistantToolCall(
                id="call_1",
                name="ungroupComponent",
                arguments=json.dumps(
                    {
                        "slideIndex": 0,
                        "componentId": "stack",
                        "reason": "User explicitly asked to ungroup overlapped items.",
                    }
                ),
            )
        )
    )

    components = template.layouts["layouts"][0]["components"]
    assert result["ok"] is True
    assert result["result"]["created_component_ids"] == ["stack_part_1", "stack_part_2"]
    assert [component["id"] for component in components] == [
        "hero",
        "body",
        "stack_part_1",
        "stack_part_2",
    ]
    assert components[2]["position"] == {"x": 14.0, "y": 26.0}
    assert components[2]["elements"][0]["position"] == {"x": 0, "y": 0}
    assert session.commit_count == 1


def test_template_v2_tool_swaps_whole_layout_items():
    template = _template()
    template.layouts["layouts"][0]["components"] = [
        {
            "id": "cards",
            "description": "Card grid component for swapping.",
            "position": {"x": 0, "y": 0},
            "size": {"width": 300, "height": 120},
            "elements": [
                {
                    "type": "grid",
                    "name": "cards",
                    "columns": 3,
                    "min_children": 3,
                    "max_children": 3,
                    "children": [
                        {
                            "type": "group",
                            "name": "card_1",
                            "children": [
                                {
                                    "type": "text",
                                    "decorative": False,
                                    "name": "title_1",
                                    "min_length": 1,
                                    "max_length": 40,
                                    "runs": [
                                        {
                                            "text": "First",
                                            "font": {"color": "#111111"},
                                        }
                                    ],
                                },
                                {
                                    "type": "image",
                                    "decorative": False,
                                    "name": "icon_1",
                                    "data": "/icons/first.svg",
                                    "is_icon": True,
                                },
                            ],
                        },
                        {
                            "type": "group",
                            "name": "card_2",
                            "children": [
                                {
                                    "type": "text",
                                    "decorative": False,
                                    "name": "title_2",
                                    "min_length": 1,
                                    "max_length": 40,
                                    "runs": [{"text": "Second"}],
                                }
                            ],
                        },
                        {
                            "type": "group",
                            "name": "card_3",
                            "children": [
                                {
                                    "type": "text",
                                    "decorative": False,
                                    "name": "title_3",
                                    "min_length": 1,
                                    "max_length": 40,
                                    "runs": [
                                        {
                                            "text": "Last",
                                            "font": {"color": "#333333"},
                                        }
                                    ],
                                },
                                {
                                    "type": "image",
                                    "decorative": False,
                                    "name": "icon_3",
                                    "data": "/icons/last.svg",
                                    "is_icon": True,
                                },
                            ],
                        },
                    ],
                }
            ],
        }
    ]
    session = _FakeTemplateSession(template)
    tools = TemplateV2ChatTools(TemplateV2ContextStore(session, template.id))

    result = _run(
        tools.execute_tool_call(
            AssistantToolCall(
                id="call_1",
                name="swapLayoutItems",
                arguments=json.dumps(
                    {
                        "slideIndex": 0,
                        "firstPath": "components[0].elements[0].children[0]",
                        "secondPath": "components[0].elements[0].children[2]",
                    }
                ),
            )
        )
    )

    cards = template.layouts["layouts"][0]["components"][0]["elements"][0]["children"]
    assert result["ok"] is True
    assert cards[0]["children"][0]["runs"][0] == {
        "text": "Last",
        "font": {"color": "#333333"},
    }
    assert cards[0]["children"][1]["data"] == "/icons/last.svg"
    assert cards[2]["children"][0]["runs"][0] == {
        "text": "First",
        "font": {"color": "#111111"},
    }
    assert cards[2]["children"][1]["data"] == "/icons/first.svg"
    assert session.commit_count == 1


def test_template_v2_service_persists_history_with_template_scope():
    template = _template()
    session = _FakeTemplateSession(template)
    conversation_id = uuid.uuid4()
    service = TemplateV2ChatService(
        sql_session=session,
        template_id=template.id,
        conversation_id=conversation_id,
    )

    with patch(
        "services.chat.v2.service.sql_chat_history.append_turn",
        new=AsyncMock(),
    ) as append_turn:
        result = _run(
            service._persist_turn(
                conversation_id=conversation_id,
                user_message="Change slide 1 title",
                response_text="Updated slide 1.",
                tool_calls=["updateElementContent"],
            )
        )

    append_turn.assert_awaited_once_with(
        session,
        template_v2_id=template.id,
        conversation_id=conversation_id,
        user_message="Change slide 1 title",
        assistant_message="Updated slide 1.",
        tool_calls=["updateElementContent"],
    )
    assert result.conversation_id == conversation_id
    assert session.commit_count == 1
