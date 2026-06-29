/* eslint-disable @next/next/no-img-element */
import React from "react";
import {
  type TemplateV2Layout as EditorTemplateV2Layout,
  withEqualTemplateV2FlowChildSizes,
} from "@/components/slide-editor/lib/template-v2-import";
import { resolveBackendAssetUrl } from "@/utils/api";
import { TemplateV2KonvaSlide } from "../../../components/TemplateV2KonvaSlide";
import {
  TemplateV2Component,
  TemplateV2Element,
  TemplateV2Layout,
  TemplateV2TextRun,
} from "../../types";

type RenderMode = "absolute" | "flow";
type Box = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

function hashKey(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function layoutElementKey(element: TemplateV2Element) {
  const record = element as Record<string, unknown>;
  const explicitKey =
    readString(record.name) ??
    readString(record.component_instance_id) ??
    readString(record.component_instance_id) ??
    readString(record.component_id) ??
    readString(record.component_id) ??
    readString(record.component_slot) ??
    readString(record.component_slot);
  return explicitKey ?? `${readString(record.type) ?? "element"}-${hashKey(JSON.stringify(element))}`;
}

function tableCellKey(cell: unknown) {
  return hashKey(JSON.stringify(cell));
}

function tableRowKey(row: unknown) {
  return hashKey(JSON.stringify(row));
}

interface TemplateV2LayoutPreviewProps {
  layout: TemplateV2Layout;
  slideDisplayRef?: React.RefObject<HTMLDivElement | null>;
  useKonvaRenderer?: boolean;
}

export const TemplateV2LayoutPreview: React.FC<TemplateV2LayoutPreviewProps> = ({
  layout,
  slideDisplayRef,
  useKonvaRenderer = true,
}) => {
  if (useKonvaRenderer) {
    return (
      <div
        ref={slideDisplayRef}
        className="relative mx-auto h-[720px] w-[1280px] select-none overflow-hidden bg-white"
      >
        <TemplateV2KonvaSlide
          layout={layout as EditorTemplateV2Layout}
          isEditMode={false}
          slideId={null}
          slideIndex={0}
        />
      </div>
    );
  }

  const elements = getLayoutElements(layout);

  return (
    <div
      ref={slideDisplayRef}
      className="relative mx-auto h-[720px] w-[1280px] overflow-hidden bg-white"
    >
      {elements.map((element) =>
        renderElement(element, `layout-element-${layoutElementKey(element)}`, "absolute")
      )}
    </div>
  );
};

function getLayoutElements(layout: TemplateV2Layout): TemplateV2Element[] {
  if (Array.isArray(layout.elements) && layout.elements.length > 0) {
    return layout.elements;
  }

  return (layout.components ?? [])
    .map(componentToGroup)
    .filter((element): element is TemplateV2Element => Boolean(element));
}

function componentToGroup(component: TemplateV2Component): TemplateV2Element | null {
  const children = Array.isArray(component.elements) ? component.elements : [];
  if (children.length === 0) return null;

  return {
    ...component,
    type: "group",
    children,
  };
}

function renderElement(
  element: TemplateV2Element | null | undefined,
  key: string,
  mode: RenderMode
): React.ReactNode {
  if (!element || typeof element !== "object") return null;

  switch (element.type) {
    case "rectangle":
      return renderRectangle(element, key, mode);
    case "image":
      return renderImage(element, key, mode);
    case "text":
      return renderText(element, key, mode);
    case "text-list":
      return renderTextList(element, key, mode);
    case "table":
      return renderTable(element, key, mode);
    case "container":
      return renderContainer(element, key, mode);
    case "flex":
      return renderFlex(element, key, mode);
    case "grid":
      return renderGrid(element, key, mode);
    case "group":
      return renderGroup(element, key, mode);
    default:
      if (Array.isArray(element.children)) {
        return renderGroup(element, key, mode);
      }
      if (element.child) {
        return renderContainer(element, key, mode);
      }
      return null;
  }
}

function renderRectangle(
  element: TemplateV2Element,
  key: string,
  mode: RenderMode
) {
  return (
    <div
      key={key}
      style={{
        ...frameStyle(element, mode),
        ...boxStyle(element),
      }}
    />
  );
}

function renderImage(element: TemplateV2Element, key: string, mode: RenderMode) {
  const src = typeof element.data === "string" ? element.data.trim() : "";
  if (!src) return null;
  const color = readString(element.color);
  const resolvedSrc = resolveBackendAssetUrl(src);
  const borderRadius = borderRadiusPx(readRecord(element.border_radius));
  const fit = imageFit(element.fit);
  const objectPosition = imageObjectPosition(element);
  const flipH = readBoolean(element.flip_h);
  const flipV = readBoolean(element.flip_v);
  const transform = imageFlipTransform(flipH, flipV);

  return (
    <div
      key={key}
      style={{
        ...frameStyle(element, mode),
        borderRadius,
        overflow: "hidden",
      }}
    >
      <img
        alt=""
        draggable={false}
        src={resolvedSrc}
        style={{
          display: "block",
          height: "100%",
          objectFit: fit,
          objectPosition,
          transform,
          width: "100%",
        }}
      />
      {color ? (
        <div
          aria-hidden="true"
          style={{
            backgroundColor: color,
            inset: 0,
            maskImage: `url(${resolvedSrc})`,
            maskPosition: objectPosition ?? "center",
            maskRepeat: "no-repeat",
            maskSize: fit === "fill" ? "100% 100%" : fit,
            pointerEvents: "none",
            position: "absolute",
            transform,
            WebkitMaskImage: `url(${resolvedSrc})`,
            WebkitMaskPosition: objectPosition ?? "center",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskSize: fit === "fill" ? "100% 100%" : fit,
          }}
        />
      ) : null}
    </div>
  );
}

function renderText(element: TemplateV2Element, key: string, mode: RenderMode) {
  const runs = readTextRuns(element);
  const alignment = readRecord(element.alignment);
  const horizontal = readString(alignment.horizontal);
  const vertical = readString(alignment.vertical);

  return (
    <div
      key={key}
      style={{
        ...frameStyle(element, mode),
        ...fontStyle(element.font),
        alignItems: verticalAlign(vertical),
        display: "flex",
        justifyContent: horizontalAlign(horizontal),
        lineHeight: readLineHeight(element.font) ?? 1.1,
        overflow: "hidden",
        textAlign: textAlign(horizontal),
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      <span style={{ width: "100%" }}>
        {runs.map((run) => (
          <span
            key={`${key}-run-${hashKey(JSON.stringify(run))}`}
            style={fontStyle({ ...(element.font ?? {}), ...(run.font ?? {}) })}
          >
            {run.text ?? ""}
          </span>
        ))}
      </span>
    </div>
  );
}

function renderTextList(
  element: TemplateV2Element,
  key: string,
  mode: RenderMode
) {
  const marker = readString(element.marker);
  const items = Array.isArray(element.items) ? element.items : [];
  const ListTag = marker === "number" ? "ol" : "ul";

  return (
    <div
      key={key}
      style={{
        ...frameStyle(element, mode),
        ...fontStyle(element.font),
        overflow: "hidden",
      }}
    >
      <ListTag
        style={{
          listStyleType: marker === "none" ? "none" : undefined,
          margin: 0,
          paddingLeft: marker === "none" ? 0 : 24,
        }}
      >
        {items.map((item, itemIndex) => {
          const runs = readTextListItemRuns(item);
          return (
            <li key={`${key}-item-${itemIndex}`}>
              {runs.map((run, runIndex) => (
                <span
                  key={`${key}-item-${itemIndex}-run-${runIndex}`}
                  style={fontStyle({ ...(element.font ?? {}), ...(run.font ?? {}) })}
                >
                  {run.text ?? ""}
                </span>
              ))}
            </li>
          );
        })}
      </ListTag>
    </div>
  );
}

function readTextListItemRuns(item: unknown): TemplateV2TextRun[] {
  if (Array.isArray(item)) {
    return item.filter((run): run is TemplateV2TextRun => Boolean(readRecord(run).text));
  }

  const record = readRecord(item);
  const text = readString(record.text) ?? readString(item);
  if (!text) return [];

  return [
    {
      text,
      font: readRecord(record.font) as TemplateV2TextRun["font"],
    },
  ];
}

function renderTable(element: TemplateV2Element, key: string, mode: RenderMode) {
  const columns = Array.isArray(element.columns) ? element.columns : [];
  const rows = Array.isArray(element.rows) ? element.rows : [];

  return (
    <div
      key={key}
      style={{
        ...frameStyle(element, mode),
        overflow: "hidden",
      }}
    >
      <table
        style={{
          borderCollapse: "collapse",
          height: "100%",
          tableLayout: "fixed",
          width: "100%",
        }}
      >
        {columns.length > 0 && (
          <thead>
            <tr>
              {columns.map((cell) => (
                <th key={`${key}-head-${tableCellKey(cell)}`} style={tableCellStyle(cell, true)}>
                  {readCellText(cell)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row) => (
            <tr key={`${key}-row-${tableRowKey(row)}`}>
              {(Array.isArray(row) ? row : []).map((cell) => (
                <td
                  key={`${key}-cell-${tableCellKey(cell)}`}
                  style={tableCellStyle(cell, false)}
                >
                  {readCellText(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderContainer(
  element: TemplateV2Element,
  key: string,
  mode: RenderMode
) {
  const padding = paddingStyle(readRecord(element.padding));
  const fallbackSize = containerFallbackSize(element);
  const childMode = element.child?.position ? "absolute" : "flow";

  return (
    <div
      key={key}
      style={{
        ...frameStyle(element, mode, fallbackSize),
        ...boxStyle(element),
        ...padding,
        alignItems: verticalAlign(readString(readRecord(element.alignment).vertical)),
        display: "flex",
        justifyContent: horizontalAlign(readString(readRecord(element.alignment).horizontal)),
        overflow: "hidden",
      }}
    >
      {renderElement(element.child, `${key}-child`, childMode)}
    </div>
  );
}

function containerFallbackSize(element: TemplateV2Element) {
  const child = element.child;
  if (!child) return undefined;

  const childFallback = Array.isArray(child.children)
    ? childrenBounds(child.children)
    : undefined;
  const childBox = readBox(child, childFallback);
  const padding = readRecord(element.padding);
  return {
    width:
      childBox.x +
      (childBox.width ?? 1) +
      (readNumber(padding.left) ?? 0) +
      (readNumber(padding.right) ?? 0),
    height:
      childBox.y +
      (childBox.height ?? 1) +
      (readNumber(padding.top) ?? 0) +
      (readNumber(padding.bottom) ?? 0),
  };
}

function renderFlex(element: TemplateV2Element, key: string, mode: RenderMode) {
  const direction = readString(element.direction) === "row" ? "row" : "column";
  const children = withEqualTemplateV2FlowChildSizes(
    element as Record<string, unknown>,
  ) as TemplateV2Element[];

  return (
    <div
      key={key}
      style={{
        ...frameStyle(element, mode),
        ...boxStyle(element),
        alignItems: cssAlignment(readString(element.align_items), "stretch"),
        display: "flex",
        flexDirection: direction,
        flexWrap: readBoolean(element.wrap) ? "wrap" : "nowrap",
        gap: px(readNumber(element.gap) ?? 0),
        justifyContent: cssAlignment(readString(element.justify_content), "flex-start"),
        overflow: "hidden",
      }}
    >
      {children.map((child) =>
        renderElement(child, `${key}-child-${layoutElementKey(child)}`, "flow")
      )}
    </div>
  );
}

function renderGrid(element: TemplateV2Element, key: string, mode: RenderMode) {
  const columns = Math.max(1, Math.floor(readNumber(element.columns) ?? 1));
  const rows = readNumber(element.rows);
  const children = withEqualTemplateV2FlowChildSizes(
    element as Record<string, unknown>,
  ) as TemplateV2Element[];

  return (
    <div
      key={key}
      style={{
        ...frameStyle(element, mode),
        ...boxStyle(element),
        alignItems: cssAlignment(readString(element.align_items), "stretch"),
        columnGap: px(readNumber(element.column_gap) ?? readNumber(element.gap) ?? 0),
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridTemplateRows: rows ? `repeat(${Math.max(1, Math.floor(rows))}, minmax(0, 1fr))` : undefined,
        justifyItems: cssAlignment(readString(element.justify_items), "stretch"),
        overflow: "hidden",
        rowGap: px(readNumber(element.row_gap) ?? readNumber(element.gap) ?? 0),
      }}
    >
      {children.map((child) =>
        renderElement(child, `${key}-child-${layoutElementKey(child)}`, "flow")
      )}
    </div>
  );
}

function renderGroup(element: TemplateV2Element, key: string, mode: RenderMode) {
  const children: TemplateV2Element[] = Array.isArray(element.children)
    ? element.children
    : [];
  return (
    <div
      key={key}
      style={{
        ...frameStyle(element, mode, childrenBounds(children)),
        ...boxStyle(element),
        overflow: "visible",
      }}
    >
      {children.map((child) =>
        renderElement(child, `${key}-child-${layoutElementKey(child)}`, "absolute")
      )}
    </div>
  );
}

function frameStyle(
  element: TemplateV2Element,
  mode: RenderMode,
  fallbackSize?: { width: number; height: number }
): React.CSSProperties {
  const box = readBox(element, fallbackSize);
  const style: React.CSSProperties = {
    boxSizing: "border-box",
    minHeight: 0,
    minWidth: 0,
    position: mode === "absolute" ? "absolute" : "relative",
  };

  if (mode === "absolute") {
    style.left = px(box.x);
    style.top = px(box.y);
  }

  if (box.width != null) style.width = px(box.width);
  if (box.height != null) style.height = px(box.height);

  return style;
}

function readBox(
  element: TemplateV2Element,
  fallbackSize?: { width: number; height: number }
): Box {
  const position = readRecord(element.position);
  const size = readRecord(element.size);
  return {
    x: readNumber(position.x) ?? 0,
    y: readNumber(position.y) ?? 0,
    width: readNumber(size.width) ?? fallbackSize?.width,
    height: readNumber(size.height) ?? fallbackSize?.height,
  };
}

function childrenBounds(children: TemplateV2Element[]): { width: number; height: number } {
  if (!children.length) return { width: 1, height: 1 };

  return children.reduce<{ width: number; height: number }>(
    (bounds, child) => {
      const box = readBox(child);
      return {
        width: Math.max(bounds.width, box.x + (box.width ?? 1)),
        height: Math.max(bounds.height, box.y + (box.height ?? 1)),
      };
    },
    { width: 1, height: 1 }
  );
}

function boxStyle(element: TemplateV2Element): React.CSSProperties {
  const fill = readRecord(element.fill);
  const stroke = readRecord(element.stroke);
  const shadow = readRecord(element.shadow);
  const borderRadius = readRecord(element.border_radius);
  const fillColor = readString(fill.color);
  const strokeColor = readString(stroke.color);
  const strokeWidth = readNumber(stroke.width);
  const shadowOpacity = readNumber(shadow.opacity) ?? 0;
  const shadowColor = readString(shadow.color) ?? "#000000";
  const offsetX = readNumber(shadow.offset_x ?? shadow.offset_x) ?? 0;
  const offsetY = readNumber(shadow.offset_y ?? shadow.offset_y) ?? 0;
  const blur = readNumber(shadow.blur) ?? 0;

  return {
    backgroundColor: fillColor ?? undefined,
    border: strokeColor || strokeWidth
      ? `${strokeWidth ?? 1}px solid ${strokeColor ?? "transparent"}`
      : undefined,
    borderRadius: borderRadiusPx(borderRadius),
    boxShadow: shadowOpacity > 0
      ? `${px(offsetX)} ${px(offsetY)} ${px(blur)} rgba(${hexToRgb(shadowColor)}, ${shadowOpacity})`
      : undefined,
    opacity: readNumber(fill.opacity) ?? undefined,
  };
}

function tableCellStyle(cell: unknown, isHeader: boolean): React.CSSProperties {
  const record = readRecord(cell);
  const text = readRecord(record.text);
  return {
    ...fontStyle(text.font as TemplateV2Element["font"]),
    border: "1px solid rgba(8, 35, 20, 0.18)",
    fontWeight: isHeader ? 700 : fontStyle(text.font as TemplateV2Element["font"]).fontWeight,
    overflow: "hidden",
    padding: "4px 6px",
    textAlign: "left",
    verticalAlign: "middle",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };
}

function readCellText(cell: unknown) {
  const record = readRecord(cell);
  const text = readRecord(record.text);
  return readString(text.text) ?? "";
}

function readTextRuns(element: TemplateV2Element): TemplateV2TextRun[] {
  if (Array.isArray(element.runs) && element.runs.length > 0) {
    return element.runs;
  }
  return [{ text: element.text ?? "" }];
}

function fontStyle(font: TemplateV2Element["font"]): React.CSSProperties {
  const record = readRecord(font);
  const size = readNumber(record.size);
  return {
    color: readString(record.color) ?? "#111827",
    fontFamily: readString(record.family) ?? undefined,
    fontSize: size ? px(size) : undefined,
    fontStyle: readBoolean(record.italic) ? "italic" : undefined,
    fontWeight: readBoolean(record.bold) ? 700 : undefined,
    lineHeight: readLineHeight(font) ?? undefined,
  };
}

function readLineHeight(font: TemplateV2Element["font"]) {
  const record = readRecord(font);
  return readNumber(record.line_height ?? record.line_height);
}

function paddingStyle(padding: Record<string, unknown>): React.CSSProperties {
  return {
    paddingBottom: px(readNumber(padding.bottom) ?? 0),
    paddingLeft: px(readNumber(padding.left) ?? 0),
    paddingRight: px(readNumber(padding.right) ?? 0),
    paddingTop: px(readNumber(padding.top) ?? 0),
  };
}

function borderRadiusPx(radius: Record<string, unknown>) {
  const topLeft = readNumber(radius.tl) ?? 0;
  const topRight = readNumber(radius.tr) ?? topLeft;
  const bottomRight = readNumber(radius.br) ?? topLeft;
  const bottomLeft = readNumber(radius.bl) ?? topLeft;
  if (!topLeft && !topRight && !bottomRight && !bottomLeft) return undefined;
  return `${px(topLeft)} ${px(topRight)} ${px(bottomRight)} ${px(bottomLeft)}`;
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function px(value: number) {
  return `${value}px`;
}

function imageFit(value: unknown): React.CSSProperties["objectFit"] {
  if (value === "contain" || value === "cover" || value === "fill") {
    return value;
  }
  return "contain";
}

function imageObjectPosition(
  element: TemplateV2Element,
): React.CSSProperties["objectPosition"] {
  const focus_x = clampPercent(readNumber(element.focus_x));
  const focus_y = clampPercent(readNumber(element.focus_y));
  if (focus_x == null && focus_y == null) return undefined;
  return `${focus_x ?? 50}% ${focus_y ?? 50}%`;
}

function clampPercent(value: number | null) {
  if (value == null) return null;
  return Math.min(100, Math.max(0, value));
}

function imageFlipTransform(flipH: boolean, flipV: boolean) {
  if (!flipH && !flipV) return undefined;
  return `${flipH ? "scaleX(-1)" : ""} ${flipV ? "scaleY(-1)" : ""}`.trim();
}

function horizontalAlign(value: string | null) {
  if (value === "center") return "center";
  if (value === "right") return "flex-end";
  return "flex-start";
}

function verticalAlign(value: string | null) {
  if (value === "middle" || value === "center") return "center";
  if (value === "bottom") return "flex-end";
  return "flex-start";
}

function textAlign(value: string | null): React.CSSProperties["textAlign"] {
  if (value === "center" || value === "right") return value;
  return "left";
}

function cssAlignment(value: string | null, fallback: string) {
  if (
    value === "flex-start" ||
    value === "flex-end" ||
    value === "center" ||
    value === "stretch"
  ) {
    return value;
  }
  return fallback;
}

function hexToRgb(color: string) {
  const normalized = color.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return "0, 0, 0";
  const value = Number.parseInt(normalized, 16);
  return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
}
