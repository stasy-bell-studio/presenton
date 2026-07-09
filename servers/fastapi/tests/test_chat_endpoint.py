import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from api.v1.ppt.endpoints.chat import delete_chat_conversation


def test_delete_chat_conversation_deletes_sql_thread_and_commits():
    presentation_id = uuid.uuid4()
    conversation_id = uuid.uuid4()
    sql_session = MagicMock()
    sql_session.commit = AsyncMock()

    with patch(
        "api.v1.ppt.endpoints.chat.sql_chat_history.delete_conversation",
        new=AsyncMock(),
    ) as delete_conversation:
        asyncio.run(
            delete_chat_conversation(
                presentation_id=presentation_id,
                conversation_id=conversation_id,
                sql_session=sql_session,
            )
        )

    delete_conversation.assert_awaited_once_with(
        sql_session,
        presentation_id=presentation_id,
        conversation_id=conversation_id,
    )
    sql_session.commit.assert_awaited_once()
