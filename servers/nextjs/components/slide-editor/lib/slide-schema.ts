import { z } from "zod";

// Geometry is in inches (PowerPoint's native unit). Slides are widescreen
// 16:9 at 10 x 5.625 in.
export const SLIDE_W = 10;
export const SLIDE_H = 5.625;

export const HexColorSchema = z
  .string()
  .regex(/^#?[0-9A-Fa-f]{6}$/, "Use 6-digit hex colors, with or without #.");

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item, index) =>
          readString(item) ?? readString(isRecord(item) ? item.label : null) ??
          `Item ${index + 1}`,
        )
        .filter(Boolean)
    : [];
}

function normalizeChartSeriesArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!isRecord(item)) return null;
      const values = Array.isArray(item.values)
        ? item.values
            .map(readNumber)
            .filter((entry): entry is number => entry != null)
        : [];
      if (values.length === 0) return null;
      return {
        name: readString(item.name) ?? `Series ${index + 1}`,
        values,
      };
    })
    .filter((item): item is { name: string; values: number[] } => Boolean(item));
}

function normalizeChartDatumArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const label = readString(item.label) ?? "Data";
      const numberValue = readNumber(item.value);
      if (numberValue == null) return null;
      return {
        label,
        value: numberValue,
        color: readString(item.color) ?? undefined,
      };
    })
    .filter(
      (
        item,
      ): item is { label: string; value: number; color: string | undefined } =>
        Boolean(item),
    );
}

function chartDataFromInput(categories: string[], series: { values: number[] }[]) {
  const first = series[0];
  if (!first) return [{ label: "Data", value: 0 }];
  const labels =
    categories.length > 0
      ? categories
      : first.values.map((_, index) => `Item ${index + 1}`);
  return labels.slice(0, 8).map((label, index) => ({
    label,
    value: first.values[index] ?? 0,
  }));
}

export const ThemeRoleSchema = z.enum([
  "background",
  "surface",
  "primary",
  "secondary",
  "accent",
  "text",
  "muted",
]);

export const HorizontalAlignmentSchema = z.enum(["left", "center", "right"]);
export const VerticalAlignmentSchema = z.enum(["top", "middle", "bottom"]);
export const LayoutAlignmentSchema = z.enum([
  "flex-start",
  "flex-end",
  "center",
  "stretch",
]);
export const TextWrapSchema = z.enum(["word", "char", "none"]);
export const MarkerSchema = z.enum(["bullet", "number", "none"]);
export const FlexDirectionSchema = z.enum(["row", "column"]);
export const ImageFitSchema = z.enum(["contain", "cover", "fill"]);
export const ChartTypeSchema = z.enum(["bar", "line", "area", "pie", "donut"]);
export const InfographicTypeSchema = z.enum(["progress_bar", "gauge"]);

export const PositionSchema = z
  .object({
    // Elements may intentionally bleed beyond the slide and are clipped by the
    // slide surface. Keep interaction bounds separate from persisted geometry.
    x: z.number(),
    y: z.number(),
  })
  .strict();

export const SizeSchema = z
  .object({
    width: z.number().positive().max(SLIDE_W),
    height: z.number().positive().max(SLIDE_H),
  })
  .strict();

export const PaddingSchema = z
  .object({
    top: z.number().min(0),
    right: z.number().min(0),
    bottom: z.number().min(0),
    left: z.number().min(0),
  })
  .strict();

export const LayoutItemSchema = z
  .object({
    grow: z.number().min(0).max(12).nullish(),
    shrink: z.number().min(0).max(12).nullish(),
    basis: z.number().positive().max(SLIDE_W).nullish(),
    min_width: z.number().min(0).max(SLIDE_W).nullish(),
    max_width: z.number().positive().max(SLIDE_W).nullish(),
    min_height: z.number().min(0).max(SLIDE_H).nullish(),
    max_height: z.number().positive().max(SLIDE_H).nullish(),
    column_span: z.number().int().min(1).max(12).nullish(),
    row_span: z.number().int().min(1).max(12).nullish(),
    align_self: LayoutAlignmentSchema.nullish(),
  })
  .strict();

export const AlignmentSchema = z
  .object({
    horizontal: HorizontalAlignmentSchema.nullish(),
    vertical: VerticalAlignmentSchema.nullish(),
  })
  .strict();

export const FontSchema = z
  .object({
    family: z.string().min(1).max(80).nullish(),
    size: z.number().min(6).max(360).nullish(),
    color: HexColorSchema.nullish(),
    bold: z.boolean().nullish(),
    italic: z.boolean().nullish(),
    underline: z.boolean().nullish(),
    line_height: z.number().min(0.8).max(2.2).nullish(),
    // Hundredths of a point, matching OOXML character spacing.
    letter_spacing: z.number().min(-200).max(600).nullish(),
    wrap: TextWrapSchema.nullish(),
    ellipsis: z.boolean().nullish(),
  })
  .strict();

export const FillSchema = z
  .object({
    color: HexColorSchema,
    opacity: z.number().min(0).max(1).nullish(),
  })
  .strict();

export const StrokeSchema = z
  .object({
    color: HexColorSchema,
    opacity: z.number().min(0).max(1).nullish(),
    width: z.number().min(0).max(8),
    dash: z.array(z.number().min(0)).nullish(),
  })
  .strict();

export const BorderRadiusSchema = z
  .object({
    tl: z.number().min(0).max(0.5),
    tr: z.number().min(0).max(0.5),
    bl: z.number().min(0).max(0.5),
    br: z.number().min(0).max(0.5),
  })
  .strict();

export const ShadowSchema = z
  .object({
    color: HexColorSchema.nullish(),
    blur: z.number().min(0).max(100).nullish(),
    opacity: z.number().min(0).max(1).nullish(),
    offset_x: z.number().min(-2).max(2).nullish(),
    offset_y: z.number().min(-2).max(2).nullish(),
  })
  .strict();

export const ChartDatumSchema = z
  .object({
    label: z.string().min(1).max(40),
    value: z.number().min(-1_000_000).max(1_000_000),
    color: HexColorSchema.nullish(),
  })
  .strict();

export const ChartSeriesSchema = z
  .object({
    name: z.string().min(1).max(80),
    values: z.array(z.number().min(-1_000_000).max(1_000_000)).min(1).max(24),
  })
  .strict();

export const TextRunSchema = z
  .object({
    text: z.string().min(1).max(700),
    font: FontSchema.nullish(),
  })
  .strict();

export const TextListItemSchema = z.array(TextRunSchema).min(1).max(12);

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const DesignVariableEffectSchema = z
  .object({
    path: z.string().min(1).max(240),
    effect: z.string().min(1).max(120),
  })
  .strict();

export const DesignVariableSchema = z
  .object({
    name: z.string().min(1).max(120),
    type: z.string().min(1).max(40).nullish(),
    options: z.array(JsonValueSchema).min(1).max(40),
    effect: z.array(DesignVariableEffectSchema).min(1).max(40),
  })
  .strict();

const elementBaseShape = {
  decorative: z.boolean().nullish(),
  name: z.string().min(1).max(120).nullish(),
  position: PositionSchema.nullish(),
  size: SizeSchema.nullish(),
  rotation: z.number().min(-360).max(360).nullish(),
  opacity: z.number().min(0).max(1).nullish(),
  shadow: ShadowSchema.nullish(),
  component_id: z.string().min(1).max(120).nullish(),
  component_instance_id: z.string().min(1).max(160).nullish(),
  component_description: z.string().max(600).nullish(),
  component_slot: z.string().min(1).max(120).nullish(),
  design_variables: z.array(DesignVariableSchema).max(24).nullish(),
  layout: LayoutItemSchema.nullish(),
};

const requiredElementBaseShape = {
  ...elementBaseShape,
  position: PositionSchema,
  size: SizeSchema,
};

export const TextElementSchema = z
  .object({
    type: z.literal("text"),
    ...elementBaseShape,
    font: FontSchema.nullish(),
    alignment: AlignmentSchema.nullish(),
    fill: FillSchema.nullish(),
    stroke: StrokeSchema.nullish(),
    runs: z.array(TextRunSchema).min(1).max(24),
    max_length: z.number().nullish(),
    min_length: z.number().nullish(),
  })
  .strict();

type ElementBaseOutput = {
  decorative?: boolean | null | undefined;
  name?: string | null | undefined;
  position?: z.infer<typeof PositionSchema> | null | undefined;
  size?: z.infer<typeof SizeSchema> | null | undefined;
  rotation?: number | null | undefined;
  opacity?: number | null | undefined;
  shadow?: z.infer<typeof ShadowSchema> | null | undefined;
  component_id?: string | null | undefined;
  component_instance_id?: string | null | undefined;
  component_description?: string | null | undefined;
  component_slot?: string | null | undefined;
  design_variables?: z.infer<typeof DesignVariableSchema>[] | null | undefined;
  layout?: z.infer<typeof LayoutItemSchema> | null | undefined;
};

type RequiredElementBaseOutput = ElementBaseOutput & {
  position: z.infer<typeof PositionSchema>;
  size: z.infer<typeof SizeSchema>;
};

type ContainerElementOutput = ElementBaseOutput & {
  type: "container";
  alignment?: z.infer<typeof AlignmentSchema> | null | undefined;
  fill?: z.infer<typeof FillSchema> | null | undefined;
  stroke?: z.infer<typeof StrokeSchema> | null | undefined;
  border_radius?: z.infer<typeof BorderRadiusSchema> | null | undefined;
  padding?: z.infer<typeof PaddingSchema> | null | undefined;
  child?: SlideElementOutput | null | undefined;
};

type FlexElementOutput = RequiredElementBaseOutput & {
  type: "flex";
  direction: z.infer<typeof FlexDirectionSchema>;
  wrap?: boolean | null | undefined;
  align_items?: z.infer<typeof LayoutAlignmentSchema> | null | undefined;
  justify_content?: z.infer<typeof LayoutAlignmentSchema> | null | undefined;
  padding?: z.infer<typeof PaddingSchema> | null | undefined;
  gap?: number | null | undefined;
  column_gap?: number | null | undefined;
  row_gap?: number | null | undefined;
  children: SlideElementOutput[];
  max_children?: number | null | undefined;
  min_children?: number | null | undefined;
};

type GridElementOutput = RequiredElementBaseOutput & {
  type: "grid";
  columns: number;
  rows?: number | null | undefined;
  gap?: number | null | undefined;
  column_gap?: number | null | undefined;
  row_gap?: number | null | undefined;
  align_items?: z.infer<typeof LayoutAlignmentSchema> | null | undefined;
  justify_items?: z.infer<typeof LayoutAlignmentSchema> | null | undefined;
  padding?: z.infer<typeof PaddingSchema> | null | undefined;
  children: SlideElementOutput[];
  max_children?: number | null | undefined;
  min_children?: number | null | undefined;
};

type ListViewElementOutput = ElementBaseOutput & {
  type: "list-view";
  direction?: z.infer<typeof FlexDirectionSchema> | null | undefined;
  gap?: number | null | undefined;
  column_gap?: number | null | undefined;
  row_gap?: number | null | undefined;
  align_items?: z.infer<typeof LayoutAlignmentSchema> | null | undefined;
  justify_content?: z.infer<typeof LayoutAlignmentSchema> | null | undefined;
  padding?: z.infer<typeof PaddingSchema> | null | undefined;
  count: number;
  item: SlideElementOutput;
  max_count?: number | null | undefined;
  min_count?: number | null | undefined;
};

type GridViewElementOutput = ElementBaseOutput & {
  type: "grid-view";
  columns: number;
  rows?: number | null | undefined;
  gap?: number | null | undefined;
  column_gap?: number | null | undefined;
  row_gap?: number | null | undefined;
  align_items?: z.infer<typeof LayoutAlignmentSchema> | null | undefined;
  justify_items?: z.infer<typeof LayoutAlignmentSchema> | null | undefined;
  padding?: z.infer<typeof PaddingSchema> | null | undefined;
  count: number;
  item: SlideElementOutput;
  max_count?: number | null | undefined;
  min_count?: number | null | undefined;
};

type GroupElementOutput = RequiredElementBaseOutput & {
  type: "group";
  children: SlideElementOutput[];
  max_children?: number | null | undefined;
  min_children?: number | null | undefined;
};

export const ContainerElementSchema: z.ZodType<ContainerElementOutput> =
  z.object({
    type: z.literal("container"),
    ...elementBaseShape,
    alignment: AlignmentSchema.nullish(),
    fill: FillSchema.nullish(),
    stroke: StrokeSchema.nullish(),
    border_radius: BorderRadiusSchema.nullish(),
    padding: PaddingSchema.nullish(),
    child: z
      .lazy((): z.ZodType<SlideElementOutput> => SlideElementSchema)
      .nullish(),
  })
    .strict();

export const ImageElementSchema = z
  .object({
    type: z.literal("image"),
    ...elementBaseShape,
    flip_h: z.boolean().nullish(),
    flip_v: z.boolean().nullish(),
    data: z.string().nullish(),
    name: z.string().max(120).nullish(),
    fit: ImageFitSchema.nullish(),
    focus_x: z.number().nullish(),
    focus_y: z.number().nullish(),
    border_radius: BorderRadiusSchema.nullish(),
    color: z.string().nullish(),
    is_icon: z.boolean().nullish(),
  })
  .strict();

export const TextListElementSchema = z
  .object({
    type: z.literal("text-list"),
    ...elementBaseShape,
    font: FontSchema.nullish(),
    marker: MarkerSchema.nullish(),
    items: z.array(TextListItemSchema).min(1).max(8),
    max_items: z.number().nullish(),
    min_items: z.number().nullish(),
    max_item_length: z.number().nullish(),
    min_item_length: z.number().nullish(),
  })
  .strict();

export const TableCellSchema = z
  .object({
    color: FillSchema.nullish(),
    font: FontSchema.nullish(),
    alignment: HorizontalAlignmentSchema.nullish(),
    runs: z.array(TextRunSchema).max(12),
  })
  .strict();

export const TableElementSchema = z
  .object({
    type: z.literal("table"),
    ...elementBaseShape,
    font: FontSchema.nullish(),
    columns: z.array(TableCellSchema).min(1).max(6),
    rows: z.array(z.array(TableCellSchema).min(1).max(6)).min(1).max(7),
    max_columns: z.number().nullish(),
    min_columns: z.number().nullish(),
    max_rows: z.number().nullish(),
    min_rows: z.number().nullish(),
  })
  .strict();

export const RectangleElementSchema = z
  .object({
    type: z.literal("rectangle"),
    ...elementBaseShape,
    fill: FillSchema.nullish(),
    stroke: StrokeSchema.nullish(),
    border_radius: BorderRadiusSchema.nullish(),
  })
  .strict();

export const EllipseElementSchema = z
  .object({
    type: z.literal("ellipse"),
    ...elementBaseShape,
    fill: FillSchema.nullish(),
    stroke: StrokeSchema.nullish(),
  })
  .strict();

export const LineElementSchema = z
  .object({
    type: z.literal("line"),
    ...elementBaseShape,
    stroke: StrokeSchema,
  })
  .strict();

export const SvgElementSchema = z
  .object({
    type: z.literal("svg"),
    ...elementBaseShape,
    svg: z.string().min(1).max(20_000),
    name: z.string().max(120).nullish(),
  })
  .strict();

export const ChartElementSchema = z.preprocess(
  (value) => {
    if (!isRecord(value)) return value;

    const categories = normalizeStringArray(value.categories);
    const series = normalizeChartSeriesArray(value.series);
    const data = normalizeChartDatumArray(value.data);
    const dataCategories = data.map((datum) => datum.label).filter(Boolean);
    const dataSeries =
      data.length > 0
        ? [
            {
              name: readString(value.title) ?? "Series 1",
              values: data.map((datum) => datum.value),
            },
          ]
        : [];
    const dataColors = data
      .map((datum) => datum.color)
      .filter((color): color is string => Boolean(color));
    const existingSeriesColors = Array.isArray(value.series_colors)
      ? value.series_colors
      : [];
    const nextCategories =
      categories.length > 0
        ? categories
        : dataCategories.length > 0
          ? dataCategories
          : [];
    const nextSeries =
      series.length > 0
        ? series
        : dataSeries.length > 0
          ? dataSeries
          : [];
    const next: UnknownRecord = {
      ...value,
      ...(nextCategories.length > 0 ? { categories: nextCategories } : {}),
      ...(nextSeries.length > 0 ? { series: nextSeries } : {}),
      ...(existingSeriesColors.length > 0
        ? {}
        : dataColors.length > 0
          ? { series_colors: dataColors }
          : {}),
    };
    if (!Array.isArray(next.data) || next.data.length === 0) {
      next.data = chartDataFromInput(nextCategories, nextSeries);
    }
    return next;
  },
  z.object({
    type: z.literal("chart"),
    ...elementBaseShape,
    chart_type: ChartTypeSchema,
    data: z.array(ChartDatumSchema).min(1).max(8),
    title: z.string().min(1).max(80).nullish(),
    color: HexColorSchema.nullish(),
    axis_color: HexColorSchema.nullish(),
    data_labels_color: HexColorSchema.nullish(),
    series_colors: z.array(HexColorSchema).max(12).nullish(),
    x_axis: z.boolean().nullish(),
    y_axis: z.boolean().nullish(),
    x_axis_title: z.string().max(80).nullish(),
    y_axis_title: z.string().max(80).nullish(),
    categories: z.array(z.string().min(1).max(40)).max(24).nullish(),
    series: z.array(ChartSeriesSchema).max(12).nullish(),
    data_labels: z.boolean().nullish(),
    grid: z.boolean().nullish(),
    source: z.string().max(120).nullish(),
  })
    .strict(),
);

export const InfographicElementSchema = z
  .object({
    type: z.literal("infographic"),
    ...elementBaseShape,
    infographic_type: InfographicTypeSchema,
    max_value: z.number(),
    min_value: z.number(),
    value: z.number(),
    base_color: HexColorSchema.nullish(),
    highlight_color: HexColorSchema.nullish(),
  })
  .strict();

export const FlexElementSchema: z.ZodType<FlexElementOutput> = z
  .object({
    type: z.literal("flex"),
    ...requiredElementBaseShape,
    direction: FlexDirectionSchema,
    wrap: z.boolean().nullish(),
    align_items: LayoutAlignmentSchema.nullish(),
    justify_content: LayoutAlignmentSchema.nullish(),
    padding: PaddingSchema.nullish(),
    gap: z.number().nullish(),
    column_gap: z.number().nullish(),
    row_gap: z.number().nullish(),
    children: z.array(
      z.lazy((): z.ZodType<SlideElementOutput> => SlideElementSchema),
    ),
    max_children: z.number().nullish(),
    min_children: z.number().nullish(),
  })
  .strict();

export const GridElementSchema: z.ZodType<GridElementOutput> = z
  .object({
    type: z.literal("grid"),
    ...requiredElementBaseShape,
    columns: z.number().min(1),
    rows: z.number().min(1).nullish(),
    gap: z.number().nullish(),
    column_gap: z.number().nullish(),
    row_gap: z.number().nullish(),
    align_items: LayoutAlignmentSchema.nullish(),
    justify_items: LayoutAlignmentSchema.nullish(),
    padding: PaddingSchema.nullish(),
    children: z.array(
      z.lazy((): z.ZodType<SlideElementOutput> => SlideElementSchema),
    ),
    max_children: z.number().nullish(),
    min_children: z.number().nullish(),
  })
  .strict();

export const ListViewElementSchema: z.ZodType<ListViewElementOutput> = z
  .object({
    type: z.literal("list-view"),
    ...elementBaseShape,
    direction: FlexDirectionSchema.nullish(),
    gap: z.number().nullish(),
    column_gap: z.number().nullish(),
    row_gap: z.number().nullish(),
    align_items: LayoutAlignmentSchema.nullish(),
    justify_content: LayoutAlignmentSchema.nullish(),
    padding: PaddingSchema.nullish(),
    count: z.number().min(0),
    item: z.lazy((): z.ZodType<SlideElementOutput> => SlideElementSchema),
    max_count: z.number().nullish(),
    min_count: z.number().nullish(),
  })
  .strict();

export const GridViewElementSchema: z.ZodType<GridViewElementOutput> = z
  .object({
    type: z.literal("grid-view"),
    ...elementBaseShape,
    columns: z.number().min(1),
    rows: z.number().min(1).nullish(),
    gap: z.number().nullish(),
    column_gap: z.number().nullish(),
    row_gap: z.number().nullish(),
    align_items: LayoutAlignmentSchema.nullish(),
    justify_items: LayoutAlignmentSchema.nullish(),
    padding: PaddingSchema.nullish(),
    count: z.number().min(0),
    item: z.lazy((): z.ZodType<SlideElementOutput> => SlideElementSchema),
    max_count: z.number().nullish(),
    min_count: z.number().nullish(),
  })
  .strict();

export const GroupElementSchema: z.ZodType<GroupElementOutput> = z
  .object({
    type: z.literal("group"),
    ...requiredElementBaseShape,
    children: z.array(
      z.lazy((): z.ZodType<SlideElementOutput> => SlideElementSchema),
    ),
    max_children: z.number().nullish(),
    min_children: z.number().nullish(),
  })
  .strict();

type SlideElementOutput =
  | z.infer<typeof TextElementSchema>
  | ContainerElementOutput
  | z.infer<typeof ImageElementSchema>
  | z.infer<typeof TextListElementSchema>
  | z.infer<typeof TableElementSchema>
  | z.infer<typeof RectangleElementSchema>
  | z.infer<typeof EllipseElementSchema>
  | z.infer<typeof LineElementSchema>
  | z.infer<typeof SvgElementSchema>
  | z.infer<typeof ChartElementSchema>
  | z.infer<typeof InfographicElementSchema>
  | FlexElementOutput
  | GridElementOutput
  | ListViewElementOutput
  | GridViewElementOutput
  | GroupElementOutput;

export const SlideElementSchema: z.ZodType<SlideElementOutput> = z.union([
  TextElementSchema,
  ContainerElementSchema,
  ImageElementSchema,
  TextListElementSchema,
  TableElementSchema,
  RectangleElementSchema,
  EllipseElementSchema,
  LineElementSchema,
  SvgElementSchema,
  ChartElementSchema,
  InfographicElementSchema,
  FlexElementSchema,
  GridElementSchema,
  ListViewElementSchema,
  GridViewElementSchema,
  GroupElementSchema,
]);

export const SlideBackgroundImageSchema = z
  .object({
    data: z.string().min(1),
    fit: ImageFitSchema.nullish(),
    opacity: z.number().min(0).max(1).nullish(),
  })
  .strict();

export const SlideSchema = z
  .object({
    background: HexColorSchema,
    background_role: ThemeRoleSchema.nullish(),
    background_image: SlideBackgroundImageSchema.nullish(),
    elements: z.array(SlideElementSchema).min(1).max(80),
    title: z.string().min(1).max(60).nullish(),
  })
  .strict();

export const DeckThemeSchema = z
  .object({
    background: HexColorSchema,
    surface: HexColorSchema.nullish(),
    primary: HexColorSchema,
    secondary: HexColorSchema,
    accent: HexColorSchema,
    text: HexColorSchema,
    muted: HexColorSchema.nullish(),
  })
  .strict();

export const DeckSchema = z
  .object({
    title: z.string().min(1).max(90),
    description: z.string().max(1200).nullish(),
    theme: DeckThemeSchema.nullish(),
    slides: z.array(SlideSchema).min(1).max(50),
  })
  .strict();

export const SlideComponentSchema = z
  .object({
    id: z.string(),
    description: z.string(),
    position: PositionSchema.nullish(),
    size: SizeSchema.nullish(),
    elements: z.array(SlideElementSchema),
  })
  .strict();

export const SlideComponentsSchema = z
  .object({
    components: z.array(SlideComponentSchema),
  })
  .strict();

export const SlideLayoutSchema = z
  .object({
    id: z.string(),
    description: z.string(),
    components: z.array(SlideComponentSchema),
  })
  .strict();

export const SlideLayoutsSchema = z
  .object({
    layouts: z.array(SlideLayoutSchema),
  })
  .strict();

export const LineSchema = StrokeSchema;
export const CornerRadiusSchema = BorderRadiusSchema;
export const BoxSchema = z
  .object({
    position: PositionSchema,
    size: SizeSchema,
  })
  .strict();

export type Inches = number;
export type Nullable<T> = T | null;
export type ThemeRole = z.infer<typeof ThemeRoleSchema>;
export type HorizontalAlignment = z.infer<typeof HorizontalAlignmentSchema>;
export type VerticalAlignment = z.infer<typeof VerticalAlignmentSchema>;
export type LayoutAlignment = z.infer<typeof LayoutAlignmentSchema>;
export type TextWrap = z.infer<typeof TextWrapSchema>;
export type Marker = z.infer<typeof MarkerSchema>;
export type FlexDirection = z.infer<typeof FlexDirectionSchema>;
export type ImageFit = z.infer<typeof ImageFitSchema>;
export type ChartType = z.infer<typeof ChartTypeSchema>;
export type InfographicType = z.infer<typeof InfographicTypeSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type Size = z.infer<typeof SizeSchema>;
export type Padding = z.infer<typeof PaddingSchema>;
export type LayoutItem = z.infer<typeof LayoutItemSchema>;
export type Alignment = z.infer<typeof AlignmentSchema>;
export type Font = z.infer<typeof FontSchema>;
export type Fill = z.infer<typeof FillSchema>;
export type Stroke = z.infer<typeof StrokeSchema>;
export type Line = Stroke;
export type BorderRadius = z.infer<typeof BorderRadiusSchema>;
export type CornerRadius = BorderRadius;
export type Shadow = z.infer<typeof ShadowSchema>;
export type ChartDatum = z.infer<typeof ChartDatumSchema>;
export type ChartSeries = z.infer<typeof ChartSeriesSchema>;
export type TextRun = z.infer<typeof TextRunSchema>;
export type TextListItem = z.infer<typeof TextListItemSchema>;
export type DesignVariableEffect = z.infer<typeof DesignVariableEffectSchema>;
export type DesignVariable = z.infer<typeof DesignVariableSchema>;
export type TextElement = z.infer<typeof TextElementSchema>;
export type ContainerElement = z.infer<typeof ContainerElementSchema>;
export type ImageElement = z.infer<typeof ImageElementSchema>;
export type TextListElement = z.infer<typeof TextListElementSchema>;
export type BulletsElement = TextListElement;
export type TableCell = z.infer<typeof TableCellSchema>;
export type TableElement = z.infer<typeof TableElementSchema>;
export type RectangleElement = z.infer<typeof RectangleElementSchema>;
export type RectElement = RectangleElement;
export type EllipseElement = z.infer<typeof EllipseElementSchema>;
export type LineElement = z.infer<typeof LineElementSchema>;
export type SvgElement = z.infer<typeof SvgElementSchema>;
export type ChartElement = z.infer<typeof ChartElementSchema>;
export type InfographicElement = z.infer<typeof InfographicElementSchema>;
export type FlexElement = z.infer<typeof FlexElementSchema>;
export type GridElement = z.infer<typeof GridElementSchema>;
export type ListViewElement = z.infer<typeof ListViewElementSchema>;
export type GridViewElement = z.infer<typeof GridViewElementSchema>;
export type GroupElement = z.infer<typeof GroupElementSchema>;
export type SlideElement = z.infer<typeof SlideElementSchema>;
export type SlideBackgroundImage = z.infer<typeof SlideBackgroundImageSchema>;
export type DeckTheme = z.infer<typeof DeckThemeSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type Deck = z.infer<typeof DeckSchema>;
export type SlideComponent = z.infer<typeof SlideComponentSchema>;
export type SlideComponents = z.infer<typeof SlideComponentsSchema>;
export type SlideLayout = z.infer<typeof SlideLayoutSchema>;
export type SlideLayouts = z.infer<typeof SlideLayoutsSchema>;
export type Box = z.infer<typeof BoxSchema>;

export const LayoutHorizontalAlignmentSchema = HorizontalAlignmentSchema;
export const LayoutVerticalAlignmentSchema = VerticalAlignmentSchema;
export const LayoutTextWrapSchema = TextWrapSchema;
export const LayoutMarkerSchema = MarkerSchema;
export const LayoutFlexDirectionSchema = FlexDirectionSchema;
export const LayoutImageFitSchema = ImageFitSchema;
export const LayoutChartTypeSchema = ChartTypeSchema;
export const LayoutPositionSchema = PositionSchema;
export const LayoutSizeSchema = SizeSchema;
export const LayoutPaddingSchema = PaddingSchema;
export const LayoutItemPropsSchema = LayoutItemSchema;
export const LayoutElementAlignmentSchema = AlignmentSchema;
export const LayoutFontSchema = FontSchema;
export const LayoutFillSchema = FillSchema;
export const LayoutStrokeSchema = StrokeSchema;
export const LayoutBorderRadiusSchema = BorderRadiusSchema;
export const LayoutShadowSchema = ShadowSchema;
export const LayoutChartDatumSchema = ChartDatumSchema;
export const LayoutTextRunSchema = TextRunSchema;
export const LayoutTextListItemSchema = TextListItemSchema;
export const LayoutTextElementSchema = TextElementSchema;
export const LayoutContainerElementSchema = ContainerElementSchema;
export const LayoutImageElementSchema = ImageElementSchema;
export const LayoutTextListElementSchema = TextListElementSchema;
export const LayoutTableCellSchema = TableCellSchema;
export const LayoutTableElementSchema = TableElementSchema;
export const LayoutRectangleElementSchema = RectangleElementSchema;
export const LayoutEllipseElementSchema = EllipseElementSchema;
export const LayoutLineElementSchema = LineElementSchema;
export const LayoutSvgElementSchema = SvgElementSchema;
export const LayoutChartElementSchema = ChartElementSchema;
export const LayoutInfographicElementSchema = InfographicElementSchema;
export const LayoutFlexElementSchema = FlexElementSchema;
export const LayoutGridElementSchema = GridElementSchema;
export const LayoutListViewElementSchema = ListViewElementSchema;
export const LayoutGridViewElementSchema = GridViewElementSchema;
export const LayoutGroupElementSchema = GroupElementSchema;
export const LayoutSlideElementSchema = SlideElementSchema;
export const LayoutSlideComponentSchema = SlideComponentSchema;
export const LayoutSlideComponentsSchema = SlideComponentsSchema;
export const LayoutSlideLayoutSchema = SlideLayoutSchema;
export const LayoutSlideLayoutsSchema = SlideLayoutsSchema;

export type LayoutHorizontalAlignment = HorizontalAlignment;
export type LayoutVerticalAlignment = VerticalAlignment;
export type LayoutTextWrap = TextWrap;
export type LayoutMarker = Marker;
export type LayoutFlexDirection = FlexDirection;
export type LayoutImageFit = ImageFit;
export type LayoutChartType = ChartType;
export type LayoutInfographicType = InfographicType;
export type LayoutPosition = Position;
export type LayoutSize = Size;
export type LayoutPadding = Padding;
export type LayoutItemProps = LayoutItem;
export type LayoutElementAlignment = Alignment;
export type LayoutFont = Font;
export type LayoutFill = Fill;
export type LayoutStroke = Stroke;
export type LayoutBorderRadius = BorderRadius;
export type LayoutShadow = Shadow;
export type LayoutChartDatum = ChartDatum;
export type LayoutTextRun = TextRun;
export type LayoutTextListItem = TextListItem;
export type LayoutTextElement = TextElement;
export type LayoutContainerElement = ContainerElement;
export type LayoutImageElement = ImageElement;
export type LayoutTextListElement = TextListElement;
export type LayoutTableCell = TableCell;
export type LayoutTableElement = TableElement;
export type LayoutRectangleElement = RectangleElement;
export type LayoutEllipseElement = EllipseElement;
export type LayoutLineElement = LineElement;
export type LayoutSvgElement = SvgElement;
export type LayoutChartElement = ChartElement;
export type LayoutInfographicElement = InfographicElement;
export type LayoutFlexElement = FlexElement;
export type LayoutGridElement = GridElement;
export type LayoutListViewElement = ListViewElement;
export type LayoutGridViewElement = GridViewElement;
export type LayoutGroupElement = GroupElement;
export type LayoutSlideElement = SlideElement;
export type LayoutSlideComponent = SlideComponent;
export type LayoutSlideComponents = SlideComponents;
export type LayoutSlideLayout = SlideLayout;
export type LayoutSlideLayouts = SlideLayouts;
