import json
import logging
import re
from typing import Any, Awaitable, Callable, Literal

import dirtyjson  # type: ignore[import-untyped]
from llmai.shared import AssistantToolCall, Tool  # type: ignore[import-not-found]

from services.chat.schemas import (
    AddElementInput,
    AddNewSlideInput,
    AddNewSlideLayoutInput,
    AddOutlineInput,
    AddSlideComponentInput,
    DeleteSlideComponentInput,
    DeleteSlideElementInput,
    DeleteSlideInput,
    DeleteOutlineInput,
    GenerateAssetsInput,
    GetSlideAtIndexInput,
    NoArgsInput,
    SaveSlideInput,
    SearchSlidesInput,
    SetPresentationThemeInput,
    UpdateComponentInput,
    UpdateSlideInput,
    UpdateSlideComponentInput,
    UpdateOutlineInput,
    UpdateSlideElementInput,
)
from services.chat.presentation_context_store import PresentationContextStore

LOGGER = logging.getLogger(__name__)

ToolHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]
ChatToolMode = Literal["presentation", "outline"]


class ChatTools:
    def __init__(
        self,
        memory: PresentationContextStore,
        mode: ChatToolMode = "presentation",
    ):
        self._memory = memory
        self._mode = mode
        self._tool_handlers: dict[str, ToolHandler] = {
            "addOutline": self._add_outline,
            "updateOutline": self._update_outline,
            "deleteOutline": self._delete_outline,
            "addNewSlide": self._add_new_slide,
            "addNewSlideLayout": self._add_new_slide_layout,
            "getTemplateSummary": self._get_template_summary,
            "searchSlide": self._search_slides,
            "getSlideAtIndex": self._get_slide_at_index,
            "getAvailableLayouts": self._get_available_layouts,
            "generateAssets": self._generate_assets,
            "saveSlide": self._save_slide,
            "updateSlide": self._update_slide,
            "deleteSlide": self._delete_slide,
            "addElement": self._add_element,
            "updateElement": self._update_slide_element,
            "deleteElement": self._delete_slide_element,
            "addComponent": self._add_slide_component,
            "createComponent": self._add_slide_component,
            "updateComponent": self._update_component,
            "deleteComponent": self._delete_slide_component,
            "getPresentationTheme": self._get_presentation_theme_catalog,
            "setPresentationTheme": self._set_presentation_theme,
        }

    def get_tool_definitions(self) -> list[Tool]:
        return [
            Tool(
                name="addOutline",
                description=(
                    "Insert a new markdown outline item into the outline draft. "
                    "This edits presentation.outlines only and does not require a layout."
                ),
                schema=AddOutlineInput,
                strict=True,
            ),
            Tool(
                name="updateOutline",
                description=(
                    "Replace the markdown content of one outline item by zero-based index. "
                    "This edits presentation.outlines only and does not require a layout."
                ),
                schema=UpdateOutlineInput,
                strict=True,
            ),
            Tool(
                name="deleteOutline",
                description=(
                    "Delete one outline item by zero-based index. This edits "
                    "presentation.outlines only and does not require a layout."
                ),
                schema=DeleteOutlineInput,
                strict=True,
            ),
            Tool(
                name="addNewSlide",
                description=(
                    "Add a blank slide to the current presentation at a zero-based index "
                    "or append when index is null."
                ),
                schema=AddNewSlideInput,
                strict=True,
            ),
            Tool(
                name="addNewSlideLayout",
                description=(
                    "Add a new slide from an available layout. Use getAvailableLayouts "
                    "first, then pass content as a JSON-serialized object matching the layout."
                ),
                schema=AddNewSlideLayoutInput,
                strict=True,
            ),
            Tool(
                name="getAvailableLayouts",
                description="List available slide layout ids, names, and summaries.",
                schema=NoArgsInput,
                strict=True,
            ),
            Tool(
                name="getTemplateSummary",
                description=(
                    "Read a compact summary of the current presentation template, "
                    "layouts, current slides, and theme. Use before choosing where/how to edit."
                ),
                schema=NoArgsInput,
                strict=True,
            ),
            Tool(
                name="searchSlide",
                description=(
                    "Search current slides for text/topics and return slide indices and snippets."
                ),
                schema=SearchSlidesInput,
                strict=True,
            ),
            Tool(
                name="getSlideAtIndex",
                description=(
                    "Live SQL: one slide by index—authoritative for exact current content. "
                    "Set includeFullContent=true when you need full JSON (before saveSlide or precise edits). "
                    "If user says slide N, use zero-based index N-1."
                ),
                schema=GetSlideAtIndexInput,
                strict=True,
            ),
            Tool(
                name="saveSlide",
                description=(
                    "Save full slide content for a layout. Use for complete slide payloads; "
                    "visible element/component edits should use element/component tools."
                ),
                schema=SaveSlideInput,
                strict=True,
            ),
            Tool(
                name="updateSlide",
                description="Replace an existing slide's layout/content by zero-based index.",
                schema=UpdateSlideInput,
                strict=True,
            ),
            Tool(
                name="deleteSlide",
                description="Delete an existing slide by zero-based index and reindex the rest.",
                schema=DeleteSlideInput,
                strict=True,
            ),
            Tool(
                name="addElement",
                description=(
                    "Add one rendered UI element to a slide, either inside a componentId "
                    "or as a new free component when componentId is null."
                ),
                schema=AddElementInput,
                strict=True,
            ),
            Tool(
                name="updateElement",
                description=(
                    "Update visible element content or geometry using an elementPath returned "
                    "by getSlideAtIndex. Supports text, lists, table, chart, image data, "
                    "position, size, and toolbar-style element property patches."
                ),
                schema=UpdateSlideElementInput,
                strict=True,
            ),
            Tool(
                name="deleteElement",
                description="Delete one rendered UI element by elementPath.",
                schema=DeleteSlideElementInput,
                strict=True,
            ),
            Tool(
                name="addComponent",
                description=(
                    "Add an existing/new rendered UI component block to a slide. Component "
                    "JSON must include id, description, position, size, and elements."
                ),
                schema=AddSlideComponentInput,
                strict=True,
            ),
            Tool(
                name="createComponent",
                description=(
                    "Create a grouped rendered UI component from provided component JSON "
                    "and add it to a slide."
                ),
                schema=AddSlideComponentInput,
                strict=True,
            ),
            Tool(
                name="updateComponent",
                description=(
                    "Move, resize, replace, duplicate, reorder, group, or ungroup rendered "
                    "UI components by componentId."
                ),
                schema=UpdateComponentInput,
                strict=True,
            ),
            Tool(
                name="deleteComponent",
                description=(
                    "Remove one whole component (a block such as a numbered point, card, "
                    "or callout) from a rendered slide by componentId."
                ),
                schema=DeleteSlideComponentInput,
                strict=True,
            ),
            Tool(
                name="getPresentationTheme",
                description="Read the current presentation theme and available themes.",
                schema=NoArgsInput,
                strict=True,
            ),
            Tool(
                name="setPresentationTheme",
                description=(
                    "Change the deck theme by theme name/id/query or customTheme payload."
                ),
                schema=SetPresentationThemeInput,
                strict=True,
            ),
            Tool(
                name="generateAssets",
                description="Generate one or more image/icon assets for slide edits.",
                schema=GenerateAssetsInput,
                strict=True,
            ),
        ]

    async def execute_tool_call(self, tool_call: AssistantToolCall) -> dict[str, Any]:
        handler = self._tool_handlers.get(tool_call.name)
        if not handler:
            return {
                "ok": False,
                "tool": tool_call.name,
                "error": f"Unsupported tool: {tool_call.name}",
            }

        try:
            parsed_args = self._parse_args(tool_call.arguments)
            LOGGER.info("Executing chat tool %s", tool_call.name)
            result = await handler(parsed_args)
            return {"ok": True, "tool": tool_call.name, "result": result}
        except Exception as exc:
            LOGGER.exception("Chat tool failed: %s", tool_call.name)
            return {
                "ok": False,
                "tool": tool_call.name,
                "error": str(exc),
            }

    async def _get_presentation_outline(self, _: dict[str, Any]) -> dict[str, Any]:
        outline = await self._memory.get("presentation_outline")
        if not isinstance(outline, dict):
            return {
                "found": False,
                "message": "Presentation outline is not available in memory yet.",
                "sections": [],
            }

        slides = outline.get("slides")
        if not isinstance(slides, list) or not slides:
            return {
                "found": False,
                "message": "Presentation outline exists but has no slides.",
                "sections": [],
            }

        sections: list[dict[str, Any]] = []
        for position, slide in enumerate(slides):
            index = position
            content = ""
            if isinstance(slide, dict):
                raw_index = slide.get("index")
                if isinstance(raw_index, int):
                    index = raw_index
                raw_content = slide.get("content")
                if isinstance(raw_content, str):
                    content = raw_content
                elif raw_content is not None:
                    try:
                        content = json.dumps(raw_content, ensure_ascii=False)
                    except Exception:
                        content = str(raw_content)
            elif isinstance(slide, str):
                content = slide

            title = self._extract_title(content) or f"Slide {index + 1}"
            sections.append(
                {
                    "index": index,
                    "slide_number": index + 1,
                    "title": title,
                }
            )

        return {
            "found": True,
            "slide_count": len(sections),
            "sections": sections,
            "source": outline.get("source", "memory"),
        }

    async def _search_slides(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = SearchSlidesInput(**args)
        results = await self._memory.search(payload.query, payload.limit)
        return {
            "query": payload.query,
            "count": len(results),
            "results": results,
        }

    async def _get_slide_at_index(self, args: dict[str, Any]) -> dict[str, Any]:
        normalized_args = dict(args)
        normalized_args.setdefault("includeFullContent", False)
        payload = GetSlideAtIndexInput(**normalized_args)
        slide = await self._memory.get_slide_at_index(
            payload.index,
            include_full_content=payload.include_full_content,
        )
        if not slide and payload.index > 0:
            # Users often refer to slides as 1-based; allow a safe fallback.
            fallback_index = payload.index - 1
            fallback_slide = await self._memory.get_slide_at_index(
                fallback_index,
                include_full_content=payload.include_full_content,
            )
            if fallback_slide:
                return {
                    "found": True,
                    "slide": fallback_slide,
                    "requested_index": payload.index,
                    "resolved_index": fallback_index,
                    "note": (
                        "No slide found at requested index; returned one-based fallback "
                        f"at index {fallback_index}."
                    ),
                }
        if not slide:
            return {
                "found": False,
                "message": f"No slide found at index {payload.index}.",
            }
        return {
            "found": True,
            "slide": slide,
        }

    async def _get_outline_draft(self, _: dict[str, Any]) -> dict[str, Any]:
        return await self._memory.get_outline_draft()

    async def _add_outline(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = AddOutlineInput(**args)
        return await self._memory.add_outline(
            content=payload.content,
            index=payload.index,
        )

    async def _update_outline(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = UpdateOutlineInput(**args)
        return await self._memory.update_outline(
            index=payload.index,
            content=payload.content,
        )

    async def _delete_outline(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = DeleteOutlineInput(**args)
        return await self._memory.delete_outline(index=payload.index)

    async def _add_new_slide(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = AddNewSlideInput(**args)
        return await self._memory.add_blank_slide(index=payload.index)

    async def _add_new_slide_layout(self, args: dict[str, Any]) -> dict[str, Any]:
        payload_args = json.loads(json.dumps(dict(args), ensure_ascii=False))
        raw_content = payload_args.get("content")
        if isinstance(raw_content, dict):
            payload_args["content"] = json.dumps(raw_content, ensure_ascii=False)
        payload = AddNewSlideLayoutInput(**payload_args)
        return await self._save_slide(
            {
                "content": payload.content,
                "layoutId": payload.layout_id,
                "index": payload.index,
                "replaceOldSlideAtIndex": False,
            }
        )

    async def _update_slide(self, args: dict[str, Any]) -> dict[str, Any]:
        payload_args = json.loads(json.dumps(dict(args), ensure_ascii=False))
        raw_content = payload_args.get("content")
        if isinstance(raw_content, dict):
            payload_args["content"] = json.dumps(raw_content, ensure_ascii=False)
        payload = UpdateSlideInput(**payload_args)
        return await self._save_slide(
            {
                "content": payload.content,
                "layoutId": payload.layout_id,
                "index": payload.index,
                "replaceOldSlideAtIndex": True,
            }
        )

    async def _get_available_layouts(self, _: dict[str, Any]) -> dict[str, Any]:
        layouts = await self._memory.get_available_layouts()
        return {
            "count": len(layouts),
            "layouts": layouts,
        }

    async def _get_template_summary(self, _: dict[str, Any]) -> dict[str, Any]:
        outline = await self._get_presentation_outline({})
        layouts = await self._get_available_layouts({})
        theme = await self._get_presentation_theme_catalog({})
        return {
            "outline": outline,
            "available_layouts": layouts,
            "theme": theme,
            "message": "Template summary fetched successfully.",
        }

    async def _get_presentation_theme_catalog(
        self, _: dict[str, Any]
    ) -> dict[str, Any]:
        return await self._memory.get_presentation_theme_catalog()

    async def _get_content_schema_from_layout_id(
        self, args: dict[str, Any]
    ) -> dict[str, Any]:
        payload = GetContentSchemaFromLayoutIdInput(**args)
        schema = await self._memory.get_content_schema_from_layout_id(payload.layout_id)
        if schema is None:
            return {
                "found": False,
                "layout_id": payload.layout_id,
                "message": "Layout schema not found for the provided layout id.",
            }
        return {
            "found": True,
            "layout_id": payload.layout_id,
            "content_schema": schema,
        }

    async def _generate_assets(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = GenerateAssetsInput(**args)
        generated_assets: list[dict[str, Any]] = []

        for index, asset in enumerate(payload.assets):
            if asset.kind == "image":
                url = await self._memory.generate_image(asset.prompt)
            else:
                url = await self._memory.generate_icon(asset.prompt)

            generated_assets.append(
                {
                    "index": index,
                    "kind": asset.kind,
                    "prompt": asset.prompt,
                    "url": url,
                }
            )

        return {
            "count": len(generated_assets),
            "assets": generated_assets,
            "message": f"Generated {len(generated_assets)} asset(s).",
        }

    async def _save_slide(self, args: dict[str, Any]) -> dict[str, Any]:
        payload_args = json.loads(json.dumps(dict(args), ensure_ascii=False))
        raw_content = payload_args.get("content")
        if isinstance(raw_content, dict):
            payload_args["content"] = json.dumps(raw_content, ensure_ascii=False)

        payload = SaveSlideInput(**payload_args)
        try:
            content_parsed: Any = dirtyjson.loads(payload.content)
        except Exception:
            content_parsed = json.loads(payload.content)

        if not isinstance(content_parsed, dict):
            raise ValueError("'content' must be a JSON object.")

        content_payload = json.loads(json.dumps(content_parsed, ensure_ascii=False))
        return await self._memory.save_slide(
            content=content_payload,
            layout_id=payload.layout_id,
            index=payload.index,
            replace_old_slide_at_index=payload.replace_old_slide_at_index,
        )

    async def _delete_slide(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = DeleteSlideInput(**args)
        return await self._memory.delete_slide(index=payload.index)

    async def _get_slide_elements(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = GetSlideAtIndexInput(
            index=int(args.get("index") or 0),
            includeFullContent=bool(args.get("includeFullJson")),
        )
        return await self._memory.get_slide_ui_elements(
            index=payload.index,
            include_full_json=payload.include_full_content,
        )

    async def _add_element(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = AddElementInput(**args)
        try:
            parsed: Any = dirtyjson.loads(payload.element)
        except Exception:
            parsed = json.loads(payload.element)
        element = json.loads(json.dumps(parsed, ensure_ascii=False))
        if not isinstance(element, dict):
            raise ValueError("'element' must be a JSON object.")
        return await self._memory.add_slide_ui_element(
            index=payload.index,
            element=element,
            component_id=payload.component_id,
            insert_index=payload.insert_index,
        )

    async def _update_slide_element(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = UpdateSlideElementInput(**args)
        element_patch: dict[str, Any] | None = None
        if payload.element is not None:
            try:
                parsed: Any = dirtyjson.loads(payload.element)
            except Exception:
                parsed = json.loads(payload.element)
            element_patch = json.loads(json.dumps(parsed, ensure_ascii=False))
            if not isinstance(element_patch, dict):
                raise ValueError("'element' must be a JSON object.")
        return await self._memory.update_slide_ui_element(
            index=payload.index,
            element_path=payload.element_path,
            text=payload.text,
            items=payload.items,
            table_cell=(
                payload.table_cell.model_dump(by_alias=False)
                if payload.table_cell is not None
                else None
            ),
            table=(
                payload.table.model_dump()
                if payload.table is not None
                else None
            ),
            chart=(
                payload.chart.model_dump(exclude_none=True)
                if payload.chart is not None
                else None
            ),
            element_patch=element_patch,
            position=(
                payload.position.model_dump()
                if payload.position is not None
                else None
            ),
            size=payload.size.model_dump() if payload.size is not None else None,
        )

    async def _update_slide_component(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = UpdateSlideComponentInput(**args)
        return await self._memory.update_slide_ui_component(
            index=payload.index,
            component_id=payload.component_id,
            position=(
                payload.position.model_dump()
                if payload.position is not None
                else None
            ),
            size=payload.size.model_dump() if payload.size is not None else None,
        )

    async def _update_component(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = UpdateComponentInput(**args)
        replacement_component: dict[str, Any] | None = None
        if payload.component is not None:
            try:
                parsed: Any = dirtyjson.loads(payload.component)
            except Exception:
                parsed = json.loads(payload.component)
            replacement_component = json.loads(json.dumps(parsed, ensure_ascii=False))
            if not isinstance(replacement_component, dict):
                raise ValueError("'component' must be a JSON object.")
        return await self._memory.update_slide_ui_component(
            index=payload.index,
            component_id=payload.component_id,
            action=payload.action or "update",
            component_ids=payload.component_ids,
            position=(
                payload.position.model_dump()
                if payload.position is not None
                else None
            ),
            size=payload.size.model_dump() if payload.size is not None else None,
            replacement_component=replacement_component,
        )

    async def _delete_slide_component(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = DeleteSlideComponentInput(**args)
        return await self._memory.delete_slide_ui_component(
            index=payload.index,
            component_id=payload.component_id,
        )

    async def _delete_slide_element(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = DeleteSlideElementInput(**args)
        return await self._memory.delete_slide_ui_element(
            index=payload.index,
            element_path=payload.element_path,
        )

    async def _add_slide_component(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = AddSlideComponentInput(**args)
        try:
            component_parsed: Any = dirtyjson.loads(payload.component)
        except Exception:
            component_parsed = json.loads(payload.component)
        if not isinstance(component_parsed, dict):
            raise ValueError("'component' must be a JSON object.")
        component_payload = json.loads(json.dumps(component_parsed, ensure_ascii=False))
        return await self._memory.add_slide_ui_component(
            index=payload.index,
            component=component_payload,
            insert_index=payload.insert_index,
        )

    async def _set_presentation_theme(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = SetPresentationThemeInput(**args)
        return await self._memory.set_presentation_theme(
            theme_query=payload.theme,
            custom_theme=(
                payload.custom_theme.model_dump(exclude_none=True)
                if payload.custom_theme is not None
                else None
            ),
            save_custom_theme=bool(payload.save_custom_theme),
        )

    @staticmethod
    def _parse_args(arguments: str | None) -> dict[str, Any]:
        if not arguments:
            return {}

        try:
            parsed = dirtyjson.loads(arguments)
        except Exception:
            parsed = json.loads(arguments)

        normalized = json.loads(json.dumps(parsed, ensure_ascii=False))
        if isinstance(normalized, dict):
            return normalized

        raise ValueError("Tool arguments must be a JSON object.")

    @staticmethod
    def _extract_title(markdown_content: str) -> str:
        for line in markdown_content.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            heading_match = re.match(r"^#{1,6}\s*(.+?)\s*$", stripped)
            if heading_match:
                return heading_match.group(1).strip()
            return stripped[:120]
        return ""

    @staticmethod
    def _truncate(value: str, limit: int) -> str:
        if len(value) <= limit:
            return value
        return f"{value[:limit]}..."
