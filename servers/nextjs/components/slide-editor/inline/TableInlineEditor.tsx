import type { CSSProperties } from "react";
import type { TableCellSelection, TableSlideElement } from "../state";
import { PT_TO_PX, PX_PER_IN, withHash } from "../editorUtils";
import {
  elementBox,
  elementFont,
  setTableCellText,
  tableCellText,
  tableRowsAsStrings,
} from "../lib/element-model";
import type { Font, TableCell } from "../lib/slide-schema";
import { inlineStyles } from "./inlineStyles";

export function TableInlineEditor({
  element,
  index,
  scale,
  selectedCell,
  onChange,
  onClose,
}: {
  element: TableSlideElement;
  index: number;
  scale: number;
  selectedCell: TableCellSelection | null;
  onChange: (index: number, element: TableSlideElement) => void;
  onClose: () => void;
}) {
  const box = elementBox(element);
  const rows = [element.columns, ...element.rows];
  const stringRows = tableRowsAsStrings(element);
  const rowCount = Math.max(1, rows.length);
  const columnCount = Math.max(1, ...stringRows.map((row) => row.length));
  const rowIndex = Math.min(
    rowCount - 1,
    Math.max(0, selectedCell?.rowIndex ?? 0),
  );
  const colIndex = Math.min(
    columnCount - 1,
    Math.max(0, selectedCell?.colIndex ?? 0),
  );
  const tableFont = elementFont(element);
  const isHeader = rowIndex === 0;
  const cell = rows[rowIndex]?.[colIndex] ?? { runs: [] };
  const font = tableCellFont(cell, tableFont, isHeader);
  const cellWidth = (box.w * scale) / columnCount;
  const cellHeight = (box.h * scale) / rowCount;
  const cellLeft = box.x * scale + colIndex * cellWidth;
  const cellTop = box.y * scale + rowIndex * cellHeight;
  const paddingX = Math.max(4, 0.08 * scale);
  const paddingY = Math.max(3, 0.04 * scale);

  const updateCellText = (text: string) => {
    const nextCell = setTableCellText(cell, text);
    if (isHeader) {
      onChange(index, {
        ...element,
        columns: Array.from({ length: columnCount }, (_, nextColIndex) =>
            nextColIndex === colIndex
              ? nextCell
              : element.columns[nextColIndex] ?? { runs: [] },
        ),
      });
      return;
    }

    onChange(index, {
      ...element,
      rows: element.rows.map((row, nextRowIndex) =>
        nextRowIndex === rowIndex - 1
          ? Array.from({ length: columnCount }, (_, nextColIndex) =>
              nextColIndex === colIndex
                ? nextCell
                : row[nextColIndex] ?? { runs: [] },
            )
          : row,
      ),
    });
  };

  return (
    <>
      <textarea
        autoFocus
        value={tableCellText(cell)}
        onChange={(event) => updateCellText(event.target.value)}
        onBlur={onClose}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        style={{
          ...inlineStyles.textEditor,
          ...cellEditorStyle,
          left: cellLeft,
          top: cellTop,
          width: cellWidth,
          height: cellHeight,
          padding: `${paddingY}px ${paddingX}px`,
          background: withHash(
            cell.color?.color ?? (isHeader ? "0B1F3A" : "FFFFFF"),
          ),
          color: withHash(font.color ?? tableFont.color),
          fontFamily: `${font.family ?? tableFont.family}, Helvetica, sans-serif`,
          fontSize:
            (font.size ?? tableFont.size) * PT_TO_PX * (scale / PX_PER_IN),
          fontStyle: font.italic ? "italic" : "normal",
          fontWeight: font.bold ? 700 : 400,
          lineHeight: font.line_height ?? 1.12,
          textAlign: colIndex === 0 ? "left" : "center",
        }}
      />
      <span
        aria-hidden="true"
        style={{
          ...cellEditorGripStyle,
          left: cellLeft + cellWidth / 2 - 24,
          top: cellTop - 7,
        }}
      />
    </>
  );
}

export function tableDraftFromElement(element: TableSlideElement) {
  return tableRowsAsStrings(element)
    .map((row) => row.map(formatTableCell).join(", "))
    .join("\n");
}

export function tableRowsFromDraft(draft: string) {
  return draft
    .split(/\r?\n/)
    .map(parseTableRow)
    .filter((row) => row.some(Boolean))
    .map((row) => row.slice(0, 6))
    .slice(0, 8);
}

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
    line_height: cellFont.line_height ?? tableFont.lineHeight ?? 1.12,
    letter_spacing: cellFont.letter_spacing ?? tableFont.letterSpacing,
    wrap: cellFont.wrap ?? tableFont.wrap ?? "word",
    ellipsis: cellFont.ellipsis ?? tableFont.ellipsis,
  };
}

function formatTableCell(cell: string) {
  if (!/[",\n\r]/.test(cell)) return cell;
  return `"${cell.replace(/"/g, '""')}"`;
}

function parseTableRow(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

const cellEditorStyle: CSSProperties = {
  border: "3px solid #7C51F8",
  backgroundClip: "padding-box",
};

const cellEditorGripStyle: CSSProperties = {
  position: "absolute",
  zIndex: 8,
  width: 48,
  height: 10,
  borderRadius: 999,
  border: "1px solid rgba(15, 23, 42, 0.12)",
  background: "#FFFFFF",
  boxShadow: "0 1px 4px rgba(15, 23, 42, 0.18)",
  pointerEvents: "none",
};
