from __future__ import annotations

from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from services.chat.schemas import OpenAIStrictSchemaModel, StrictSchemaModel


class NoArgsInput(StrictSchemaModel):
    pass


class GetSlideLayoutInput(StrictSchemaModel):
    slide_index: int = Field(alias="slideIndex", ge=0, le=1000)
    include_full_json: bool = Field(alias="includeFullJson")

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class SearchTemplateContentInput(StrictSchemaModel):
    query: str = Field(min_length=1, max_length=1000)
    limit: int = Field(ge=1, le=20)


class GetEditableElementsInput(StrictSchemaModel):
    slide_index: int = Field(alias="slideIndex", ge=0, le=1000)

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class AddSlideLayoutInput(OpenAIStrictSchemaModel):
    source_slide_index: int | None = Field(
        ...,
        alias="sourceSlideIndex",
        ge=0,
        le=1000,
        description="Zero-based slide layout to duplicate. Use null to duplicate the last layout.",
    )
    insert_index: int | None = Field(
        ...,
        alias="insertIndex",
        ge=0,
        le=1000,
        description="Zero-based insert position. Use null to append.",
    )
    layout_id: str | None = Field(
        ...,
        alias="layoutId",
        min_length=1,
        max_length=120,
        description="Optional id for the new layout.",
    )
    description: str | None = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Optional description for the new layout.",
    )

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class TableCellUpdateInput(StrictSchemaModel):
    section: Literal["columns", "rows"]
    column_index: int = Field(alias="columnIndex", ge=0, le=100)
    row_index: int | None = Field(
        alias="rowIndex",
        ge=0,
        le=100,
        description="Required when section is rows; ignored for columns.",
    )
    text: str = Field(min_length=0, max_length=5000)

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)

    @model_validator(mode="after")
    def validate_row_target(self) -> "TableCellUpdateInput":
        if self.section == "rows" and self.row_index is None:
            raise ValueError("rowIndex is required when section is rows.")
        return self


class ChartSeriesInput(StrictSchemaModel):
    name: str = Field(min_length=1, max_length=200)
    values: list[float] = Field(min_length=1, max_length=100)

    @model_validator(mode="before")
    @classmethod
    def normalize_data_alias(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        if "values" not in normalized and "data" in normalized:
            normalized["values"] = normalized.pop("data")
        return normalized


class ChartUpdateInput(OpenAIStrictSchemaModel):
    title: str | None = Field(..., min_length=0, max_length=500)
    categories: list[str] | None = Field(..., min_length=1, max_length=100)
    series: list[ChartSeriesInput] | None = Field(..., min_length=1, max_length=20)

    @model_validator(mode="before")
    @classmethod
    def drop_chart_type(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        normalized.pop("type", None)
        normalized.pop("chart_type", None)
        return normalized


class TableUpdateInput(StrictSchemaModel):
    columns: list[Any] | None = Field(default=None, min_length=1, max_length=100)
    headers: list[Any] | None = Field(default=None, min_length=1, max_length=100)
    rows: list[list[Any]] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_columns_or_headers(self) -> "TableUpdateInput":
        if self.columns is None and self.headers is None:
            raise ValueError("columns or headers is required.")
        return self


class UpdateElementContentInput(OpenAIStrictSchemaModel):
    slide_index: int = Field(alias="slideIndex", ge=0, le=1000)
    element_path: str = Field(
        alias="elementPath",
        min_length=1,
        max_length=500,
        description=(
            "Path returned by getEditableElements, for example "
            "components[0].elements[1].children[0]."
        ),
    )
    text: str | None = Field(
        ...,
        min_length=0,
        max_length=20000,
        description="Replacement text for text or image data fields.",
    )
    items: list[str] | None = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Replacement item text for text-list elements.",
    )
    table_cell: TableCellUpdateInput | None = Field(
        ...,
        alias="tableCell",
        description="A single table header/body cell update.",
    )
    chart: ChartUpdateInput | None = Field(
        ...,
        description="Chart title/categories/series update.",
    )
    table: TableUpdateInput | None = Field(
        ...,
        description="Whole table update with columns/headers and rows.",
    )

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def normalize_common_llm_payloads(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        if "chart" not in normalized and any(
            key in normalized for key in ("title", "categories", "series")
        ):
            normalized["chart"] = {
                key: normalized.pop(key)
                for key in ("title", "categories", "series")
                if key in normalized
            }
        return normalized


class DeleteComponentInput(StrictSchemaModel):
    slide_index: int = Field(alias="slideIndex", ge=0, le=1000)
    component_id: str = Field(alias="componentId", min_length=1, max_length=120)

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class UngroupComponentInput(StrictSchemaModel):
    slide_index: int = Field(alias="slideIndex", ge=0, le=1000)
    component_id: str = Field(alias="componentId", min_length=1, max_length=120)
    reason: str = Field(min_length=20, max_length=500)

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class SwapLayoutItemsInput(StrictSchemaModel):
    slide_index: int = Field(alias="slideIndex", ge=0, le=1000)
    first_path: str = Field(alias="firstPath", min_length=1, max_length=500)
    second_path: str = Field(alias="secondPath", min_length=1, max_length=500)

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class SwapComponentVariantInput(OpenAIStrictSchemaModel):
    slide_index: int = Field(alias="slideIndex", ge=0, le=1000)
    component_id: str = Field(alias="componentId", min_length=1, max_length=120)
    variant_id: str | None = Field(..., alias="variantId", min_length=1, max_length=120)
    variant_index: int | None = Field(..., alias="variantIndex", ge=0, le=100)

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)

    @model_validator(mode="after")
    def validate_variant_target(self) -> "SwapComponentVariantInput":
        if self.variant_id is None and self.variant_index is None:
            raise ValueError("Either variantId or variantIndex is required.")
        return self
