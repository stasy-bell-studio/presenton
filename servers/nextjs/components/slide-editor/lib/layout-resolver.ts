import {
  SLIDE_H,
  SLIDE_W,
  type ContainerElement,
  type FlexDirection,
  type GridElement,
  type GridViewElement,
  type GroupElement,
  type LayoutAlignment,
  type Padding,
  type Slide,
  type SlideElement,
} from "./slide-schema";
import {
  boxToPositionSize,
  elementBox,
  elementFont,
  type ElementBox,
} from "./element-model";
import { renderMarkdownTextContent } from "./markdown-text";
import { measureTextHeightInches } from "./textMeasure";

export type RenderMode = "absolute" | "flow";

export type LayoutFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ResolvedLayoutItem = {
  element: SlideElement;
  source: SlideElement;
  sourcePath: string;
  rootIndex: number;
  path: string;
  parentPath: string | null;
  depth: number;
  mode: RenderMode;
  box: ElementBox;
  frame: LayoutFrame;
  paintable: boolean;
};

export type ResolvedLayoutNode = ResolvedLayoutItem & {
  children: ResolvedLayoutNode[];
};

export type LayoutElement = Extract<
  SlideElement,
  {
    type:
      | "container"
      | "flex"
      | "grid"
      | "group"
      | "list-view"
      | "grid-view";
  }
>;

type LayoutContext = {
  rootIndex: number;
  path: string;
  sourcePath?: string;
  parentPath: string | null;
  depth: number;
  mode?: RenderMode;
  forcedBox?: ElementBox;
  transform?: LayoutTransform;
};

type LayoutTransform = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  rotation: number;
};

type FlexLike = {
  alignItems?: LayoutAlignment | null;
  columnGap?: number | null;
  direction?: FlexDirection | null;
  gap?: number | null;
  justifyContent?: LayoutAlignment | null;
  padding?: Padding | null;
  rowGap?: number | null;
  wrap?: boolean | null;
};

type GridLike = Pick<
  GridElement | GridViewElement,
  | "alignItems"
  | "columnGap"
  | "columns"
  | "gap"
  | "justifyItems"
  | "padding"
  | "rowGap"
  | "rows"
>;

const ZERO_PADDING: Padding = { top: 0, right: 0, bottom: 0, left: 0 };
const SOURCE_PX_PER_IN = 128;
const DECORATIVE_LINE_THICKNESS = 4 / SOURCE_PX_PER_IN;
const DECORATIVE_LINE_LENGTH = 80 / SOURCE_PX_PER_IN;
const TEXT_AVERAGE_CHAR_EM = 0.45;
const IDENTITY_TRANSFORM: LayoutTransform = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
  rotation: 0,
};
const LAYOUT_TYPES = new Set<SlideElement["type"]>([
  "container",
  "flex",
  "grid",
  "group",
  "list-view",
  "grid-view",
]);

export function isLayoutElement(element: SlideElement): element is LayoutElement {
  return LAYOUT_TYPES.has(element.type);
}

export function resolveSlideLayout(slide: Slide): ResolvedLayoutItem[] {
  return flattenResolvedLayoutTree(resolveSlideLayoutTree(slide));
}

export function resolveSlideLayoutTree(slide: Slide): ResolvedLayoutNode[] {
  return slide.elements.map((element, index) =>
    resolveElementLayoutTree(element, {
      rootIndex: index,
      path: String(index),
      parentPath: null,
      depth: 0,
      mode: "absolute",
    }),
  );
}

export function resolveElementLayout(
  element: SlideElement,
  context: LayoutContext,
): ResolvedLayoutItem[] {
  return flattenResolvedLayoutNode(resolveElementLayoutTree(element, context));
}

export function resolveElementLayoutTree(
  element: SlideElement,
  context: LayoutContext,
): ResolvedLayoutNode {
  const box = context.forcedBox ?? elementBox(element);

  if (element.type === "container") {
    return resolveContainer(element, box, context);
  }

  if (element.type === "flex") {
    return resolveFlex(
      element,
      element.children,
      box,
      context,
      undefined,
      undefined,
      element,
    );
  }

  if (element.type === "grid") {
    return resolveGrid(
      element,
      element.children,
      box,
      context,
      undefined,
      undefined,
      element,
    );
  }

  if (element.type === "group") {
    return resolveGroup(element, box, context);
  }

  if (element.type === "list-view") {
    const repeated = Array.from({ length: element.count }, () => element.item);
    return resolveFlex(
      {
        ...element,
        direction: element.direction ?? "column",
        wrap: false,
      },
      repeated,
      box,
      context,
      "item",
      `${context.sourcePath ?? context.path}.item`,
      element,
    );
  }

  if (element.type === "grid-view") {
    const repeated = Array.from({ length: element.count }, () => element.item);
    return resolveGrid(
      element,
      repeated,
      box,
      context,
      "item",
      `${context.sourcePath ?? context.path}.item`,
      element,
    );
  }

  return layoutNode(element, element, box, context, true);
}

function resolveContainer(
  element: ContainerElement,
  box: ElementBox,
  context: LayoutContext,
): ResolvedLayoutNode {
  if (!element.child) {
    return layoutNode(element, element, box, context, containerPaintable(element));
  }

  const content = paddedBox(box, element.padding);
  const childBox =
    element.child.type === "group"
      ? relativeChildBox(element.child, content)
      : alignChildBox(
          element.child,
          content,
          element.alignment?.horizontal ?? "left",
          element.alignment?.vertical ?? "top",
        );
  const childMode = hasExplicitFrame(element.child) ? "absolute" : "flow";
  const childTransform = childTransformFor(context, box, element.rotation);
  const child = resolveElementLayoutTree(element.child, {
    rootIndex: context.rootIndex,
    path: `${context.path}.child`,
    sourcePath: `${context.sourcePath ?? context.path}.child`,
    parentPath: context.path,
    depth: context.depth + 1,
    mode: childMode,
    forcedBox: childBox,
    transform: childTransform,
  });

  return layoutNode(element, element, box, context, containerPaintable(element), [
    child,
  ]);
}

function resolveGroup(
  element: GroupElement,
  box: ElementBox,
  context: LayoutContext,
): ResolvedLayoutNode {
  const childTransform = childTransformFor(context, box, element.rotation);
  const children = element.children.map((child, index) =>
    resolveElementLayoutTree(child, {
      rootIndex: context.rootIndex,
      path: `${context.path}.children.${index}`,
      sourcePath: `${context.sourcePath ?? context.path}.children.${index}`,
      parentPath: context.path,
      depth: context.depth + 1,
      mode: "absolute",
      forcedBox: relativeChildBox(child, box),
      transform: childTransform,
    }),
  );
  return layoutNode(element, element, box, context, false, children);
}

function resolveFlex(
  element: FlexLike,
  children: SlideElement[],
  box: ElementBox,
  context: LayoutContext,
  pathSegment = "children",
  sourcePathBase?: string,
  sourceElement?: SlideElement,
): ResolvedLayoutNode {
  const source = sourceElement ?? (element as SlideElement);
  const childTransform = childTransformFor(context, box, source.rotation);
  const content = paddedBox(box, element.padding);
  const flowChildren = children.map((child, index) => ({ child, index }));
  const boxes = flexBoxes(element, flowChildren.map(({ child }) => child), content);

  const resolvedChildren = [
    ...flowChildren.map(({ child, index }, flowIndex) =>
      resolveElementLayoutTree(child, {
        rootIndex: context.rootIndex,
        path: `${context.path}.${pathSegment}.${index}`,
        sourcePath:
          sourcePathBase ??
          `${context.sourcePath ?? context.path}.${pathSegment}.${index}`,
        parentPath: context.path,
        depth: context.depth + 1,
        mode: "flow",
        forcedBox: boxes[flowIndex] ?? content,
        transform: childTransform,
      }),
    ),
  ];

  return layoutNode(source, source, box, context, false, resolvedChildren);
}

function resolveGrid(
  element: GridLike,
  children: SlideElement[],
  box: ElementBox,
  context: LayoutContext,
  pathSegment = "children",
  sourcePathBase?: string,
  sourceElement?: SlideElement,
): ResolvedLayoutNode {
  const source = sourceElement ?? (element as SlideElement);
  const childTransform = childTransformFor(context, box, source.rotation);
  const content = paddedBox(box, element.padding);
  const flowChildren = children.map((child, index) => ({ child, index }));
  const boxes = gridBoxes(element, flowChildren.map(({ child }) => child), content);

  const resolvedChildren = [
    ...flowChildren.map(({ child, index }, flowIndex) =>
      resolveElementLayoutTree(child, {
        rootIndex: context.rootIndex,
        path: `${context.path}.${pathSegment}.${index}`,
        sourcePath:
          sourcePathBase ??
          `${context.sourcePath ?? context.path}.${pathSegment}.${index}`,
        parentPath: context.path,
        depth: context.depth + 1,
        mode: "flow",
        forcedBox: boxes[flowIndex] ?? content,
        transform: childTransform,
      }),
    ),
  ];

  return layoutNode(source, source, box, context, false, resolvedChildren);
}

function flexBoxes(
  element: FlexLike,
  children: SlideElement[],
  box: ElementBox,
): ElementBox[] {
  if (children.length === 0) return [];

  const direction = element.direction ?? "row";
  const mainSize = direction === "row" ? box.w : box.h;
  const crossSize = direction === "row" ? box.h : box.w;
  const mainGap = direction === "row"
    ? element.columnGap ?? element.gap ?? 0
    : element.rowGap ?? element.gap ?? 0;
  const crossGap = direction === "row"
    ? element.rowGap ?? element.gap ?? 0
    : element.columnGap ?? element.gap ?? 0;

  const bases = children.map((child) =>
    flexBasis(child, direction, crossSize),
  );

  if (element.wrap) {
    return wrappedFlexBoxes({
      alignItems: element.alignItems ?? "stretch",
      box,
      bases,
      children,
      crossGap,
      crossSize,
      direction,
      justifyContent: element.justifyContent ?? "flex-start",
      mainGap,
      mainSize,
    });
  }

  const gapTotal = mainGap * Math.max(0, children.length - 1);
  const availableMain = Math.max(0.01, mainSize - gapTotal);
  let sizes = bases.map((basis) => (basis > 0 ? basis : 0));
  const usedMain = sizes.reduce((sum, size) => sum + size, 0);
  const free = availableMain - usedMain;
  const grows = children.map((child, index) =>
    child.layout?.grow ?? (bases[index] > 0 ? 0 : 1),
  );
  const growTotal = grows.reduce((sum, grow) => sum + grow, 0);

  if (free > 0 && growTotal > 0) {
    sizes = sizes.map((size, index) => size + (free * grows[index]) / growTotal);
  } else if (
    free > 0 &&
    element.justifyContent === "stretch" &&
    children.length > 0
  ) {
    sizes = sizes.map((size) => size + free / children.length);
  } else if (free < 0) {
    const shrinks = children.map((child) => child.layout?.shrink ?? 1);
    const scaledShrinks = shrinks.map((shrink, index) => shrink * sizes[index]);
    const shrinkTotal = scaledShrinks.reduce((sum, shrink) => sum + shrink, 0);
    if (shrinkTotal > 0) {
      sizes = sizes.map((size, index) =>
        Math.max(0.01, size + (free * scaledShrinks[index]) / shrinkTotal),
      );
    }
  }

  const finalUsed =
    sizes.reduce((sum, size) => sum + size, 0) +
    mainGap * Math.max(0, children.length - 1);
  let cursor = mainOffset(element.justifyContent ?? "flex-start", mainSize, finalUsed);

  return children.map((child, index) => {
    const main = clampMainSize(sizes[index], child, direction);
    const cross = childCrossSize(
      child,
      direction,
      crossSize,
      element.alignItems ?? "stretch",
    );
    const crossOffset = alignmentOffset(
      child.layout?.alignSelf ?? element.alignItems ?? "stretch",
      crossSize,
      cross,
    );
    const placed = flexPlacedBox(box, direction, cursor, main, crossOffset, cross);
    cursor += main + mainGap;
    return placed;
  });
}

function flexBasis(
  child: SlideElement,
  direction: FlexDirection,
  crossSize: number,
) {
  const explicit =
    child.layout?.basis ??
    (direction === "row" ? child.size?.width : child.size?.height);
  if (explicit != null && explicit > 0) {
    return clampMainSize(explicit, child, direction);
  }

  const intrinsic = intrinsicMainSize(child, direction, crossSize);
  return intrinsic > 0 ? clampMainSize(intrinsic, child, direction) : 0;
}

function intrinsicMainSize(
  child: SlideElement,
  direction: FlexDirection,
  crossSize: number,
) {
  if (isFrameLessDecorativeShape(child)) return DECORATIVE_LINE_THICKNESS;
  if (child.type === "text") {
    return intrinsicTextMainSize(child, direction, crossSize);
  }
  return 0;
}

function intrinsicTextMainSize(
  child: Extract<SlideElement, { type: "text" }>,
  direction: FlexDirection,
  crossSize: number,
) {
  const font = elementFont(child);
  const text = renderMarkdownTextContent(child.runs);
  const lineHeight = (font.size / 72) * (font.lineHeight ?? 1.15);
  if (direction === "row") {
    return Math.max(0.1, text.length * (font.size / 72) * TEXT_AVERAGE_CHAR_EM);
  }

  const width = Math.max(0.1, child.size?.width ?? crossSize);
  const measured = measureTextHeightInches({
    text,
    fontFace: font.family,
    fontSize: font.size,
    bold: font.bold,
    italic: font.italic,
    lineHeight: font.lineHeight,
    charSpacing: font.letterSpacing,
    wrap: font.wrap,
    w: width,
  });
  if (measured != null) return measured;

  const averageCharWidth = Math.max(
    0.01,
    (font.size / 72) * TEXT_AVERAGE_CHAR_EM,
  );
  const charsPerLine = Math.max(1, Math.floor(width / averageCharWidth));
  const lines = text
    .split("\n")
    .reduce(
      (count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)),
      0,
    );
  return Math.max(0.01, lines * lineHeight);
}

function wrappedFlexBoxes({
  alignItems,
  bases,
  box,
  children,
  crossGap,
  crossSize,
  direction,
  justifyContent,
  mainGap,
  mainSize,
}: {
  alignItems: LayoutAlignment;
  bases: number[];
  box: ElementBox;
  children: SlideElement[];
  crossGap: number;
  crossSize: number;
  direction: FlexDirection;
  justifyContent: LayoutAlignment;
  mainGap: number;
  mainSize: number;
}): ElementBox[] {
  const lines: Array<Array<{ child: SlideElement; index: number; main: number }>> = [];
  let current: Array<{ child: SlideElement; index: number; main: number }> = [];
  let currentMain = 0;

  children.forEach((child, index) => {
    const main = bases[index] > 0 ? bases[index] : mainSize;
    const nextMain = currentMain + (current.length > 0 ? mainGap : 0) + main;
    if (current.length > 0 && nextMain > mainSize) {
      lines.push(current);
      current = [];
      currentMain = 0;
    }
    current.push({ child, index, main });
    currentMain += (current.length > 1 ? mainGap : 0) + main;
  });
  if (current.length > 0) lines.push(current);

  const lineCrosses = lines.map((line) =>
    Math.max(
      0.01,
      ...line.map(({ child }) =>
        childCrossSize(child, direction, crossSize, alignItems),
      ),
    ),
  );
  const totalCross =
    lineCrosses.reduce((sum, size) => sum + size, 0) +
    crossGap * Math.max(0, lineCrosses.length - 1);
  let crossCursor = alignmentOffset("center", crossSize, Math.min(crossSize, totalCross));
  const result: ElementBox[] = [];

  lines.forEach((line, lineIndex) => {
    const lineUsed =
      line.reduce((sum, item) => sum + item.main, 0) +
      mainGap * Math.max(0, line.length - 1);
    let mainCursor = mainOffset(justifyContent, mainSize, lineUsed);
    const lineCross = lineCrosses[lineIndex];

    line.forEach(({ child, index, main }) => {
      const cross = childCrossSize(child, direction, lineCross, alignItems);
      const crossOffset =
        crossCursor +
        alignmentOffset(child.layout?.alignSelf ?? alignItems, lineCross, cross);
      result[index] = flexPlacedBox(
        box,
        direction,
        mainCursor,
        main,
        crossOffset,
        cross,
      );
      mainCursor += main + mainGap;
    });

    crossCursor += lineCross + crossGap;
  });

  return result;
}

function gridBoxes(
  element: GridLike,
  children: SlideElement[],
  box: ElementBox,
): ElementBox[] {
  if (children.length === 0) return [];

  const columns = Math.max(1, Math.trunc(element.columns));
  const columnGap = element.columnGap ?? element.gap ?? 0;
  const rowGap = element.rowGap ?? element.gap ?? 0;
  const placements = placeGridChildren(children, columns, element.rows ?? null);
  const rows = Math.max(
    element.rows ?? 1,
    ...placements.map((placement) => placement.row + placement.rowSpan),
  );
  const cellW = Math.max(0.01, (box.w - columnGap * (columns - 1)) / columns);
  const cellH = Math.max(0.01, (box.h - rowGap * Math.max(0, rows - 1)) / rows);

  return placements.map((placement, index) => {
    const child = children[index];
    const area: ElementBox = {
      x: box.x + placement.col * (cellW + columnGap),
      y: box.y + placement.row * (cellH + rowGap),
      w: cellW * placement.columnSpan + columnGap * (placement.columnSpan - 1),
      h: cellH * placement.rowSpan + rowGap * (placement.rowSpan - 1),
    };
    const justify = child.layout?.alignSelf ?? element.justifyItems ?? "stretch";
    const align = child.layout?.alignSelf ?? element.alignItems ?? "stretch";
    const childW =
      justify === "stretch"
        ? area.w
        : clampSize(child.size?.width ?? area.w, child, "width");
    const childH =
      align === "stretch"
        ? area.h
        : clampSize(child.size?.height ?? area.h, child, "height");
    return {
      x: area.x + alignmentOffset(justify, area.w, childW),
      y: area.y + alignmentOffset(align, area.h, childH),
      w: childW,
      h: childH,
    };
  });
}

function placeGridChildren(
  children: SlideElement[],
  columns: number,
  declaredRows: number | null,
) {
  const occupied = new Set<string>();
  const placements: Array<{
    col: number;
    row: number;
    columnSpan: number;
    rowSpan: number;
  }> = [];
  let rowLimit = Math.max(1, declaredRows ?? Math.ceil(children.length / columns));

  children.forEach((child) => {
    const columnSpan = Math.min(
      columns,
      Math.max(1, Math.trunc(child.layout?.columnSpan ?? 1)),
    );
    const rowSpan = Math.max(1, Math.trunc(child.layout?.rowSpan ?? 1));
    let row = 0;
    let col = 0;

    while (true) {
      let placed = false;
      for (row = 0; row < rowLimit && !placed; row += 1) {
        for (col = 0; col <= columns - columnSpan; col += 1) {
          if (gridAreaOpen(occupied, row, col, rowSpan, columnSpan)) {
            placed = true;
            break;
          }
        }
      }
      if (placed) {
        row -= 1;
        break;
      }
      rowLimit += 1;
    }

    markGridArea(occupied, row, col, rowSpan, columnSpan);
    placements.push({ col, row, columnSpan, rowSpan });
  });

  return placements;
}

function gridAreaOpen(
  occupied: Set<string>,
  row: number,
  col: number,
  rowSpan: number,
  columnSpan: number,
) {
  for (let r = row; r < row + rowSpan; r += 1) {
    for (let c = col; c < col + columnSpan; c += 1) {
      if (occupied.has(`${r}:${c}`)) return false;
    }
  }
  return true;
}

function markGridArea(
  occupied: Set<string>,
  row: number,
  col: number,
  rowSpan: number,
  columnSpan: number,
) {
  for (let r = row; r < row + rowSpan; r += 1) {
    for (let c = col; c < col + columnSpan; c += 1) {
      occupied.add(`${r}:${c}`);
    }
  }
}

function layoutNode(
  element: SlideElement,
  source: SlideElement,
  box: ElementBox,
  context: LayoutContext,
  paintable: boolean,
  children: ResolvedLayoutNode[] = [],
): ResolvedLayoutNode {
  const normalized = normalizeBox(box);
  const transformed = transformBox(normalized, contextTransform(context));
  return {
    element: cloneElementWithBox(
      element,
      transformed,
      contextTransform(context).rotation,
    ),
    source,
    sourcePath: context.sourcePath ?? context.path,
    rootIndex: context.rootIndex,
    path: context.path,
    parentPath: context.parentPath,
    depth: context.depth,
    mode: context.mode ?? "absolute",
    box: transformed,
    frame: boxToFrame(transformed),
    paintable,
    children,
  };
}

export function flattenResolvedLayoutTree(
  nodes: ResolvedLayoutNode[],
): ResolvedLayoutItem[] {
  return nodes.flatMap(flattenResolvedLayoutNode);
}

export function flattenResolvedLayoutNode(
  node: ResolvedLayoutNode,
): ResolvedLayoutItem[] {
  return [
    ...(node.paintable ? [node] : []),
    ...node.children.flatMap(flattenResolvedLayoutNode),
  ];
}

function containerPaintable(element: ContainerElement) {
  return Boolean(
    element.fill ||
      element.stroke ||
      element.borderRadius ||
      element.shadow ||
      element.opacity != null,
  );
}

function cloneElementWithBox<T extends SlideElement>(
  element: T,
  box: ElementBox,
  inheritedRotation = 0,
): T {
  const next = {
    ...element,
    ...boxToPositionSize(normalizeBox(box)),
  } as T;
  if (element.rotation != null || inheritedRotation !== 0) {
    next.rotation = normalizeRotation((element.rotation ?? 0) + inheritedRotation);
  }
  return next;
}

function contextTransform(context: LayoutContext) {
  return context.transform ?? IDENTITY_TRANSFORM;
}

function childTransformFor(
  context: LayoutContext,
  box: ElementBox,
  rotation: number | null | undefined,
) {
  return rotateAroundBox(contextTransform(context), box, rotation ?? 0);
}

function rotateAroundBox(
  transform: LayoutTransform,
  box: ElementBox,
  degrees: number,
): LayoutTransform {
  if (!degrees) return transform;
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const originX = box.x;
  const originY = box.y;
  const rotation: LayoutTransform = {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: originX - cos * originX + sin * originY,
    f: originY - sin * originX - cos * originY,
    rotation: degrees,
  };
  return multiplyTransforms(transform, rotation);
}

function multiplyTransforms(
  left: LayoutTransform,
  right: LayoutTransform,
): LayoutTransform {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
    rotation: normalizeRotation(left.rotation + right.rotation),
  };
}

function transformBox(box: ElementBox, transform: LayoutTransform): ElementBox {
  const point = transformPoint(transform, box.x, box.y);
  return normalizeBox({
    x: point.x,
    y: point.y,
    w: box.w,
    h: box.h,
  });
}

function transformPoint(transform: LayoutTransform, x: number, y: number) {
  return {
    x: transform.a * x + transform.c * y + transform.e,
    y: transform.b * x + transform.d * y + transform.f,
  };
}

function normalizeRotation(rotation: number) {
  const normalized = ((((rotation + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function boxToFrame(box: ElementBox): LayoutFrame {
  return {
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
  };
}

function hasExplicitFrame(element: SlideElement) {
  return element.position != null || element.size != null;
}

function paddedBox(box: ElementBox, padding: Padding | null | undefined) {
  const p = padding ?? ZERO_PADDING;
  return normalizeBox({
    x: box.x + p.left,
    y: box.y + p.top,
    w: box.w - p.left - p.right,
    h: box.h - p.top - p.bottom,
  });
}

function relativeChildBox(child: SlideElement, parent: ElementBox): ElementBox {
  return normalizeBox({
    x: parent.x + (child.position?.x ?? 0),
    y: parent.y + (child.position?.y ?? 0),
    w: child.size?.width ?? parent.w,
    h: child.size?.height ?? parent.h,
  });
}

function alignChildBox(
  child: SlideElement,
  parent: ElementBox,
  horizontal: "left" | "center" | "right",
  vertical: "top" | "middle" | "bottom",
): ElementBox {
  const w = child.size?.width ?? parent.w;
  const h = child.size?.height ?? parent.h;
  const x =
    horizontal === "center"
      ? parent.x + (parent.w - w) / 2
      : horizontal === "right"
        ? parent.x + parent.w - w
        : parent.x + (child.position?.x ?? 0);
  const y =
    vertical === "middle"
      ? parent.y + (parent.h - h) / 2
      : vertical === "bottom"
        ? parent.y + parent.h - h
        : parent.y + (child.position?.y ?? 0);
  return normalizeBox({ x, y, w, h });
}

function childCrossSize(
  child: SlideElement,
  direction: FlexDirection,
  crossSize: number,
  alignItems: LayoutAlignment,
) {
  if (isFrameLessDecorativeShape(child)) {
    return clampSize(
      Math.min(crossSize, DECORATIVE_LINE_LENGTH),
      child,
      direction === "row" ? "height" : "width",
    );
  }

  if (alignItems === "stretch" && child.layout?.alignSelf == null) {
    return crossSize;
  }
  const value = direction === "row" ? child.size?.height : child.size?.width;
  return clampSize(value ?? crossSize, child, direction === "row" ? "height" : "width");
}

function isFrameLessDecorativeShape(child: SlideElement) {
  if (child.position != null || child.size != null) return false;
  return child.type === "rectangle" || child.type === "ellipse" || child.type === "line";
}

function flexPlacedBox(
  box: ElementBox,
  direction: FlexDirection,
  mainOffsetValue: number,
  mainSize: number,
  crossOffset: number,
  crossSize: number,
): ElementBox {
  return direction === "row"
    ? normalizeBox({
        x: box.x + mainOffsetValue,
        y: box.y + crossOffset,
        w: mainSize,
        h: crossSize,
      })
    : normalizeBox({
        x: box.x + crossOffset,
        y: box.y + mainOffsetValue,
        w: crossSize,
        h: mainSize,
      });
}

function mainOffset(
  alignment: LayoutAlignment,
  available: number,
  used: number,
) {
  const free = Math.max(0, available - used);
  if (alignment === "flex-end") return free;
  if (alignment === "center") return free / 2;
  return 0;
}

function alignmentOffset(
  alignment: LayoutAlignment,
  available: number,
  used: number,
) {
  if (alignment === "flex-end") return Math.max(0, available - used);
  if (alignment === "center") return Math.max(0, (available - used) / 2);
  return 0;
}

function clampMainSize(
  size: number,
  child: SlideElement,
  direction: FlexDirection,
) {
  return clampSize(size, child, direction === "row" ? "width" : "height");
}

function clampSize(
  size: number,
  child: SlideElement,
  dimension: "width" | "height",
) {
  const layout = child.layout;
  const min = dimension === "width" ? layout?.minWidth : layout?.minHeight;
  const max = dimension === "width" ? layout?.maxWidth : layout?.maxHeight;
  return Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? 0.01, size));
}

function normalizeBox(box: ElementBox): ElementBox {
  return {
    // Preserve off-slide positions so bleed elements are clipped at the slide
    // edge instead of being shifted into the visible canvas.
    x: finiteOr(box.x, 0),
    y: finiteOr(box.y, 0),
    w: clampFinite(box.w, 0.01, SLIDE_W),
    h: clampFinite(box.h, 0.01, SLIDE_H),
  };
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clampFinite(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
