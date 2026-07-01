from __future__ import annotations

import copy
import json
import logging
import re
from typing import Any, Awaitable, Callable

import dirtyjson  # type: ignore[import-untyped]
from llmai.shared import AssistantToolCall, Tool  # type: ignore[import-not-found]

from services.chat.v2.context_store import TemplateV2ContextStore
from services.chat.v2.schemas import (
    DeleteComponentInput,
    GetEditableElementsInput,
    GetSlideLayoutInput,
    NoArgsInput,
    SearchTemplateContentInput,
    SwapComponentVariantInput,
    UpdateElementContentInput,
)
from templates.v2.models.layouts import SlideLayout

LOGGER = logging.getLogger(__name__)

ToolHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]
_PATH_SEGMENT_RE = re.compile(r"^(?P<key>components|elements|children)\[(?P<index>\d+)\]$")


class TemplateV2ChatTools:
    def __init__(self, context: TemplateV2ContextStore):
        self._context = context
        self._tool_handlers: dict[str, ToolHandler] = {
            "getTemplateSummary": self._get_template_summary,
            "getSlideLayout": self._get_slide_layout,
            "searchTemplateContent": self._search_template_content,
            "getEditableElements": self._get_editable_elements,
            "updateElementContent": self._update_element_content,
            "deleteComponent": self._delete_component,
            "swapComponentVariant": self._swap_component_variant,
        }

    def get_tool_definitions(self) -> list[Tool]:
        return [
            Tool(
                name="getTemplateSummary",
                description=(
                    "Read compact TemplateV2 structure: slide layouts, component ids, "
                    "component descriptions, and element types. Use before deciding "
                    "which slide/component to inspect or edit."
                ),
                schema=NoArgsInput,
                strict=True,
            ),
            Tool(
                name="getSlideLayout",
                description=(
                    "Read one TemplateV2 SlideLayout by zero-based slideIndex. "
                    "Set includeFullJson=true only when exact JSON is required before "
                    "an edit or variant decision."
                ),
                schema=GetSlideLayoutInput,
                strict=True,
            ),
            Tool(
                name="searchTemplateContent",
                description=(
                    "Search editable text, list items, table cells, chart labels, "
                    "image data, component descriptions, and layout descriptions. "
                    "Returns slide indices and concrete element paths."
                ),
                schema=SearchTemplateContentInput,
                strict=True,
            ),
            Tool(
                name="getEditableElements",
                description=(
                    "List editable element paths for one slide. Use this before "
                    "updateElementContent. Paths are concrete and safe to pass back."
                ),
                schema=GetEditableElementsInput,
                strict=True,
            ),
            Tool(
                name="updateElementContent",
                description=(
                    "Patch safe content fields only for one concrete element path: "
                    "text.runs via text, text-list.items via items, one table cell via "
                    "tableCell, chart title/categories/series via chart, or image/icon "
                    "data via text. Does not change geometry or create elements."
                ),
                schema=UpdateElementContentInput,
                strict=True,
            ),
            Tool(
                name="deleteComponent",
                description=(
                    "Delete one simple component by explicit zero-based slideIndex and "
                    "componentId. Use only when the user clearly asks to remove that "
                    "component/content from the template."
                ),
                schema=DeleteComponentInput,
                strict=True,
            ),
            Tool(
                name="swapComponentVariant",
                description=(
                    "Swap a component with a compatible variant from template "
                    "merged_components. Preserves the current component id, position, "
                    "and size; replaces description/elements only."
                ),
                schema=SwapComponentVariantInput,
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
            LOGGER.info("Executing TemplateV2 chat tool %s", tool_call.name)
            result = await handler(parsed_args)
            return {"ok": True, "tool": tool_call.name, "result": result}
        except Exception as exc:
            LOGGER.exception("TemplateV2 chat tool failed: %s", tool_call.name)
            return {"ok": False, "tool": tool_call.name, "error": str(exc)}

    async def _get_template_summary(self, _: dict[str, Any]) -> dict[str, Any]:
        template = await self._context.get_template()
        layouts = await self._context.get_slide_layouts()
        slides: list[dict[str, Any]] = []
        for slide_index, layout in enumerate(layouts.layouts):
            layout_dict = _model_dict(layout)
            components = []
            for component in layout_dict.get("components", []):
                if not isinstance(component, dict):
                    continue
                components.append(
                    {
                        "component_id": component.get("id"),
                        "description": component.get("description"),
                        "element_types": [
                            element.get("type")
                            for element in component.get("elements", [])
                            if isinstance(element, dict)
                        ],
                    }
                )
            slides.append(
                {
                    "slide_index": slide_index,
                    "slide_number": slide_index + 1,
                    "layout_id": layout.id,
                    "description": layout.description,
                    "component_count": len(layout.components),
                    "components": components,
                }
            )

        return {
            "template_id": str(template.id),
            "name": template.name,
            "description": template.description,
            "slide_count": len(slides),
            "slides": slides,
            "message": f"Template has {len(slides)} slide layout(s).",
        }

    async def _get_slide_layout(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = GetSlideLayoutInput(**args)
        layout = await self._context.get_slide_layout(payload.slide_index)
        layout_dict = _model_dict(layout)
        editable = _collect_editable_elements(layout_dict)
        if payload.include_full_json:
            return {
                "found": True,
                "slide_index": payload.slide_index,
                "slide_number": payload.slide_index + 1,
                "layout": layout_dict,
                "editable_count": len(editable),
            }
        return {
            "found": True,
            "slide_index": payload.slide_index,
            "slide_number": payload.slide_index + 1,
            "layout_id": layout.id,
            "description": layout.description,
            "component_count": len(layout.components),
            "components": _compact_components(layout_dict),
            "editable_count": len(editable),
        }

    async def _search_template_content(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = SearchTemplateContentInput(**args)
        layouts = await self._context.get_slide_layouts()
        query = payload.query.casefold()
        matches: list[dict[str, Any]] = []

        for slide_index, layout in enumerate(layouts.layouts):
            layout_dict = _model_dict(layout)
            candidates: list[dict[str, Any]] = [
                {
                    "slide_index": slide_index,
                    "slide_number": slide_index + 1,
                    "kind": "layout",
                    "path": "",
                    "name": layout.id,
                    "text": f"{layout.id} {layout.description}",
                }
            ]
            for entry in _collect_editable_elements(layout_dict):
                text = _searchable_text(entry.get("content"))
                if text:
                    candidates.append({**entry, "text": text})

            for candidate in candidates:
                text = str(candidate.get("text") or "")
                if query not in text.casefold():
                    continue
                matches.append(
                    {
                        "slide_index": slide_index,
                        "slide_number": slide_index + 1,
                        "path": candidate.get("path"),
                        "component_id": candidate.get("component_id"),
                        "type": candidate.get("type") or candidate.get("kind"),
                        "name": candidate.get("name"),
                        "snippet": _snippet(text, payload.query),
                    }
                )
                if len(matches) >= payload.limit:
                    return {
                        "query": payload.query,
                        "count": len(matches),
                        "results": matches,
                    }

        return {
            "query": payload.query,
            "count": len(matches),
            "results": matches,
        }

    async def _get_editable_elements(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = GetEditableElementsInput(**args)
        layout = await self._context.get_slide_layout(payload.slide_index)
        editable = _collect_editable_elements(_model_dict(layout))
        return {
            "slide_index": payload.slide_index,
            "slide_number": payload.slide_index + 1,
            "layout_id": layout.id,
            "count": len(editable),
            "elements": editable,
        }

    async def _update_element_content(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = UpdateElementContentInput(**args)
        layout = await self._context.get_slide_layout(payload.slide_index)
        layout_dict = _model_dict(layout)
        element = _resolve_element_path(layout_dict, payload.element_path)
        element_type = str(element.get("type") or "")

        if element_type == "text":
            if payload.text is None:
                raise ValueError("text is required for text elements.")
            _update_text_element(element, payload.text)
        elif element_type == "text-list":
            if payload.items is None:
                raise ValueError("items is required for text-list elements.")
            _update_text_list_element(element, payload.items)
        elif element_type == "table":
            if payload.table_cell is None:
                raise ValueError("tableCell is required for table elements.")
            _update_table_cell(element, payload.table_cell.model_dump(by_alias=False))
        elif element_type == "chart":
            if payload.chart is None:
                raise ValueError("chart is required for chart elements.")
            _update_chart_element(element, payload.chart.model_dump(exclude_none=True))
        elif element_type == "image":
            if payload.text is None:
                raise ValueError("text must contain the replacement image/icon data.")
            element["data"] = payload.text
        else:
            raise ValueError(f"Element type '{element_type}' is not content-editable.")

        updated_layout = SlideLayout.model_validate(layout_dict)
        await self._context.save_slide_layout(
            slide_index=payload.slide_index,
            layout=updated_layout,
        )

        component_id = _component_id_for_path(layout_dict, payload.element_path)
        return {
            "updated": True,
            "slide_index": payload.slide_index,
            "slide_number": payload.slide_index + 1,
            "component_id": component_id,
            "element_path": payload.element_path,
            "element_type": element_type,
            "message": (
                f"Updated {element_type} content on slide {payload.slide_index + 1}."
            ),
        }

    async def _delete_component(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = DeleteComponentInput(**args)
        layout = await self._context.get_slide_layout(payload.slide_index)
        layout_dict = _model_dict(layout)
        components = layout_dict.get("components")
        if not isinstance(components, list):
            raise ValueError("Slide layout has no components list.")

        before = len(components)
        layout_dict["components"] = [
            component
            for component in components
            if not (isinstance(component, dict) and component.get("id") == payload.component_id)
        ]
        if len(layout_dict["components"]) == before:
            raise ValueError(f"Component '{payload.component_id}' was not found.")

        updated_layout = SlideLayout.model_validate(layout_dict)
        await self._context.save_slide_layout(
            slide_index=payload.slide_index,
            layout=updated_layout,
        )
        return {
            "deleted": True,
            "slide_index": payload.slide_index,
            "slide_number": payload.slide_index + 1,
            "component_id": payload.component_id,
            "message": (
                f"Deleted component '{payload.component_id}' from slide "
                f"{payload.slide_index + 1}."
            ),
        }

    async def _swap_component_variant(self, args: dict[str, Any]) -> dict[str, Any]:
        payload = SwapComponentVariantInput(**args)
        layout = await self._context.get_slide_layout(payload.slide_index)
        layout_dict = _model_dict(layout)
        components = layout_dict.get("components")
        if not isinstance(components, list):
            raise ValueError("Slide layout has no components list.")

        component_index = next(
            (
                index
                for index, component in enumerate(components)
                if isinstance(component, dict) and component.get("id") == payload.component_id
            ),
            None,
        )
        if component_index is None:
            raise ValueError(f"Component '{payload.component_id}' was not found.")
        current_component = components[component_index]
        if not isinstance(current_component, dict):
            raise ValueError("Target component is invalid.")

        merged_components = await self._context.get_merged_components()
        if merged_components is None:
            raise ValueError("No merged component variants are available.")

        variant = None
        merged_group_id = None
        for group in merged_components.components:
            variant_ids = {candidate.id for candidate in group.variants}
            if payload.component_id not in variant_ids and payload.component_id != group.id:
                continue
            merged_group_id = group.id
            if payload.variant_id is not None:
                variant = next(
                    (candidate for candidate in group.variants if candidate.id == payload.variant_id),
                    None,
                )
            elif payload.variant_index is not None and payload.variant_index < len(group.variants):
                variant = group.variants[payload.variant_index]
            break

        if variant is None:
            raise ValueError("Requested compatible variant was not found.")

        variant_dict = _model_dict(variant)
        if not isinstance(variant_dict.get("elements"), list) or not variant_dict["elements"]:
            raise ValueError("Requested variant has no elements.")

        replacement = copy.deepcopy(variant_dict)
        replacement["id"] = current_component.get("id")
        replacement["position"] = current_component.get("position")
        replacement["size"] = current_component.get("size")
        components[component_index] = replacement

        updated_layout = SlideLayout.model_validate(layout_dict)
        await self._context.save_slide_layout(
            slide_index=payload.slide_index,
            layout=updated_layout,
        )
        return {
            "swapped": True,
            "slide_index": payload.slide_index,
            "slide_number": payload.slide_index + 1,
            "component_id": payload.component_id,
            "variant_id": variant.id,
            "merged_component_id": merged_group_id,
            "message": (
                f"Swapped component '{payload.component_id}' to variant "
                f"'{variant.id}' on slide {payload.slide_index + 1}."
            ),
        }

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


def _model_dict(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json", exclude_none=True)
    return json.loads(json.dumps(value, ensure_ascii=False))


def _compact_components(layout_dict: dict[str, Any]) -> list[dict[str, Any]]:
    components: list[dict[str, Any]] = []
    for component in layout_dict.get("components", []):
        if not isinstance(component, dict):
            continue
        components.append(
            {
                "component_id": component.get("id"),
                "description": component.get("description"),
                "element_count": len(component.get("elements", []))
                if isinstance(component.get("elements"), list)
                else 0,
                "element_types": [
                    element.get("type")
                    for element in component.get("elements", [])
                    if isinstance(element, dict)
                ],
            }
        )
    return components


def _collect_editable_elements(layout_dict: dict[str, Any]) -> list[dict[str, Any]]:
    editable: list[dict[str, Any]] = []
    components = layout_dict.get("components", [])
    if not isinstance(components, list):
        return editable

    for component_index, component in enumerate(components):
        if not isinstance(component, dict):
            continue
        component_id = str(component.get("id") or "")
        elements = component.get("elements", [])
        if not isinstance(elements, list):
            continue
        for element_index, element in enumerate(elements):
            if isinstance(element, dict):
                _visit_editable_element(
                    element=element,
                    path=f"components[{component_index}].elements[{element_index}]",
                    component_id=component_id,
                    editable=editable,
                )
    return editable


def _visit_editable_element(
    *,
    element: dict[str, Any],
    path: str,
    component_id: str,
    editable: list[dict[str, Any]],
) -> None:
    element_type = str(element.get("type") or "")
    if element_type in {"text", "text-list", "table", "image", "chart"}:
        editable.append(
            {
                "path": path,
                "component_id": component_id,
                "type": element_type,
                "name": element.get("name"),
                "decorative": element.get("decorative"),
                "content": _element_content(element),
                "limits": _element_limits(element),
            }
        )

    child = element.get("child")
    if isinstance(child, dict):
        _visit_editable_element(
            element=child,
            path=f"{path}.child",
            component_id=component_id,
            editable=editable,
        )

    children = element.get("children")
    if isinstance(children, list):
        for index, nested in enumerate(children):
            if isinstance(nested, dict):
                _visit_editable_element(
                    element=nested,
                    path=f"{path}.children[{index}]",
                    component_id=component_id,
                    editable=editable,
                )


def _element_limits(element: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "max_length",
        "min_length",
        "max_items",
        "min_items",
        "max_item_length",
        "min_item_length",
        "max_columns",
        "min_columns",
        "max_rows",
        "min_rows",
    )
    return {key: element[key] for key in keys if key in element}


def _element_content(element: dict[str, Any]) -> Any:
    element_type = element.get("type")
    if element_type == "text":
        return {"text": _runs_text(element.get("runs"))}
    if element_type == "text-list":
        items = element.get("items") if isinstance(element.get("items"), list) else []
        return {"items": [_runs_text(item) for item in items]}
    if element_type == "table":
        return {
            "columns": [_runs_text(cell.get("runs")) for cell in _dicts(element.get("columns"))],
            "rows": [
                [_runs_text(cell.get("runs")) for cell in _dicts(row)]
                for row in element.get("rows", [])
                if isinstance(row, list)
            ],
        }
    if element_type == "chart":
        return {
            "title": element.get("title"),
            "categories": element.get("categories"),
            "series": element.get("series"),
        }
    if element_type == "image":
        return {
            "data": element.get("data"),
            "is_icon": element.get("is_icon"),
        }
    return None


def _dicts(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _runs_text(value: Any) -> str:
    if not isinstance(value, list):
        return ""
    return "".join(str(run.get("text") or "") for run in value if isinstance(run, dict))


def _searchable_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    try:
        return json.dumps(content, ensure_ascii=False)
    except Exception:
        return str(content)


def _snippet(text: str, query: str, limit: int = 220) -> str:
    normalized = text.replace("\n", " ")
    index = normalized.casefold().find(query.casefold())
    if index < 0:
        return normalized[:limit]
    start = max(0, index - 70)
    end = min(len(normalized), index + len(query) + 140)
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(normalized) else ""
    return f"{prefix}{normalized[start:end]}{suffix}"


def _resolve_element_path(layout_dict: dict[str, Any], path: str) -> dict[str, Any]:
    current: Any = layout_dict
    for segment in path.split("."):
        if segment == "child":
            if not isinstance(current, dict) or not isinstance(current.get("child"), dict):
                raise ValueError(f"Invalid element path segment: {segment}")
            current = current["child"]
            continue

        match = _PATH_SEGMENT_RE.match(segment)
        if not match:
            raise ValueError(f"Invalid element path segment: {segment}")
        key = match.group("key")
        index = int(match.group("index"))
        if not isinstance(current, dict) or not isinstance(current.get(key), list):
            raise ValueError(f"Invalid element path segment: {segment}")
        values = current[key]
        if index >= len(values) or not isinstance(values[index], dict):
            raise ValueError(f"Invalid element path index: {segment}")
        current = values[index]

    if not isinstance(current, dict) or not isinstance(current.get("type"), str):
        raise ValueError("Path does not resolve to an element.")
    return current


def _component_id_for_path(layout_dict: dict[str, Any], path: str) -> str | None:
    first = path.split(".", 1)[0]
    match = _PATH_SEGMENT_RE.match(first)
    if not match or match.group("key") != "components":
        return None
    index = int(match.group("index"))
    components = layout_dict.get("components")
    if not isinstance(components, list) or index >= len(components):
        return None
    component = components[index]
    return str(component.get("id")) if isinstance(component, dict) else None


def _update_text_element(element: dict[str, Any], text: str) -> None:
    _validate_text_length(
        text,
        min_length=element.get("min_length"),
        max_length=element.get("max_length"),
        label=str(element.get("name") or "text"),
    )
    element["runs"] = _replacement_runs(
        existing_runs=element.get("runs"),
        text=text,
        fallback_font=element.get("font"),
    )
    # The Konva renderer reads the flattened top-level `text` in preference to
    # `runs` (see rawTextContent in TemplateV2KonvaSlide.tsx), and the frontend
    # inline editor always writes both. Keep them in sync so edits are visible.
    element["text"] = text


def _update_text_list_element(element: dict[str, Any], items: list[str]) -> None:
    min_items = _int_or_none(element.get("min_items"))
    max_items = _int_or_none(element.get("max_items"))
    if min_items is not None and len(items) < min_items:
        raise ValueError(f"Text list requires at least {min_items} item(s).")
    if max_items is not None and len(items) > max_items:
        raise ValueError(f"Text list allows at most {max_items} item(s).")

    for index, item in enumerate(items):
        _validate_text_length(
            item,
            min_length=element.get("min_item_length"),
            max_length=element.get("max_item_length"),
            label=f"list item {index + 1}",
        )

    source_items = element.get("items") if isinstance(element.get("items"), list) else []
    element["items"] = [
        _replacement_runs(
            existing_runs=source_items[index] if index < len(source_items) else None,
            text=item,
            fallback_font=element.get("font"),
        )
        for index, item in enumerate(items)
    ]


def _update_table_cell(element: dict[str, Any], table_cell: dict[str, Any]) -> None:
    section = table_cell["section"]
    column_index = int(table_cell["column_index"])
    text = str(table_cell.get("text") or "")
    if section == "columns":
        columns = element.get("columns")
        if not isinstance(columns, list) or column_index >= len(columns):
            raise ValueError("Invalid table column index.")
        target = columns[column_index]
    else:
        row_index = table_cell.get("row_index")
        rows = element.get("rows")
        if not isinstance(row_index, int) or not isinstance(rows, list) or row_index >= len(rows):
            raise ValueError("Invalid table row index.")
        row = rows[row_index]
        if not isinstance(row, list) or column_index >= len(row):
            raise ValueError("Invalid table cell column index.")
        target = row[column_index]

    if not isinstance(target, dict):
        raise ValueError("Target table cell is invalid.")
    target["runs"] = _replacement_runs(
        existing_runs=target.get("runs"),
        text=text,
        fallback_font=target.get("font"),
    )


def _update_chart_element(element: dict[str, Any], chart: dict[str, Any]) -> None:
    if "title" in chart:
        element["title"] = chart["title"]
    if "categories" in chart:
        element["categories"] = chart["categories"]
    if "series" in chart:
        element["series"] = chart["series"]

    categories = element.get("categories")
    series = element.get("series")
    if isinstance(categories, list) and isinstance(series, list):
        category_count = len(categories)
        for item in series:
            if not isinstance(item, dict):
                continue
            values = item.get("values")
            if isinstance(values, list) and len(values) != category_count:
                raise ValueError("Each chart series must match the category count.")


def _replacement_runs(
    *,
    existing_runs: Any,
    text: str,
    fallback_font: Any,
) -> list[dict[str, Any]]:
    if isinstance(existing_runs, list) and existing_runs:
        first = existing_runs[0]
        if isinstance(first, dict):
            run = copy.deepcopy(first)
            run["text"] = text
            return [run]
    run: dict[str, Any] = {"text": text}
    if isinstance(fallback_font, dict):
        run["font"] = copy.deepcopy(fallback_font)
    return [run]


def _validate_text_length(
    text: str,
    *,
    min_length: Any,
    max_length: Any,
    label: str,
) -> None:
    min_value = _int_or_none(min_length)
    max_value = _int_or_none(max_length)
    if min_value is not None and len(text) < min_value:
        raise ValueError(f"{label} must be at least {min_value} character(s).")
    if max_value is not None and len(text) > max_value:
        raise ValueError(f"{label} must be at most {max_value} character(s).")


def _int_or_none(value: Any) -> int | None:
    return value if isinstance(value, int) else None
