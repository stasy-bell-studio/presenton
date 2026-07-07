from __future__ import annotations

import copy
import json
import math
import re
from typing import Any

_PATH_SEGMENT_RE = re.compile(r"^(?P<key>components|elements|children)\[(?P<index>\d+)\]$")
CONTENT_EDITABLE_ELEMENT_TYPES = {"text", "text-list", "table", "image", "chart"}
VISIBLE_ELEMENT_TYPES = CONTENT_EDITABLE_ELEMENT_TYPES | {
    "container",
    "rectangle",
    "ellipse",
    "line",
    "infographic",
    "flex",
    "grid",
    "grid-view",
    "group",
}


def _model_dict(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json", exclude_none=True)
    return json.loads(json.dumps(value, ensure_ascii=False))


def _ungrouped_components_from_component(
    component: dict[str, Any],
    component_index: int,
    *,
    used_ids: set[str],
) -> list[dict[str, Any]]:
    component_box = _required_box(component, label="component")
    id_base = _normalize_component_id(
        str(
            component.get("id")
            or component.get("name")
            or component.get("description")
            or f"component_{component_index + 1}"
        )
    )
    entries: list[dict[str, Any]] = []
    elements = component.get("elements")
    if not isinstance(elements, list):
        return []

    for element in elements:
        if not isinstance(element, dict):
            continue
        box = _box_or_default(
            element,
            {
                "x": 0.0,
                "y": 0.0,
                "width": component_box["width"],
                "height": component_box["height"],
            },
        )
        entries.extend(
            _ungroup_element_tree(
                element,
                {
                    "x": component_box["x"] + box["x"],
                    "y": component_box["y"] + box["y"],
                    "width": box["width"],
                    "height": box["height"],
                },
            )
        )

    parts: list[dict[str, Any]] = []
    for index, entry in enumerate(entries):
        box = entry["box"]
        element = copy.deepcopy(entry["element"])
        element["position"] = {"x": 0, "y": 0}
        element["size"] = {"width": box["width"], "height": box["height"]}
        component_id = _unique_component_id(f"{id_base}_part_{index + 1}", used_ids)
        parts.append(
            {
                "id": component_id,
                "description": "Ungrouped component element",
                "position": {"x": box["x"], "y": box["y"]},
                "size": {"width": box["width"], "height": box["height"]},
                "elements": [element],
            }
        )
    return parts


def _ungroup_element_tree(
    element: dict[str, Any],
    box: dict[str, float],
) -> list[dict[str, Any]]:
    children = _child_items(element)
    if not children:
        return [{"element": element, "box": box}]

    entries = (
        [{"element": _strip_element_children(element), "box": box}]
        if _element_has_visible_box_style(element)
        else []
    )
    for child, child_box in _layout_child_boxes(element, children, box):
        entries.extend(
            _ungroup_element_tree(
                child,
                {
                    "x": box["x"] + child_box["x"],
                    "y": box["y"] + child_box["y"],
                    "width": child_box["width"],
                    "height": child_box["height"],
                },
            )
        )
    return entries


def _child_items(element: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("children", "elements"):
        value = element.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    child = element.get("child")
    return [child] if isinstance(child, dict) else []


def _layout_child_boxes(
    parent: dict[str, Any],
    children: list[dict[str, Any]],
    parent_box: dict[str, float],
) -> list[tuple[dict[str, Any], dict[str, float]]]:
    parent_type = str(parent.get("type") or "")
    if parent_type in {"flex", "list-view"}:
        return _layout_flex_child_boxes(parent, children, parent_box)
    if parent_type in {"grid", "grid-view"}:
        return _layout_grid_child_boxes(parent, children, parent_box)

    padding = _padding(parent.get("padding")) if parent_type == "container" else {}
    content = {
        "x": float(padding.get("left", 0.0)),
        "y": float(padding.get("top", 0.0)),
        "width": max(
            1.0,
            parent_box["width"]
            - float(padding.get("left", 0.0))
            - float(padding.get("right", 0.0)),
        ),
        "height": max(
            1.0,
            parent_box["height"]
            - float(padding.get("top", 0.0))
            - float(padding.get("bottom", 0.0)),
        ),
    }
    return [
        (
            child,
            _box_or_default(
                child,
                {
                    "x": content["x"],
                    "y": content["y"],
                    "width": content["width"],
                    "height": content["height"],
                },
            ),
        )
        for child in children
    ]


def _layout_flex_child_boxes(
    parent: dict[str, Any],
    children: list[dict[str, Any]],
    parent_box: dict[str, float],
) -> list[tuple[dict[str, Any], dict[str, float]]]:
    padding = _padding(parent.get("padding"))
    direction = "row" if parent.get("direction") == "row" else "column"
    gap = _number(parent.get("gap")) or 0.0
    content_x = padding["left"]
    content_y = padding["top"]
    content_w = max(1.0, parent_box["width"] - padding["left"] - padding["right"])
    content_h = max(1.0, parent_box["height"] - padding["top"] - padding["bottom"])
    count = max(1, len(children))
    if direction == "row":
        width = max(1.0, (content_w - gap * (count - 1)) / count)
        return [
            (
                child,
                _box_or_default(
                    child,
                    {
                        "x": content_x + index * (width + gap),
                        "y": content_y,
                        "width": width,
                        "height": content_h,
                    },
                ),
            )
            for index, child in enumerate(children)
        ]
    height = max(1.0, (content_h - gap * (count - 1)) / count)
    return [
        (
            child,
            _box_or_default(
                child,
                {
                    "x": content_x,
                    "y": content_y + index * (height + gap),
                    "width": content_w,
                    "height": height,
                },
            ),
        )
        for index, child in enumerate(children)
    ]


def _layout_grid_child_boxes(
    parent: dict[str, Any],
    children: list[dict[str, Any]],
    parent_box: dict[str, float],
) -> list[tuple[dict[str, Any], dict[str, float]]]:
    padding = _padding(parent.get("padding"))
    gap = _number(parent.get("gap")) or 0.0
    column_count = _number(parent.get("columns"))
    if column_count is None and isinstance(parent.get("columns"), list):
        column_count = len(parent["columns"])
    columns = max(1, int(column_count or 1))
    rows = max(1, math.ceil(len(children) / columns))
    content_w = max(1.0, parent_box["width"] - padding["left"] - padding["right"])
    content_h = max(1.0, parent_box["height"] - padding["top"] - padding["bottom"])
    cell_w = max(1.0, (content_w - gap * (columns - 1)) / columns)
    cell_h = max(1.0, (content_h - gap * (rows - 1)) / rows)
    return [
        (
            child,
            _box_or_default(
                child,
                {
                    "x": padding["left"] + (index % columns) * (cell_w + gap),
                    "y": padding["top"] + (index // columns) * (cell_h + gap),
                    "width": cell_w,
                    "height": cell_h,
                },
            ),
        )
        for index, child in enumerate(children)
    ]


def _strip_element_children(element: dict[str, Any]) -> dict[str, Any]:
    stripped = copy.deepcopy(element)
    for key in ("child", "children", "elements", "item"):
        stripped.pop(key, None)
    return stripped


def _element_has_visible_box_style(element: dict[str, Any]) -> bool:
    if str(element.get("type") or "") not in {
        "container",
        "flex",
        "grid",
        "grid-view",
        "group",
        "list-view",
        "rectangle",
    }:
        return False
    fill = element.get("fill") if isinstance(element.get("fill"), dict) else {}
    stroke = element.get("stroke") if isinstance(element.get("stroke"), dict) else {}
    shadow = element.get("shadow") if isinstance(element.get("shadow"), dict) else {}
    return bool(
        fill.get("color")
        or fill.get("opacity") is not None
        or stroke.get("color")
        or (_number(stroke.get("width")) or 0) > 0
        or shadow.get("color")
        or shadow.get("opacity") is not None
        or element.get("border_radius") is not None
        or element.get("borderRadius") is not None
        or element.get("color")
    )


def _required_box(value: dict[str, Any], *, label: str) -> dict[str, float]:
    box = _optional_box(value)
    if box is None:
        raise ValueError(f"Cannot safely ungroup {label} without position and size.")
    return box


def _box_or_default(
    value: dict[str, Any],
    default: dict[str, float],
) -> dict[str, float]:
    return _optional_box(value) or default


def _optional_box(value: dict[str, Any]) -> dict[str, float] | None:
    position = value.get("position")
    size = value.get("size")
    if not isinstance(position, dict) or not isinstance(size, dict):
        return None
    x = _finite_number(position.get("x"))
    y = _finite_number(position.get("y"))
    width = _finite_number(size.get("width"))
    height = _finite_number(size.get("height"))
    if x is None or y is None or width is None or height is None:
        return None
    if width <= 0 or height <= 0:
        return None
    return {"x": x, "y": y, "width": width, "height": height}


def _finite_number(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        number = float(value)
        return number if math.isfinite(number) else None
    return None


def _number(value: Any) -> float | None:
    return _finite_number(value)


def _padding(value: Any) -> dict[str, float]:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        number = float(value)
        return {"top": number, "right": number, "bottom": number, "left": number}
    if not isinstance(value, dict):
        return {"top": 0.0, "right": 0.0, "bottom": 0.0, "left": 0.0}
    x = _number(value.get("x")) or _number(value.get("horizontal")) or 0.0
    y = _number(value.get("y")) or _number(value.get("vertical")) or 0.0
    return {
        "top": _number(value.get("top")) or y,
        "right": _number(value.get("right")) or x,
        "bottom": _number(value.get("bottom")) or y,
        "left": _number(value.get("left")) or x,
    }


def _normalize_component_id(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    return normalized or "component"


def _unique_component_id(base: str, used_ids: set[str]) -> str:
    stem = base[:80].strip("_") or "component"
    candidate = stem
    suffix = 2
    while candidate in used_ids:
        suffix_text = f"_{suffix}"
        candidate = f"{stem[: 80 - len(suffix_text)]}{suffix_text}"
        suffix += 1
    used_ids.add(candidate)
    return candidate


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


def _collect_editable_elements(
    layout_dict: dict[str, Any],
    *,
    include_visual_elements: bool = False,
) -> list[dict[str, Any]]:
    editable: list[dict[str, Any]] = []
    root_elements = layout_dict.get("elements")
    if isinstance(root_elements, list):
        for element_index, element in enumerate(root_elements):
            if isinstance(element, dict):
                _visit_editable_element(
                    element=element,
                    path=f"elements[{element_index}]",
                    component_id="",
                    editable=editable,
                    include_visual_elements=include_visual_elements,
                )

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
                    include_visual_elements=include_visual_elements,
                )
    return editable


def _visit_editable_element(
    *,
    element: dict[str, Any],
    path: str,
    component_id: str,
    editable: list[dict[str, Any]],
    include_visual_elements: bool,
) -> None:
    element_type = str(element.get("type") or "")
    is_content_editable = element_type in CONTENT_EDITABLE_ELEMENT_TYPES
    if is_content_editable or (
        include_visual_elements and element_type in VISIBLE_ELEMENT_TYPES
    ):
        editable.append(
            {
                "path": path,
                "component_id": component_id,
                "type": element_type,
                "name": element.get("name"),
                "decorative": element.get("decorative"),
                "content_editable": is_content_editable,
                "geometry_editable": True,
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
            include_visual_elements=include_visual_elements,
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
                    include_visual_elements=include_visual_elements,
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
        "max_children",
        "min_children",
        "max_value",
        "min_value",
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


def _resolve_layout_item_parent(
    layout_dict: dict[str, Any],
    path: str,
) -> tuple[list[Any], int]:
    current: Any = layout_dict
    segments = path.split(".")
    if not segments:
        raise ValueError("Layout item path is required.")

    for segment in segments[:-1]:
        if segment == "child":
            if not isinstance(current, dict) or not isinstance(current.get("child"), dict):
                raise ValueError(f"Invalid layout item path segment: {segment}")
            current = current["child"]
            continue

        match = _PATH_SEGMENT_RE.match(segment)
        if not match:
            raise ValueError(f"Invalid layout item path segment: {segment}")
        key = match.group("key")
        index = int(match.group("index"))
        if not isinstance(current, dict) or not isinstance(current.get(key), list):
            raise ValueError(f"Invalid layout item path segment: {segment}")
        values = current[key]
        if index >= len(values) or not isinstance(values[index], dict):
            raise ValueError(f"Invalid layout item path index: {segment}")
        current = values[index]

    match = _PATH_SEGMENT_RE.match(segments[-1])
    if not match:
        raise ValueError(f"Invalid layout item path segment: {segments[-1]}")
    key = match.group("key")
    index = int(match.group("index"))
    if not isinstance(current, dict) or not isinstance(current.get(key), list):
        raise ValueError(f"Invalid layout item path segment: {segments[-1]}")
    values = current[key]
    if index >= len(values):
        raise ValueError(f"Invalid layout item path index: {segments[-1]}")
    return values, index


def _preserve_slot_fields(
    target: dict[str, Any],
    slot: dict[str, Any],
    *,
    keep_id: bool,
) -> None:
    for key in ("position", "size", "rotation"):
        if key in slot:
            target[key] = copy.deepcopy(slot[key])
        else:
            target.pop(key, None)
    if keep_id:
        target["id"] = slot.get("id")


def _is_top_level_component_path(path: str) -> bool:
    match = _PATH_SEGMENT_RE.match(path)
    return bool(
        match
        and match.group("key") == "components"
        and match.group(0) == path
    )


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


def _looks_like_chart_request(value: str) -> bool:
    if _looks_like_asset_reference(value):
        return False
    normalized = " ".join(value.casefold().split())
    if not normalized:
        return False
    chart_phrases = (
        "pie chart",
        "bar chart",
        "line chart",
        "area chart",
        "donut chart",
        "column chart",
        "stacked bar",
        "stacked column",
        "radial chart",
        "chart with",
        "chart showing",
        "dummy metrics",
        "dummy chart",
    )
    if any(phrase in normalized for phrase in chart_phrases):
        return True
    if "chart" not in normalized:
        return False
    return any(
        token in normalized
        for token in ("pie", "bar", "line", "donut", "metrics", "graph", "visualization")
    )


def _chart_request_on_image_error() -> ValueError:
    return ValueError(
        "Chart requests must use a chart element, not an image. If the target is an "
        "image/icon, delete that component and addComponent with type chart "
        "(chart_type/chartType pie|bar|line|donut, title, categories, series with "
        "values). If the target is already chart, use updateElement with chart."
    )


def _looks_like_asset_reference(value: str) -> bool:
    stripped = value.strip()
    return stripped.startswith(
        ("http://", "https://", "/app_data/", "/static/", "data:", "blob:")
    )


def _chart_update_has_content(chart: dict[str, Any] | None) -> bool:
    if chart is None:
        return False
    if chart.get("title") is not None:
        return True
    if chart.get("categories") is not None:
        return True
    return chart.get("series") is not None


def _resolve_image_update_payload(
    text: str | None,
    items: list[str] | None,
) -> str | dict[str, Any] | None:
    if text is not None:
        stripped = text.strip()
        if not stripped:
            return None
        if stripped.startswith("{") and stripped.endswith("}"):
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, dict):
                return parsed
        return text
    if isinstance(items, list) and len(items) == 1:
        candidate = str(items[0] or "").strip()
        if candidate:
            return candidate
    return None


def _template_v2_asset_url(value: Any) -> str | None:
    from utils.asset_directory_utils import normalize_slide_asset_url

    if isinstance(value, str):
        return normalize_slide_asset_url(value)
    if not isinstance(value, dict):
        return None

    for key in (
        "data",
        "url",
        "image_url",
        "icon_url",
        "__image_url__",
        "__icon_url__",
    ):
        asset_url = value.get(key)
        if isinstance(asset_url, str) and asset_url.strip():
            return normalize_slide_asset_url(asset_url)
    return None


def _template_v2_asset_prompt(value: Any, *, is_icon: bool) -> str | None:
    if not isinstance(value, dict):
        return None

    prompt_keys = (
        ("icon_query", "__icon_query__", "query", "prompt")
        if is_icon
        else ("image_prompt", "__image_prompt__", "prompt", "query")
    )
    for key in prompt_keys:
        prompt = value.get(key)
        if isinstance(prompt, str) and prompt.strip():
            return prompt
    return None


def _apply_image_element_value(element: dict[str, Any], value: Any) -> None:
    asset_url = _template_v2_asset_url(value)
    if not asset_url:
        raise ValueError(
            "Image/icon updates require `text` with an image or icon URL."
        )
    element["data"] = asset_url
    prompt = _template_v2_asset_prompt(
        value,
        is_icon=element.get("is_icon") is True,
    )
    if prompt:
        element["prompt"] = prompt


def _apply_image_element_update(
    element: dict[str, Any],
    *,
    text: str | None,
    items: list[str] | None,
) -> None:
    payload = _resolve_image_update_payload(text, items)
    if payload is None:
        raise ValueError(
            "Image/icon updates require `text` with an image or icon URL."
        )
    if isinstance(payload, str) and _looks_like_chart_request(payload):
        raise _chart_request_on_image_error()
    _apply_image_element_value(element, payload)


def _content_update_requested_for_type(
    element_type: str,
    *,
    text: str | None,
    items: list[str] | None,
    table_cell: dict[str, Any] | None,
    table: dict[str, Any] | None,
    chart: dict[str, Any] | None,
) -> bool:
    if element_type == "text":
        return text is not None
    if element_type == "text-list":
        return items is not None
    if element_type == "table":
        return table is not None or table_cell is not None
    if element_type == "chart":
        return _chart_update_has_content(chart)
    if element_type == "image":
        return _resolve_image_update_payload(text, items) is not None
    return any(
        value is not None
        for value in (text, items, table_cell, table, chart)
    )


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


def _update_table_element(element: dict[str, Any], table: dict[str, Any]) -> None:
    columns = table.get("columns") or table.get("headers")
    rows = table.get("rows")
    if not isinstance(columns, list) or not isinstance(rows, list):
        raise ValueError("table update requires columns/headers and rows.")
    if not all(isinstance(row, list) for row in rows):
        raise ValueError("table rows must be lists.")

    column_count = len(columns)
    if column_count == 0:
        raise ValueError("table must contain at least one column.")
    if any(len(row) != column_count for row in rows):
        raise ValueError("each table row must match the column count.")

    min_columns = int(element.get("min_columns") or 0)
    max_columns = int(element.get("max_columns") or max(column_count, 100))
    min_rows = int(element.get("min_rows") or 0)
    max_rows = int(element.get("max_rows") or max(len(rows), 100))
    if column_count < min_columns or column_count > max_columns:
        raise ValueError("table column count is outside this element's limits.")
    if len(rows) < min_rows or len(rows) > max_rows:
        raise ValueError("table row count is outside this element's limits.")

    existing_columns = _dicts(element.get("columns"))
    existing_rows = [
        _dicts(row) for row in element.get("rows", []) if isinstance(row, list)
    ]

    element["columns"] = [
        _replacement_table_cell(
            value=value,
            existing=existing_columns[index] if index < len(existing_columns) else None,
        )
        for index, value in enumerate(columns)
    ]
    element["rows"] = [
        [
            _replacement_table_cell(
                value=value,
                existing=(
                    existing_rows[row_index][column_index]
                    if row_index < len(existing_rows)
                    and column_index < len(existing_rows[row_index])
                    else None
                ),
            )
            for column_index, value in enumerate(row)
        ]
        for row_index, row in enumerate(rows)
    ]


def _replacement_table_cell(value: Any, existing: dict[str, Any] | None) -> dict[str, Any]:
    cell = copy.deepcopy(existing) if isinstance(existing, dict) else {}
    cell["runs"] = _replacement_runs(
        existing_runs=cell.get("runs"),
        text=_table_value_text(value),
        fallback_font=cell.get("font"),
    )
    return cell


def _table_value_text(value: Any) -> str:
    if isinstance(value, dict):
        if isinstance(value.get("text"), str):
            return value["text"]
        runs = value.get("runs")
        if isinstance(runs, list):
            return _runs_text(runs)
    if value is None:
        return ""
    return str(value)


def _update_chart_element(element: dict[str, Any], chart: dict[str, Any]) -> None:
    if "chart_type" in chart:
        element["chart_type"] = chart["chart_type"]
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
