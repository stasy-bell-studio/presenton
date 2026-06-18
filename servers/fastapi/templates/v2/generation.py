from __future__ import annotations

import copy
import json
import logging
import os
import re
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from json import JSONDecodeError
from time import perf_counter
from typing import Any, Callable

from llmai import get_client
from llmai.shared import (
    AssistantMessage,
    JSONSchemaResponse,
    SystemMessage,
    UserMessage,
)
from pydantic import (
    BaseModel,
    Field,
    TypeAdapter,
    ValidationError,
    field_validator,
    model_validator,
)

from templates.v2.models.elements import Position, Size, SlideElement
from templates.v2.models.layouts import SlideLayouts
from utils.llm_config import get_llm_config
from utils.llm_provider import get_model


DEFAULT_VALIDATION_RETRIES = 5
DEFAULT_LLM_LOG_PREVIEW_CHARS = 4000
LLM_LOG_PREVIEW_CHARS_ENV = "TEMPLATE_V2_LLM_LOG_PREVIEW_CHARS"
MAX_PARALLEL_CLUSTER_CANDIDATES = 10
MAX_PARALLEL_COMPONENTS = 8
CONTENT_ELEMENT_TYPES = {"text", "image", "text-list", "table", "chart"}
ELEMENT_TYPES = {
    "text",
    "container",
    "image",
    "text-list",
    "table",
    "rectangle",
    "ellipse",
    "line",
    "chart",
    "flex",
    "grid",
    "group",
}
ARRAY_INDEX_RE = re.compile(r"^(0|[1-9]\d*)$")

LOGGER = logging.getLogger(__name__)
_SLIDE_ELEMENTS_ADAPTER = TypeAdapter(list[SlideElement])


class ClusterCandidate(BaseModel):
    id: str
    description: str = Field(min_length=10, max_length=200)
    slide_index: int = Field(ge=0)
    elements: list[int] = Field(min_length=1)

    @field_validator("elements")
    @classmethod
    def _element_indices_must_be_valid(cls, value: list[int]) -> list[int]:
        if len(value) != len(set(value)):
            raise ValueError("elements must not contain duplicate indices")
        if any(index < 0 for index in value):
            raise ValueError("elements must contain non-negative indices")
        return value


class Cluster(BaseModel):
    id: str
    candidates: list[int] = Field(min_length=1)

    @field_validator("candidates")
    @classmethod
    def _candidate_indices_must_be_valid(cls, value: list[int]) -> list[int]:
        if len(value) != len(set(value)):
            raise ValueError("candidates must not contain duplicate indices")
        if any(index < 0 for index in value):
            raise ValueError("candidates must contain non-negative indices")
        return value


class DesignVariableEffect(BaseModel):
    source: str = Field(min_length=1)
    target: str = Field(min_length=1)


class DesignVariable(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    type: str = Field(min_length=1, max_length=40)
    options: list[Any] = Field(default_factory=list)
    effect: list[DesignVariableEffect] = Field(default_factory=list)


class Component(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=10, max_length=300)
    position: Position
    size: Size
    design_variables: list[DesignVariable] = Field(default_factory=list)
    elements: list[SlideElement] = Field(min_length=1)

    @model_validator(mode="after")
    def _design_variable_names_must_be_unique(self) -> "Component":
        names = [variable.name for variable in self.design_variables]
        if len(names) != len(set(names)):
            raise ValueError("design variable names must be unique")
        return self


_COMPONENTS_ADAPTER = TypeAdapter(list[Component])


class ComponentClusterCandidate(BaseModel):
    id: str
    slide_index: int
    description: str
    elements: list[SlideElement] = Field(min_length=1)


class ComponentCluster(BaseModel):
    id: str
    candidates: list[ComponentClusterCandidate] = Field(min_length=1)


class TemplateStats(BaseModel):
    replaced_candidates: int
    skipped_overlapping_candidates: int
    untouched_elements: int


class TemplateGenerationArtifacts(BaseModel):
    cluster_candidates: dict[str, Any]
    clusters: dict[str, Any]
    components: dict[str, Any]
    layouts: dict[str, Any]
    stats: TemplateStats


class _ClusterCandidateSelection(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=10, max_length=200)
    element_indices: list[int] = Field(min_length=1)

    @field_validator("element_indices")
    @classmethod
    def _element_indices_must_be_unique(cls, value: list[int]) -> list[int]:
        if len(value) != len(set(value)):
            raise ValueError("element_indices must not contain duplicates")
        return value


class _ClusterCandidateSelections(BaseModel):
    candidates: list[_ClusterCandidateSelection]

    @model_validator(mode="after")
    def _candidate_ids_must_be_unique(self) -> "_ClusterCandidateSelections":
        ids = [candidate.id for candidate in self.candidates]
        if len(ids) != len(set(ids)):
            raise ValueError("candidate ids must be unique")
        return self


class _ClusterSelection(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    candidate_indices: list[int] = Field(min_length=1)

    @field_validator("candidate_indices")
    @classmethod
    def _candidate_indices_must_be_unique(cls, value: list[int]) -> list[int]:
        if len(value) != len(set(value)):
            raise ValueError("candidate_indices must not contain duplicates")
        return value


class _ClusterSelections(BaseModel):
    clusters: list[_ClusterSelection]

    @model_validator(mode="after")
    def _cluster_ids_must_be_unique(self) -> "_ClusterSelections":
        ids = [cluster.id for cluster in self.clusters]
        if len(ids) != len(set(ids)):
            raise ValueError("cluster ids must be unique")
        return self


class _CandidateRecord(BaseModel):
    index: int
    id: str
    slide_index: int
    element_indices: list[int]
    elements: list[dict[str, Any]]


@dataclass(frozen=True)
class ContentElementMatch:
    element: dict[str, Any]
    bounds: dict[str, float]


GENERATE_CLUSTER_CANDIDATES_SYSTEM_PROMPT = """
Identify reusable visual component candidates in one slide.
The user message contains slide elements with stable 0-based source indices.
Return exactly one raw JSON object matching the response schema.
Do not include markdown, comments, explanations, or text outside the JSON object.

# What to Cluster
- Create candidates for elements that together form a component: a card, list of cards, table block, pricing/metric block, timeline item, icon/text feature, chart block, header/nav, or similar reusable visual unit.
- Every source element must be included in at least one candidate.
- Page titles, subtitles, footers, dividers, lines, decorative shapes, backgrounds, ornaments, isolated text, standalone images, tables, charts, and text-lists are all valid candidate material.
- If a title has a line below it, group the title and line as a candidate.
- A candidate may contain exactly one element.
- If an element does not visually belong with nearby elements, create a single-element candidate for it instead of omitting it.
- Prefer useful visual groups over tiny fragments, but never omit an element.

# Selection Rules
- Generate a unique, concise lower_snake_case id for each candidate.
- Use only element_indices from the provided source elements.
- Every element index must be valid, unique within its candidate, and non-empty.
- Across all candidates, every source element index must appear at least once.
- Preserve the visual/reading order of selected elements as much as possible.
- Candidates may overlap only when one is a meaningful higher-level component that contains smaller repeated components.
- Write descriptions that define the candidate layout, not the slide topic.
- In each description, name the structure and element order: for example grid, row, column, flex-like stack, group, card, title with divider, icon/title/description block, image/text pair, table, or standalone text.
- Mention the important element types in order, such as background rectangle, icon image, title text, description text, line, chart, table, or repeated card group.
"""


GENERATE_CLUSTERS_SYSTEM_PROMPT = """
Group reusable visual component candidates into clusters of similar layout structure.
The user message contains every candidate with a stable 0-based source index, id,
slide index, and description. Return exactly one raw JSON object matching the
response schema. Do not include markdown, comments, explanations, or text outside
the JSON object.

# Clustering Goal
- Cluster candidates by visual/component structure, not by slide topic or literal content.
- Similar candidates should have the same kind of layout, element roles, and element order.
- Useful cluster examples include card, card grid, title with divider, footer label,
  image/text pair, metric block, table block, chart block, standalone background,
  standalone heading, icon/title/description block, and repeated list item.
- Ignore exact wording and minor style differences when the structural pattern matches.
- Do not merge candidates when their structure or intended reusable component role differs.

# Response Rules
- Generate a unique, concise lower_snake_case id for each cluster.
- Use only candidate_indices from the provided source candidates.
- Every source candidate index must appear exactly once across all clusters.
- A cluster may contain one candidate when it has no similar candidate.
- Preserve source order inside candidate_indices.
"""


GENERATE_COMPONENTS_FROM_CLUSTER_PROMPT = """
Generate one reusable presentation component from one cluster of visually similar candidates.
Use the source elements as ground truth and return one raw JSON object matching the Component schema.

# Steps
1. Compare the candidate structures, roles, styling, and layout intent.
2. Choose candidate 0 as the base geometry unless another candidate better represents the shared structure.
3. Set the component `position` and `size` from the chosen base candidate bounds.
4. Build one generalized component using valid SlideElement objects whose coordinates are local to the component origin.
5. Mark literal content as editable placeholders or fixed static content based on role.
6. Add design variables only for meaningful reusable visual differences, with the narrow fixed text/image exception below.
7. Check that the final JSON matches the Component schema exactly.

# Layout Rules
- Preserve source element roles, stacking order, visible styling, images, typography, and layout intent.
- Normalize repeated instances to one component geometry.
- Do not create variables for absolute slide placement.
- The top-level Component must include required `position` and `size`.
- `position` is the selected base candidate's absolute slide position; `size` is its bounding box size.
- Every element inside `elements` must use coordinates local to the Component origin: local `{x: 0, y: 0}` means the component's top-left corner.
- The source candidate payload already localizes candidate `elements`; keep output element coordinates in that same local coordinate system.
- Prefer `flex` for rows, columns, stacks, headers, footers, icon/text pairs, menus, timelines, and card internals.
- Prefer `grid` for columns, dashboards, card decks, metric areas, asymmetric regions, and repeated grids.
- Use `container` or `group` only for real semantic structure.
- Keep simple standalone components simple.
- Direct children of `flex` and `grid` should omit `position` and `size`; nested elements inside computed slots may use local coordinates.

# Element Rules
- Use `text` for text boxes; text belongs in `runs`, never top-level `text`.
- Use `image` for photos, illustrations, logos, and icons.
- Use `rectangle`, `ellipse`, and `line` for visible geometry.
- Use `table`, `chart`, and `text-list` for tabular, chart, and list content.

# Editable Content Rules
- Source candidates intentionally omit `fixed`; decide `fixed` from each element's role.
- Set `fixed: true` for static or decorative content.
- Set `fixed: false` for replaceable content placeholders.
- Decorative content is visual chrome that defines the component style and is not meant to be edited per instance: background shapes, dividers, borders, shadows, decorative icons, ornaments, brand marks, static labels, and layout helper geometry.
- Content is user-replaceable information: headings, body text, metric values, list items, table cells, chart labels or values, photos, illustrations, logos, icons selected by the user, and any image or text that carries the instance's meaning.
- Use concise lower_snake_case role names for editable `name` fields.
- Include required bounds where supported: text uses `min_length` and `max_length`; text-list uses `min_items`, `max_items`, `min_item_length`, and `max_item_length`; table uses `min_columns`, `max_columns`, `min_rows`, and `max_rows`; flex/grid uses `min_children` and `max_children`.
- When a flex/grid contains repeated item children, use the same `min_length` and `max_length` for corresponding editable text roles in every repeated item.
- Every `min_*` must equal half of the matching `max_*`, rounded up.

# Design Variable Rules
- Use `design_variables` for reusable visual differences, not for user-replaceable content differences.
- Create visual variables only for meaningful reusable visual differences: icon choice, colors, opacity, stroke, shadow, font styling, size, rotation, child count, layout spacing, and relative layout variants.
- Do not create design variables for replaceable content differences: headings, body text, metric values, list items, table cells, chart labels or values, chart titles, user photos, illustrations, logos, or user-selected icons.
- Text strings and image data may be design variables only when the target element is `fixed: true` and the literal text or image is static visual chrome, not user-replaceable instance content.
- Never create content-related design variables for `text-list`, `table`, or `chart` content.
- Editable content alone is not a reason to create a design variable.
- A design variable may include only properties whose values actually change across candidate options; unchanged properties must stay in the base `elements`.
- For object or array options, include only the varying nested fields needed by the effects. Do not copy full objects, rich text runs, font objects, geometry, or other attributes into each option when those attributes are identical across options.
- Before adding a variable, compare every candidate option after removing unchanged nested fields. If the remaining option values are all identical or empty, do not create the variable.
- Do not create variables for absolute slide position.
- Image variables are allowed for visual icon choices and for fixed decorative/static image choices only.
- Use position variables only for meaningful relative movement inside the component.
- Ignore tiny accidental coordinate differences when shared geometry works.
- Combine correlated changes into one semantic variable, such as `scale_variant`, `density`, `card_size`, or `typography_scale`.
- If correlated values are not a simple scale, use an `object` option such as `{"width": 240, "height": 120, "font_size": 28}`.
- Avoid variables that allow impossible combinations not observed in the source candidates.
- Names must be unique lower_snake_case.
- Types must be one of: string, number, integer, boolean, color, image, enum, array, object.
- `options` must contain observed values, deduplicated in source order.
- Deduplicate object and array options by their meaningful varying fields, not by unchanged metadata bundled into the option.
- Do not create a variable with fewer than two options.

# Effect Rules
- Every design variable must have at least one effect.
- Use one variable with multiple effects when one semantic choice changes multiple related elements.
- `effect.source` is an expression using `$`, such as `$`, `$ * 0.5`, `$ / 3`, `round($)`, `$.width`, `$.height`, or `$.font_size`.
- `effect.target` is an explicit dot path from the component root and must start with `elements.<index>`, such as `elements.0.size.width`, `elements.1.font.size`, `elements.1.runs.0.font.size`, `elements.2.children.0.size.width`, `elements.3.child.runs.0.text`, `elements.4.items`, `elements.5.rows`, `elements.6.data`, or `elements.6.title`.
- Use concrete array indices for every list segment in the target path.
- Do not use element type names as target path selectors, such as `grid`, `rectangle`, `text`, or `image`, because multiple elements can share the same type.

# Output Rules
- Return exactly one JSON object and nothing else.
- Do not include markdown, comments, explanations, or surrounding text.
- Use only supported SlideElement types and snake_case fields.
- `elements` must be a non-empty list.
"""


def generate_template(layouts: SlideLayouts) -> TemplateGenerationArtifacts:
    """
    Generate a component-based template from raw PPTX-derived slide layouts.

    Flow:
    raw layouts -> cluster candidates -> clusters -> components -> template layouts.
    """
    if not layouts.layouts:
        raise ValueError("layouts must contain at least one slide layout")

    started_at = perf_counter()
    LOGGER.info(
        "[templates.v2.generate] template generation start slides=%d "
        "validation_retries=%d",
        len(layouts.layouts),
        DEFAULT_VALIDATION_RETRIES,
    )
    candidates = generate_cluster_candidates(layouts)
    clusters = generate_clusters(candidates)
    component_clusters = expand_component_clusters(clusters, candidates, layouts)
    components = generate_components(component_clusters)
    template_layouts, stats = build_template_layouts(
        layouts,
        candidates,
        clusters,
        components,
    )
    artifacts = TemplateGenerationArtifacts(
        cluster_candidates=_cluster_candidates_artifact(layouts, candidates),
        clusters=_clusters_artifact(candidates, clusters),
        components=_components_artifact(clusters, components),
        layouts=template_layouts,
        stats=stats,
    )
    LOGGER.info(
        "[templates.v2.generate] template generation complete slides=%d "
        "candidates=%d clusters=%d components=%d replaced=%d skipped=%d "
        "untouched=%d duration_ms=%.1f",
        len(layouts.layouts),
        len(candidates),
        len(clusters),
        len(components),
        stats.replaced_candidates,
        stats.skipped_overlapping_candidates,
        stats.untouched_elements,
        _elapsed_ms(started_at),
    )
    return artifacts


def generate_cluster_candidates(layouts: SlideLayouts) -> list[ClusterCandidate]:
    slides = [layout.elements for layout in layouts.layouts]
    if not slides:
        return []

    max_workers = min(MAX_PARALLEL_CLUSTER_CANDIDATES, len(slides))
    LOGGER.info(
        "[templates.v2.candidates] generation start slides=%d max_parallel=%d",
        len(slides),
        max_workers,
    )
    candidates_by_slide: dict[int, list[ClusterCandidate]] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                _generate_cluster_candidates_from_elements,
                slide_index,
                elements,
            ): slide_index
            for slide_index, elements in enumerate(slides)
        }
        for future in as_completed(futures):
            slide_index = futures[future]
            candidates_by_slide[slide_index] = future.result()
            LOGGER.info(
                "[templates.v2.candidates] slide complete slide_index=%d/%d "
                "candidates=%d completed=%d/%d",
                slide_index + 1,
                len(slides),
                len(candidates_by_slide[slide_index]),
                len(candidates_by_slide),
                len(slides),
            )

    return [
        candidate
        for slide_index in range(len(slides))
        for candidate in candidates_by_slide.get(slide_index, [])
    ]


def generate_clusters(candidates: list[ClusterCandidate]) -> list[Cluster]:
    if not candidates:
        return []

    payload = _cluster_payload(candidates)
    selections_json = _generate_with_validation_retries(
        client=get_client(config=get_llm_config()),
        model=get_model(),
        messages=[
            SystemMessage(content=GENERATE_CLUSTERS_SYSTEM_PROMPT),
            UserMessage(content=_json_dumps_for_prompt(payload)),
        ],
        label="candidate clusters",
        output_model=_ClusterSelections,
        response_name="ClusterSelectionsResponse",
        validation_retries=DEFAULT_VALIDATION_RETRIES,
        extra_validator=lambda value: _validate_cluster_selection_indices(
            value.clusters,
            len(candidates),
        ),
    )
    selections = _ClusterSelections.model_validate(selections_json)
    clusters = [
        Cluster(id=selection.id, candidates=selection.candidate_indices)
        for selection in selections.clusters
    ]
    LOGGER.info(
        "[templates.v2.clusters] generation complete candidates=%d clusters=%d",
        len(candidates),
        len(clusters),
    )
    return clusters


def expand_component_clusters(
    clusters: list[Cluster],
    candidates: list[ClusterCandidate],
    layouts: SlideLayouts,
) -> list[ComponentCluster]:
    slide_elements = [
        _SLIDE_ELEMENTS_ADAPTER.validate_python(layout.elements)
        for layout in layouts.layouts
    ]
    return [
        ComponentCluster(
            id=cluster.id,
            candidates=[
                _expand_candidate(candidates, slide_elements, candidate_index)
                for candidate_index in cluster.candidates
            ],
        )
        for cluster in clusters
    ]


def generate_components(clusters: list[ComponentCluster]) -> list[Component]:
    if not clusters:
        return []

    max_workers = min(MAX_PARALLEL_COMPONENTS, len(clusters))
    LOGGER.info(
        "[templates.v2.components] generation start clusters=%d max_parallel=%d",
        len(clusters),
        max_workers,
    )
    components_by_index: dict[int, Component] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(generate_component_from_cluster, cluster): index
            for index, cluster in enumerate(clusters)
        }
        for future in as_completed(futures):
            index = futures[future]
            components_by_index[index] = future.result()
            LOGGER.info(
                "[templates.v2.components] cluster complete cluster_index=%d/%d "
                "cluster_id=%s completed=%d/%d",
                index + 1,
                len(clusters),
                clusters[index].id,
                len(components_by_index),
                len(clusters),
            )

    return [components_by_index[index] for index in range(len(clusters))]


def generate_component_from_cluster(cluster: ComponentCluster) -> Component:
    if not cluster.candidates:
        raise ValueError("cluster must contain at least one candidate")

    payload = _component_payload(cluster)
    component_json = _generate_with_validation_retries(
        client=get_client(config=get_llm_config()),
        model=get_model(),
        messages=[
            SystemMessage(content=GENERATE_COMPONENTS_FROM_CLUSTER_PROMPT),
            UserMessage(content=_json_dumps_for_prompt(payload)),
        ],
        label=f"component for cluster {cluster.id}",
        output_model=Component,
        response_name="ComponentResponse",
        validation_retries=DEFAULT_VALIDATION_RETRIES,
        max_tokens=16384,
    )
    component = Component.model_validate(component_json)
    LOGGER.info(
        "[templates.v2.components] generated component cluster_id=%s component_id=%s",
        cluster.id,
        component.id,
    )
    return component


def build_template_layouts(
    layouts: SlideLayouts,
    candidates: list[ClusterCandidate],
    clusters: list[Cluster],
    components: list[Component],
) -> tuple[dict[str, Any], TemplateStats]:
    presentation = layouts.model_dump(mode="json", exclude_none=True)
    raw_layouts = _layouts_from_presentation(presentation)
    candidate_records = _candidate_records(
        [candidate.model_dump(mode="json") for candidate in candidates],
        raw_layouts,
    )
    component_by_candidate = _component_by_candidate_index(
        [cluster.model_dump(mode="json") for cluster in clusters],
        [component.model_dump(mode="json", exclude_none=True) for component in components],
    )
    candidates_by_slide = _candidates_by_slide(candidate_records)

    replaced_count = 0
    skipped_count = 0
    untouched_count = 0
    template_layouts: list[dict[str, Any]] = []

    for slide_index, layout in enumerate(raw_layouts):
        slide_candidates = candidates_by_slide.get(slide_index, [])
        components_for_slide, stats = _template_components_for_slide(
            slide_index=slide_index,
            source_elements=layout.get("elements", []),
            candidates=slide_candidates,
            component_by_candidate=component_by_candidate,
        )
        template_layout = copy.deepcopy(layout)
        template_layout.pop("elements", None)
        template_layout["id"] = str(uuid.uuid4())
        template_layout["components"] = components_for_slide
        template_layouts.append(template_layout)
        replaced_count += stats.replaced_candidates
        skipped_count += stats.skipped_overlapping_candidates
        untouched_count += stats.untouched_elements

    return (
        _presentation_with_layouts(presentation, template_layouts),
        TemplateStats(
            replaced_candidates=replaced_count,
            skipped_overlapping_candidates=skipped_count,
            untouched_elements=untouched_count,
        ),
    )


def _generate_cluster_candidates_from_elements(
    slide_index: int,
    elements: list[SlideElement],
) -> list[ClusterCandidate]:
    if not elements:
        LOGGER.info(
            "[templates.v2.candidates] skipping empty slide slide_index=%d",
            slide_index + 1,
        )
        return []

    payload = _cluster_candidate_payload(elements)
    selections_json = _generate_with_validation_retries(
        client=get_client(config=get_llm_config()),
        model=get_model(),
        messages=[
            SystemMessage(content=GENERATE_CLUSTER_CANDIDATES_SYSTEM_PROMPT),
            UserMessage(content=_json_dumps_for_prompt(payload)),
        ],
        label=f"cluster candidates for slide {slide_index + 1}",
        output_model=_ClusterCandidateSelections,
        response_name="ClusterCandidateSelectionsResponse",
        validation_retries=DEFAULT_VALIDATION_RETRIES,
        extra_validator=lambda value: _validate_candidate_selection_indices(
            value.candidates,
            len(elements),
        ),
    )
    selections = _ClusterCandidateSelections.model_validate(selections_json)
    return [
        ClusterCandidate(
            id=selection.id,
            slide_index=slide_index,
            description=selection.description,
            elements=selection.element_indices,
        )
        for selection in selections.candidates
    ]


def _cluster_candidate_payload(elements: list[SlideElement]) -> dict[str, Any]:
    serialized_elements = _SLIDE_ELEMENTS_ADAPTER.dump_python(elements, mode="json")
    return {
        "slide_element_count": len(elements),
        "elements": [
            {"index": index, "element": element}
            for index, element in enumerate(serialized_elements)
        ],
    }


def _cluster_payload(candidates: list[ClusterCandidate]) -> dict[str, Any]:
    return {
        "candidate_count": len(candidates),
        "candidates": [
            {
                "index": index,
                "id": candidate.id,
                "slide_index": candidate.slide_index,
                "description": candidate.description,
            }
            for index, candidate in enumerate(candidates)
        ],
    }


def _component_payload(cluster: ComponentCluster) -> dict[str, Any]:
    return {
        "cluster": {
            "id": cluster.id,
            "candidate_count": len(cluster.candidates),
            "candidates": [
                _component_candidate_payload(index, candidate)
                for index, candidate in enumerate(cluster.candidates)
            ],
        }
    }


def _component_candidate_payload(
    index: int,
    candidate: ComponentClusterCandidate,
) -> dict[str, Any]:
    elements = _SLIDE_ELEMENTS_ADAPTER.dump_python(candidate.elements, mode="json")
    bounds = _elements_bounds(elements) or {
        "x": 0.0,
        "y": 0.0,
        "width": 0.0,
        "height": 0.0,
    }
    localized_elements = _localize_elements(elements, bounds)
    _strip_fixed_fields(localized_elements)

    return {
        "index": index,
        "id": candidate.id,
        "slide_index": candidate.slide_index,
        "description": candidate.description,
        "position": {"x": bounds["x"], "y": bounds["y"]},
        "size": {"width": bounds["width"], "height": bounds["height"]},
        "elements": localized_elements,
    }


def _expand_candidate(
    candidates: list[ClusterCandidate],
    slide_elements: list[list[SlideElement]],
    candidate_index: int,
) -> ComponentClusterCandidate:
    if candidate_index < 0 or candidate_index >= len(candidates):
        raise ValueError(
            f"cluster references candidate index {candidate_index}, "
            f"but valid indices are 0 through {len(candidates) - 1}"
        )

    candidate = candidates[candidate_index]
    if candidate.slide_index < 0 or candidate.slide_index >= len(slide_elements):
        raise ValueError(
            f"candidate {candidate_index} references slide index "
            f"{candidate.slide_index}, but valid indices are 0 through "
            f"{len(slide_elements) - 1}"
        )

    elements = slide_elements[candidate.slide_index]
    return ComponentClusterCandidate(
        id=candidate.id,
        slide_index=candidate.slide_index,
        description=candidate.description,
        elements=[
            _slide_element_at_index(elements, element_index, candidate_index)
            for element_index in candidate.elements
        ],
    )


def _slide_element_at_index(
    elements: list[SlideElement],
    element_index: int,
    candidate_index: int,
) -> SlideElement:
    if element_index < 0 or element_index >= len(elements):
        raise ValueError(
            f"candidate {candidate_index} references element index "
            f"{element_index}, but valid indices are 0 through {len(elements) - 1}"
        )
    return elements[element_index]


def _validate_candidate_selection_indices(
    selections: list[_ClusterCandidateSelection],
    element_count: int,
) -> None:
    covered_indices: set[int] = set()

    for candidate_index, selection in enumerate(selections):
        for element_index in selection.element_indices:
            if element_index < 0 or element_index >= element_count:
                raise ValueError(
                    "candidate "
                    f"{candidate_index} references element index {element_index}, "
                    f"but valid indices are 0 through {element_count - 1}"
                )
            covered_indices.add(element_index)

    missing_indices = sorted(set(range(element_count)) - covered_indices)
    if missing_indices:
        raise ValueError(
            "every source element must be included in at least one candidate; "
            f"missing element indices: {missing_indices}"
        )


def _validate_cluster_selection_indices(
    selections: list[_ClusterSelection],
    candidate_count: int,
) -> None:
    seen_indices: set[int] = set()
    duplicate_indices: set[int] = set()

    for cluster_index, selection in enumerate(selections):
        for candidate_index in selection.candidate_indices:
            if candidate_index < 0 or candidate_index >= candidate_count:
                raise ValueError(
                    "cluster "
                    f"{cluster_index} references candidate index {candidate_index}, "
                    f"but valid indices are 0 through {candidate_count - 1}"
                )
            if candidate_index in seen_indices:
                duplicate_indices.add(candidate_index)
            seen_indices.add(candidate_index)

    if duplicate_indices:
        raise ValueError(
            "every source candidate must appear exactly once; duplicate "
            f"candidate indices: {sorted(duplicate_indices)}"
        )

    missing_indices = sorted(set(range(candidate_count)) - seen_indices)
    if missing_indices:
        raise ValueError(
            "every source candidate must appear exactly once; missing "
            f"candidate indices: {missing_indices}"
        )


def _template_components_for_slide(
    *,
    slide_index: int,
    source_elements: list[Any],
    candidates: list[_CandidateRecord],
    component_by_candidate: dict[int, dict[str, Any]],
) -> tuple[list[dict[str, Any]], TemplateStats]:
    components_by_start_index: dict[int, dict[str, Any]] = {}
    consumed_element_indices: set[int] = set()
    skipped_count = 0

    for candidate in candidates:
        candidate = _parent_candidate_for(candidate, candidates)
        if consumed_element_indices.intersection(candidate.element_indices):
            skipped_count += 1
            continue

        component = component_by_candidate.get(candidate.index)
        if component is None:
            raise ValueError(
                f"candidate {candidate.index} on slide {slide_index} "
                "does not have a matching component"
            )

        start_index = min(candidate.element_indices)
        components_by_start_index[start_index] = _component_for_candidate(
            component,
            candidate,
        )
        consumed_element_indices.update(candidate.element_indices)

    template_components: list[dict[str, Any]] = []
    untouched_count = 0

    for element_index, element in enumerate(source_elements):
        component = components_by_start_index.get(element_index)
        if component is not None:
            template_components.append(component)

        if element_index in consumed_element_indices:
            continue

        untouched_count += 1
        template_components.append(
            _component_for_untouched_element(slide_index, element_index, element)
        )

    _COMPONENTS_ADAPTER.validate_python(template_components)
    return (
        template_components,
        TemplateStats(
            replaced_candidates=len(components_by_start_index),
            skipped_overlapping_candidates=skipped_count,
            untouched_elements=untouched_count,
        ),
    )


def _parent_candidate_for(
    candidate: _CandidateRecord,
    candidates: list[_CandidateRecord],
) -> _CandidateRecord:
    candidate_element_indices = set(candidate.element_indices)
    selected_candidate = candidate
    selected_element_count = len(candidate_element_indices)

    for possible_parent in candidates:
        if possible_parent.index == candidate.index:
            continue

        possible_parent_element_indices = set(possible_parent.element_indices)
        if not candidate_element_indices < possible_parent_element_indices:
            continue

        possible_parent_element_count = len(possible_parent_element_indices)
        if possible_parent_element_count > selected_element_count:
            selected_candidate = possible_parent
            selected_element_count = possible_parent_element_count
        elif (
            possible_parent_element_count == selected_element_count
            and possible_parent.index < selected_candidate.index
        ):
            selected_candidate = possible_parent

    return selected_candidate


def _component_for_candidate(
    component: dict[str, Any],
    candidate: _CandidateRecord,
) -> dict[str, Any]:
    template_component = copy.deepcopy(component)
    _ensure_component_frame(template_component)
    component_elements = template_component.get("elements", [])
    if not isinstance(component_elements, list) or not component_elements:
        raise ValueError(f"component {component.get('id')} must contain elements")

    candidate_bounds = _elements_bounds(candidate.elements) or _component_frame(
        template_component
    )
    localized_candidate_elements = _localize_elements(
        candidate.elements,
        candidate_bounds,
    )

    _apply_best_design_variables(
        component_elements,
        component.get("design_variables", []),
        localized_candidate_elements,
    )
    _align_component_to_candidate(component_elements, localized_candidate_elements)
    _copy_candidate_content(component_elements, localized_candidate_elements)
    template_component["position"] = {
        "x": candidate_bounds["x"],
        "y": candidate_bounds["y"],
    }
    template_component["size"] = {
        "width": candidate_bounds["width"],
        "height": candidate_bounds["height"],
    }
    _SLIDE_ELEMENTS_ADAPTER.validate_python(component_elements)
    Component.model_validate(template_component)
    return template_component


def _component_for_untouched_element(
    slide_index: int,
    element_index: int,
    element: Any,
) -> dict[str, Any]:
    if not isinstance(element, dict):
        raise ValueError(
            f"slide {slide_index} element {element_index} must be a JSON object"
        )

    source_elements = [copy.deepcopy(element)]
    bounds = _elements_bounds(source_elements) or {
        "x": 0.0,
        "y": 0.0,
        "width": 0.0,
        "height": 0.0,
    }
    component = {
        "id": f"slide_{slide_index + 1}_element_{element_index + 1}",
        "description": (
            "Fallback component for a source element not covered by any "
            "non-overlapping candidate."
        ),
        "position": {"x": bounds["x"], "y": bounds["y"]},
        "size": {"width": bounds["width"], "height": bounds["height"]},
        "design_variables": [],
        "elements": _localize_elements(source_elements, bounds),
    }
    Component.model_validate(component)
    return component


def _apply_best_design_variables(
    component_elements: list[dict[str, Any]],
    design_variables: Any,
    candidate_elements: list[dict[str, Any]],
) -> None:
    if not isinstance(design_variables, list):
        return

    for variable in design_variables:
        if not isinstance(variable, dict):
            continue

        options = variable.get("options")
        effects = variable.get("effect")
        if not isinstance(options, list) or not options:
            continue
        if not isinstance(effects, list) or not effects:
            continue

        best_option = _best_design_variable_option(
            component_elements,
            variable,
            options,
            candidate_elements,
        )
        _apply_design_variable(component_elements, variable, best_option)


def _best_design_variable_option(
    component_elements: list[dict[str, Any]],
    variable: dict[str, Any],
    options: list[Any],
    candidate_elements: list[dict[str, Any]],
) -> Any:
    best_option = options[0]
    best_score = float("inf")

    for option in options:
        test_elements = copy.deepcopy(component_elements)
        _apply_design_variable(test_elements, variable, option)
        score = _score_component_against_candidate(test_elements, candidate_elements)
        if score < best_score:
            best_score = score
            best_option = option

    return best_option


def _apply_design_variable(
    component_elements: list[dict[str, Any]],
    variable: dict[str, Any],
    selected_option: Any,
) -> None:
    effects = variable.get("effect")
    if not isinstance(effects, list):
        return

    for effect in effects:
        if not isinstance(effect, dict):
            continue

        target = effect.get("target")
        source = effect.get("source")
        if not isinstance(target, str) or not isinstance(source, str):
            continue

        value = _evaluate_design_variable_effect(selected_option, source)
        if value is not None:
            _set_design_path_value(component_elements, target, value)


def _evaluate_design_variable_effect(selected_option: Any, expression: str) -> Any:
    trimmed = expression.strip()
    round_match = re.match(r"^round\((.+)\)$", trimmed)

    if round_match:
        value = _evaluate_design_variable_effect(
            selected_option,
            round_match.group(1).strip(),
        )
        return round(value) if isinstance(value, (int, float)) else value

    arithmetic_match = re.match(r"^(.+?)\s*([*/])\s*(-?\d+(?:\.\d+)?)$", trimmed)
    if arithmetic_match:
        value = _evaluate_design_variable_effect(
            selected_option,
            arithmetic_match.group(1).strip(),
        )
        operand = float(arithmetic_match.group(3))
        if not isinstance(value, (int, float)):
            return value
        return value * operand if arithmetic_match.group(2) == "*" else value / operand

    if trimmed == "$":
        return selected_option

    if trimmed.startswith("$."):
        return _get_object_path_value(selected_option, trimmed[2:].split("."))

    return selected_option


def _set_design_path_value(
    elements: list[dict[str, Any]],
    path: str,
    value: Any,
) -> None:
    segments = [segment for segment in path.split(".") if segment]
    if not segments:
        return

    property_name = segments[-1]
    parent = _resolve_design_path_node({"elements": elements}, segments[:-1])
    if parent is None:
        parent = _resolve_design_path_node(elements, segments[:-1])

    if isinstance(parent, list) and _is_array_index(property_name):
        parent[int(property_name)] = value
    elif isinstance(parent, dict):
        parent[property_name] = value


def _resolve_design_path_node(root: Any, segments: list[str]) -> Any:
    current = root
    index = 0

    while index < len(segments):
        segment = segments[index]

        if isinstance(current, list):
            if _is_array_index(segment):
                element_index = int(segment)
                if element_index >= len(current):
                    return None
                current = current[element_index]
                index += 1
                continue

            if segment in ELEMENT_TYPES:
                elements_by_type = [
                    value
                    for value in current
                    if isinstance(value, dict) and value.get("type") == segment
                ]
                if not elements_by_type:
                    return None

                current = elements_by_type[0]
                index += 1
                continue

            return None

        if not isinstance(current, dict):
            return None

        if segment in ELEMENT_TYPES:
            if current.get("type") != segment:
                current = _find_nested_element_by_type(current, segment)
                if current is None:
                    return None
            index += 1
            continue

        if _is_array_index(segment):
            children = _element_children(current)
            child_index = int(segment)
            if child_index >= len(children):
                return None
            current = children[child_index]
            index += 1
            continue

        current = current.get(segment)
        index += 1

    return current


def _find_nested_element_by_type(
    element: dict[str, Any],
    element_type: str,
) -> dict[str, Any] | None:
    children = _element_children(element)
    direct_match = next(
        (
            child
            for child in children
            if isinstance(child, dict) and child.get("type") == element_type
        ),
        None,
    )
    if direct_match is not None:
        return direct_match

    for child in children:
        if not isinstance(child, dict):
            continue

        nested_match = _find_nested_element_by_type(child, element_type)
        if nested_match is not None:
            return nested_match

    return None


def _copy_candidate_content(
    component_elements: list[dict[str, Any]],
    candidate_elements: list[dict[str, Any]],
) -> None:
    sources_by_type: dict[str, list[ContentElementMatch]] = {
        element_type: [] for element_type in CONTENT_ELEMENT_TYPES
    }
    for source in _content_element_matches(candidate_elements, fixed=None):
        element_type = source.element.get("type")
        if element_type in CONTENT_ELEMENT_TYPES:
            sources_by_type[element_type].append(source)

    used_source_indices = {element_type: set() for element_type in CONTENT_ELEMENT_TYPES}
    copied_target_ids: set[int] = set()

    for target in _content_element_matches(component_elements, fixed=False):
        _copy_best_candidate_content(
            target,
            sources_by_type,
            used_source_indices,
            copied_target_ids,
        )


def _copy_best_candidate_content(
    target: ContentElementMatch,
    sources_by_type: dict[str, list[ContentElementMatch]],
    used_source_indices: dict[str, set[int]],
    copied_target_ids: set[int],
) -> None:
    target_id = id(target.element)
    if target_id in copied_target_ids:
        return

    element_type = target.element.get("type")
    if element_type not in CONTENT_ELEMENT_TYPES:
        return

    source_index = _best_content_source_index(
        target,
        sources_by_type[element_type],
        used_source_indices[element_type],
    )
    if source_index is None:
        return

    _copy_content_value(target.element, sources_by_type[element_type][source_index].element)
    used_source_indices[element_type].add(source_index)
    copied_target_ids.add(target_id)


def _best_content_source_index(
    target: ContentElementMatch,
    sources: list[ContentElementMatch],
    used_indices: set[int],
) -> int | None:
    available_indices = [
        source_index
        for source_index in range(len(sources))
        if source_index not in used_indices
    ]
    if not available_indices:
        return None

    scored_indices: list[tuple[float, int]] = []
    for source_index in available_indices:
        scored_indices.append(
            (
                _content_match_score(target.bounds, sources[source_index].bounds),
                source_index,
            )
        )

    return min(scored_indices)[1]


def _content_match_score(
    target_bounds: dict[str, float],
    source_bounds: dict[str, float],
) -> float:
    target_center_x = target_bounds["x"] + target_bounds["width"] / 2
    target_center_y = target_bounds["y"] + target_bounds["height"] / 2
    source_center_x = source_bounds["x"] + source_bounds["width"] / 2
    source_center_y = source_bounds["y"] + source_bounds["height"] / 2
    return (
        abs(target_center_x - source_center_x)
        + abs(target_center_y - source_center_y)
        + abs(target_bounds["width"] - source_bounds["width"]) / 2
        + abs(target_bounds["height"] - source_bounds["height"]) / 2
    )


def _content_element_matches(
    elements: list[dict[str, Any]],
    *,
    fixed: bool | None,
) -> list[ContentElementMatch]:
    matches: list[ContentElementMatch] = []
    for element in elements:
        matches.extend(
            _content_element_matches_for_element(
                element,
                mode="absolute",
                origin={"x": 0.0, "y": 0.0},
                flow_frame=None,
                fixed=fixed,
            )
        )
    return matches


def _content_element_matches_for_element(
    element: dict[str, Any],
    *,
    mode: str,
    origin: dict[str, float],
    flow_frame: dict[str, float] | None,
    fixed: bool | None,
) -> list[ContentElementMatch]:
    frame = _render_frame(element, mode=mode, flow_frame=flow_frame)
    element_origin = {
        "x": origin["x"] + frame["x"],
        "y": origin["y"] + frame["y"],
    }
    matches: list[ContentElementMatch] = []

    if element.get("type") in CONTENT_ELEMENT_TYPES and (
        fixed is None or element.get("fixed") is fixed
    ):
        matches.append(
            ContentElementMatch(
                element=element,
                bounds={
                    "x": element_origin["x"],
                    "y": element_origin["y"],
                    "width": frame["width"],
                    "height": frame["height"],
                },
            )
        )

    child_origin = element_origin
    element_type = element.get("type")

    if element_type == "container":
        child = element.get("child")
        if isinstance(child, dict):
            child_mode = "absolute" if _has_explicit_frame(child) else "flow"
            matches.extend(
                _content_element_matches_for_element(
                    child,
                    mode=child_mode,
                    origin=child_origin,
                    flow_frame=(
                        _child_flow_frame(frame, element.get("padding"))
                        if child_mode == "flow"
                        else None
                    ),
                    fixed=fixed,
                )
            )
        return matches

    children = element.get("children")
    if not isinstance(children, list):
        return matches

    if element_type == "flex":
        child_frames = _flex_child_frames(
            children,
            frame,
            str(element.get("direction", "row")),
            {
                "gap": element.get("gap"),
                "column_gap": element.get("column_gap"),
                "row_gap": element.get("row_gap"),
            },
            element.get("align_items"),
            element.get("justify_content"),
        )
        for child, child_frame in zip(children, child_frames, strict=False):
            if isinstance(child, dict):
                matches.extend(
                    _content_element_matches_for_element(
                        child,
                        mode="flow",
                        origin=child_origin,
                        flow_frame=child_frame,
                        fixed=fixed,
                    )
                )
        return matches

    if element_type == "grid":
        child_frames = _grid_child_frames(
            children,
            frame,
            int(element.get("columns", 1)),
            element.get("rows"),
            {
                "gap": element.get("gap"),
                "column_gap": element.get("column_gap"),
                "row_gap": element.get("row_gap"),
            },
            element.get("align_items"),
            element.get("justify_items"),
        )
        for child, child_frame in zip(children, child_frames, strict=False):
            if isinstance(child, dict):
                matches.extend(
                    _content_element_matches_for_element(
                        child,
                        mode="flow",
                        origin=child_origin,
                        flow_frame=child_frame,
                        fixed=fixed,
                    )
                )
        return matches

    for child in children:
        if isinstance(child, dict):
            matches.extend(
                _content_element_matches_for_element(
                    child,
                    mode="absolute",
                    origin=child_origin,
                    flow_frame=None,
                    fixed=fixed,
                )
            )

    return matches


def _render_frame(
    element: dict[str, Any],
    *,
    mode: str,
    flow_frame: dict[str, float] | None,
) -> dict[str, float]:
    if mode == "flow" and flow_frame is not None:
        return flow_frame

    position = _element_position(element)
    size = _element_size(element)
    return {
        "x": _numeric_or(position.get("x") if position else None, 0.0),
        "y": _numeric_or(position.get("y") if position else None, 0.0),
        "width": _numeric_or(
            size.get("width") if size else None,
            flow_frame["width"] if flow_frame else 0.0,
        ),
        "height": _numeric_or(
            size.get("height") if size else None,
            flow_frame["height"] if flow_frame else 0.0,
        ),
    }


def _element_position(element: dict[str, Any]) -> dict[str, Any] | None:
    position = element.get("position")
    return position if isinstance(position, dict) else None


def _element_size(element: dict[str, Any]) -> dict[str, Any] | None:
    size = element.get("size")
    return size if isinstance(size, dict) else None


def _has_explicit_frame(element: dict[str, Any]) -> bool:
    return _element_position(element) is not None or _element_size(element) is not None


def _child_flow_frame(
    frame: dict[str, float],
    padding: Any,
) -> dict[str, float]:
    padding = padding if isinstance(padding, dict) else {}
    left = _numeric_or(padding.get("left"), 0.0)
    top = _numeric_or(padding.get("top"), 0.0)
    right = _numeric_or(padding.get("right"), 0.0)
    bottom = _numeric_or(padding.get("bottom"), 0.0)
    return {
        "x": left,
        "y": top,
        "width": max(frame["width"] - left - right, 0.0),
        "height": max(frame["height"] - top - bottom, 0.0),
    }


def _flex_child_frames(
    children: list[Any],
    frame: dict[str, float],
    direction: str,
    gaps: dict[str, Any],
    align_items: Any,
    justify_content: Any,
) -> list[dict[str, float]]:
    count = len(children)
    is_row = direction == "row"
    gap = _numeric_or(
        gaps.get("column_gap" if is_row else "row_gap"),
        _numeric_or(gaps.get("gap"), 0.0),
    )
    total_gap = max(count - 1, 0) * gap
    fixed_main = 0.0
    flexible_count = 0

    for child in children:
        size = _element_size(child) if isinstance(child, dict) else None
        main_size = size.get("width" if is_row else "height") if size else None
        if isinstance(main_size, (int, float)):
            fixed_main += float(main_size)
        else:
            flexible_count += 1

    available_main = frame["width"] if is_row else frame["height"]
    flexible_main = (
        max((available_main - fixed_main - total_gap) / flexible_count, 0.0)
        if flexible_count > 0
        else 0.0
    )
    occupied_main = fixed_main + flexible_main * flexible_count + total_gap
    cursor = _alignment_offset(justify_content, max(available_main - occupied_main, 0.0))
    frames: list[dict[str, float]] = []

    for child in children:
        size = _element_size(child) if isinstance(child, dict) else None
        width = _numeric_or(
            size.get("width") if size else None,
            flexible_main if is_row else frame["width"],
        )
        height = _numeric_or(
            size.get("height") if size else None,
            frame["height"] if is_row else flexible_main,
        )
        cross_limit = frame["height"] if is_row else frame["width"]
        cross_size = height if is_row else width
        cross_space = max(cross_limit - cross_size, 0.0)
        cross_offset = _alignment_offset(align_items, cross_space)
        frames.append(
            {
                "x": cursor if is_row else cross_offset,
                "y": cross_offset if is_row else cursor,
                "width": width,
                "height": height,
            }
        )
        cursor += (width if is_row else height) + gap

    return frames


def _grid_child_frames(
    children: list[Any],
    frame: dict[str, float],
    columns: int,
    rows: Any,
    gaps: dict[str, Any],
    align_items: Any,
    justify_items: Any,
) -> list[dict[str, float]]:
    count = len(children)
    column_count = max(columns, 1)
    row_count = max(
        int(rows) if isinstance(rows, int) else 0,
        (count + column_count - 1) // column_count,
        1,
    )
    column_gap = _numeric_or(gaps.get("column_gap"), _numeric_or(gaps.get("gap"), 0.0))
    row_gap = _numeric_or(gaps.get("row_gap"), _numeric_or(gaps.get("gap"), 0.0))
    cell_width = max((frame["width"] - column_gap * (column_count - 1)) / column_count, 0.0)
    cell_height = max((frame["height"] - row_gap * (row_count - 1)) / row_count, 0.0)
    frames: list[dict[str, float]] = []

    for index, child in enumerate(children):
        size = _element_size(child) if isinstance(child, dict) else None
        width = (
            cell_width
            if justify_items == "stretch" or not _has_numeric_size(size, "width")
            else min(float(size["width"]), cell_width)
        )
        height = (
            cell_height
            if align_items == "stretch" or not _has_numeric_size(size, "height")
            else min(float(size["height"]), cell_height)
        )
        cell_x = (index % column_count) * (cell_width + column_gap)
        cell_y = (index // column_count) * (cell_height + row_gap)
        frames.append(
            {
                "x": cell_x + _alignment_offset(justify_items, max(cell_width - width, 0.0)),
                "y": cell_y + _alignment_offset(align_items, max(cell_height - height, 0.0)),
                "width": width,
                "height": height,
            }
        )

    return frames


def _alignment_offset(alignment: Any, available_space: float) -> float:
    if alignment == "flex-end":
        return available_space
    if alignment == "center":
        return available_space / 2
    return 0.0


def _has_numeric_size(size: dict[str, Any] | None, key: str) -> bool:
    return isinstance(size, dict) and isinstance(size.get(key), (int, float))


def _numeric_or(value: Any, fallback: float) -> float:
    return float(value) if isinstance(value, (int, float)) else fallback


def _copy_content_value(target: dict[str, Any], source: dict[str, Any]) -> None:
    element_type = target.get("type")

    if element_type == "text":
        _copy_text_content(target, source)
    elif element_type == "image":
        if "data" in source:
            target["data"] = copy.deepcopy(source.get("data"))
    elif element_type == "text-list":
        if "items" in source:
            target["items"] = copy.deepcopy(source.get("items"))
    elif element_type == "table":
        if "columns" in source:
            target["columns"] = copy.deepcopy(source.get("columns"))
        if "rows" in source:
            target["rows"] = copy.deepcopy(source.get("rows"))
    elif element_type == "chart":
        if "data" in source:
            target["data"] = copy.deepcopy(source.get("data"))
        if "title" in source:
            target["title"] = copy.deepcopy(source.get("title"))


def _copy_text_content(target: dict[str, Any], source: dict[str, Any]) -> None:
    source_runs = source.get("runs")
    if not isinstance(source_runs, list) or not source_runs:
        return

    source_texts = [
        run.get("text", "")
        for run in source_runs
        if isinstance(run, dict) and isinstance(run.get("text"), str)
    ]
    if not source_texts:
        return

    target_runs = target.get("runs")
    if not isinstance(target_runs, list) or not target_runs:
        target["runs"] = [{"text": "".join(source_texts), "font": target.get("font")}]
        return

    for index, source_text in enumerate(source_texts):
        if index < len(target_runs) and isinstance(target_runs[index], dict):
            target_runs[index]["text"] = source_text
            continue

        target_runs.append({"text": source_text, "font": copy.deepcopy(target.get("font"))})

    if len(target_runs) > len(source_texts):
        del target_runs[len(source_texts) :]


def _align_component_to_candidate(
    component_elements: list[dict[str, Any]],
    candidate_elements: list[dict[str, Any]],
) -> None:
    component_bounds = _elements_bounds(component_elements)
    candidate_bounds = _elements_bounds(candidate_elements)
    if component_bounds is None or candidate_bounds is None:
        return

    dx = candidate_bounds["x"] - component_bounds["x"]
    dy = candidate_bounds["y"] - component_bounds["y"]
    if dx == 0 and dy == 0:
        return

    _translate_elements(component_elements, dx, dy)


def _translate_elements(elements: list[dict[str, Any]], dx: float, dy: float) -> None:
    for element in elements:
        _translate_element(element, dx, dy)


def _translate_element(element: dict[str, Any], dx: float, dy: float) -> None:
    position = element.get("position")
    if isinstance(position, dict):
        if isinstance(position.get("x"), (int, float)):
            position["x"] += dx
        if isinstance(position.get("y"), (int, float)):
            position["y"] += dy
        return

    child = element.get("child")
    if isinstance(child, dict):
        _translate_element(child, dx, dy)

    children = element.get("children")
    if isinstance(children, list):
        for child_element in children:
            if isinstance(child_element, dict):
                _translate_element(child_element, dx, dy)


def _score_component_against_candidate(
    component_elements: list[dict[str, Any]],
    candidate_elements: list[dict[str, Any]],
) -> float:
    score = 0.0
    component_bounds = _elements_bounds(component_elements)
    candidate_bounds = _elements_bounds(candidate_elements)

    if component_bounds is not None and candidate_bounds is not None:
        score += abs(component_bounds["width"] - candidate_bounds["width"]) * 3
        score += abs(component_bounds["height"] - candidate_bounds["height"]) * 3

    component_flat = _flatten_elements(component_elements)
    candidate_flat = _flatten_elements(candidate_elements)
    for element_type in ELEMENT_TYPES:
        component_sequence = [
            element for element in component_flat if element.get("type") == element_type
        ]
        candidate_sequence = [
            element for element in candidate_flat if element.get("type") == element_type
        ]
        pair_count = min(len(component_sequence), len(candidate_sequence))
        score += abs(len(component_sequence) - len(candidate_sequence)) * 20
        for index in range(pair_count):
            score += _score_element(component_sequence[index], candidate_sequence[index])

    return score


def _score_element(component: dict[str, Any], candidate: dict[str, Any]) -> float:
    score = 0.0
    score += _score_size(component.get("size"), candidate.get("size"))
    score += _score_font(component.get("font"), candidate.get("font"))
    score += _score_alignment(component.get("alignment"), candidate.get("alignment"))
    score += _score_content(component, candidate)
    return score


def _score_content(component: dict[str, Any], candidate: dict[str, Any]) -> float:
    component_type = component.get("type")
    if component_type != candidate.get("type"):
        return 0.0

    if component_type == "text":
        return 0.0 if _text_content(component) == _text_content(candidate) else 25.0
    if component_type == "image":
        return 0.0 if component.get("data") == candidate.get("data") else 25.0
    if component_type == "text-list":
        return 0.0 if component.get("items") == candidate.get("items") else 25.0
    if component_type == "table":
        return (
            0.0
            if component.get("columns") == candidate.get("columns")
            and component.get("rows") == candidate.get("rows")
            else 25.0
        )
    if component_type == "chart":
        return (
            0.0
            if component.get("data") == candidate.get("data")
            and component.get("title") == candidate.get("title")
            else 25.0
        )

    return 0.0


def _text_content(element: dict[str, Any]) -> str:
    runs = element.get("runs")
    if not isinstance(runs, list):
        return ""

    return "".join(
        run.get("text", "")
        for run in runs
        if isinstance(run, dict) and isinstance(run.get("text"), str)
    )


def _score_size(component_size: Any, candidate_size: Any) -> float:
    if not isinstance(component_size, dict) or not isinstance(candidate_size, dict):
        return 0.0

    return _numeric_diff(component_size.get("width"), candidate_size.get("width")) + _numeric_diff(
        component_size.get("height"),
        candidate_size.get("height"),
    )


def _score_font(component_font: Any, candidate_font: Any) -> float:
    if not isinstance(component_font, dict) or not isinstance(candidate_font, dict):
        return 0.0

    return _numeric_diff(component_font.get("size"), candidate_font.get("size")) * 2


def _score_alignment(component_alignment: Any, candidate_alignment: Any) -> float:
    if not isinstance(component_alignment, dict) or not isinstance(candidate_alignment, dict):
        return 0.0

    component_horizontal = component_alignment.get("horizontal")
    candidate_horizontal = candidate_alignment.get("horizontal")
    if component_horizontal and candidate_horizontal and component_horizontal != candidate_horizontal:
        return 15.0

    return 0.0


def _numeric_diff(first: Any, second: Any) -> float:
    if not isinstance(first, (int, float)) or not isinstance(second, (int, float)):
        return 0.0
    return abs(first - second)


def _ensure_component_frame(component: dict[str, Any]) -> None:
    elements = component.get("elements")
    if not isinstance(elements, list):
        return

    position = component.get("position")
    size = component.get("size")
    if _valid_position(position) and _valid_size(size):
        return

    bounds = _elements_bounds(elements) or {
        "x": 0.0,
        "y": 0.0,
        "width": 0.0,
        "height": 0.0,
    }
    component["position"] = {"x": bounds["x"], "y": bounds["y"]}
    component["size"] = {"width": bounds["width"], "height": bounds["height"]}
    component["elements"] = _localize_elements(elements, bounds)


def _component_frame(component: dict[str, Any]) -> dict[str, float]:
    position = component.get("position")
    size = component.get("size")
    return {
        "x": float(position.get("x", 0.0)) if isinstance(position, dict) else 0.0,
        "y": float(position.get("y", 0.0)) if isinstance(position, dict) else 0.0,
        "width": float(size.get("width", 0.0)) if isinstance(size, dict) else 0.0,
        "height": float(size.get("height", 0.0)) if isinstance(size, dict) else 0.0,
    }


def _valid_position(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("x"), (int, float))
        and isinstance(value.get("y"), (int, float))
    )


def _valid_size(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("width"), (int, float))
        and isinstance(value.get("height"), (int, float))
    )


def _localize_elements(
    elements: list[dict[str, Any]],
    bounds: dict[str, float],
) -> list[dict[str, Any]]:
    localized = copy.deepcopy(elements)
    _translate_elements(localized, -bounds["x"], -bounds["y"])
    return localized


def _elements_bounds(elements: list[dict[str, Any]]) -> dict[str, float] | None:
    boxes: list[dict[str, float]] = []
    for element in elements:
        boxes.extend(_element_boxes(element))

    if not boxes:
        return None

    min_x = min(box["x"] for box in boxes)
    min_y = min(box["y"] for box in boxes)
    max_x = max(box["x"] + box["width"] for box in boxes)
    max_y = max(box["y"] + box["height"] for box in boxes)
    return {
        "x": min_x,
        "y": min_y,
        "width": max_x - min_x,
        "height": max_y - min_y,
    }


def _element_boxes(element: dict[str, Any]) -> list[dict[str, float]]:
    position = element.get("position")
    size = element.get("size")
    if isinstance(position, dict) and isinstance(size, dict):
        x = position.get("x")
        y = position.get("y")
        width = size.get("width")
        height = size.get("height")
        if all(isinstance(value, (int, float)) for value in (x, y, width, height)):
            return [
                {
                    "x": float(x),
                    "y": float(y),
                    "width": float(width),
                    "height": float(height),
                }
            ]

    boxes: list[dict[str, float]] = []
    child = element.get("child")
    if isinstance(child, dict):
        boxes.extend(_element_boxes(child))

    children = element.get("children")
    if isinstance(children, list):
        for child_element in children:
            if isinstance(child_element, dict):
                boxes.extend(_element_boxes(child_element))

    return boxes


def _flatten_elements(elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    flattened: list[dict[str, Any]] = []
    for element in elements:
        flattened.extend(_flatten_element(element))
    return flattened


def _flatten_element(element: dict[str, Any]) -> list[dict[str, Any]]:
    flattened = [element]
    child = element.get("child")
    if isinstance(child, dict):
        flattened.extend(_flatten_element(child))

    children = element.get("children")
    if isinstance(children, list):
        for child_element in children:
            if isinstance(child_element, dict):
                flattened.extend(_flatten_element(child_element))

    return flattened


def _candidate_records(
    candidates: list[dict[str, Any]],
    layouts: list[dict[str, Any]],
) -> list[_CandidateRecord]:
    records: list[_CandidateRecord] = []
    for candidate_index, candidate in enumerate(candidates):
        slide_index = candidate.get("slide_index")
        element_indices = candidate.get("elements")
        if not isinstance(slide_index, int):
            raise ValueError(f"candidate {candidate_index} must contain slide_index")
        if slide_index < 0 or slide_index >= len(layouts):
            raise ValueError(f"candidate {candidate_index} references invalid slide_index")
        if not isinstance(element_indices, list) or not element_indices:
            raise ValueError(f"candidate {candidate_index} must contain element indices")

        source_elements = layouts[slide_index].get("elements", [])
        if not isinstance(source_elements, list):
            raise ValueError(f"slide {slide_index} must contain elements")

        resolved_elements = [
            copy.deepcopy(_element_at_index(source_elements, element_index, candidate_index))
            for element_index in element_indices
        ]
        records.append(
            _CandidateRecord(
                index=candidate_index,
                id=str(candidate.get("id", f"candidate_{candidate_index}")),
                slide_index=slide_index,
                element_indices=[int(element_index) for element_index in element_indices],
                elements=resolved_elements,
            )
        )

    return records


def _element_at_index(
    elements: list[Any],
    element_index: Any,
    candidate_index: int,
) -> dict[str, Any]:
    if not isinstance(element_index, int):
        raise ValueError(f"candidate {candidate_index} contains a non-integer element index")
    if element_index < 0 or element_index >= len(elements):
        raise ValueError(
            f"candidate {candidate_index} references element index {element_index}, "
            f"but valid indices are 0 through {len(elements) - 1}"
        )

    element = elements[element_index]
    if not isinstance(element, dict):
        raise ValueError(f"candidate {candidate_index} references a non-object element")
    return element


def _component_by_candidate_index(
    clusters: list[dict[str, Any]],
    components: list[dict[str, Any]],
) -> dict[int, dict[str, Any]]:
    if len(components) < len(clusters):
        raise ValueError(
            f"components has {len(components)} components for {len(clusters)} clusters"
        )

    component_by_candidate: dict[int, dict[str, Any]] = {}
    for cluster_index, cluster in enumerate(clusters):
        candidate_indices = cluster.get("candidates")
        if not isinstance(candidate_indices, list):
            raise ValueError(f"cluster {cluster_index} must contain candidate indices")

        component = components[cluster_index]
        for candidate_index in candidate_indices:
            if not isinstance(candidate_index, int):
                raise ValueError(f"cluster {cluster_index} contains a non-integer candidate index")
            component_by_candidate[candidate_index] = component

    return component_by_candidate


def _candidates_by_slide(
    candidate_records: list[_CandidateRecord],
) -> dict[int, list[_CandidateRecord]]:
    by_slide: dict[int, list[_CandidateRecord]] = {}
    for candidate in candidate_records:
        by_slide.setdefault(candidate.slide_index, []).append(candidate)

    return by_slide


def _layouts_from_presentation(presentation: Any) -> list[dict[str, Any]]:
    if isinstance(presentation, list):
        layouts = presentation
    elif isinstance(presentation, dict):
        layouts = presentation.get("layouts", presentation.get("slides", []))
    else:
        layouts = []

    if not isinstance(layouts, list):
        raise ValueError("pptx JSON must contain a layouts or slides array")
    if not all(isinstance(layout, dict) for layout in layouts):
        raise ValueError("all layouts must be JSON objects")

    return layouts


def _presentation_with_layouts(
    presentation: Any,
    layouts: list[dict[str, Any]],
) -> dict[str, Any]:
    if isinstance(presentation, dict):
        template = copy.deepcopy(presentation)
        if "layouts" in template or "slides" not in template:
            template["layouts"] = layouts
        else:
            template["slides"] = layouts
        return template
    return {"layouts": layouts}


def _element_children(element: dict[str, Any]) -> list[Any]:
    children = element.get("children")
    if isinstance(children, list):
        return children

    child = element.get("child")
    if isinstance(child, dict):
        return [child]

    return []


def _get_object_path_value(value: Any, path: list[str]) -> Any:
    current = value
    for segment in path:
        if not isinstance(current, dict):
            return None
        current = current.get(segment)
    return current


def _is_array_index(value: Any) -> bool:
    return isinstance(value, str) and ARRAY_INDEX_RE.match(value) is not None


def _strip_fixed_fields(value: Any) -> None:
    if isinstance(value, list):
        for item in value:
            _strip_fixed_fields(item)
        return

    if not isinstance(value, dict):
        return

    value.pop("fixed", None)
    child = value.get("child")
    if isinstance(child, dict):
        _strip_fixed_fields(child)

    children = value.get("children")
    if isinstance(children, list):
        _strip_fixed_fields(children)


def _cluster_candidates_artifact(
    layouts: SlideLayouts,
    candidates: list[ClusterCandidate],
) -> dict[str, Any]:
    return {
        "slide_count": len(layouts.layouts),
        "candidate_count": len(candidates),
        "candidates": [
            candidate.model_dump(mode="json", exclude_none=True)
            for candidate in candidates
        ],
    }


def _clusters_artifact(
    candidates: list[ClusterCandidate],
    clusters: list[Cluster],
) -> dict[str, Any]:
    return {
        "candidate_count": len(candidates),
        "cluster_count": len(clusters),
        "clusters": [
            cluster.model_dump(mode="json", exclude_none=True)
            for cluster in clusters
        ],
    }


def _components_artifact(
    clusters: list[Cluster],
    components: list[Component],
) -> dict[str, Any]:
    return {
        "cluster_count": len(clusters),
        "component_count": len(components),
        "components": [
            component.model_dump(mode="json", exclude_none=True)
            for component in components
        ],
    }


def _generate_with_validation_retries(
    *,
    client: Any,
    model: str,
    messages: list[Any],
    label: str,
    output_model: type[BaseModel],
    response_name: str,
    validation_retries: int,
    extra_validator: Callable[[Any], None] | None = None,
    max_tokens: int = 8192,
) -> dict[str, Any]:
    attempt_messages = list(messages)
    last_error: Exception | None = None
    max_attempts = validation_retries + 1

    for attempt in range(1, max_attempts + 1):
        attempt_started_at = perf_counter()
        LOGGER.info(
            "[templates.v2.llm] request start label=%s model=%s attempt=%d/%d "
            "retry=%d/%d messages=%d",
            label,
            model,
            attempt,
            max_attempts,
            attempt - 1,
            validation_retries,
            len(attempt_messages),
        )
        try:
            response = client.generate(
                model=model,
                messages=attempt_messages,
                response_format=JSONSchemaResponse(
                    name=response_name,
                    strict=False,
                    json_schema=output_model,
                ),
                max_tokens=max_tokens,
            )
        except Exception as exc:
            last_error = exc
            LOGGER.warning(
                "[templates.v2.llm] request failed label=%s model=%s "
                "attempt=%d/%d retry=%d/%d duration_ms=%.1f error=%s",
                label,
                model,
                attempt,
                max_attempts,
                attempt - 1,
                validation_retries,
                _elapsed_ms(attempt_started_at),
                exc,
            )
            if attempt > validation_retries:
                LOGGER.error(
                    "[templates.v2.llm] retries exhausted after generation error "
                    "label=%s model=%s attempts=%d validation_retries=%d",
                    label,
                    model,
                    attempt,
                    validation_retries,
                )
                raise
            attempt_messages = _messages_for_generation_error_retry(
                messages=attempt_messages,
                label=label,
                error=exc,
            )
            continue

        try:
            parsed = _parse_json_content(response.content)
            validated = _validate_output_model(
                parsed,
                output_model,
                extra_validator=extra_validator,
            )
            LOGGER.info(
                "[templates.v2.llm] response validated label=%s model=%s "
                "attempt=%d/%d retry=%d/%d duration_ms=%.1f preview=%s",
                label,
                model,
                attempt,
                max_attempts,
                attempt - 1,
                validation_retries,
                _elapsed_ms(attempt_started_at),
                _preview_for_log(response.content),
            )
            return validated
        except ValidationError as exc:
            last_error = exc
            if attempt > validation_retries:
                LOGGER.error(
                    "[templates.v2.llm] validation failed; retries exhausted "
                    "label=%s model=%s attempt=%d/%d retry=%d/%d "
                    "duration_ms=%.1f",
                    label,
                    model,
                    attempt,
                    max_attempts,
                    attempt - 1,
                    validation_retries,
                    _elapsed_ms(attempt_started_at),
                )
                raise
            LOGGER.warning(
                "[templates.v2.llm] validation failed; retrying label=%s model=%s "
                "attempt=%d/%d retry=%d/%d next_attempt=%d/%d duration_ms=%.1f",
                label,
                model,
                attempt,
                max_attempts,
                attempt - 1,
                validation_retries,
                attempt + 1,
                max_attempts,
                _elapsed_ms(attempt_started_at),
            )
            attempt_messages = _messages_for_model_validation_retry(
                messages=attempt_messages,
                response=response,
                label=label,
                output_model=output_model,
                error=exc,
                invalid_response=parsed,
            )
        except (JSONDecodeError, ValueError) as exc:
            last_error = exc
            LOGGER.warning(
                "[templates.v2.llm] JSON or semantic validation failed label=%s "
                "model=%s attempt=%d/%d retry=%d/%d duration_ms=%.1f error=%s "
                "preview=%s",
                label,
                model,
                attempt,
                max_attempts,
                attempt - 1,
                validation_retries,
                _elapsed_ms(attempt_started_at),
                exc,
                _preview_for_log(response.content),
            )
            if attempt > validation_retries:
                LOGGER.error(
                    "[templates.v2.llm] retries exhausted after JSON or semantic "
                    "validation failure label=%s model=%s attempts=%d "
                    "validation_retries=%d",
                    label,
                    model,
                    attempt,
                    validation_retries,
                )
                raise
            attempt_messages = _messages_for_json_repair_retry(
                messages=attempt_messages,
                response=response,
                label=label,
                error=exc,
            )

    if last_error is not None:
        raise last_error

    raise RuntimeError(f"LLM failed to generate {label}")


def _validate_output_model(
    parsed: dict[str, Any],
    output_model: type[BaseModel],
    *,
    extra_validator: Callable[[Any], None] | None = None,
) -> dict[str, Any]:
    validated = output_model.model_validate(parsed)
    if extra_validator is not None:
        extra_validator(validated)
    return validated.model_dump(mode="json")


def _parse_json_content(content: Any) -> dict[str, Any]:
    text_content = _text_from_content(content)

    if text_content is not None:
        parsed = json.loads(text_content)
    else:
        parsed = content

    if not isinstance(parsed, dict):
        raise ValueError("LLM response must be a JSON object")

    return parsed


def _text_from_content(content: Any) -> str | None:
    if isinstance(content, str):
        return content

    if not isinstance(content, list):
        return None

    parts: list[str] = []
    for part in content:
        if isinstance(part, str):
            parts.append(part)
            continue

        text = getattr(part, "text", None)
        if isinstance(text, str):
            parts.append(text)

    return "".join(parts) if parts else None


def _messages_for_generation_error_retry(
    *,
    messages: list[Any],
    label: str,
    error: Exception,
) -> list[Any]:
    return [
        *messages,
        UserMessage(
            content=_json_repair_prompt(
                label=label,
                invalid_response=None,
                error=error,
            )
        ),
    ]


def _messages_for_json_repair_retry(
    *,
    messages: list[Any],
    response: Any,
    label: str,
    error: Exception,
) -> list[Any]:
    invalid_response = _text_from_content(response.content) or response.content
    retry_messages = [
        *messages,
        AssistantMessage(content=[_json_dumps_for_prompt(invalid_response)]),
    ]

    retry_messages.append(
        UserMessage(
            content=_json_repair_prompt(
                label=label,
                invalid_response=invalid_response,
                error=error,
            )
        )
    )
    return retry_messages


def _messages_for_model_validation_retry(
    *,
    messages: list[Any],
    response: Any,
    label: str,
    output_model: type[BaseModel],
    error: ValidationError,
    invalid_response: dict[str, Any],
) -> list[Any]:
    retry_messages = [
        *messages,
        AssistantMessage(content=[_json_dumps_for_prompt(invalid_response)]),
    ]

    retry_messages.append(
        UserMessage(
            content=_model_validation_repair_prompt(
                label=label,
                output_model=output_model,
                invalid_response=invalid_response,
                error=error,
            )
        )
    )
    return retry_messages


def _json_repair_prompt(
    *,
    label: str,
    invalid_response: Any | None,
    error: Exception,
) -> str:
    parts = [
        f"The previous {label} response was not valid for this task.",
        "Return a complete replacement JSON object.",
        "Return raw JSON only. Do not include markdown fences, comments, explanations, or any text before or after the JSON object.",
        "",
        "errors:",
        _format_error_for_prompt(error),
    ]

    if invalid_response is not None:
        parts.extend(
            [
                "",
                "invalid_response:",
                _json_dumps_for_prompt(invalid_response),
            ]
        )

    return "\n".join(parts)


def _model_validation_repair_prompt(
    *,
    label: str,
    output_model: type[BaseModel],
    invalid_response: dict[str, Any],
    error: ValidationError,
) -> str:
    parts = [
        f"The previous {label} JSON did not match the required schema.",
        "Return a complete corrected replacement JSON object.",
    ]

    if output_model is Component:
        parts.extend(
            [
                (
                    "The Component must include required `position` and `size`, "
                    "keep every element coordinate local to the component origin, "
                    "use design_variables for reusable visual differences, and "
                    "never turn absolute slide placement or replaceable content "
                    "differences into variables."
                ),
                (
                    "Do not create design variables, object option fields, or "
                    "array option entries for values that are identical across "
                    "candidate options; keep unchanged attributes in base elements."
                ),
                (
                    "Text strings and image data may be variables only when the "
                    "element is fixed static visual chrome, not editable instance "
                    "content."
                ),
            ]
        )

    parts.extend(
        [
            "Return raw JSON only. Do not include markdown fences, comments, explanations, or any text before or after the JSON object.",
            "",
            "validation_errors:",
            _format_error_for_prompt(error),
            "",
            "invalid_response:",
            _json_dumps_for_prompt(invalid_response),
            "",
            "required_json_schema:",
            _json_dumps_for_prompt(output_model.model_json_schema()),
        ]
    )
    return "\n".join(parts)


def _format_error_for_prompt(error: Exception) -> str:
    if isinstance(error, ValidationError):
        return _json_dumps_for_prompt(error.errors(include_input=False))

    if isinstance(error, JSONDecodeError):
        return _json_dumps_for_prompt(
            [{"type": "JSONDecodeError", "msg": str(error)}]
        )

    return _json_dumps_for_prompt([{"type": type(error).__name__, "msg": str(error)}])


def _json_dumps_for_prompt(value: Any) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False, default=str)


def _elapsed_ms(started_at: float) -> float:
    return (perf_counter() - started_at) * 1000


def _preview_for_log(value: Any) -> str:
    text = _text_from_content(value)
    if text is None:
        text = _json_dumps_for_prompt(value)

    max_chars = _llm_log_preview_chars()
    if max_chars <= 0:
        return "<disabled>"

    if len(text) <= max_chars:
        return text

    return f"{text[:max_chars]}... <truncated {len(text) - max_chars} chars>"


def _llm_log_preview_chars() -> int:
    raw = os.getenv(LLM_LOG_PREVIEW_CHARS_ENV)
    if raw is None:
        return DEFAULT_LLM_LOG_PREVIEW_CHARS
    try:
        return int(raw)
    except ValueError:
        LOGGER.warning(
            "[templates.v2.llm] invalid %s=%r; using default preview chars=%d",
            LLM_LOG_PREVIEW_CHARS_ENV,
            raw,
            DEFAULT_LLM_LOG_PREVIEW_CHARS,
        )
        return DEFAULT_LLM_LOG_PREVIEW_CHARS
