import { resolveBackendAssetUrl } from "@/utils/api";
import { chartDataFromSeries } from "./chart-data";
import {
  DeckSchema,
  SLIDE_H,
  SLIDE_W,
  type Alignment,
  type BorderRadius,
  type ChartSeries,
  type Deck,
  type DesignVariable,
  type Fill,
  type Font,
  type GroupElement,
  type LayoutAlignment,
  type LayoutItem,
  type Padding,
  type Shadow,
  type Slide,
  type SlideElement,
  type Stroke,
  type TableCell,
  type TextElement,
  type TextListItem,
  type TextRun,
} from "./slide-schema";

const SOURCE_W = 1280;
const SOURCE_H = 720;
const X_SCALE = SLIDE_W / SOURCE_W;
const Y_SCALE = SLIDE_H / SOURCE_H;
type UnknownRecord = Record<string, unknown>;
type AdaptedPosition = { x: number; y: number };
type AdaptedSize = { width: number; height: number };
type AdaptedBaseElement = {
  decorative?: boolean | null;
  position?: AdaptedPosition | null;
  size?: AdaptedSize | null;
  rotation?: number | null;
  opacity?: number | null;
  shadow?: Shadow | null;
  component_id?: string | null;
  component_instance_id?: string | null;
  component_description?: string | null;
  component_slot?: string | null;
  design_variables?: DesignVariable[] | null;
  layout?: LayoutItem | null;
};
type AdaptedRequiredBaseElement = AdaptedBaseElement & {
  position: AdaptedPosition;
  size: AdaptedSize;
};

export type TemplateV2Layout = {
  id?: unknown;
  description?: unknown;
  elements?: unknown;
  components?: unknown;
};

export type TemplateV2ImportResponse = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  merged_components?: unknown;
  raw_layouts?: unknown;
  layouts?: unknown;
  assets?: unknown;
};

export type GeneratedTemplateV2PresentationResponse = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  layout?: unknown;
  slides?: unknown;
};

const LAYOUT_ALIGNMENT_VALUES = new Set([
  "flex-start",
  "flex-end",
  "center",
  "stretch",
]);
export function adaptTemplateV2ResponseToDeck(
  template: TemplateV2ImportResponse,
): Deck {
  const layouts = extractRenderableLayouts(template);
  if (layouts.length === 0) {
    throw new Error("Template response did not include any layouts.");
  }

  const slides = layouts.slice(0, 50).map(adaptLayoutToSlide);
  const deck = {
    title: truncateString(readString(template.name) ?? "Imported template", 90),
    description:
      truncateString(readString(template.description) ?? "", 1200) || null,
    slides,
  } satisfies Deck;

  const parsed = DeckSchema.safeParse(deck);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? issue.path.join(".") : "deck";
    throw new Error(
      `Backend template response could not be rendered in the editor (${path}: ${issue?.message ?? "invalid deck"}).`,
    );
  }

  return parsed.data;
}

export function normalizeTemplateV2Fonts(
  template: TemplateV2ImportResponse,
  fallbackFonts: Record<string, string> = {},
): Record<string, string> {
  const assets = asRecord(template.assets);
  const assetFonts = asRecord(assets?.fonts);
  const fonts =
    assetFonts && Object.keys(assetFonts).length > 0 ? assetFonts : fallbackFonts;

  return Object.fromEntries(
    Object.entries(fonts)
      .filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" &&
          entry[0].trim().length > 0 &&
          typeof entry[1] === "string" &&
          entry[1].trim().length > 0,
      )
      .map(([name, url]) => [name, resolveBackendAssetUrl(url)]),
  );
}

export function adaptGeneratedTemplateV2PresentationToDeck(
  presentation: GeneratedTemplateV2PresentationResponse,
): Deck {
  const presentationRecord = asRecord(presentation) ?? {};
  const layoutPayload = readValue(presentationRecord, "layout");
  const layouts = extractTemplateV2Layouts(layoutPayload);
  const layoutById = new Map(
    layouts
      .map((layout) => [readString(layout.id), layout] as const)
      .filter((entry): entry is [string, TemplateV2Layout] => Boolean(entry[0])),
  );
  const generatedSlides = readArray(presentationRecord, "slides")
    .filter(isRecord)
    .sort((a, b) => (readNumber(a, "index") ?? 0) - (readNumber(b, "index") ?? 0));

  if (layouts.length === 0 && generatedSlides.length === 0) {
    throw new Error("Generated presentation did not include template v2 slides.");
  }

  const slides =
    generatedSlides.length > 0
      ? generatedSlides.slice(0, 50).map((slide, index) => {
          const uiLayout = readGeneratedSlideUiLayout(slide);
          if (uiLayout) {
            return adaptLayoutToSlide(uiLayout, index);
          }

          const layoutId = readString(slide.layout);
          const layout =
            (layoutId ? layoutById.get(layoutId) : null) ??
            layouts[index % layouts.length];
          if (!layout) {
            throw new Error(
              `Generated slide ${index + 1} did not include a renderable template v2 layout.`,
            );
          }
          return adaptLayoutToSlide(layout, index);
        })
      : layouts.slice(0, 50).map(adaptLayoutToSlide);

  const deck = {
    title: truncateString(
      readString(presentationRecord.title) ??
        readString(presentationRecord.id) ??
        "Generated presentation",
      90,
    ),
    description:
      truncateString(readString(presentationRecord.description) ?? "", 1200) ||
      null,
    slides,
  } satisfies Deck;

  const parsed = DeckSchema.safeParse(deck);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? issue.path.join(".") : "deck";
    throw new Error(
      `Generated presentation could not be rendered in the editor (${path}: ${issue?.message ?? "invalid deck"}).`,
    );
  }

  return parsed.data;
}

function readGeneratedSlideUiLayout(slide: UnknownRecord): TemplateV2Layout | null {
  const ui = asRecord(readValue(slide, "ui"));
  return ui ? (ui as TemplateV2Layout) : null;
}

export function extractTemplateV2Layouts(value: unknown): TemplateV2Layout[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord) as TemplateV2Layout[];
  }

  const record = asRecord(value);
  if (Array.isArray(record?.layouts)) {
    return record.layouts.filter(isRecord) as TemplateV2Layout[];
  }
  const nestedLayouts = asRecord(record?.layouts);
  if (Array.isArray(nestedLayouts?.layouts)) {
    return nestedLayouts.layouts.filter(isRecord) as TemplateV2Layout[];
  }

  return [];
}

function extractRenderableLayouts(
  template: TemplateV2ImportResponse,
): TemplateV2Layout[] {
  const layouts = extractTemplateV2Layouts(template.layouts);
  if (layouts.length > 0) return layouts;
  return extractTemplateV2Layouts(template.raw_layouts);
}

export function adaptTemplateV2LayoutToSlide(
  layout: TemplateV2Layout,
  index = 0,
): Slide {
  return adaptLayoutToSlide(layout, index);
}

export function withEqualTemplateV2FlowChildSizes(
  element: Record<string, unknown>,
): unknown[] {
  const children = readArray(element, "children");
  if (children.length === 0) return children;

  const size = readRecord(element, "size");
  const width = readNumber(size ?? {}, "width");
  const height = readNumber(size ?? {}, "height");
  if (width == null || height == null) return children;

  const padding = readRecord(element, "padding");
  const contentWidth = Math.max(
    0.01,
    width -
      (readNumber(padding ?? {}, "left") ?? 0) -
      (readNumber(padding ?? {}, "right") ?? 0),
  );
  const contentHeight = Math.max(
    0.01,
    height -
      (readNumber(padding ?? {}, "top") ?? 0) -
      (readNumber(padding ?? {}, "bottom") ?? 0),
  );
  const type = readString(element.type);

  if (type === "flex") {
    const childTypes = children.map((child) => readString(asRecord(child)?.type));
    if (
      childTypes.some((childType) => childType == null) ||
      new Set(childTypes).size > 1
    ) {
      return children;
    }

    const direction = readString(element.direction) === "column" ? "column" : "row";
    const gap =
      direction === "row"
        ? readNumber(element, "column_gap") ??
          readNumber(element, "gap") ??
          0
        : readNumber(element, "row_gap") ??
          readNumber(element, "gap") ??
          0;
    const availableMain = Math.max(
      0.01,
      (direction === "row" ? contentWidth : contentHeight) -
        gap * Math.max(0, children.length - 1),
    );
    const mainSize = availableMain / children.length;
    return children.map((child) =>
      withTemplateV2ChildSize(
        child,
        direction === "row" ? mainSize : contentWidth,
        direction === "row" ? contentHeight : mainSize,
      ),
    );
  }

  if (type === "grid") {
    const columns = Math.max(
      1,
      Math.min(children.length, Math.trunc(readNumber(element, "columns") ?? 1)),
    );
    const rows = Math.max(
      1,
      Math.trunc(readNumber(element, "rows") ?? Math.ceil(children.length / columns)),
    );
    const columnGap =
      readNumber(element, "column_gap") ??
      readNumber(element, "gap") ??
      0;
    const rowGap =
      readNumber(element, "row_gap") ??
      readNumber(element, "gap") ??
      0;
    const cellWidth = Math.max(
      0.01,
      (contentWidth - columnGap * Math.max(0, columns - 1)) / columns,
    );
    const cellHeight = Math.max(
      0.01,
      (contentHeight - rowGap * Math.max(0, rows - 1)) / rows,
    );
    return children.map((child) =>
      withTemplateV2ChildSize(child, cellWidth, cellHeight),
    );
  }

  return children;
}

function withTemplateV2ChildSize(
  child: unknown,
  width: number,
  height: number,
) {
  const record = asRecord(child);
  if (!record) return child;
  const size: UnknownRecord = readRecord(record, "size") ?? {};
  return {
    ...record,
    size: {
      ...size,
      width: readNumber(size, "width") ?? sourceNumber(width),
      height: readNumber(size, "height") ?? sourceNumber(height),
    },
  };
}

export function normalizeTemplateV2Slide(slide: Slide): Slide {
  return {
    ...slide,
    elements: slide.elements.map(normalizeTemplateV2Element),
  };
}

function adaptLayoutToSlide(layout: TemplateV2Layout, index: number): Slide {
  const rawElements = extractLayoutElements(layout);
  const elements = rawElements
    .slice(0, 80)
    .map((element) => adaptElement(element))
    .filter((element): element is SlideElement => Boolean(element));

  const slideElements =
    elements.length > 0 ? elements : [invisibleFallbackElement()];

  return normalizeTemplateV2Slide({
    title: titleFromLayout(layout, index),
    background: backgroundFromElements(slideElements),
    elements: slideElements,
  });
}

function normalizeTemplateV2Element(element: SlideElement): SlideElement {
  if ("children" in element && Array.isArray(element.children)) {
    const next = {
      ...element,
      children: element.children.map(normalizeTemplateV2Element),
    } as SlideElement;
    return next.type === "group" ? normalizeAuthorInfoCardGroup(next) : next;
  }

  if (element.type === "container" && element.child) {
    return {
      ...element,
      child: normalizeTemplateV2Element(element.child),
    };
  }

  return element;
}

function normalizeAuthorInfoCardGroup(group: GroupElement): GroupElement {
  if (!isAuthorInfoCard(group)) return group;

  const cardRight = authorInfoCardRightEdge(group);
  let changed = false;
  const children = group.children.map((child) => {
    if (!isAuthorInfoText(child) || !child.position || !child.size) {
      return child;
    }

    const availableWidth = Math.max(0.1, cardRight - child.position.x - 0.18);
    if (availableWidth <= child.size.width + 0.01) return child;

    changed = true;
    return {
      ...child,
      size: {
        ...child.size,
        width: Math.min(SLIDE_W, availableWidth),
      },
    };
  });

  return changed ? { ...group, children } : group;
}

function isAuthorInfoCard(group: GroupElement) {
  return (
    group.component_id === "author_info_card" ||
    group.component_slot === "author_info_card" ||
    group.component_instance_id?.startsWith("author_info_card:")
  );
}

function authorInfoCardRightEdge(group: GroupElement) {
  const background = group.children.find(
    (child) =>
      child.type === "rectangle" &&
      (child.position?.x ?? 0) <= 0.05 &&
      (child.position?.y ?? 0) <= 0.05 &&
      child.size?.width,
  );

  if (background?.size?.width) {
    return (background.position?.x ?? 0) + background.size.width;
  }

  return group.size.width;
}

function isAuthorInfoText(
  element: SlideElement,
): element is Extract<SlideElement, { type: "text" }> {
  return (
    element.type === "text" &&
    (element.component_slot === "author_name" || element.component_slot === "date")
  );
}

function extractLayoutElements(layout: TemplateV2Layout): unknown[] {
  if (Array.isArray(layout.elements) && layout.elements.length > 0) {
    return layout.elements;
  }

  const components = readArray(layout as UnknownRecord, "components");
  return components
    .map((component, componentIndex) =>
      componentToGroupElement(component, componentIndex),
    )
    .filter((element): element is UnknownRecord => Boolean(asRecord(element)));
}

function componentToGroupElement(
  component: unknown,
  componentIndex: number,
): UnknownRecord | null {
  const raw = asRecord(component);
  if (!raw) return null;

  const elements = readArray(raw, "elements");
  if (elements.length === 0) return null;

  const renderedElements = elements.filter(isRecord);
  const componentFrame = rawComponentFrame(raw);
  const frame = componentFrame ?? rawElementsFrame(renderedElements);
  if (!frame) return null;

  const componentId =
    truncateString(readString(raw.id) ?? `component_${componentIndex}`, 120) ||
    `component_${componentIndex}`;
  const componentDescription = truncateString(
    readString(raw.description) ?? "",
    600,
  );

  return stripNullish({
    type: "group",
    position: { x: frame.x, y: frame.y },
    size: { width: frame.width, height: frame.height },
    children: componentFrame
      ? renderedElements.map((element) =>
          frameTopLevelFlowElementToComponent(element, componentFrame),
        )
      : renderedElements.map((element) =>
          localizeRawElementToFrame(element, frame),
        ),
    name: componentId,
    component_id: componentId,
    component_instance_id: `${componentId}:${componentIndex}`,
    component_description: componentDescription || null,
    design_variables: readArray(raw, "design_variables"),
  });
}

export function extractTemplateV2MergedComponents(template: unknown): unknown[] {
  const raw = asRecord(template);
  if (!raw) return [];

  const value = readValue(raw, "merged_components");
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  const record = asRecord(value);
  if (!record) return [];

  const components = readArray(record, "components");
  if (components.length > 0) {
    return components.filter(isRecord);
  }

  return Object.values(record).filter(isRecord);
}

export function adaptTemplateV2ComponentToElement(
  component: unknown,
  componentIndex = 0,
): SlideElement | null {
  const rawGroup = componentToGroupElement(component, componentIndex);
  if (!rawGroup) return null;

  const element = adaptElement(rawGroup);
  return element ? normalizeTemplateV2Element(element) : null;
}

function frameTopLevelFlowElementToComponent(
  element: UnknownRecord,
  frame: RawFrame,
): UnknownRecord {
  const type = readString(element.type);
  if (
    (type !== "grid" && type !== "flex") ||
    readRecord(element, "position") ||
    readRecord(element, "size")
  ) {
    return element;
  }

  return {
    ...element,
    position: { x: 0, y: 0 },
    size: { width: frame.width, height: frame.height },
  };
}

function rawElementsFrame(elements: UnknownRecord[]) {
  return mergeRawElementFrames(
    elements
      .map((element) => rawElementFrame(element))
      .filter((frame): frame is RawFrame => Boolean(frame)),
  );
}

type RawFrame = { x: number; y: number; width: number; height: number };

function rawElementFrame(
  element: UnknownRecord,
  offsetX = 0,
  offsetY = 0,
): RawFrame | null {
  const position = readRecord(element, "position");
  const size = readRecord(element, "size");
  const x = readNumber(position ?? {}, "x");
  const y = readNumber(position ?? {}, "y");
  const width = readNumber(size ?? {}, "width");
  const height = readNumber(size ?? {}, "height");
  const hasPosition = x != null && y != null;
  const frame =
    hasPosition && width != null && height != null
      ? {
          x: offsetX + x,
          y: offsetY + y,
          width: Math.max(1, width),
          height: Math.max(1, height),
        }
      : null;
  const childOffsetX = hasPosition ? offsetX + x : offsetX;
  const childOffsetY = hasPosition ? offsetY + y : offsetY;
  const childFrames = rawElementChildren(element)
    .map((child) => rawElementFrame(child, childOffsetX, childOffsetY))
    .filter((childFrame): childFrame is RawFrame => Boolean(childFrame));

  return mergeRawElementFrames(frame ? [frame, ...childFrames] : childFrames);
}

function rawElementChildren(element: UnknownRecord): UnknownRecord[] {
  const children = readArray(element, "children").filter(isRecord);
  const child = asRecord(readValue(element, "child"));
  return [...children, ...(child ? [child] : [])];
}

function mergeRawElementFrames(frames: RawFrame[]): RawFrame | null {
  if (frames.length === 0) {
    return null;
  }

  const minX = Math.min(...frames.map((frame) => frame.x));
  const minY = Math.min(...frames.map((frame) => frame.y));
  const maxX = Math.max(...frames.map((frame) => frame.x + frame.width));
  const maxY = Math.max(...frames.map((frame) => frame.y + frame.height));

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function rawComponentFrame(component: UnknownRecord) {
  const position = readRecord(component, "position");
  const size = readRecord(component, "size");
  const x = readNumber(position ?? {}, "x");
  const y = readNumber(position ?? {}, "y");
  const width = readNumber(size ?? {}, "width");
  const height = readNumber(size ?? {}, "height");
  if (x == null || y == null || width == null || height == null) return null;

  return {
    x,
    y,
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function localizeRawElementToFrame(
  element: UnknownRecord,
  frame: { x: number; y: number },
) {
  const position = readRecord(element, "position");
  const localized: UnknownRecord = position
    ? {
        ...element,
        position: {
          ...position,
          x: (readNumber(position, "x") ?? 0) - frame.x,
          y: (readNumber(position, "y") ?? 0) - frame.y,
        },
      }
    : { ...element };

  if (!position) {
    const children = readArray(localized, "children");
    if (children.length > 0) {
      localized.children = children.map((child) => {
        const rawChild = asRecord(child);
        return rawChild ? localizeRawElementToFrame(rawChild, frame) : child;
      });
    }

    const child = asRecord(readValue(localized, "child"));
    if (child) {
      localized.child = localizeRawElementToFrame(child, frame);
    }
  }

  return localized;
}

function adaptElement(value: unknown): SlideElement | null {
  const raw = asRecord(value);
  const type = readString(raw?.type);
  if (!raw || !type) return null;

  switch (type) {
    case "text":
      return adaptText(raw);
    case "container":
      return adaptContainer(raw);
    case "image":
      return adaptImage(raw);
    case "text-list":
      return adaptTextList(raw);
    case "table":
      return adaptTable(raw);
    case "rectangle":
      return adaptRectangle(raw);
    case "ellipse":
      return adaptEllipse(raw);
    case "line":
      return adaptLine(raw);
    case "chart":
      return adaptChart(raw);
    case "infographic":
      return adaptInfographic(raw);
    case "flex":
      return adaptFlex(raw);
    case "grid":
      return adaptGrid(raw);
    case "group":
      return adaptGroup(raw);
    default:
      return null;
  }
}

function adaptText(raw: UnknownRecord): SlideElement {
  const font = adaptFont(readRecord(raw, "font"));
  const element: TextElement = {
    ...baseElement(raw),
    type: "text",
    font: font && font.line_height == null ? { ...font, line_height: 1 } : font,
    alignment: adaptAlignment(readRecord(raw, "alignment")),
    fill: adaptFill(readRecord(raw, "fill")),
    stroke: adaptStroke(readRecord(raw, "stroke")),
    runs: adaptTextRuns(readArray(raw, "runs"), readString(raw.text)),
    max_length: readNumber(raw, "max_length"),
    min_length: readNumber(raw, "min_length"),
  };
  return widenSingleLineTextElement(element);
}

function adaptContainer(raw: UnknownRecord): SlideElement {
  const child = adaptElement(readValue(raw, "child"));
  const base = baseElement(raw);
  const padding = adaptPadding(readRecord(raw, "padding"));
  const inferredSize =
    !base.size && child?.size ? paddedChildSize(child.size, padding) : null;
  return {
    ...base,
    ...(inferredSize ? { size: inferredSize } : {}),
    type: "container",
    alignment: adaptAlignment(readRecord(raw, "alignment")),
    fill: adaptFill(readRecord(raw, "fill")),
    stroke: adaptStroke(readRecord(raw, "stroke")),
    border_radius: adaptBorderRadius(readRecord(raw, "border_radius")),
    padding,
    shadow: adaptShadow(readRecord(raw, "shadow")),
    child,
  };
}

function paddedChildSize(
  size: AdaptedSize,
  padding: Padding | null,
): AdaptedSize {
  return {
    width: clamp(
      round(size.width + (padding?.left ?? 0) + (padding?.right ?? 0)),
      0.01,
      SLIDE_W,
    ),
    height: clamp(
      round(size.height + (padding?.top ?? 0) + (padding?.bottom ?? 0)),
      0.01,
      SLIDE_H,
    ),
  };
}

function adaptImage(raw: UnknownRecord): SlideElement {
  const data = readString(raw.data);
  return {
    ...baseElement(raw),
    type: "image",
    flip_h: readBoolean(raw, "flip_h"),
    flip_v: readBoolean(raw, "flip_v"),
    data: data ? resolveBackendAssetUrl(data) : null,
    name: truncateString(readString(raw.name) ?? "", 120) || null,
    fit: readEnum(raw, ["contain", "cover", "fill"], "fit"),
    focus_x: readNumber(raw, "focus_x"),
    focus_y: readNumber(raw, "focus_y"),
    border_radius: adaptBorderRadius(readRecord(raw, "border_radius")),
    color: readString(raw.color),
    is_icon: readBoolean(raw, "is_icon"),
  };
}

function adaptTextList(raw: UnknownRecord): SlideElement {
  return {
    ...baseElement(raw),
    type: "text-list",
    font: adaptFont(readRecord(raw, "font")),
    marker: readEnum(raw, ["bullet", "number", "none"], "marker"),
    items: adaptTextListItems(readArray(raw, "items")),
    max_items: readNumber(raw, "max_items"),
    min_items: readNumber(raw, "min_items"),
    max_item_length: readNumber(raw, "max_item_length"),
    min_item_length: readNumber(raw, "min_item_length"),
  };
}

function adaptTable(raw: UnknownRecord): SlideElement {
  const columns = adaptTableCells(readArray(raw, "columns")).slice(0, 6);
  const rows = readArray(raw, "rows")
    .map((row) => adaptTableCells(Array.isArray(row) ? row : []))
    .filter((row) => row.length > 0)
    .slice(0, 7);

  return {
    ...baseElement(raw),
    type: "table",
    font: adaptFont(readRecord(raw, "font")),
    columns,
    rows: rows.length > 0 ? rows : [columns],
    max_columns: readNumber(raw, "max_columns"),
    min_columns: readNumber(raw, "min_columns"),
    max_rows: readNumber(raw, "max_rows"),
    min_rows: readNumber(raw, "min_rows"),
  };
}

function adaptRectangle(raw: UnknownRecord): SlideElement | null {
  const base = baseElement(raw);
  const fill = adaptFill(readRecord(raw, "fill"));
  const stroke = adaptStroke(readRecord(raw, "stroke"));
  if (!hasVisiblePaint(fill, stroke, base.opacity)) return null;

  return {
    ...base,
    type: "rectangle",
    fill,
    stroke,
    border_radius: adaptBorderRadius(readRecord(raw, "border_radius")),
  };
}

function adaptEllipse(raw: UnknownRecord): SlideElement | null {
  const base = baseElement(raw);
  const fill = adaptFill(readRecord(raw, "fill"));
  const stroke = adaptStroke(readRecord(raw, "stroke"));
  if (!hasVisiblePaint(fill, stroke, base.opacity)) return null;

  return {
    ...base,
    type: "ellipse",
    fill,
    stroke,
  };
}

function adaptLine(raw: UnknownRecord): SlideElement {
  return {
    ...baseElement(raw),
    type: "line",
    stroke:
      adaptStroke(readRecord(raw, "stroke")) ?? {
        color: "000000",
        width: 1,
      },
  };
}

function adaptChart(raw: UnknownRecord): SlideElement {
  const categories = adaptChartCategories(readArray(raw, "categories"));
  const series = readArray(raw, "series")
    .map(adaptChartSeries)
    .filter((item): item is ChartSeries => item != null);
  const seriesColors = readArray(raw, "series_colors")
    .map(readColor)
    .filter((item): item is string => Boolean(item))
    .slice(0, 12);
  const color = seriesColors[0] ?? null;
  const data = chartDataFromSeries(categories, series, color).slice(0, 8);
  const dataLabels = readBoolean(raw, "data_labels");

  return {
    ...baseElement(raw),
    type: "chart",
    chart_type:
      readEnum(
        raw,
        ["bar", "line", "area", "pie", "donut"],
        "chart_type",
      ) ??
      "bar",
    data: data.length > 0 ? data : [{ label: "Data", value: 0 }],
    title: truncateString(readString(raw.title) ?? "", 80) || null,
    color,
    axis_color: readColor(readValue(raw, "axis_color")),
    data_labels_color: readColor(
      readValue(raw, "data_labels_color"),
    ),
    data_labels: dataLabels,
    series_colors: seriesColors,
    x_axis: readBoolean(raw, "x_axis"),
    y_axis: readBoolean(raw, "y_axis"),
    x_axis_title:
      truncateString(
        readString(readValue(raw, "x_axis_title")) ?? "",
        80,
      ) || null,
    y_axis_title:
      truncateString(
        readString(readValue(raw, "y_axis_title")) ?? "",
        80,
      ) || null,
    categories,
    series,
    grid: readBoolean(raw, "grid"),
    source: truncateString(readString(raw.source) ?? "", 120) || null,
  };
}

function adaptInfographic(raw: UnknownRecord): SlideElement {
  const minValue = readNumber(raw, "min_value") ?? 0;
  const rawMaxValue = readNumber(raw, "max_value") ?? 100;
  const maxValue =
    rawMaxValue === minValue ? minValue + 1 : rawMaxValue;

  return {
    ...baseElement(raw),
    type: "infographic",
    infographic_type:
      readEnum(
        raw,
        ["progress_bar", "gauge"],
        "infographic_type",
      ) ?? "gauge",
    min_value: minValue,
    max_value: maxValue,
    value: readNumber(raw, "value") ?? minValue,
    base_color: readColor(readValue(raw, "base_color")),
    highlight_color: readColor(
      readValue(raw, "highlight_color"),
    ),
  };
}

function adaptFlex(raw: UnknownRecord): SlideElement {
  return {
    ...requiredBaseElement(raw),
    type: "flex",
    direction: readEnum(raw, ["row", "column"], "direction") ?? "row",
    wrap: readBoolean(raw, "wrap"),
    align_items: readLayoutAlignment(raw, "align_items"),
    justify_content: readLayoutAlignment(raw, "justify_content"),
    padding: adaptPadding(readRecord(raw, "padding")),
    gap: scaleDistance(readNumber(raw, "gap"), X_SCALE),
    column_gap: scaleDistance(readNumber(raw, "column_gap"), X_SCALE),
    row_gap: scaleDistance(readNumber(raw, "row_gap"), Y_SCALE),
    children: withEqualTemplateV2FlowChildSizes(raw)
      .map(adaptElement)
      .filter(Boolean) as SlideElement[],
    max_children: readNumber(raw, "max_children"),
    min_children: readNumber(raw, "min_children"),
  };
}

function adaptGrid(raw: UnknownRecord): SlideElement {
  return {
    ...requiredBaseElement(raw),
    type: "grid",
    columns: positiveInteger(readNumber(raw, "columns"), 1),
    rows: positiveIntegerOrNull(readNumber(raw, "rows")),
    gap: scaleDistance(readNumber(raw, "gap"), X_SCALE),
    column_gap: scaleDistance(readNumber(raw, "column_gap"), X_SCALE),
    row_gap: scaleDistance(readNumber(raw, "row_gap"), Y_SCALE),
    align_items: readLayoutAlignment(raw, "align_items"),
    justify_items: readLayoutAlignment(raw, "justify_items"),
    padding: adaptPadding(readRecord(raw, "padding")),
    children: withEqualTemplateV2FlowChildSizes(raw)
      .map(adaptElement)
      .filter(Boolean) as SlideElement[],
    max_children: readNumber(raw, "max_children"),
    min_children: readNumber(raw, "min_children"),
  };
}

function adaptGroup(raw: UnknownRecord): SlideElement {
  const children = readArray(raw, "children")
    .map(adaptElement)
    .filter(Boolean) as SlideElement[];
  const base = baseElement(raw);
  const frame = groupFrame(base, children);

  return {
    ...base,
    ...frame,
    type: "group",
    children,
    max_children: readNumber(raw, "max_children"),
    min_children: readNumber(raw, "min_children"),
  };
}

function groupFrame(
  base: AdaptedBaseElement,
  children: SlideElement[],
): AdaptedRequiredBaseElement {
  const bounds = childrenBounds(children);
  return {
    ...base,
    position: base.position ?? { x: 0, y: 0 },
    size: base.size ?? bounds,
  };
}

function childrenBounds(children: SlideElement[]): AdaptedSize {
  if (children.length === 0) return { width: 0.1, height: 0.1 };

  const bounds = children.reduce(
    (acc, child) => {
      const x = child.position?.x ?? 0;
      const y = child.position?.y ?? 0;
      const width = child.size?.width ?? 0.1;
      const height = child.size?.height ?? 0.1;
      return {
        width: Math.max(acc.width, x + width),
        height: Math.max(acc.height, y + height),
      };
    },
    { width: 0.1, height: 0.1 },
  );

  return {
    width: clamp(round(bounds.width), 0.01, SLIDE_W),
    height: clamp(round(bounds.height), 0.01, SLIDE_H),
  };
}

function baseElement(
  raw: UnknownRecord,
  options: { requireFrame?: boolean } = {},
): AdaptedBaseElement {
  const base: AdaptedBaseElement = {};
  const position = adaptPosition(readRecord(raw, "position"));
  const size = adaptSize(readRecord(raw, "size"));
  const componentSlot =
    readString(readValue(raw, "component_slot")) ??
    readString(raw.name);

  const decorative = readDecorative(raw);
  if (decorative != null) base.decorative = decorative;
  if (position) base.position = position;
  if (size) base.size = size;
  if (options.requireFrame && !position) base.position = { x: 0, y: 0 };
  if (options.requireFrame && !size) base.size = { width: SLIDE_W, height: SLIDE_H };
  if (options.requireFrame && !readRecord(raw, "layout")) {
    base.layout = { grow: 1, shrink: 1 };
  }
  if (readNumber(raw, "rotation") != null) {
    base.rotation = clamp(readNumber(raw, "rotation") ?? 0, -360, 360);
  }
  if (readNumber(raw, "opacity") != null) {
    base.opacity = clamp(readNumber(raw, "opacity") ?? 1, 0, 1);
  }
  if (componentSlot) base.component_slot = truncateString(componentSlot, 120);
  const designVariables = adaptDesignVariables(
    readArray(raw, "design_variables"),
  );
  if (designVariables.length > 0) base.design_variables = designVariables;
  if (readString(readValue(raw, "component_id"))) {
    base.component_id = truncateString(
      readString(readValue(raw, "component_id")) ?? "",
      120,
    );
  }
  if (readString(readValue(raw, "component_instance_id"))) {
    base.component_instance_id = truncateString(
      readString(readValue(raw, "component_instance_id")) ?? "",
      160,
    );
  }
  if (readString(readValue(raw, "component_description"))) {
    base.component_description = truncateString(
      readString(readValue(raw, "component_description")) ?? "",
      600,
    );
  }

  const shadow = adaptShadow(readRecord(raw, "shadow"));
  if (shadow) base.shadow = shadow;

  const layout = adaptLayoutItem(readRecord(raw, "layout"));
  if (layout) base.layout = { ...(base.layout ?? {}), ...layout };

  return base;
}

function requiredBaseElement(raw: UnknownRecord): AdaptedRequiredBaseElement {
  return baseElement(raw, { requireFrame: true }) as AdaptedRequiredBaseElement;
}

function adaptDesignVariables(values: unknown[]): DesignVariable[] {
  return values
    .map((value): DesignVariable | null => {
      const raw = asRecord(value);
      if (!raw) return null;

      const name = truncateString(readString(raw.name) ?? "", 120);
      const type = truncateString(readString(raw.type) ?? "", 40);
      const options: unknown[] = readArray(raw, "options")
        .map(toJsonValue)
        .filter((option) => option !== undefined);
      const effect = readArray(raw, "effect")
        .map((item) => {
          const rawEffect = asRecord(item);
	          if (!rawEffect) return null;
	          const path = truncateString(
	            readString(readValue(rawEffect, "path")) ?? "",
	            240,
	          );
	          const expression = truncateString(
	            readString(readValue(rawEffect, "effect")) ?? "",
	            120,
	          );
          return path && expression ? { path, effect: expression } : null;
        })
        .filter((item): item is DesignVariable["effect"][number] =>
          Boolean(item),
        );

      if (!name || options.length === 0 || effect.length === 0) return null;
      return {
        name,
        ...(type ? { type } : {}),
        options,
        effect,
      } satisfies DesignVariable;
    })
    .filter((item): item is DesignVariable => Boolean(item));
}

function toJsonValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toJsonValue).filter((item) => item !== undefined);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, toJsonValue(item)] as const)
        .filter(([, item]) => item !== undefined),
    );
  }

  return undefined;
}

function adaptPosition(value: UnknownRecord | null): { x: number; y: number } | null {
  if (!value) return null;
  return {
    x: round((readNumber(value, "x") ?? 0) * X_SCALE),
    y: round((readNumber(value, "y") ?? 0) * Y_SCALE),
  };
}

function adaptSize(value: UnknownRecord | null): { width: number; height: number } | null {
  if (!value) return null;
  return {
    width: clamp(round((readNumber(value, "width") ?? 1) * X_SCALE), 0.01, SLIDE_W),
    height: clamp(round((readNumber(value, "height") ?? 1) * Y_SCALE), 0.01, SLIDE_H),
  };
}

function adaptLayoutItem(value: UnknownRecord | null): LayoutItem | null {
  if (!value) return null;
  return stripNullish({
    grow: clampOptional(readNumber(value, "grow"), 0, 12),
    shrink: clampOptional(readNumber(value, "shrink"), 0, 12),
    basis: scaleDistance(readNumber(value, "basis"), X_SCALE),
    min_width: scaleDistance(readNumber(value, "min_width"), X_SCALE),
    max_width: scaleDistance(readNumber(value, "max_width"), X_SCALE),
    min_height: scaleDistance(readNumber(value, "min_height"), Y_SCALE),
    max_height: scaleDistance(readNumber(value, "max_height"), Y_SCALE),
    column_span: clampInteger(readNumber(value, "column_span"), 1, 12),
    row_span: clampInteger(readNumber(value, "row_span"), 1, 12),
    align_self: readLayoutAlignment(value, "align_self"),
  });
}

function adaptAlignment(value: UnknownRecord | null): Alignment | null {
  if (!value) return null;
  return stripNullish({
    horizontal: readEnum(value, ["left", "center", "right"], "horizontal"),
    vertical: readEnum(value, ["top", "middle", "bottom"], "vertical"),
  });
}

function adaptFont(value: UnknownRecord | null): Font | null {
  if (!value) return null;
  const fontWeight = readNumber(value, "font_weight");
  const size = readNumber(value, "size");
  return stripNullish({
    family:
      truncateString(readString(value.family) ?? readString(value.name) ?? "", 80) ||
      null,
    size: size == null ? null : clamp(round(size), 6, 360),
    color: readColor(value.color),
    bold: readBoolean(value, "bold") ?? (fontWeight == null ? null : fontWeight >= 600),
    italic: readBoolean(value, "italic"),
    underline:
      readBoolean(value, "underline") ??
      ([
        readString(value.text_decoration),
        readString(value.textDecoration),
      ].includes("underline")
        ? true
        : null),
    line_height: clampOptional(readNumber(value, "line_height"), 0.8, 2.2),
    letter_spacing: clamp(readNumber(value, "letter_spacing") ?? 0, -200, 600),
    wrap: readEnum(value, ["word", "char", "none"], "wrap"),
    ellipsis: readBoolean(value, "ellipsis"),
  });
}

function adaptFill(value: UnknownRecord | null): Fill | null {
  const color = readColor(value?.color);
  if (!color) return null;
  return stripNullish({
    color,
    opacity: clamp(readNumber(value ?? {}, "opacity") ?? 1, 0, 1),
  });
}

function adaptStroke(value: UnknownRecord | null): Stroke | null {
  const color = readColor(value?.color);
  if (!color) return null;
  return stripNullish({
    color,
    opacity: clamp(readNumber(value ?? {}, "opacity") ?? 1, 0, 1),
    width: clamp(round(readNumber(value ?? {}, "width") ?? 1), 0, 8),
    dash: readArray(value ?? {}, "dash")
      .map((item) => readRawNumber(item))
      .filter((item): item is number => item != null && item >= 0),
  });
}

function hasVisiblePaint(
  fill: Fill | null,
  stroke: Stroke | null,
  opacity?: number | null,
) {
  if ((opacity ?? 1) <= 0) return false;
  if (fill && (fill.opacity ?? 1) > 0) return true;
  return Boolean(stroke && stroke.width > 0 && (stroke.opacity ?? 1) > 0);
}

function adaptBorderRadius(value: UnknownRecord | null): BorderRadius | null {
  if (!value) return null;
  return {
    tl: clamp(round((readNumber(value, "tl") ?? 0) * X_SCALE), 0, 0.5),
    tr: clamp(round((readNumber(value, "tr") ?? 0) * X_SCALE), 0, 0.5),
    bl: clamp(round((readNumber(value, "bl") ?? 0) * X_SCALE), 0, 0.5),
    br: clamp(round((readNumber(value, "br") ?? 0) * X_SCALE), 0, 0.5),
  };
}

function adaptPadding(value: UnknownRecord | null): Padding | null {
  if (!value) return null;
  return {
    top: Math.max(0, round((readNumber(value, "top") ?? 0) * Y_SCALE)),
    right: Math.max(0, round((readNumber(value, "right") ?? 0) * X_SCALE)),
    bottom: Math.max(0, round((readNumber(value, "bottom") ?? 0) * Y_SCALE)),
    left: Math.max(0, round((readNumber(value, "left") ?? 0) * X_SCALE)),
  };
}

function adaptShadow(value: UnknownRecord | null): Shadow | null {
  if (!value) return null;
  return stripNullish({
    color: readColor(value.color),
    blur: clamp(round((readNumber(value, "blur") ?? 0) * X_SCALE), 0, 100),
    opacity: clamp(readNumber(value, "opacity") ?? 0.2, 0, 1),
    offset_x: clamp(round((readNumber(value, "offset_x") ?? 0) * X_SCALE), -2, 2),
    offset_y: clamp(round((readNumber(value, "offset_y") ?? 0) * Y_SCALE), -2, 2),
  });
}

function textRun(text: string, font?: Font | null): TextRun {
  return stripNullish({ text, font }) as TextRun;
}

function adaptTextRun(item: unknown): TextRun | null {
  const record = asRecord(item);
  if (!record) return null;
  const text = truncateString(readString(record.text) ?? "", 700);
  if (!text) return null;
  return textRun(text, adaptFont(readRecord(record, "font")));
}

function adaptTextRuns(value: unknown[], fallbackText?: string | null): TextRun[] {
  const runs = value
    .map(adaptTextRun)
    .filter((item): item is TextRun => Boolean(item))
    .slice(0, 24);

  if (runs.length > 0) return runs;
  return [{ text: truncateString(fallbackText || "Text", 700) }];
}

function widenSingleLineTextElement(element: TextElement): TextElement {
  if (!element.position || !element.size) return element;

  const text = element.runs.map((run) => run.text).join("");
  const displayText = text.replace(/\*\*|__/g, "").trim();
  if (!displayText || displayText.includes("\n") || displayText.length > 48) {
    return element;
  }

  const wrap = element.font?.wrap;
  const oneLineBox = (element.size.height ?? 0) <= 0.55;
  if (wrap != null && wrap !== "none") return element;
  if (wrap == null && !oneLineBox) return element;

  const fontSize = element.font?.size ?? 18;
  const averageGlyphWidth = element.font?.bold ? 0.6 : 0.54;
  const estimatedWidth = fontSize * X_SCALE * averageGlyphWidth * displayText.length;
  const requiredWidth = round(Math.min(SLIDE_W - element.position.x, estimatedWidth + 0.12));
  if (requiredWidth <= element.size.width + 0.01) return element;

  return {
    ...element,
    size: {
      ...element.size,
      width: clamp(requiredWidth, element.size.width, SLIDE_W),
    },
  };
}

function adaptTextListItems(value: unknown[]): TextListItem[] {
  const items = value
    .map((item) => {
      if (Array.isArray(item)) {
        const runs = item
          .map(adaptTextRun)
          .filter((run): run is TextRun => Boolean(run));
        return runs.length > 0 ? runs : null;
      }
      const record = asRecord(item);
      const text = truncateString(readString(record?.text) ?? readString(item) ?? "", 180);
      return text ? [textRun(text)] : null;
    })
    .filter((item): item is TextRun[] => Boolean(item))
    .slice(0, 8);

  return items.length > 0 ? items : [[textRun("List item")]];
}

function adaptTableCells(value: unknown[]): TableCell[] {
  const cells = value
    .map((item) => {
      if (typeof item === "string" || typeof item === "number") {
        return { runs: [textRun(truncateString(String(item), 80))] } satisfies TableCell;
      }
      const record = asRecord(item);
      if (!record) return null;
      const rawRuns = readArray(record, "runs");
      const runText = rawRuns
        .map((run) => readString(asRecord(run)?.text) ?? "")
        .join("");
      const firstRun = asRecord(rawRuns[0]) ?? {};
      const textValue = record.text;
      const textRecord = asRecord(textValue);
      const text = truncateString(
        runText ||
          (textRecord
            ? readString(textRecord.text) ?? ""
            : readString(textValue) ?? ""),
        80,
      );
      const runs =
        rawRuns.map(adaptTextRun).filter((run): run is TextRun => Boolean(run))
          .length > 0
          ? rawRuns
              .map(adaptTextRun)
              .filter((run): run is TextRun => Boolean(run))
          : text
            ? [textRun(text)]
            : [];
      return stripNullish({
        color:
          adaptFill(readRecord(record, "color")) ??
          adaptFill(readRecord(record, "fill")),
        font:
          adaptFont(readRecord(record, "font")) ??
          adaptFont(readRecord(firstRun, "font")) ??
          adaptFont(readRecord(textRecord ?? {}, "font")),
        alignment: readEnum(record, ["left", "center", "right"], "alignment"),
        runs,
      }) as TableCell;
    })
    .filter((item): item is TableCell => Boolean(item));

  return cells.length > 0 ? cells : [{ runs: [] }];
}

function adaptChartCategories(value: unknown[]): string[] {
  return value
    .map((item, index) =>
      truncateString(readString(item) ?? readString(asRecord(item)?.label) ?? "", 40) ||
      `Item ${index + 1}`,
    )
    .filter(Boolean)
    .slice(0, 24);
}

function adaptChartSeries(value: unknown): ChartSeries | null {
  const record = asRecord(value);
  if (!record) return null;
  const values = readArray(record, "values")
    .map(readRawNumber)
    .filter((item): item is number => item != null)
    .map((item) => clamp(item, -1_000_000, 1_000_000))
    .slice(0, 24);
  if (values.length === 0) return null;
  return {
    name: truncateString(readString(record.name) ?? "Series", 80) || "Series",
    values,
  };
}

function invisibleFallbackElement(): SlideElement {
  return {
    type: "rectangle",
    position: { x: 0, y: 0 },
    size: { width: 0.1, height: 0.1 },
    fill: { color: "FFFFFF" },
    opacity: 0,
  };
}

function backgroundFromElements(elements: SlideElement[]) {
  const background = findBackgroundRectangle(elements, 0, 0);

  return background?.type === "rectangle" && background.fill?.color
    ? background.fill.color
    : "FFFFFF";
}

function findBackgroundRectangle(
  elements: SlideElement[],
  offsetX: number,
  offsetY: number,
): SlideElement | null {
  for (const element of elements) {
    const x = offsetX + (element.position?.x ?? 0);
    const y = offsetY + (element.position?.y ?? 0);
    if (
      element.type === "rectangle" &&
      x === 0 &&
      y === 0 &&
      element.size?.width === SLIDE_W &&
      element.size?.height === SLIDE_H &&
      element.fill?.color
    ) {
      return element;
    }

    if (
      element.type === "group" ||
      element.type === "flex" ||
      element.type === "grid"
    ) {
      const background = findBackgroundRectangle(element.children, x, y);
      if (background) return background;
    }

    if (element.type === "container" && element.child) {
      const background = findBackgroundRectangle([element.child], x, y);
      if (background) return background;
    }
  }

  return null;
}

function titleFromLayout(layout: TemplateV2Layout, index: number) {
  const id = readString(layout.id);
  const slideNumber = id?.match(/\d+/)?.[0] ?? `${index + 1}`;
  return truncateString(`Slide ${slideNumber}`, 60);
}

function sourceNumber(value: number) {
  return Math.round(value * 10000) / 10000;
}

function readValue(record: UnknownRecord, key: string) {
  return record[key];
}

function readRecord(
  record: UnknownRecord | null | undefined,
  key: string,
) {
  return asRecord(record ? readValue(record, key) : null);
}

function readArray(record: UnknownRecord, key: string) {
  const value = readValue(record, key);
  return Array.isArray(value) ? value : [];
}

function readNumber(record: UnknownRecord, key: string) {
  return readRawNumber(readValue(record, key));
}

function readRawNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(record: UnknownRecord, key: string) {
  const value = readValue(record, key);
  return typeof value === "boolean" ? value : null;
}

function readDecorative(record: UnknownRecord): boolean | null {
  return readBoolean(record, "decorative");
}

function readEnum<const T extends readonly string[]>(
  record: UnknownRecord,
  values: T,
  key: string,
): T[number] | null {
  const value = readString(readValue(record, key));
  return value && (values as readonly string[]).includes(value)
    ? (value as T[number])
    : null;
}

function readLayoutAlignment(
  record: UnknownRecord,
  key: string,
): LayoutAlignment | null {
  const value = readString(readValue(record, key));
  return value && LAYOUT_ALIGNMENT_VALUES.has(value)
    ? (value as LayoutAlignment)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readColor(value: unknown): string | null {
  const color = readString(value)?.trim();
  if (!color) return null;
  return /^#?[0-9A-Fa-f]{6}$/.test(color) ? color : null;
}

function asRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripNullish<T extends UnknownRecord>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) =>
        item !== null &&
        item !== undefined &&
        (!Array.isArray(item) || item.length > 0),
    ),
  ) as T;
}

function scaleDistance(value: number | null, scale: number) {
  return value == null ? null : Math.max(0, round(value * scale));
}

function positiveInteger(value: number | null, fallback: number) {
  return Math.max(1, Math.trunc(value ?? fallback));
}

function positiveIntegerOrNull(value: number | null) {
  return value == null ? null : positiveInteger(value, 1);
}

function clampInteger(value: number | null, min: number, max: number) {
  return value == null ? null : Math.trunc(clamp(value, min, max));
}

function clampOptional(value: number | null, min: number, max: number) {
  return value == null ? null : clamp(value, min, max);
}

function truncateString(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}
