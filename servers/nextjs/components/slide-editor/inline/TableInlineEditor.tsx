import { useCallback, useRef, useState } from "react";
import type {
  TableCellSelection,
  TableSlideElement,
  TextSlideElement,
} from "../state";
import { PT_TO_PX, PX_PER_IN, withHash } from "../editorUtils";
import {
  elementBox,
  elementFont,
  tableRowsAsStrings,
} from "../lib/element-model";
import type { Font, TableCell, TextRun } from "../lib/slide-schema";
import { effectiveLineHeight } from "../lib/text-line-height";
import {
  textRunsContent,
  type TextSelectionRange,
} from "../lib/text-runs";
import { inlineStyles } from "./inlineStyles";
import { TextToolbar } from "./TextToolbar";
import { TiptapInlineTextEditor } from "./TiptapInlineTextEditor";

const DEFAULT_TABLE_NAME = "Default Table";
const DEFAULT_TABLE_HEADERS = ["Name", "Title", "Status", "Position"];

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
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [textSelectionRange, setTextSelectionRange] =
    useState<TextSelectionRange | null>(null);
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
  const tableWidth = box.w * scale;
  const tableHeight = box.h * scale;
  const isDefaultTable = isDefaultTableElement(element, stringRows);
  const bodyRowCount = Math.max(1, rowCount - 1);
  const defaultHeaderHeight = clamp(tableHeight * 0.26, 46, 104);
  const defaultBodyRowHeight =
    (Math.max(1, tableHeight - defaultHeaderHeight)) / bodyRowCount;
  const cellWidth = tableWidth / columnCount;
  const cellHeight = isDefaultTable
    ? isHeader
      ? defaultHeaderHeight
      : defaultBodyRowHeight
    : tableHeight / rowCount;
  const cellLeft = box.x * scale + colIndex * cellWidth;
  const cellTop =
    box.y * scale +
    (isDefaultTable
      ? isHeader
        ? 0
        : defaultHeaderHeight + (rowIndex - 1) * defaultBodyRowHeight
      : rowIndex * cellHeight);
  const paddingX = isDefaultTable
    ? isHeader
      ? clamp(tableWidth * 0.025, 18, 32)
      : clamp(tableWidth * 0.018, 12, 26)
    : Math.max(4, 0.08 * scale);
  const paddingY = isDefaultTable ? 0 : Math.max(3, 0.04 * scale);
  const textElement: TextSlideElement = {
    type: "text",
    position: { x: cellLeft / scale, y: cellTop / scale },
    size: { width: cellWidth / scale, height: cellHeight / scale },
    font,
    alignment: {
      horizontal: cell.alignment ?? "left",
      vertical: "middle",
    },
    runs: normalizedTextRuns(cell, font),
  };
  const textFont = elementFont(textElement);
  const cellText = textRunsContent(textElement.runs);
  const textFontSizePx = textFont.size * PT_TO_PX * (scale / PX_PER_IN);
  const editorLineHeight = effectiveLineHeight({
    text: cellText,
    width: Math.max(1, cellWidth - paddingX * 2),
    fontSize: textFontSizePx,
    lineHeight: textFont.lineHeight,
    fallback: 1.12,
    wrap: textFont.wrap,
  });
  const closeAfterBlur = useCallback(() => {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (active && editorRef.current?.contains(active)) return;
      onClose();
    }, 0);
  }, [onClose]);

  const updateCell = (nextCell: TableCell) => {
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

  const updateCellTextElement = (nextTextElement: TextSlideElement) => {
    updateCell({
      ...cell,
      font: nextTextElement.font ?? cell.font,
      alignment: nextTextElement.alignment?.horizontal ?? cell.alignment,
      runs: normalizedTextRuns(nextTextElement, nextTextElement.font ?? font),
    });
  };
  const updateCellRuns = (runs: TextRun[]) => {
    updateCell({
      ...cell,
      runs: runs.length > 0 ? runs : [{ text: " ", font }],
    });
  };

  return (
    <div
      ref={editorRef}
      data-inline-edit-ignore="true"
      onBlur={closeAfterBlur}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        zIndex: 30,
        inset: 0,
        pointerEvents: "none",
      }}
    >
      <div style={{ pointerEvents: "auto" }}>
        <TextToolbar
          element={textElement}
          index={index}
          scale={scale}
          selectionRange={textSelectionRange}
          onChange={(_index, nextTextElement) =>
            updateCellTextElement(nextTextElement)
          }
        />
      </div>
      <TiptapInlineTextEditor
        baseFont={textElement.font ?? font}
        runs={textElement.runs}
        onBlurOutside={onClose}
        onCommitShortcut={onClose}
        onEscape={onClose}
        onRunsChange={updateCellRuns}
        onSelectionChange={setTextSelectionRange}
        editorStyle={{
          ...inlineStyles.textEditor,
          ...cellEditorStyle,
          left: cellLeft,
          top: cellTop,
          width: cellWidth,
          height: cellHeight,
          pointerEvents: "auto",
          padding: `${paddingY}px ${paddingX}px`,
          background: withHash(
            cell.color?.color ?? (isHeader ? "F7F7FA" : "FFFFFF"),
          ),
          color: withHash(textFont.color),
          caretColor: withHash(textFont.color),
          fontFamily: `${textFont.family}, Helvetica, sans-serif`,
          fontSize: textFontSizePx,
          fontStyle: textFont.italic ? "italic" : "normal",
          fontWeight: textFont.bold ? 700 : 400,
          textDecoration: textFont.underline ? "underline" : "none",
          lineHeight: editorLineHeight,
          textAlign: textElement.alignment?.horizontal ?? "left",
          letterSpacing:
            ((textFont.letterSpacing ?? 0) / 100) *
            PT_TO_PX *
            (scale / PX_PER_IN),
        }}
      />
    </div>
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

function normalizedTextRuns(
  source: Pick<TextSlideElement, "runs"> | TableCell,
  font: Font | null | undefined,
) {
  const runs = source.runs.length > 0 ? source.runs : [{ text: " " }];
  return runs.map((run) => ({
    ...run,
    text: run.text || " ",
    font: run.font ?? font ?? undefined,
  }));
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

const cellEditorStyle = {
  zIndex: 31,
  border: "1px solid #7C51F8",
  outline: "none",
  resize: "none",
  margin: 0,
  backgroundClip: "padding-box",
} as const;

function isDefaultTableElement(element: TableSlideElement, rows: string[][]) {
  const headers = rows[0] ?? [];
  const hasDefaultName =
    (element as TableSlideElement & { name?: string }).name === DEFAULT_TABLE_NAME;
  const hasDefaultHeaders =
    headers.length === DEFAULT_TABLE_HEADERS.length &&
    DEFAULT_TABLE_HEADERS.every((header, index) => headers[index] === header);

  return hasDefaultName || hasDefaultHeaders;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
