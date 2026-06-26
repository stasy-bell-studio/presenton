import { Group, Rect, Text } from "react-konva";
import type { Font, TableElement as TableEl } from "../../lib/slide-schema";
import { PT_TO_PX, PX_PER_IN, withHash } from "../../editorUtils";
import { elementFont, tableRowsAsStrings } from "../../lib/element-model";
import { renderMarkdownTextRuns } from "../../lib/markdown-text";
import { rotationProps, shadowProps } from "./elementVisuals";
import {
  geometry,
  type ElementCommonProps,
  type TableInteractionProps,
} from "./types";

export function TableElement({
  element,
  index,
  scale,
  selected,
  editing,
  onTableCellClick,
  setRef,
  events,
  renderMode = "canvas",
}: ElementCommonProps &
  TableInteractionProps & {
    element: TableEl;
    renderMode?: "canvas" | "proxy";
  }) {
  const { x, y, width, height, stroke, strokeWidth } = geometry(
    element,
    scale,
    selected,
  );
  const rowCells = [element.columns, ...element.rows];
  const rows = tableRowsAsStrings(element);
  const cols = Math.max(1, ...rows.map((row) => row.length));
  const rowH = height / rows.length;
  const colW = width / cols;
  const font = elementFont(element);
  const fill = withHash("FFFFFF");
  const borderColor = withHash("DDE5F0");

  return (
    <Group
      ref={setRef}
      name={`element-${index}`}
      x={x}
      y={y}
      width={width}
      height={height}
      {...rotationProps(element)}
      opacity={element.opacity ?? 1}
      {...shadowProps(element.shadow, scale)}
      {...events}
    >
      <Rect
        width={width}
        height={height}
        fill={renderMode === "proxy" ? "rgba(255,255,255,0.01)" : fill}
        stroke={
          selected
            ? stroke
            : renderMode === "proxy"
              ? "rgba(255,255,255,0)"
              : borderColor
        }
        strokeWidth={selected ? strokeWidth : renderMode === "proxy" ? 0 : 1}
        cornerRadius={4}
      />
      {editing
        ? null
        : rows.map((row, rowIndex) =>
	            Array.from({ length: cols }).map((_, colIndex) => {
	              const isHeader = rowIndex === 0;
	              const cellStyle = rowCells[rowIndex]?.[colIndex];
	              const cellFill =
	                cellStyle?.color?.color ?? (isHeader ? "0B1F3A" : "FFFFFF");
	              const cellBorder = "DDE5F0";
	              const cellFont = tableCellFont(cellStyle?.font, font, isHeader);
	              const renderedRuns = renderMarkdownTextRuns(
	                cellStyle?.runs.length
	                  ? cellStyle.runs.map((run) => ({
	                      ...run,
	                      font: run.font ?? cellFont,
	                    }))
	                  : [{ text: row[colIndex] ?? "", font: cellFont }],
	              );
              const renderedText = renderedRuns.map((run) => run.text).join("");
              const cellFontSize =
                (cellFont.size ?? font.size) * PT_TO_PX * (scale / PX_PER_IN);
              const isBold = renderedRuns.some((run) => run.font?.bold);
              const isItalic = renderedRuns.some((run) => run.font?.italic);
              return (
                <Group key={`${rowIndex}-${colIndex}`}>
                  <Rect
                    x={colIndex * colW}
                    y={rowIndex * rowH}
                    width={colW}
                    height={rowH}
                    fill={
                      renderMode === "proxy"
	                        ? "rgba(255,255,255,0.01)"
	                        : colorWithOpacity(cellFill, cellStyle?.color?.opacity)
                    }
                    stroke={
	                      renderMode === "proxy"
	                        ? "rgba(255,255,255,0)"
	                        : colorWithOpacity(cellBorder)
	                    }
	                    strokeWidth={
	                      renderMode === "proxy" ? 0 : 1
	                    }
                    onClick={(event) => {
                      event.cancelBubble = true;
                      if (!events.onClick(event)) return;
                      onTableCellClick?.(rowIndex, colIndex);
                    }}
                    onTap={(event) => {
                      if (!events.onTap(event)) return;
                      onTableCellClick?.(rowIndex, colIndex);
                    }}
                  />
                  {renderMode === "canvas" ? (
                    <Text
                      x={colIndex * colW + 8 * (scale / PX_PER_IN)}
                      y={rowIndex * rowH + 6 * (scale / PX_PER_IN)}
                      width={Math.max(1, colW - 16 * (scale / PX_PER_IN))}
                      height={Math.max(1, rowH - 10 * (scale / PX_PER_IN))}
                      text={renderedText}
                      fill={withHash(cellFont.color ?? font.color)}
                      fontFamily={`${cellFont.family ?? font.family}, Helvetica, sans-serif`}
                      fontSize={cellFontSize}
                      fontStyle={
                        `${isBold ? "bold" : "normal"} ${isItalic ? "italic" : ""}`
                      }
                      align={colIndex === 0 ? "left" : "center"}
                      verticalAlign="middle"
                      lineHeight={cellFont.line_height ?? 1.12}
                      listening={false}
                    />
                  ) : null}
                </Group>
              );
            }),
          )}
    </Group>
  );
}

function tableCellFont(
  cellFont: Font | null | undefined,
  tableFont: ReturnType<typeof elementFont>,
  isHeader: boolean,
): Font {
  return {
    family: cellFont?.family ?? tableFont.family,
    size: cellFont?.size ?? tableFont.size,
    color: cellFont?.color ?? tableFont.color,
    bold: cellFont?.bold ?? tableFont.bold ?? isHeader,
    italic: cellFont?.italic ?? tableFont.italic,
    line_height: cellFont?.line_height ?? tableFont.lineHeight ?? 1.12,
    letter_spacing: cellFont?.letter_spacing ?? tableFont.letterSpacing,
    wrap: cellFont?.wrap ?? tableFont.wrap ?? "word",
    ellipsis: cellFont?.ellipsis ?? tableFont.ellipsis,
  };
}

function colorWithOpacity(color: string, opacity?: number | null) {
  const clampedOpacity = Math.max(0, Math.min(opacity ?? 1, 1));
  if (clampedOpacity >= 1) return withHash(color);

  const normalized = color.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(0, 0, 0, ${clampedOpacity})`;
  }

  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${clampedOpacity})`;
}
