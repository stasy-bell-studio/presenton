import uuid

from llmai.shared import AssistantMessage, SystemMessage, UserMessage
from pydantic import BaseModel, Field, ValidationError

from templates.v2.generation import (
    Cluster,
    ClusterCandidate,
    Component,
    ComponentCluster,
    ComponentClusterCandidate,
    _apply_design_variable,
    _component_payload,
    _messages_for_json_repair_retry,
    _messages_for_model_validation_retry,
    build_template_layouts,
)
from templates.v2.models.layouts import SlideLayouts


class _FakeResponse:
    def __init__(self, content, messages):
        self.content = content
        self.messages = messages


class _ProviderResponseItem:
    id = "rs_00000000000000000000000000000000"


class _RetrySchema(BaseModel):
    title: str = Field(min_length=5)


def test_design_variable_uses_source_expression_and_explicit_target_path():
    component = Component(
        id="metric_card",
        description="Reusable metric card with scalable typography.",
        position={"x": 0, "y": 0},
        size={"width": 200, "height": 100},
        design_variables=[
            {
                "name": "scale_variant",
                "type": "object",
                "options": [{"width": 240, "font_size": 28}],
                "effect": [
                    {"source": "$.width", "target": "elements.0.size.width"},
                    {
                        "source": "$.font_size",
                        "target": "elements.1.runs.0.font.size",
                    },
                ],
            }
        ],
        elements=[
            {
                "type": "rectangle",
                "position": {"x": 0, "y": 0},
                "size": {"width": 200, "height": 100},
            },
            {
                "type": "text",
                "position": {"x": 20, "y": 20},
                "size": {"width": 160, "height": 40},
                "fixed": False,
                "name": "metric",
                "min_length": 10,
                "max_length": 20,
                "runs": [{"text": "Metric", "font": {"size": 20}}],
            },
        ],
    )
    component_data = component.model_dump(mode="json", exclude_none=True)

    _apply_design_variable(
        component_data["elements"],
        component_data["design_variables"][0],
        {"width": 240, "font_size": 28},
    )

    assert component_data["elements"][0]["size"]["width"] == 240
    assert component_data["elements"][1]["runs"][0]["font"]["size"] == 28


def test_build_template_layouts_replaces_candidates_and_keeps_fallbacks():
    raw_layouts = SlideLayouts.model_validate(
        {
            "layouts": [
                {
                    "id": "slide_1",
                    "description": "Raw slide.",
                    "elements": [
                        {
                            "type": "rectangle",
                            "position": {"x": 10, "y": 20},
                            "size": {"width": 100, "height": 80},
                            "fill": {"color": "#ffffff"},
                        },
                        {
                            "type": "rectangle",
                            "position": {"x": 200, "y": 20},
                            "size": {"width": 100, "height": 80},
                            "fill": {"color": "#eeeeee"},
                        },
                    ],
                }
            ]
        }
    )
    candidates = [
        ClusterCandidate(
            id="left_card",
            description="Standalone rectangle component.",
            slide_index=0,
            elements=[0],
        )
    ]
    clusters = [Cluster(id="card", candidates=[0])]
    components = [
        Component(
            id="card_component",
            description="Reusable rectangle card component.",
            position={"x": 0, "y": 0},
            size={"width": 100, "height": 80},
            design_variables=[],
            elements=[
                {
                    "type": "rectangle",
                    "position": {"x": 0, "y": 0},
                    "size": {"width": 100, "height": 80},
                    "fill": {"color": "#ffffff"},
                }
            ],
        )
    ]

    template, stats = build_template_layouts(
        raw_layouts,
        candidates,
        clusters,
        components,
    )

    layout = template["layouts"][0]
    assert "elements" not in layout
    assert [component["id"] for component in layout["components"]] == [
        "card_component",
        "slide_1_element_2",
    ]
    assert layout["components"][0]["position"] == {"x": 10.0, "y": 20.0}
    assert layout["components"][0]["size"] == {"width": 100.0, "height": 80.0}
    assert layout["components"][0]["elements"][0]["position"] == {"x": 0.0, "y": 0.0}
    assert layout["components"][1]["position"] == {"x": 200.0, "y": 20.0}
    assert layout["components"][1]["elements"][0]["position"] == {"x": 0.0, "y": 0.0}
    assert stats.replaced_candidates == 1
    assert stats.skipped_overlapping_candidates == 0
    assert stats.untouched_elements == 1


def test_build_template_layouts_assigns_uuid_layout_ids(monkeypatch):
    layout_ids = iter(
        [
            uuid.UUID("00000000-0000-0000-0000-000000000101"),
            uuid.UUID("00000000-0000-0000-0000-000000000102"),
        ]
    )
    monkeypatch.setattr(
        "templates.v2.generation.uuid.uuid4",
        lambda: next(layout_ids),
    )
    raw_layouts = SlideLayouts.model_validate(
        {
            "layouts": [
                {"id": "slide_1", "description": "First slide.", "elements": []},
                {"id": "slide_2", "description": "Second slide.", "elements": []},
            ]
        }
    )

    template, stats = build_template_layouts(raw_layouts, [], [], [])

    assert [layout["id"] for layout in template["layouts"]] == [
        "00000000-0000-0000-0000-000000000101",
        "00000000-0000-0000-0000-000000000102",
    ]
    assert stats.replaced_candidates == 0
    assert stats.skipped_overlapping_candidates == 0
    assert stats.untouched_elements == 0


def test_build_template_layouts_promotes_overlapping_child_to_parent_candidate():
    raw_layouts = SlideLayouts.model_validate(
        {
            "layouts": [
                {
                    "id": "slide_1",
                    "description": "Raw slide.",
                    "elements": [
                        {
                            "type": "rectangle",
                            "position": {"x": 20, "y": 30},
                            "size": {"width": 180, "height": 90},
                            "fill": {"color": "#f4f4f4"},
                        },
                        {
                            "type": "text",
                            "position": {"x": 40, "y": 50},
                            "size": {"width": 120, "height": 30},
                            "fixed": False,
                            "name": "title",
                            "max_length": 40,
                            "min_length": 20,
                            "runs": [{"text": "Original title"}],
                        },
                    ],
                }
            ]
        }
    )
    candidates = [
        ClusterCandidate(
            id="title_only",
            description="Standalone title text component.",
            slide_index=0,
            elements=[1],
        ),
        ClusterCandidate(
            id="title_card",
            description="Card with background rectangle and title text.",
            slide_index=0,
            elements=[0, 1],
        ),
    ]
    clusters = [
        Cluster(id="title_cluster", candidates=[0]),
        Cluster(id="card_cluster", candidates=[1]),
    ]
    components = [
        Component(
            id="title_component",
            description="Reusable standalone title component.",
            position={"x": 0, "y": 0},
            size={"width": 120, "height": 30},
            design_variables=[],
            elements=[
                {
                    "type": "text",
                    "position": {"x": 0, "y": 0},
                    "size": {"width": 120, "height": 30},
                    "fixed": False,
                    "name": "title",
                    "max_length": 40,
                    "min_length": 20,
                    "runs": [{"text": "Placeholder"}],
                }
            ],
        ),
        Component(
            id="card_component",
            description="Reusable card with title component.",
            position={"x": 0, "y": 0},
            size={"width": 180, "height": 90},
            design_variables=[],
            elements=[
                {
                    "type": "rectangle",
                    "position": {"x": 0, "y": 0},
                    "size": {"width": 180, "height": 90},
                    "fill": {"color": "#f4f4f4"},
                },
                {
                    "type": "text",
                    "position": {"x": 20, "y": 20},
                    "size": {"width": 120, "height": 30},
                    "fixed": False,
                    "name": "title",
                    "max_length": 40,
                    "min_length": 20,
                    "runs": [{"text": "Placeholder"}],
                },
            ],
        ),
    ]

    template, stats = build_template_layouts(
        raw_layouts,
        candidates,
        clusters,
        components,
    )

    layout_components = template["layouts"][0]["components"]
    assert [component["id"] for component in layout_components] == ["card_component"]
    assert layout_components[0]["position"] == {"x": 20.0, "y": 30.0}
    assert layout_components[0]["size"] == {"width": 180.0, "height": 90.0}
    assert layout_components[0]["elements"][1]["runs"] == [{"text": "Original title"}]
    assert stats.replaced_candidates == 1
    assert stats.skipped_overlapping_candidates == 1
    assert stats.untouched_elements == 0


def test_component_payload_localizes_candidate_elements_and_strips_fixed_fields():
    cluster = ComponentCluster(
        id="cards",
        candidates=[
            ComponentClusterCandidate(
                id="card_one",
                slide_index=0,
                description="Card with background and title.",
                elements=[
                    {
                        "type": "rectangle",
                        "position": {"x": 100, "y": 120},
                        "size": {"width": 200, "height": 80},
                        "fill": {"color": "#ffffff"},
                    },
                    {
                        "type": "text",
                        "position": {"x": 120, "y": 140},
                        "size": {"width": 160, "height": 30},
                        "fixed": False,
                        "name": "title",
                        "max_length": 40,
                        "min_length": 20,
                        "runs": [{"text": "Candidate title"}],
                    },
                ],
            )
        ],
    )

    payload = _component_payload(cluster)
    candidate = payload["cluster"]["candidates"][0]

    assert candidate["position"] == {"x": 100.0, "y": 120.0}
    assert candidate["size"] == {"width": 200.0, "height": 80.0}
    assert candidate["elements"][0]["position"] == {"x": 0.0, "y": 0.0}
    assert candidate["elements"][1]["position"] == {"x": 20.0, "y": 20.0}
    assert "fixed" not in candidate["elements"][1]


def test_json_repair_retry_rebuilds_messages_without_provider_response_items():
    original_messages = [
        SystemMessage(content="Return JSON."),
        UserMessage(content="{}"),
    ]
    provider_response_item = _ProviderResponseItem()
    response = _FakeResponse(
        content='{"bad": true',
        messages=[provider_response_item],
    )

    retry_messages = _messages_for_json_repair_retry(
        messages=original_messages,
        response=response,
        label="component",
        error=ValueError("invalid JSON"),
    )

    assert provider_response_item not in retry_messages
    assert retry_messages[:2] == original_messages
    assert isinstance(retry_messages[2], AssistantMessage)
    assert retry_messages[2].content == ['"{\\"bad\\": true"']
    assert isinstance(retry_messages[3], UserMessage)
    assert "Return a complete replacement JSON object." in retry_messages[3].content


def test_validation_retry_rebuilds_messages_without_provider_response_items():
    original_messages = [
        SystemMessage(content="Return schema JSON."),
        UserMessage(content='{"title":"ok"}'),
    ]
    provider_response_item = _ProviderResponseItem()
    invalid_response = {"title": "bad"}
    response = _FakeResponse(
        content=invalid_response,
        messages=[provider_response_item],
    )
    try:
        _RetrySchema.model_validate(invalid_response)
    except ValidationError as exc:
        validation_error = exc
    else:
        raise AssertionError("expected validation error")

    retry_messages = _messages_for_model_validation_retry(
        messages=original_messages,
        response=response,
        label="component",
        output_model=_RetrySchema,
        error=validation_error,
        invalid_response=invalid_response,
    )

    assert provider_response_item not in retry_messages
    assert retry_messages[:2] == original_messages
    assert isinstance(retry_messages[2], AssistantMessage)
    assert retry_messages[2].content == ['{\n  "title": "bad"\n}']
    assert isinstance(retry_messages[3], UserMessage)
    assert "required_json_schema:" in retry_messages[3].content
