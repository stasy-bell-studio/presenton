import asyncio
import json
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from llmai.shared import AssistantToolCall  # type: ignore[import-not-found]

from models.sql.template_v2 import TemplateV2
from services.chat.v2.context_store import TemplateV2ContextStore
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
