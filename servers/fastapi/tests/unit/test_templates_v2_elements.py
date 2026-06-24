import pytest
from pydantic import ValidationError

from templates.v2.models.elements import (
    Chart,
    Container,
    Image,
    Table,
    Text,
    TextList,
)
from templates.v2.models.layouts import RawSlideLayout


def test_element_models_match_export_schema_changes():
    assert "decorative" not in Container.model_fields
    assert not {
        "data",
        "color",
        "axis_color",
        "label_color",
        "show_values",
    }.intersection(Chart.model_fields)

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
