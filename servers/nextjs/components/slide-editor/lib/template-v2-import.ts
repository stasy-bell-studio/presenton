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
  type Position,
  type Shadow,
  type Size,
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
const SOURCE_PX_TO_PT = (72 * SLIDE_W) / SOURCE_W;

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
  componentId?: string | null;
  componentInstanceId?: string | null;
  componentDescription?: string | null;
  componentSlot?: string | null;
  designVariables?: DesignVariable[] | null;
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
  mergedComponents?: unknown;
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
const GENERATED_VALUE_ELEMENT_TYPES = new Set([
  "text",
  "image",
  "text-list",
  "table",
  "chart",
]);
const GENERATED_TABLE_TEXT_FONT = {
  family: "Sniglet",
  size: 12,
  color: "#082314",
};
const GENERATED_TABLE_HEADER_FONT = {
  ...GENERATED_TABLE_TEXT_FONT,
  bold: true,
};
const GENERATED_TABLE_CELL_FILL = {
  color: "#F8F4E9",
  opacity: 1,
};
const GENERATED_TABLE_CELL_STROKE = {
  color: "#D8D3C4",
  opacity: 1,
  width: 1,
};

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
  if (layouts.length === 0) {
    throw new Error("Generated presentation did not include template v2 layouts.");
  }

  const layoutById = new Map(
    layouts
      .map((layout) => [readString(layout.id), layout] as const)
      .filter((entry): entry is [string, TemplateV2Layout] => Boolean(entry[0])),
  );
  const generatedSlides = readArray(presentationRecord, "slides")
    .filter(isRecord)
    .sort((a, b) => (readNumber(a, "index") ?? 0) - (readNumber(b, "index") ?? 0));

  const slides =
    generatedSlides.length > 0
      ? generatedSlides.slice(0, 50).map((slide, index) => {
          const layoutId = readString(slide.layout);
          const layout =
            (layoutId ? layoutById.get(layoutId) : null) ??
            layouts[index % layouts.length];
          const content = asRecord(slide.content) ?? {};
          return adaptLayoutToSlide(
            applyGeneratedSlideContentToLayout(layout, content),
            index,
          );
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
        ? readNumber(element, "columnGap", "column_gap") ??
          readNumber(element, "gap") ??
          0
        : readNumber(element, "rowGap", "row_gap") ??
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
      readNumber(element, "columnGap", "column_gap") ??
      readNumber(element, "gap") ??
      0;
    const rowGap =
      readNumber(element, "rowGap", "row_gap") ??
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

export function serializeTemplateV2LayoutFromSlide(
  layout: TemplateV2Layout,
  slide: Slide,
): TemplateV2Layout {
  const sourceComponents = readArray(layout as UnknownRecord, "components").filter(
    isRecord,
  );
  const usedSourceIndexes = new Set<number>();
  const components = slide.elements
    .filter(
      (element): element is GroupElement =>
        element.type === "group" && Boolean(element.componentId),
    )
    .map((group, index) => {
      const componentId = group.componentId || `component_${index}`;
      const sourceIndex = sourceComponents.findIndex(
        (component, candidateIndex) =>
          !usedSourceIndexes.has(candidateIndex) &&
          readString(component.id) === componentId,
      );
      const source = sourceIndex >= 0 ? sourceComponents[sourceIndex] : null;
      if (sourceIndex >= 0) usedSourceIndexes.add(sourceIndex);
      const sourceElements = source ? readArray(source, "elements") : [];

      return stripNullish({
        ...(source ?? {}),
        id: componentId,
        description:
          group.componentDescription ??
          readString(source?.description) ??
          `Editable ${componentId} component`,
        position: sourcePosition(group.position),
        size: sourceSize(group.size),
        elements: group.children
          .map((element, elementIndex) =>
            serializeTemplateV2Element(element, sourceElements[elementIndex]),
          )
          .filter(isRecord),
      });
    });

  return {
    ...layout,
    components,
  };
}

export function extractTemplateV2ContentFromSlide(
  slide: Slide,
  currentContent: unknown,
  legacyEditorStateKey?: string,
): Record<string, unknown> {
  const content = cloneJsonRecord(currentContent);
  if (legacyEditorStateKey) delete content[legacyEditorStateKey];

  const componentGroups = slide.elements.filter(
    (element): element is GroupElement =>
      element.type === "group" && Boolean(element.componentId),
  );
  const componentKeys = templateComponentContentKeys(
    componentGroups.map((group) => ({ id: group.componentId })),
  );

  componentGroups.forEach((element, index) => {
    const componentKey = componentKeys[index];
    const componentContent = isRecord(content[componentKey])
      ? cloneJsonRecord(content[componentKey])
      : componentKey === element.componentId && isRecord(content[element.componentId])
        ? cloneJsonRecord(content[element.componentId])
      : {};
    updateTemplateV2ContentFromElement(element, componentContent);
    content[componentKey] = componentContent;
  });
  if (legacyEditorStateKey) {
    content[legacyEditorStateKey] = normalizeTemplateV2Slide(slide);
  }
  return content;
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

  if (
    (element.type === "list-view" || element.type === "grid-view") &&
    element.item
  ) {
    return {
      ...element,
      item: normalizeTemplateV2Element(element.item),
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
    group.componentId === "author_info_card" ||
    group.componentSlot === "author_info_card" ||
    group.componentInstanceId?.startsWith("author_info_card:")
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
    (element.componentSlot === "author_name" || element.componentSlot === "date")
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
    componentId,
    componentInstanceId: `${componentId}:${componentIndex}`,
    componentDescription: componentDescription || null,
    design_variables: readArray(raw, "design_variables"),
  });
}

export function extractTemplateV2MergedComponents(template: unknown): unknown[] {
  const raw = asRecord(template);
  if (!raw) return [];

  const value = readValue(raw, "mergedComponents", "merged_components");
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
  const item = asRecord(readValue(element, "item"));
  return [
    ...children,
    ...(child ? [child] : []),
    ...(item ? [item] : []),
  ];
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

    const item = asRecord(readValue(localized, "item"));
    if (item) {
      localized.item = localizeRawElementToFrame(item, frame);
    }
  }

  return localized;
}

export function applyGeneratedSlideContentToLayout(
  layout: TemplateV2Layout,
  content: Record<string, unknown>,
): TemplateV2Layout {
  const rawLayout = asRecord(layout);
  if (!rawLayout) return layout;

  const components = readArray(rawLayout, "components");
  if (components.length === 0) {
    return rawLayout as TemplateV2Layout;
  }

  const componentKeys = templateComponentContentKeys(components);
  return {
    ...rawLayout,
    components: components.map((component, index) => {
      const rawComponent = asRecord(component);
      if (!rawComponent) return component;

      const componentContent =
        asRecord(content[componentKeys[index]]) ??
        asRecord(content[readString(rawComponent.id) ?? ""]) ??
        {};

      return {
        ...rawComponent,
        elements: readArray(rawComponent, "elements").map((element) =>
          applyGeneratedContentToElement(element, componentContent),
        ),
      };
    }),
  } as TemplateV2Layout;
}

function templateComponentContentKeys(components: unknown[]): string[] {
  const ids = components.map((component, index) => {
    const id = readString(asRecord(component)?.id);
    return id || `component_${index}`;
  });
  const counts = new Map<string, number>();
  ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));

  const indexes = new Map<string, number>();
  const used = new Set<string>();
  return ids.map((id) => {
    const occurrenceIndex = indexes.get(id) ?? 0;
    indexes.set(id, occurrenceIndex + 1);
    const base = (counts.get(id) ?? 0) > 1 ? `${id}_${occurrenceIndex}` : id;

    let key = base;
    let suffix = 1;
    while (used.has(key)) {
      key = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(key);
    return key;
  });
}

function applyGeneratedContentToElement(
  element: unknown,
  content: UnknownRecord,
): unknown {
  const raw = asRecord(element);
  if (!raw) return element;

  const type = readString(raw.type);
  const name = readString(raw.name);
  const value = name ? content[name] : undefined;
  const nestedContent = asRecord(value) ?? content;

  if (
    readDecorative(raw) === false &&
    name &&
    value !== undefined &&
    GENERATED_VALUE_ELEMENT_TYPES.has(type ?? "")
  ) {
    return applyGeneratedContentValue(raw, value);
  }

  if (type === "container") {
    return {
      ...raw,
      child: applyGeneratedContentToElement(readValue(raw, "child"), nestedContent),
    };
  }

  if (type === "flex" || type === "grid" || type === "group") {
    const children = readArray(raw, "children");
    return {
      ...raw,
      children: applyGeneratedContentToChildren(children, value, nestedContent),
    };
  }

  if (type === "list-view" || type === "grid-view") {
    const repeated = Array.isArray(value) ? value : null;
    if (repeated) {
      const itemTemplate = readValue(raw, "item");
      const children = repeated.map((item) =>
        applyGeneratedContentToElement(itemTemplate, asRecord(item) ?? {}),
      );

      if (type === "list-view") {
        const direction = readString(raw.direction);
        return {
          ...raw,
          type: "flex",
          direction:
            direction === "row" || direction === "column" ? direction : "column",
          children,
        };
      }

      return {
        ...raw,
        type: "grid",
        children,
      };
    }

    return {
      ...raw,
      item: applyGeneratedContentToElement(
        readValue(raw, "item"),
        nestedContent,
      ),
    };
  }

  return raw;
}

function applyGeneratedContentToChildren(
  children: unknown[],
  value: unknown,
  content: UnknownRecord,
): unknown[] {
  if (Array.isArray(value) && children.length > 0) {
    return value.map((item, index) =>
      applyGeneratedContentToElement(
        children[Math.min(index, children.length - 1)],
        asRecord(item) ?? {},
      ),
    );
  }

  return children.map((child) => applyGeneratedContentToElement(child, content));
}

function applyGeneratedContentValue(
  raw: UnknownRecord,
  value: unknown,
): UnknownRecord {
  const type = readString(raw.type);
  switch (type) {
    case "text":
      return applyGeneratedText(raw, value);
    case "image":
      return applyGeneratedImage(raw, value);
    case "text-list":
      return applyGeneratedTextList(raw, value);
    case "table":
      return applyGeneratedTable(raw, value);
    case "chart":
      return applyGeneratedChart(raw, value);
    default:
      return raw;
  }
}

function applyGeneratedText(raw: UnknownRecord, value: unknown): UnknownRecord {
  const text =
    readString(value) ??
    readString(asRecord(value)?.text) ??
    (typeof value === "number" ? String(value) : null);
  if (!text) return raw;

  const runs = readArray(raw, "runs");
  const firstRun = asRecord(runs[0]) ?? {};
  return {
    ...raw,
    text,
    runs: [{ ...firstRun, text }],
  };
}

function applyGeneratedImage(raw: UnknownRecord, value: unknown): UnknownRecord {
  const record = asRecord(value);
  if (!record) return raw;

  const url =
    readString(record.image_url) ??
    readString(record.icon_url) ??
    readString(record.__image_url__) ??
    readString(record.__icon_url__) ??
    readString(record.url);

  if (!url) return raw;
  return {
    ...raw,
    data: resolveBackendAssetUrl(url),
  };
}

function applyGeneratedTextList(
  raw: UnknownRecord,
  value: unknown,
): UnknownRecord {
  if (!Array.isArray(value)) return raw;
  return {
    ...raw,
    items: value
      .map((item) => readString(item) ?? readString(asRecord(item)?.text))
      .filter((item): item is string => Boolean(item))
      .map((text) => ({ type: "text", text })),
  };
}

function applyGeneratedTable(raw: UnknownRecord, value: unknown): UnknownRecord {
  const record = asRecord(value);
  if (!record) return raw;

  const templateColumns = readArray(raw, "columns");
  const templateRows = readArray(raw, "rows").filter(
    (row): row is unknown[] => Array.isArray(row),
  );
  const generatedColumns = readArray(record, "columns").map(readTableTextValue);
  const generatedRows = readArray(record, "rows").map((row) =>
    (Array.isArray(row) ? row : []).map(readTableTextValue),
  );
  const fallbackRow =
    templateRows[templateRows.length - 1] ?? templateColumns;

  return {
    ...raw,
    columns:
      generatedColumns.length > 0
        ? mergeGeneratedTableRowToLength(
            templateColumns,
            generatedColumns,
            true,
          )
        : templateColumns,
    rows:
      generatedRows.length > 0
        ? generatedRows.map((row, index) =>
            mergeGeneratedTableRowToLength(
              templateRows[index] ?? fallbackRow,
              row,
              false,
            ),
          )
        : templateRows,
  };
}

function mergeGeneratedTableRowToLength(
  templateCells: unknown[],
  generatedTexts: Array<string | null>,
  isHeader: boolean,
): unknown[] {
  const fallbackCell = templateCells[templateCells.length - 1];
  return generatedTexts.map((text, index) => {
    const cell = templateCells[index] ?? fallbackCell;
    return replaceTableCellText(cell ?? null, text ?? "", isHeader);
  });
}

function replaceTableCellText(
  cell: unknown,
  text: string,
  isHeader: boolean,
): unknown {
  const rawCell = asRecord(cell);
  const font = isHeader ? GENERATED_TABLE_HEADER_FONT : GENERATED_TABLE_TEXT_FONT;
  if (!rawCell) {
    return {
      fill: GENERATED_TABLE_CELL_FILL,
      stroke: GENERATED_TABLE_CELL_STROKE,
      text: { text, font },
    };
  }

  const textValue = readValue(rawCell, "text");
  const textRecord = asRecord(textValue);
  return {
    ...rawCell,
    fill: rawCell.fill ?? GENERATED_TABLE_CELL_FILL,
    stroke: rawCell.stroke ?? GENERATED_TABLE_CELL_STROKE,
    text: textRecord
      ? { ...textRecord, text, font: textRecord.font ?? font }
      : { text, font },
  };
}

function readTableTextValue(value: unknown): string | null {
  const record = asRecord(value);
  const text =
    readPrimitiveTableText(value) ??
    readPrimitiveTableText(readValue(record ?? {}, "text")) ??
    readPrimitiveTableText(readValue(record ?? {}, "value"));

  return text ? truncateString(text, 80) : null;
}

function readPrimitiveTableText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function applyGeneratedChart(raw: UnknownRecord, value: unknown): UnknownRecord {
  const record = asRecord(value);
  if (!record) return raw;

  const categories = readArray(record, "categories");
  const series = readArray(record, "series");
  const seriesColors = readArray(record, "seriesColors", "series_colors");
  const chartType = readEnum(
    record,
    ["bar", "line", "area", "pie", "donut"],
    "chartType",
    "chart_type",
  );

  return stripNullish({
    ...raw,
    chart_type: chartType ?? readValue(raw, "chart_type"),
    title: readString(record.title) ?? raw.title,
    categories: categories.length > 0 ? categories : raw.categories,
    series: series.length > 0 ? series : raw.series,
    series_colors:
      seriesColors.length > 0 ? seriesColors : readValue(raw, "series_colors"),
    x_axis:
      readBoolean(record, "xAxis", "x_axis") ??
      readBoolean(raw, "xAxis", "x_axis"),
    y_axis:
      readBoolean(record, "yAxis", "y_axis") ??
      readBoolean(raw, "yAxis", "y_axis"),
    x_axis_title:
      readValue(record, "xAxisTitle", "x_axis_title") ??
      readValue(raw, "x_axis_title"),
    y_axis_title:
      readValue(record, "yAxisTitle", "y_axis_title") ??
      readValue(raw, "y_axis_title"),
    data_labels:
      readBoolean(record, "dataLabels", "data_labels") ??
      readBoolean(raw, "dataLabels", "data_labels"),
    grid: readBoolean(record, "grid") ?? readBoolean(raw, "grid"),
    source: readString(record.source) ?? raw.source,
  });
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
    case "svg":
      return adaptSvg(raw);
    case "chart":
      return adaptChart(raw);
    case "infographic":
      return adaptInfographic(raw);
    case "flex":
      return adaptFlex(raw);
    case "grid":
      return adaptGrid(raw);
    case "list-view":
      return adaptListView(raw);
    case "grid-view":
      return adaptGridView(raw);
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
    font: font && font.lineHeight == null ? { ...font, lineHeight: 1 } : font,
    alignment: adaptAlignment(readRecord(raw, "alignment")),
    fill: adaptFill(readRecord(raw, "fill")),
    stroke: adaptStroke(readRecord(raw, "stroke")),
    runs: adaptTextRuns(readArray(raw, "runs"), readString(raw.text)),
    maxLength: readNumber(raw, "maxLength", "max_length"),
    minLength: readNumber(raw, "minLength", "min_length"),
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
    borderRadius: adaptBorderRadius(readRecord(raw, "borderRadius", "border_radius")),
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
    data: data ? resolveBackendAssetUrl(data) : null,
    name: truncateString(readString(raw.name) ?? "", 120) || null,
    fit: readEnum(raw, ["contain", "cover", "fill"], "fit"),
    borderRadius: adaptBorderRadius(readRecord(raw, "borderRadius", "border_radius")),
    color: readString(raw.color),
    is_icon: readBoolean(raw, "is_icon") ?? readBoolean(raw, "isIcon"),
  };
}

function adaptTextList(raw: UnknownRecord): SlideElement {
  return {
    ...baseElement(raw),
    type: "text-list",
    font: adaptFont(readRecord(raw, "font")),
    marker: readEnum(raw, ["bullet", "number", "none"], "marker"),
    items: adaptTextListItems(readArray(raw, "items")),
    maxItems: readNumber(raw, "maxItems", "max_items"),
    minItems: readNumber(raw, "minItems", "min_items"),
    maxItemLength: readNumber(raw, "maxItemLength", "max_item_length"),
    minItemLength: readNumber(raw, "minItemLength", "min_item_length"),
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
    maxColumns: readNumber(raw, "maxColumns", "max_columns"),
    minColumns: readNumber(raw, "minColumns", "min_columns"),
    maxRows: readNumber(raw, "maxRows", "max_rows"),
    minRows: readNumber(raw, "minRows", "min_rows"),
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
    borderRadius: adaptBorderRadius(readRecord(raw, "borderRadius", "border_radius")),
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

function adaptSvg(raw: UnknownRecord): SlideElement {
  return {
    ...baseElement(raw),
    type: "svg",
    svg: truncateString(readString(raw.svg) ?? "<svg />", 20_000),
    name: truncateString(readString(raw.name) ?? "", 120) || null,
  };
}

function adaptChart(raw: UnknownRecord): SlideElement {
  const categories = adaptChartCategories(readArray(raw, "categories"));
  const series = readArray(raw, "series")
    .map(adaptChartSeries)
    .filter((item): item is ChartSeries => item != null);
  const seriesColors = readArray(raw, "seriesColors", "series_colors")
    .map(readColor)
    .filter((item): item is string => Boolean(item))
    .slice(0, 12);
  const color = seriesColors[0] ?? null;
  const data = chartDataFromSeries(categories, series, color).slice(0, 8);
  const dataLabels = readBoolean(raw, "dataLabels", "data_labels");

  return {
    ...baseElement(raw),
    type: "chart",
    chartType:
      readEnum(
        raw,
        ["bar", "line", "area", "pie", "donut"],
        "chartType",
        "chart_type",
      ) ??
      "bar",
    data: data.length > 0 ? data : [{ label: "Data", value: 0 }],
    title: truncateString(readString(raw.title) ?? "", 80) || null,
    color,
    axisColor: null,
    labelColor: null,
    showValues: dataLabels,
    seriesColors,
    xAxis: readBoolean(raw, "xAxis", "x_axis"),
    yAxis: readBoolean(raw, "yAxis", "y_axis"),
    xAxisTitle:
      truncateString(
        readString(readValue(raw, "xAxisTitle", "x_axis_title")) ?? "",
        80,
      ) || null,
    yAxisTitle:
      truncateString(
        readString(readValue(raw, "yAxisTitle", "y_axis_title")) ?? "",
        80,
      ) || null,
    categories,
    series,
    dataLabels,
    grid: readBoolean(raw, "grid"),
    source: truncateString(readString(raw.source) ?? "", 120) || null,
  };
}

function adaptInfographic(raw: UnknownRecord): SlideElement {
  const minValue = readNumber(raw, "minValue", "min_value") ?? 0;
  const rawMaxValue = readNumber(raw, "maxValue", "max_value") ?? 100;
  const maxValue =
    rawMaxValue === minValue ? minValue + 1 : rawMaxValue;

  return {
    ...baseElement(raw),
    type: "infographic",
    infographicType:
      readEnum(
        raw,
        ["progress_bar", "gauge"],
        "infographicType",
        "infographic_type",
      ) ?? "gauge",
    minValue,
    maxValue,
    value: readNumber(raw, "value") ?? minValue,
    baseColor: readColor(readValue(raw, "baseColor", "base_color")),
    highlightColor: readColor(
      readValue(raw, "highlightColor", "highlight_color"),
    ),
  };
}

function adaptFlex(raw: UnknownRecord): SlideElement {
  return {
    ...requiredBaseElement(raw),
    type: "flex",
    direction: readEnum(raw, ["row", "column"], "direction") ?? "row",
    wrap: readBoolean(raw, "wrap"),
    alignItems: readLayoutAlignment(raw, "alignItems", "align_items"),
    justifyContent: readLayoutAlignment(raw, "justifyContent", "justify_content"),
    padding: adaptPadding(readRecord(raw, "padding")),
    gap: scaleDistance(readNumber(raw, "gap"), X_SCALE),
    columnGap: scaleDistance(readNumber(raw, "columnGap", "column_gap"), X_SCALE),
    rowGap: scaleDistance(readNumber(raw, "rowGap", "row_gap"), Y_SCALE),
    children: withEqualTemplateV2FlowChildSizes(raw)
      .map(adaptElement)
      .filter(Boolean) as SlideElement[],
    maxChildren: readNumber(raw, "maxChildren", "max_children"),
    minChildren: readNumber(raw, "minChildren", "min_children"),
  };
}

function adaptGrid(raw: UnknownRecord): SlideElement {
  return {
    ...requiredBaseElement(raw),
    type: "grid",
    columns: positiveInteger(readNumber(raw, "columns"), 1),
    rows: positiveIntegerOrNull(readNumber(raw, "rows")),
    gap: scaleDistance(readNumber(raw, "gap"), X_SCALE),
    columnGap: scaleDistance(readNumber(raw, "columnGap", "column_gap"), X_SCALE),
    rowGap: scaleDistance(readNumber(raw, "rowGap", "row_gap"), Y_SCALE),
    alignItems: readLayoutAlignment(raw, "alignItems", "align_items"),
    justifyItems: readLayoutAlignment(raw, "justifyItems", "justify_items"),
    padding: adaptPadding(readRecord(raw, "padding")),
    children: withEqualTemplateV2FlowChildSizes(raw)
      .map(adaptElement)
      .filter(Boolean) as SlideElement[],
    maxChildren: readNumber(raw, "maxChildren", "max_children"),
    minChildren: readNumber(raw, "minChildren", "min_children"),
  };
}

function adaptListView(raw: UnknownRecord): SlideElement {
  return {
    ...baseElement(raw),
    type: "list-view",
    direction: readEnum(raw, ["row", "column"], "direction"),
    gap: scaleDistance(readNumber(raw, "gap"), X_SCALE),
    columnGap: scaleDistance(readNumber(raw, "columnGap", "column_gap"), X_SCALE),
    rowGap: scaleDistance(readNumber(raw, "rowGap", "row_gap"), Y_SCALE),
    alignItems: readLayoutAlignment(raw, "alignItems", "align_items"),
    justifyContent: readLayoutAlignment(raw, "justifyContent", "justify_content"),
    padding: adaptPadding(readRecord(raw, "padding")),
    count: Math.max(0, Math.trunc(readNumber(raw, "count") ?? 0)),
    item: adaptElement(readValue(raw, "item")) ?? invisibleFallbackElement(),
    maxCount: readNumber(raw, "maxCount", "max_count"),
    minCount: readNumber(raw, "minCount", "min_count"),
  };
}

function adaptGridView(raw: UnknownRecord): SlideElement {
  return {
    ...baseElement(raw),
    type: "grid-view",
    columns: positiveInteger(readNumber(raw, "columns"), 1),
    rows: positiveIntegerOrNull(readNumber(raw, "rows")),
    gap: scaleDistance(readNumber(raw, "gap"), X_SCALE),
    columnGap: scaleDistance(readNumber(raw, "columnGap", "column_gap"), X_SCALE),
    rowGap: scaleDistance(readNumber(raw, "rowGap", "row_gap"), Y_SCALE),
    alignItems: readLayoutAlignment(raw, "alignItems", "align_items"),
    justifyItems: readLayoutAlignment(raw, "justifyItems", "justify_items"),
    padding: adaptPadding(readRecord(raw, "padding")),
    count: Math.max(0, Math.trunc(readNumber(raw, "count") ?? 0)),
    item: adaptElement(readValue(raw, "item")) ?? invisibleFallbackElement(),
    maxCount: readNumber(raw, "maxCount", "max_count"),
    minCount: readNumber(raw, "minCount", "min_count"),
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
    maxChildren: readNumber(raw, "maxChildren", "max_children"),
    minChildren: readNumber(raw, "minChildren", "min_children"),
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
    readString(readValue(raw, "componentSlot", "component_slot")) ??
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
  if (componentSlot) base.componentSlot = truncateString(componentSlot, 120);
  const designVariables = adaptDesignVariables(
    readArray(raw, "designVariables", "design_variables"),
  );
  if (designVariables.length > 0) base.designVariables = designVariables;
  if (readString(readValue(raw, "componentId", "component_id"))) {
    base.componentId = truncateString(
      readString(readValue(raw, "componentId", "component_id")) ?? "",
      120,
    );
  }
  if (readString(readValue(raw, "componentInstanceId", "component_instance_id"))) {
    base.componentInstanceId = truncateString(
      readString(readValue(raw, "componentInstanceId", "component_instance_id")) ?? "",
      160,
    );
  }
  if (readString(readValue(raw, "componentDescription", "component_description"))) {
    base.componentDescription = truncateString(
      readString(readValue(raw, "componentDescription", "component_description")) ?? "",
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
            readString(readValue(rawEffect, "path", "target")) ?? "",
            240,
          );
          const expression = truncateString(
            readString(readValue(rawEffect, "effect", "source")) ?? "",
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
    minWidth: scaleDistance(readNumber(value, "minWidth", "min_width"), X_SCALE),
    maxWidth: scaleDistance(readNumber(value, "maxWidth", "max_width"), X_SCALE),
    minHeight: scaleDistance(readNumber(value, "minHeight", "min_height"), Y_SCALE),
    maxHeight: scaleDistance(readNumber(value, "maxHeight", "max_height"), Y_SCALE),
    columnSpan: clampInteger(readNumber(value, "columnSpan", "column_span"), 1, 12),
    rowSpan: clampInteger(readNumber(value, "rowSpan", "row_span"), 1, 12),
    alignSelf: readLayoutAlignment(value, "alignSelf", "align_self"),
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
  const fontWeight = readNumber(value, "fontWeight", "font_weight");
  const size = readNumber(value, "size");
  return stripNullish({
    family:
      truncateString(readString(value.family) ?? readString(value.name) ?? "", 80) ||
      null,
    size:
      size == null ? null : clamp(round(size * SOURCE_PX_TO_PT), 6, 360),
    color: readColor(value.color),
    bold: readBoolean(value, "bold") ?? (fontWeight == null ? null : fontWeight >= 600),
    italic: readBoolean(value, "italic"),
    lineHeight: clampOptional(readNumber(value, "lineHeight", "line_height"), 0.8, 2.2),
    letterSpacing: clamp(readNumber(value, "letterSpacing", "letter_spacing") ?? 0, -200, 600),
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
    width: clamp(round((readNumber(value ?? {}, "width") ?? 1) * SOURCE_PX_TO_PT), 0, 8),
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
    offsetX: clamp(round((readNumber(value, "offsetX", "offset_x") ?? 0) * X_SCALE), -2, 2),
    offsetY: clamp(round((readNumber(value, "offsetY", "offset_y") ?? 0) * Y_SCALE), -2, 2),
  });
}

function adaptTextRuns(value: unknown[], fallbackText?: string | null): TextRun[] {
  const runs = value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const text = truncateString(readString(record.text) ?? "", 700);
      if (!text) return null;
      const font = adaptFont(readRecord(record, "font"));
      return stripNullish({ text, font }) as TextRun;
    })
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
  const estimatedWidth = (fontSize / 72) * averageGlyphWidth * displayText.length;
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
        return item
          .map((run) => readString(asRecord(run)?.text) ?? "")
          .join("");
      }
      const record = asRecord(item);
      return readString(record?.text) ?? readString(item);
    })
    .map((text) => truncateString(text ?? "", 180))
    .filter((text) => text.length > 0)
    .slice(0, 8)
    .map((text) => ({ type: "text" as const, text }));

  return items.length > 0 ? items : [{ type: "text", text: "List item" }];
}

function adaptTableCells(value: unknown[]): TableCell[] {
  const cells = value
    .map((item) => {
      if (typeof item === "string" || typeof item === "number") {
        return { text: truncateString(String(item), 80) } satisfies TableCell;
      }
      const record = asRecord(item);
      if (!record) return null;
      const textValue = record.text;
      const textRecord = asRecord(textValue);
      const text = truncateString(
        textRecord ? readString(textRecord.text) ?? "" : readString(textValue) ?? "",
        80,
      );
      return stripNullish({
        fill: adaptFill(readRecord(record, "fill")),
        stroke: adaptStroke(readRecord(record, "stroke")),
        font: adaptFont(readRecord(record, "font")) ?? adaptFont(readRecord(textRecord ?? {}, "font")),
        text: text || null,
        maxLength: readNumber(record, "maxLength", "max_length"),
        minLength: readNumber(record, "minLength", "min_length"),
      }) as TableCell;
    })
    .filter((item): item is TableCell => Boolean(item));

  return cells.length > 0 ? cells : [{ text: "" }];
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

function serializeTemplateV2Element(
  element: SlideElement,
  sourceValue: unknown,
): UnknownRecord | null {
  const source = asRecord(sourceValue) ?? {};
  const base = serializeTemplateV2ElementBase(element, source);

  switch (element.type) {
    case "text":
      return stripNullish({
        ...base,
        type: "text",
        font: sourceFont(element.font),
        alignment: element.alignment,
        fill: element.fill,
        stroke: sourceStroke(element.stroke),
        runs: element.runs.map((run) =>
          stripNullish({ text: run.text, font: sourceFont(run.font) }),
        ),
        min_length: element.minLength,
        max_length: element.maxLength,
      });
    case "container":
      return stripNullish({
        ...base,
        type: "container",
        alignment: element.alignment,
        fill: element.fill,
        stroke: sourceStroke(element.stroke),
        border_radius: sourceBorderRadius(element.borderRadius),
        padding: sourcePadding(element.padding),
        child: element.child
          ? serializeTemplateV2Element(element.child, source.child)
          : null,
      });
    case "image":
      return stripNullish({
        ...base,
        type: "image",
        data: element.data,
        name: element.name ?? element.componentSlot,
        fit: element.fit,
        border_radius: sourceBorderRadius(element.borderRadius),
        color: element.color,
        is_icon: element.is_icon,
      });
    case "text-list":
      return stripNullish({
        ...base,
        type: "text-list",
        font: sourceFont(element.font),
        marker: element.marker,
        items: element.items.map((item) => [{ text: item.text }]),
        min_items: element.minItems,
        max_items: element.maxItems,
        min_item_length: element.minItemLength,
        max_item_length: element.maxItemLength,
      });
    case "table":
      return stripNullish({
        ...base,
        type: "table",
        columns: element.columns.map(serializeTemplateV2TableCell),
        rows: element.rows.map((row) =>
          row.map(serializeTemplateV2TableCell),
        ),
        min_columns: element.minColumns,
        max_columns: element.maxColumns,
        min_rows: element.minRows,
        max_rows: element.maxRows,
      });
    case "rectangle":
      return stripNullish({
        ...base,
        type: "rectangle",
        fill: element.fill,
        stroke: sourceStroke(element.stroke),
        border_radius: sourceBorderRadius(element.borderRadius),
      });
    case "ellipse":
      return stripNullish({
        ...base,
        type: "ellipse",
        fill: element.fill,
        stroke: sourceStroke(element.stroke),
      });
    case "line":
      return stripNullish({
        ...base,
        type: "line",
        stroke: sourceStroke(element.stroke),
      });
    case "chart":
      return stripNullish({
        ...base,
        type: "chart",
        chart_type: element.chartType,
        title: element.title,
        series_colors: element.seriesColors,
        x_axis: element.xAxis,
        y_axis: element.yAxis,
        x_axis_title: element.xAxisTitle,
        y_axis_title: element.yAxisTitle,
        categories: element.categories,
        series: element.series,
        data_labels: element.dataLabels ?? element.showValues,
        grid: element.grid,
        source: element.source,
      });
    case "infographic":
      return stripNullish({
        ...base,
        type: "infographic",
        infographic_type: element.infographicType,
        min_value: element.minValue,
        max_value: element.maxValue,
        value: element.value,
        base_color: element.baseColor,
        highlight_color: element.highlightColor,
      });
    case "flex":
      return serializeTemplateV2ChildrenElement(
        base,
        "flex",
        element,
        readArray(source, "children"),
        {
          direction: element.direction,
          wrap: element.wrap,
          align_items: element.alignItems,
          justify_content: element.justifyContent,
          padding: sourcePadding(element.padding),
          gap: sourceDistance(element.gap, X_SCALE),
          column_gap: sourceDistance(element.columnGap, X_SCALE),
          row_gap: sourceDistance(element.rowGap, Y_SCALE),
          min_children: element.minChildren,
          max_children: element.maxChildren,
        },
      );
    case "grid":
      return serializeTemplateV2ChildrenElement(
        base,
        "grid",
        element,
        readArray(source, "children"),
        {
          columns: element.columns,
          rows: element.rows,
          align_items: element.alignItems,
          justify_items: element.justifyItems,
          padding: sourcePadding(element.padding),
          gap: sourceDistance(element.gap, X_SCALE),
          column_gap: sourceDistance(element.columnGap, X_SCALE),
          row_gap: sourceDistance(element.rowGap, Y_SCALE),
          min_children: element.minChildren,
          max_children: element.maxChildren,
        },
      );
    case "group":
      return serializeTemplateV2ChildrenElement(
        base,
        "group",
        element,
        readArray(source, "children"),
        {
          min_children: element.minChildren,
          max_children: element.maxChildren,
        },
      );
    case "list-view":
    case "grid-view":
      return source;
    case "svg":
      return Object.keys(source).length > 0 ? source : null;
  }
}

function serializeTemplateV2ElementBase(
  element: SlideElement,
  source: UnknownRecord,
): UnknownRecord {
  return stripNullish({
    ...source,
    position: sourcePosition(element.position),
    size: sourceSize(element.size),
    rotation: element.rotation,
    decorative: element.decorative,
    name: element.componentSlot ?? readString(source.name),
    shadow: sourceShadow(element.shadow),
  });
}

function serializeTemplateV2ChildrenElement(
  base: UnknownRecord,
  type: "flex" | "grid" | "group",
  element: Extract<SlideElement, { children: SlideElement[] }>,
  sourceChildren: unknown[],
  fields: UnknownRecord,
): UnknownRecord {
  return stripNullish({
    ...base,
    ...fields,
    type,
    children: element.children
      .map((child, index) =>
        serializeTemplateV2Element(child, sourceChildren[index]),
      )
      .filter(isRecord),
  });
}

function serializeTemplateV2TableCell(cell: TableCell): UnknownRecord {
  return stripNullish({
    fill: cell.fill,
    stroke: sourceStroke(cell.stroke),
    text: cell.text
      ? stripNullish({ text: cell.text, font: sourceFont(cell.font) })
      : null,
  });
}

function sourcePosition(value: Position | null | undefined) {
  return value
    ? { x: sourceNumber(value.x / X_SCALE), y: sourceNumber(value.y / Y_SCALE) }
    : null;
}

function sourceSize(value: Size | null | undefined) {
  return value
    ? {
        width: sourceNumber(value.width / X_SCALE),
        height: sourceNumber(value.height / Y_SCALE),
      }
    : null;
}

function sourceFont(value: Font | null | undefined) {
  if (!value) return null;
  return stripNullish({
    ...value,
    size:
      value.size == null
        ? null
        : sourceNumber(value.size / SOURCE_PX_TO_PT),
    line_height: value.lineHeight,
    letter_spacing: value.letterSpacing,
    lineHeight: undefined,
    letterSpacing: undefined,
  });
}

function sourceStroke(value: Stroke | null | undefined) {
  if (!value) return null;
  return {
    ...value,
    width: sourceNumber(value.width / SOURCE_PX_TO_PT),
  };
}

function sourceBorderRadius(value: BorderRadius | null | undefined) {
  if (!value) return null;
  return {
    tl: sourceNumber(value.tl / X_SCALE),
    tr: sourceNumber(value.tr / X_SCALE),
    bl: sourceNumber(value.bl / X_SCALE),
    br: sourceNumber(value.br / X_SCALE),
  };
}

function sourcePadding(value: Padding | null | undefined) {
  if (!value) return null;
  return {
    top: sourceNumber(value.top / Y_SCALE),
    right: sourceNumber(value.right / X_SCALE),
    bottom: sourceNumber(value.bottom / Y_SCALE),
    left: sourceNumber(value.left / X_SCALE),
  };
}

function sourceShadow(value: Shadow | null | undefined) {
  if (!value) return null;
  return stripNullish({
    ...value,
    blur:
      value.blur == null ? null : sourceNumber(value.blur / X_SCALE),
    offset_x:
      value.offsetX == null ? null : sourceNumber(value.offsetX / X_SCALE),
    offset_y:
      value.offsetY == null ? null : sourceNumber(value.offsetY / Y_SCALE),
    offsetX: undefined,
    offsetY: undefined,
  });
}

function sourceDistance(value: number | null | undefined, scale: number) {
  return value == null ? null : sourceNumber(value / scale);
}

function sourceNumber(value: number) {
  return Math.round(value * 10000) / 10000;
}

function updateTemplateV2ContentFromElement(
  element: SlideElement,
  componentContent: Record<string, unknown>,
) {
  const slot = readString(element.componentSlot);
  const updater = templateV2ContentUpdater(element);
  if (slot && updater) {
    if (!updateMatchingTemplateV2Content(componentContent, slot, updater)) {
      componentContent[slot] = updater(undefined);
    }
  }

  if ("children" in element && Array.isArray(element.children)) {
    element.children.forEach((child) =>
      updateTemplateV2ContentFromElement(child, componentContent),
    );
  }
  if (element.type === "container" && element.child) {
    updateTemplateV2ContentFromElement(element.child, componentContent);
  }
  if (
    (element.type === "list-view" || element.type === "grid-view") &&
    element.item
  ) {
    updateTemplateV2ContentFromElement(element.item, componentContent);
  }
}

type TemplateV2ContentUpdater = (currentValue: unknown) => unknown;

function templateV2ContentUpdater(
  element: SlideElement,
): TemplateV2ContentUpdater | null {
  if (element.decorative !== false) return null;
  if (element.type === "text") {
    return () => element.runs.map((run) => run.text).join("");
  }
  if (element.type === "image" && element.data) {
    return (currentValue) => {
      const value: UnknownRecord = {
        ...(isRecord(currentValue) ? currentValue : {}),
      };
      delete value.__icon_url__;
      delete value.__image_url__;
      value[element.is_icon ? "icon_url" : "image_url"] = element.data;
      return value;
    };
  }
  if (element.type === "text-list") {
    return () => element.items.map((item) => item.text);
  }
  if (element.type === "table") {
    return () => ({
      columns: element.columns.map((cell) => cell.text ?? ""),
      rows: element.rows.map((row) => row.map((cell) => cell.text ?? "")),
    });
  }
  if (element.type === "chart") {
    return () =>
      stripNullish({
        title: element.title ?? null,
        categories: element.categories,
        series: element.series,
      });
  }
  return null;
}

function updateMatchingTemplateV2Content(
  value: unknown,
  slot: string,
  updater: TemplateV2ContentUpdater,
): boolean {
  const candidates = templateV2ContentSlotCandidates(slot);
  if (isRecord(value)) {
    for (const candidate of candidates) {
      if (Object.prototype.hasOwnProperty.call(value, candidate)) {
        value[candidate] = updater(value[candidate]);
        return true;
      }
    }
    return Object.values(value).some((child) =>
      updateMatchingTemplateV2Content(child, slot, updater),
    );
  }
  if (Array.isArray(value)) {
    const preferredIndex = templateV2RepeatedContentIndex(slot);
    if (
      preferredIndex != null &&
      preferredIndex < value.length &&
      updateMatchingTemplateV2Content(value[preferredIndex], slot, updater)
    ) {
      return true;
    }
    return value.some(
      (child, index) =>
        index !== preferredIndex &&
        updateMatchingTemplateV2Content(child, slot, updater),
    );
  }
  return false;
}

function templateV2ContentSlotCandidates(slot: string): string[] {
  const withoutNumericToken = slot.replace(/_\d+(?=_|$)/g, "");
  const withoutPrefix = withoutNumericToken.includes("_")
    ? withoutNumericToken.slice(withoutNumericToken.indexOf("_") + 1)
    : withoutNumericToken;
  return Array.from(new Set([slot, withoutNumericToken, withoutPrefix]));
}

function templateV2RepeatedContentIndex(slot: string): number | null {
  const match = slot.match(/_(\d+)(?=_|$)/);
  return match ? Math.max(0, Number(match[1]) - 1) : null;
}

function cloneJsonRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return { ...value };
  }
}

function readValue(
  record: UnknownRecord,
  camelKey: string,
  snakeKey = camelToSnake(camelKey),
) {
  return record[camelKey] ?? record[snakeKey];
}

function readRecord(
  record: UnknownRecord | null | undefined,
  camelKey: string,
  snakeKey = camelToSnake(camelKey),
) {
  return asRecord(record ? readValue(record, camelKey, snakeKey) : null);
}

function readArray(
  record: UnknownRecord,
  camelKey: string,
  snakeKey = camelToSnake(camelKey),
) {
  const value = readValue(record, camelKey, snakeKey);
  return Array.isArray(value) ? value : [];
}

function readNumber(
  record: UnknownRecord,
  camelKey: string,
  snakeKey = camelToSnake(camelKey),
) {
  return readRawNumber(readValue(record, camelKey, snakeKey));
}

function readRawNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(
  record: UnknownRecord,
  camelKey: string,
  snakeKey = camelToSnake(camelKey),
) {
  const value = readValue(record, camelKey, snakeKey);
  return typeof value === "boolean" ? value : null;
}

function readDecorative(record: UnknownRecord): boolean | null {
  return readBoolean(record, "decorative");
}

function readEnum<const T extends readonly string[]>(
  record: UnknownRecord,
  values: T,
  camelKey: string,
  snakeKey = camelToSnake(camelKey),
): T[number] | null {
  const value = readString(readValue(record, camelKey, snakeKey));
  return value && (values as readonly string[]).includes(value)
    ? (value as T[number])
    : null;
}

function readLayoutAlignment(
  record: UnknownRecord,
  camelKey: string,
  snakeKey = camelToSnake(camelKey),
): LayoutAlignment | null {
  const value = readString(readValue(record, camelKey, snakeKey));
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

function camelToSnake(value: string) {
  return value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}
