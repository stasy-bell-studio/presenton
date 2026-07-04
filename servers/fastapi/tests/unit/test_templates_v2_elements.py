import pytest
from pydantic import ValidationError

from templates.v2.models.elements import (
    Chart,
    Container,
    Image,
    Infographic,
    Table,
    Text,
    TextList,
)
from templates.v2.models.layouts import RawSlideLayout


def test_image_element_accepts_flip_flags():
    image = Image.model_validate(
        {
            "type": "image",
            "decorative": False,
            "name": "hero",
            "is_icon": False,
            "data": "/app_data/images/hero.png",
            "flip_h": True,
            "flip_v": False,
            "focus_x": 20.0,
            "focus_y": 75.0,
        }
    )
    assert image.flip_h is True
    assert image.flip_v is False
    assert image.focus_x == 20.0
    assert image.focus_y == 75.0

    layout = RawSlideLayout.model_validate(
        {
            "id": "flipped_image_slide",
            "description": "Layout with a flipped image.",
            "elements": [
                {
                    "type": "image",
                    "decorative": False,
                    "name": "hero",
                    "is_icon": False,
                    "data": "/app_data/images/hero.png",
                    "flip_h": True,
                    "flip_v": False,
                    "focus_x": 20.0,
                    "focus_y": 75.0,
                }
            ],
        }
    )
    layout_image = layout.elements[0]
    assert layout_image.flip_h is True
    assert layout_image.flip_v is False
    assert layout_image.focus_x == 20.0
    assert layout_image.focus_y == 75.0


def test_element_models_match_export_schema_changes():
    assert "decorative" not in Container.model_fields
    assert not {
        "data",
        "color",
        "axis_color",
        "label_color",
        "show_values",
    }.intersection(Chart.model_fields)
    assert {"base_color", "highlight_color"}.issubset(Infographic.model_fields)

    with pytest.raises(ValidationError, match="runs"):
        Text.model_validate(
            {
                "type": "text",
                "decorative": False,
                "name": "title",
                "min_length": 1,
                "max_length": 10,
            }
        )

    with pytest.raises(ValidationError, match="items"):
        TextList.model_validate(
            {
                "type": "text-list",
                "decorative": False,
                "name": "bullets",
                "min_items": 1,
                "max_items": 2,
                "min_item_length": 1,
                "max_item_length": 10,
            }
        )

    with pytest.raises(ValidationError, match="data"):
        Image.model_validate(
            {
                "type": "image",
                "decorative": False,
                "name": "hero",
                "is_icon": False,
            }
        )

    table = Table.model_validate(
        {
            "type": "table",
            "decorative": False,
            "name": "metrics",
            "columns": ["Metric", "Value"],
            "rows": [["Revenue", "$12M"]],
            "min_columns": 1,
            "max_columns": 2,
            "min_rows": 1,
            "max_rows": 1,
        }
    )
    assert table.columns == ["Metric", "Value"]

    with pytest.raises(ValidationError):
        Table.model_validate(
            {
                "type": "table",
                "decorative": False,
                "name": "metrics",
                "columns": [{"text": "Metric"}],
                "rows": [["Revenue"]],
                "min_columns": 1,
                "max_columns": 1,
                "min_rows": 1,
                "max_rows": 1,
            }
        )

    infographic = Infographic.model_validate(
        {
            "type": "infographic",
            "decorative": False,
            "name": "progress",
            "infographic_type": "progress_bar",
            "min_value": 0,
            "max_value": 100,
            "value": 70,
            "base_color": "E5E7EB",
            "highlight_color": "2563EB",
        }
    )
    assert infographic.type == "infographic"
    assert infographic.decorative is False
    assert infographic.infographic_type.value == "progress_bar"
    assert infographic.base_color == "E5E7EB"
    assert infographic.highlight_color == "2563EB"

    with pytest.raises(ValidationError):
        Infographic.model_validate(
            {
                "type": "infographics",
                "decorative": False,
                "name": "progress",
                "infographics_type": "progress_bar",
                "min_value": 0,
                "max_value": 100,
                "value": 70,
            }
        )


def test_chart_rejects_tiny_explicit_size():
    with pytest.raises(ValidationError, match="chart size"):
        Chart.model_validate(
            {
                "type": "chart",
                "decorative": False,
                "name": "model_chart",
                "chart_type": "bar",
                "position": {"x": 0.25, "y": 0.2},
                "size": {"width": 0.6, "height": 0.5},
                "categories": ["GPT OSS 20B", "GPT OSS 120B"],
                "series": [{"name": "Score", "values": [20, 120]}],
            }
        )

    chart = Chart.model_validate(
        {
            "type": "chart",
            "decorative": False,
            "name": "model_chart",
            "chart_type": "bar",
            "position": {"x": 0, "y": 0},
            "size": {"width": 640, "height": 300},
            "categories": ["GPT OSS 20B", "GPT OSS 120B"],
            "series": [{"name": "Score", "values": [20, 120]}],
        }
    )
    assert chart.size.width == 640


def test_raw_layout_accepts_reference_converter_element_models():
    layout = RawSlideLayout.model_validate(
        {
            "id": "pptx_slide",
            "description": "Layout converted from a PowerPoint source slide.",
            "elements": [
                {
                    "type": "image",
                    "decorative": True,
                    "name": "background",
                    "is_icon": False,
                    "opacity": 0.42,
                    "data": "/app_data/images/background.png",
                },
                {
                    "type": "table",
                    "decorative": False,
                    "name": "financials",
                    "columns": ["Metric", "Value"],
                    "rows": [["Revenue", "$12M"]],
                    "min_columns": 1,
                    "max_columns": 2,
                    "min_rows": 1,
                    "max_rows": 1,
                },
                {
                    "type": "chart",
                    "decorative": False,
                    "name": "revenue_chart",
                    "chart_type": "bar",
                    "title": "Revenue",
                    "series_colors": ["#445566"],
                    "x_axis": False,
                    "y_axis": False,
                    "categories": ["Q1", "Q2"],
                    "series": [{"name": "Revenue", "values": [10.0, 12.0]}],
                    "data_labels": True,
                    "grid": True,
                },
            ],
        }
    )

    image, table, chart = layout.elements
    assert image.opacity == 0.42
    assert table.columns == ["Metric", "Value"]
    assert chart.grid is True
    assert chart.series[0].values == [10.0, 12.0]


def test_flow_layout_children_can_omit_geometry():
    layout = RawSlideLayout.model_validate(
        {
            "id": "flow_slide",
            "description": "Layout with flex-computed child geometry.",
            "elements": [
                {
                    "type": "flex",
                    "name": "cards",
                    "direction": "row",
                    "min_children": 1,
                    "max_children": 2,
                    "children": [
                        {
                            "type": "grid",
                            "name": "metric_grid",
                            "columns": 2,
                            "min_children": 1,
                            "max_children": 2,
                            "children": [
                                {
                                    "type": "text",
                                    "decorative": False,
                                    "name": "metric",
                                    "min_length": 2,
                                    "max_length": 4,
                                    "runs": [{"text": "42"}],
                                }
                            ],
                        }
                    ],
                }
            ],
        }
    )

    flex = layout.elements[0]
    grid = flex.children[0]
    assert flex.position is None
    assert grid.size is None
