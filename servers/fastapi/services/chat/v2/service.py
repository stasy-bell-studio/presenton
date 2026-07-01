from __future__ import annotations

import json
import uuid
from typing import Any

import dirtyjson  # type: ignore[import-untyped]
from fastapi import HTTPException
from llmai.shared import Message, SystemMessage, UserMessage  # type: ignore[import-not-found]
from sqlalchemy.ext.asyncio import AsyncSession

from services.chat import sql_chat_history
from services.chat.service import ChatTurnResult, PresentationChatService
from services.chat.v2.context_store import TemplateV2ContextStore
from services.chat.v2.prompts import build_template_v2_system_prompt
from services.chat.v2.tools import TemplateV2ChatTools


class TemplateV2ChatService(PresentationChatService):
    def __init__(
        self,
        sql_session: AsyncSession,
        template_id: uuid.UUID,
        conversation_id: uuid.UUID | None,
    ):
        self._sql_session = sql_session
        self._template_id = template_id
        self._conversation_id = conversation_id
        self._context = TemplateV2ContextStore(sql_session, template_id)
        self._tools = TemplateV2ChatTools(self._context)

    async def _prepare_turn_context(
        self,
        user_message: str,
    ) -> tuple[uuid.UUID, list[Message]]:
        if not (user_message or "").strip():
            raise HTTPException(status_code=400, detail="Message is required")

        await self._context.get_template()
        conversation_id = self._conversation_id or uuid.uuid4()
        history = await sql_chat_history.load_messages(
            self._sql_session,
            template_v2_id=self._template_id,
            conversation_id=conversation_id,
        )
        history_messages = self._convert_history_to_messages(history)

        normalized_user_message = self._strip_ui_context_prefix(user_message)
        memory_query = normalized_user_message or user_message
        template_context = await self._context.retrieve_context(memory_query)

        messages: list[Message] = [
            SystemMessage(
                content=build_template_v2_system_prompt(
                    template_context=template_context,
                    chat_memory_context="",
                )
            ),
            *history_messages,
            UserMessage(content=user_message),
        ]
        return conversation_id, messages

    async def _persist_turn(
        self,
        *,
        conversation_id: uuid.UUID,
        user_message: str,
        response_text: str,
        tool_calls: list[str],
    ) -> ChatTurnResult:
        await sql_chat_history.append_turn(
            self._sql_session,
            template_v2_id=self._template_id,
            conversation_id=conversation_id,
            user_message=self._strip_ui_context_prefix(user_message) or user_message,
            assistant_message=response_text,
            tool_calls=tool_calls,
        )
        await self._sql_session.commit()
        return ChatTurnResult(
            conversation_id=conversation_id,
            response_text=response_text,
            tool_calls=tool_calls,
        )

    @staticmethod
    def _tool_focus_from_arguments(
        *,
        tool_name: str,
        arguments: str | None,
    ) -> dict[str, Any] | None:
        if tool_name not in {
            "getSlideLayout",
            "getEditableElements",
            "updateElementContent",
            "deleteComponent",
            "swapComponentVariant",
        }:
            return None

        try:
            parsed_args = dirtyjson.loads(arguments or "{}")
        except Exception:
            try:
                parsed_args = json.loads(arguments or "{}")
            except Exception:
                return None
        if not isinstance(parsed_args, dict):
            return None
        return TemplateV2ChatService._focus_payload_from_mapping(parsed_args)

    @staticmethod
    def _tool_focus_from_result(
        *,
        tool_name: str,
        tool_result: dict[str, Any],
    ) -> dict[str, Any] | None:
        if tool_name not in {
            "getSlideLayout",
            "getEditableElements",
            "updateElementContent",
            "deleteComponent",
            "swapComponentVariant",
        }:
            return None
        if not tool_result.get("ok"):
            return None
        result = tool_result.get("result")
        if not isinstance(result, dict):
            return None
        return TemplateV2ChatService._focus_payload_from_mapping(result)

    @staticmethod
    def _focus_payload_from_mapping(payload: dict[str, Any]) -> dict[str, Any] | None:
        focus_payload: dict[str, Any] = {}
        raw_index = payload.get("slide_index")
        if not isinstance(raw_index, int):
            raw_index = payload.get("slideIndex")
        if isinstance(raw_index, int):
            normalized_index = max(0, raw_index)
            focus_payload["slide_index"] = normalized_index
            focus_payload["slide_number"] = normalized_index + 1

        component_id = payload.get("component_id") or payload.get("componentId")
        if isinstance(component_id, str) and component_id:
            focus_payload["component_id"] = component_id

        element_path = payload.get("element_path") or payload.get("elementPath")
        if isinstance(element_path, str) and element_path:
            focus_payload["element_path"] = element_path

        return focus_payload or None

    @staticmethod
    def _tool_start_message(tool_name: str) -> str:
        labels = {
            "getTemplateSummary": "Reading template structure",
            "getSlideLayout": "Opening the requested template slide",
            "searchTemplateContent": "Searching template content",
            "getEditableElements": "Finding editable elements",
            "updateElementContent": "Updating template content",
            "deleteComponent": "Deleting the template component",
            "swapComponentVariant": "Swapping component variant",
        }
        return labels.get(tool_name, f"Running {tool_name}")
