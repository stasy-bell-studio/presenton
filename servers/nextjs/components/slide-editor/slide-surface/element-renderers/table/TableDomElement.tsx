import type { CSSProperties } from "react";
import { PT_TO_PX, PX_PER_IN, withHash } from "../../../editorUtils";
import { elementFont } from "../../../lib/element-model";
import { rootPath } from "../../../lib/element-path";
import type { ResolvedLayoutItem } from "../../../lib/layout-resolver";
import { renderMarkdownTextRuns } from "../../../lib/markdown-text";
import type { Font, TableCell, TextRun } from "../../../lib/slide-schema";
import type { TableCellSelection } from "../../../state";
import { DomElementLayer, elementBoxStyle } from "../shared";

const TABLE_CELL_PADDING_X_IN = 0.08;
const TABLE_CELL_PADDING_Y_IN = 0.04;

export function TableDomElement({
  items,
  scale,
  selectedCell,
}: {
  items: ResolvedLayoutItem[];
  scale: number;
  selectedCell?: TableCellSelection | null;
}) {
  return (
    <DomElementLayer>
      {items.map((item) => {
        const element = item.element;
        if (element.type !== "table") {
          return null;
        }

        const rows = [element.columns, ...element.rows];
        const cols = Math.max(1, ...rows.map((row) => row.length));
        const font = elementFont(element);
        const tableStroke = element.columns[0]?.stroke ?? element.rows[0]?.[0]?.stroke;
        const borderColor = colorWithOpacity(
          tableStroke?.color ?? "D9E2EF",
          tableStroke?.opacity,
        );

        return (
          <table
            key={item.path}
            style={{
              ...elementBoxStyle(element, scale),
              ...tableStyle,
              borderColor,
              borderWidth: tableStroke?.width ?? 1,
              color: withHash(font.color),
              fontFamily: `${font.family}, Helvetica, sans-serif`,
              fontSize: font.size * PT_TO_PX * (scale / PX_PER_IN),
            }}
          >
            <tbody style={tableBodyStyle}>
              {rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  style={{
                    ...tableRowStyle,
                    height: `${100 / rows.length}%`,
                  }}
                >
                  {Array.from({ length: cols }).map((_, colIndex) => {
                    const isHeader = rowIndex === 0;
                    const selectedCellPath =
                      selectedCell?.elementPath ??
                      (selectedCell
                        ? rootPath(selectedCell.elementIndex)
                        : null);
                    const isSelected =
                      selectedCell != null &&
                      selectedCellPath === item.sourcePath &&
                      selectedCell.rowIndex === rowIndex &&
                      selectedCell.colIndex === colIndex;
                    const cell = row[colIndex] ?? {};
                    const textAlign = colIndex === 0 ? "left" : "center";
                    const baseFont = tableCellFont(cell, font, isHeader);
                    const renderedRuns = renderMarkdownTextRuns([
                      {
                        text: cell.text ?? "",
                        font: baseFont,
                      },
                    ]);
                    const authoredFontSize = baseFont.size ?? font.size;
                    const cellBorderColor = colorWithOpacity(
                      cell.stroke?.color ?? borderColor,
                      cell.stroke?.opacity,
                    );
                    return (
                      <td
                        key={colIndex}
                        style={{
                          ...cellStyle,
                          width: `${100 / cols}%`,
                          height: `${100 / rows.length}%`,
                          borderColor: cellBorderColor,
                          borderWidth: cell.stroke?.width ?? 1,
                          background: colorWithOpacity(
                            cell.fill?.color ??
                              (isHeader ? "0B1F3A" : "FFFFFF"),
                            cell.fill?.opacity,
                          ),
                          color: withHash(baseFont.color ?? font.color),
                          fontFamily: `${baseFont.family ?? font.family}, Helvetica, sans-serif`,
                          fontSize:
                            authoredFontSize * PT_TO_PX * (scale / PX_PER_IN),
                          fontStyle: baseFont.italic ? "italic" : "normal",
                          fontWeight: baseFont.bold ? 700 : 400,
                          lineHeight: baseFont.lineHeight ?? 1.12,
                          overflow: isSelected ? "visible" : "hidden",
                          padding: 0,
                          position: "relative",
                          textAlign,
                          zIndex: isSelected ? 2 : undefined,
                        }}
                      >
                        <div
                          style={{
                            ...cellContentStyle,
                            alignItems: "center",
                            justifyContent:
                              textAlign === "center" ? "center" : "flex-start",
                            padding: `${TABLE_CELL_PADDING_Y_IN * scale}px ${
                              TABLE_CELL_PADDING_X_IN * scale
                            }px`,
                            textAlign,
                          }}
                        >
                          <span style={cellTextStyle}>
                            <TableRichTextRuns
                              baseFont={baseFont}
                              effectiveFontSize={authoredFontSize}
                              runs={renderedRuns}
                              scale={scale}
                            />
                          </span>
                        </div>
                        {isSelected ? (
                          <span
                            aria-hidden="true"
                            style={selectedCellFrameStyle}
                          >
                            <span style={selectedCellGripStyle} />
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </DomElementLayer>
  );
}

const tableStyle: CSSProperties = {
  tableLayout: "fixed",
  borderCollapse: "collapse",
  borderWidth: 1,
  borderStyle: "solid",
  overflow: "visible",
};

const tableBodyStyle: CSSProperties = {
  height: "100%",
};

const tableRowStyle: CSSProperties = {
  height: "100%",
};

const cellStyle: CSSProperties = {
  boxSizing: "border-box",
  borderWidth: 1,
  borderStyle: "solid",
  lineHeight: 1.12,
  verticalAlign: "middle",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "normal",
  wordBreak: "break-word",
};

const selectedCellFrameStyle: CSSProperties = {
  position: "absolute",
  inset: -1,
  zIndex: 3,
  border: "3px solid #7C51F8",
  boxSizing: "border-box",
  pointerEvents: "none",
};

const selectedCellGripStyle: CSSProperties = {
  position: "absolute",
  top: -7,
  left: "50%",
  width: 48,
  height: 10,
  transform: "translateX(-50%)",
  borderRadius: 999,
  border: "1px solid rgba(15, 23, 42, 0.12)",
  background: "#FFFFFF",
  boxShadow: "0 1px 4px rgba(15, 23, 42, 0.18)",
};

const cellContentStyle: CSSProperties = {
  boxSizing: "border-box",
  display: "flex",
  height: "100%",
  minHeight: 0,
  overflow: "hidden",
  width: "100%",
};

const cellTextStyle: CSSProperties = {
  display: "block",
  maxHeight: "100%",
  overflow: "hidden",
};

function tableCellFont(
  cell: TableCell,
  tableFont: ReturnType<typeof elementFont>,
  isHeader: boolean,
): Font {
  const cellFont = cell.font ?? {};
  return {
    family: cellFont.family ?? tableFont.family,
    size: cellFont.size ?? tableFont.size,
    color: cellFont.color ?? tableFont.color,
    bold: cellFont.bold ?? tableFont.bold ?? isHeader,
    italic: cellFont.italic ?? tableFont.italic,
    lineHeight: cellFont.lineHeight ?? tableFont.lineHeight ?? 1.12,
    letterSpacing: cellFont.letterSpacing ?? tableFont.letterSpacing,
    wrap: cellFont.wrap ?? tableFont.wrap ?? "word",
    ellipsis: cellFont.ellipsis ?? tableFont.ellipsis,
  };
}

function TableRichTextRuns({
  baseFont,
  effectiveFontSize,
  runs,
  scale,
}: {
  baseFont: Font;
  effectiveFontSize: number;
  runs: TextRun[];
  scale: number;
}) {
  const fontScale =
    baseFont.size && baseFont.size > 0 ? effectiveFontSize / baseFont.size : 1;

  return (
    <>
      {runs.map((run, index) => {
        const runFont = run.font ?? {};
        return (
          <span
            key={`${index}-${run.text}`}
            style={{
              color: withHash(runFont.color ?? baseFont.color ?? "1A2B45"),
              fontFamily: `${runFont.family ?? baseFont.family ?? "Arial"}, Helvetica, sans-serif`,
              fontSize:
                (runFont.size != null
                  ? runFont.size * fontScale
                  : effectiveFontSize) *
                PT_TO_PX *
                (scale / PX_PER_IN),
              fontStyle: runFont.italic ? "italic" : undefined,
              fontWeight: runFont.bold ? 700 : undefined,
            }}
          >
            {run.text}
          </span>
        );
      })}
    </>
  );
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
