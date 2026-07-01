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

    result = _call(tools, "getSlideElements", {"index": 0})

    assert result["ok"] is True
    payload = result["result"]
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
        "updateSlideElement",
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


def test_delete_slide_component_removes_block_from_ui():
    slide = _slide()
    tools, _ = _tools(slide)

    result = _call(tools, "deleteSlideComponent", {"index": 0, "componentId": "body"})

    assert result["ok"] is True
    assert result["result"]["deleted"] is True
    assert [c["id"] for c in slide.ui["components"]] == ["hero"]


def test_delete_slide_element_removes_indexed_element():
    slide = _slide()
    tools, _ = _tools(slide)

    result = _call(
        tools,
        "deleteSlideElement",
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
        "addSlideComponent",
        {"index": 0, "component": json.dumps(component)},
    )

    assert result["ok"] is True
    assert result["result"]["added"] is True
    assert [c["id"] for c in slide.ui["components"]] == ["hero", "body", "note"]


def test_ui_tool_reports_non_ui_slide():
    slide = _slide()
    slide.ui = None
    tools, _ = _tools(slide)

    result = _call(tools, "getSlideElements", {"index": 0})

    assert result["ok"] is True
    assert result["result"]["editable"] is False


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
