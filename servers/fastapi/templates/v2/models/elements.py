"""Pydantic models matching the frontend slide element types."""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal, Optional, TypeAlias, Union

from pydantic import BaseModel, Field


def _validate_min_max(
    min_value: int | None,
    max_value: int | None,
    *,
    min_name: str,
    max_name: str,
) -> None:
    if min_value is None or max_value is None:
        return

    expected_min = (max_value + 1) // 2
    if min_value != expected_min:
        raise ValueError(
            f"{min_name} must equal half of {max_name}, rounded up ({expected_min})"
        )


class HorizontalAlignment(str, Enum):
    LEFT = "left"
    CENTER = "center"
    RIGHT = "right"


class VerticalAlignment(str, Enum):
    TOP = "top"
    MIDDLE = "middle"
    BOTTOM = "bottom"


class LayoutAlignment(str, Enum):
    FLEX_START = "flex-start"
    FLEX_END = "flex-end"
    CENTER = "center"
    STRETCH = "stretch"


class TextWrap(str, Enum):
    WORD = "word"
    CHAR = "char"
    NONE = "none"


class Marker(str, Enum):
    BULLET = "bullet"
    NUMBER = "number"
    NONE = "none"


class FlexDirection(str, Enum):
    ROW = "row"
    COLUMN = "column"


class ImageFit(str, Enum):
    CONTAIN = "contain"
    COVER = "cover"
    FILL = "fill"


class ChartType(str, Enum):
    BAR = "bar"
    LINE = "line"
    AREA = "area"
    PIE = "pie"
    DONUT = "donut"


class Position(BaseModel):
    x: float
    y: float


class Size(BaseModel):
    width: float
    height: float


class Padding(BaseModel):
    top: float
    right: float
    bottom: float
    left: float


class Alignment(BaseModel):
    horizontal: Optional[HorizontalAlignment] = None
    vertical: Optional[VerticalAlignment] = None


class Font(BaseModel):
    size: float
    family: Optional[str] = None
    color: Optional[str] = None
    bold: Optional[bool] = None
    italic: Optional[bool] = None
    line_height: Optional[float] = None
    letter_spacing: Optional[float] = None
    wrap: Optional[TextWrap] = None
    ellipsis: Optional[bool] = None


class Fill(BaseModel):
    color: str
    opacity: Optional[float] = None


class Stroke(BaseModel):
    color: str
    opacity: Optional[float] = None
    width: float
    dash: Optional[list[float]] = None


class BorderRadius(BaseModel):
    tl: float
    tr: float
    bl: float
    br: float


class Shadow(BaseModel):
    color: str
    blur: Optional[float] = None
    opacity: Optional[float] = None
    offset_x: Optional[float] = None
    offset_y: Optional[float] = None


class ChartDatum(BaseModel):
    label: str
    value: float
    color: Optional[str] = None


class TextRun(BaseModel):
    text: str
    font: Optional[Font] = None


class Text(BaseModel):  # Konva Text
    type: Literal["text"]
    position: Optional[Position] = None
    size: Optional[Size] = None
    rotation: Optional[float] = None
    font: Optional[Font] = None
    alignment: Optional[Alignment] = None
    fill: Optional[Fill] = None
    stroke: Optional[Stroke] = None
    shadow: Optional[Shadow] = None
    runs: Optional[list[TextRun]] = None

    # Schema
    decorative: bool
    name: str
    max_length: int
    min_length: int


class Container(BaseModel):  # Konva Group
    type: Literal["container"]
    position: Optional[Position] = None
    size: Optional[Size] = None
    rotation: Optional[float] = None
    alignment: Optional[Alignment] = None
    fill: Optional[Fill] = None
    stroke: Optional[Stroke] = None
    border_radius: Optional[BorderRadius] = None
    shadow: Optional[Shadow] = None
    padding: Optional[Padding] = None
    child: Optional[SlideElement] = None

    # Schema
    decorative: bool


class Image(BaseModel):  # Konva Image
    type: Literal["image"]
    position: Optional[Position] = None
    size: Optional[Size] = None
    rotation: Optional[float] = None
    data: Optional[str] = None
    fit: Optional[ImageFit] = None
    border_radius: Optional[BorderRadius] = None
    color: Optional[str] = None

    # Schema
    decorative: bool
    name: str
    is_icon: bool


class TextList(BaseModel):  # Konva Group
    type: Literal["text-list"]
    position: Optional[Position] = None
    size: Optional[Size] = None
    rotation: Optional[float] = None
    font: Optional[Font] = None
    marker: Optional[Marker] = None
    items: Optional[list[list[TextRun]]] = None

    # Schema
    decorative: bool
    name: str
    max_items: int
    min_items: int
    max_item_length: int
    min_item_length: int


class TableCell(BaseModel):
    fill: Optional[Fill] = None
    stroke: Optional[Stroke] = None
    text: Optional[TextRun] = None


class Table(BaseModel):
    type: Literal["table"]
    position: Optional[Position] = None
    size: Optional[Size] = None
    rotation: Optional[float] = None
    columns: list[TableCell]
    rows: list[list[TableCell]]

    # Schema
    decorative: bool
    name: str
    max_columns: int
    min_columns: int
    max_rows: int
    min_rows: int


class Rectangle(BaseModel):
    type: Literal["rectangle"]
    position: Optional[Position] = None
    size: Optional[Size] = None
    rotation: Optional[float] = None
    fill: Optional[Fill] = None
    stroke: Optional[Stroke] = None
    border_radius: Optional[BorderRadius] = None
    shadow: Optional[Shadow] = None


class Ellipse(BaseModel):
    type: Literal["ellipse"]
    position: Optional[Position] = None
    size: Optional[Size] = None
    rotation: Optional[float] = None
    fill: Optional[Fill] = None
    stroke: Optional[Stroke] = None
    shadow: Optional[Shadow] = None


class Line(BaseModel):
    type: Literal["line"]
    position: Optional[Position] = None
    size: Optional[Size] = None
    rotation: Optional[float] = None
    stroke: Stroke
    shadow: Optional[Shadow] = None


class Chart(BaseModel):
    type: Literal["chart"]
    position: Optional[Position] = None
    size: Optional[Size] = None
    rotation: Optional[float] = None
    chart_type: ChartType
    data: list[ChartDatum]
    title: Optional[str] = None
    color: Optional[str] = None
    axis_color: Optional[str] = None
    label_color: Optional[str] = None
    show_values: Optional[bool] = None

    # Schema
    decorative: bool
    name: str


class Flex(BaseModel):
    type: Literal["flex"]
    position: Position
    size: Size
    rotation: Optional[float] = None
    direction: FlexDirection
    wrap: Optional[bool] = None
    align_items: Optional[LayoutAlignment] = None
    justify_content: Optional[LayoutAlignment] = None
    gap: Optional[float] = None
    column_gap: Optional[float] = None
    row_gap: Optional[float] = None
    children: list[SlideElement]

    # Schema
    name: str
    max_children: int
    min_children: int


class Grid(BaseModel):
    type: Literal["grid"]
    position: Position
    size: Size
    rotation: Optional[float] = None
    columns: int
    rows: Optional[int] = None
    gap: Optional[float] = None
    column_gap: Optional[float] = None
    row_gap: Optional[float] = None
    align_items: Optional[LayoutAlignment] = None
    justify_items: Optional[LayoutAlignment] = None
    children: list[SlideElement]

    # Schema
    name: str
    max_children: int
    min_children: int


class Group(BaseModel):
    type: Literal["group"]
    children: list[SlideElement]

    # Schema
    name: str


SlideElement: TypeAlias = Annotated[
    Union[
        Text,
        Container,
        Image,
        TextList,
        Table,
        Rectangle,
        Ellipse,
        Line,
        Chart,
        Flex,
        Grid,
        Group,
    ],
    Field(discriminator="type"),
]


for _model in (Container, Flex, Grid, Group):
    _model.model_rebuild()


__all__ = [
    "Alignment",
    "BorderRadius",
    "Chart",
    "ChartDatum",
    "ChartType",
    "Container",
    "Ellipse",
    "Fill",
    "Flex",
    "FlexDirection",
    "Font",
    "Grid",
    "HorizontalAlignment",
    "Image",
    "ImageFit",
    "LayoutAlignment",
    "Line",
    "Marker",
    "Padding",
    "Position",
    "Rectangle",
    "Shadow",
    "Size",
    "SlideElement",
    "Group",
    "Stroke",
    "Table",
    "TableCell",
    "Text",
    "TextList",
    "TextRun",
    "TextWrap",
    "VerticalAlignment",
]
