import { Group, Line, Rect, Text } from "react-konva";
import { effectiveLineHeight } from "../../lib/text-line-height";

type UnknownRecord = Record<string, any>;
type RawElement = UnknownRecord;
type RenderTextFont = {
  family: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  lineHeight: number;
  letterSpacing: number;
  wrap: string;
};

const DEFAULT_TABLE_NAME = "Default Table";
const DEFAULT_TABLE_HEADERS = ["Name", "Title", "Status", "Position"];

export function TemplateV2TableElement({
  element,
  width,
  height,
  interactive,
  selectedCell,
  onCellSelect,
  onCellEdit,
}: {
  element: RawElement;
  width: number;
  height: number;
  interactive: boolean;
  selectedCell?: { rowIndex: number; colIndex: number } | null;
  onCellSelect?: (rowIndex: number, colIndex: number) => void;
  onCellEdit?: (rowIndex: number, colIndex: number) => void;
}) {
  const rows = rawTableRows(element);
  const rowCount = Math.max(1, rows.length);
  const colCount = Math.max(1, ...rows.map((row) => row.length));
  const cellW = width / colCount;
  const cellH = height / rowCount;
  const font = rawFont(element);

  if (isDefaultTableElement(element, rows)) {
    return (
      <RawDefaultTableElement
        rows={rows}
        width={width}
        height={height}
        interactive={interactive}
        selectedCell={selectedCell}
        onCellSelect={onCellSelect}
        onCellEdit={onCellEdit}
        font={font}
      />
    );
  }

  return (
    <Group listening={interactive}>
      {rows.map((row, rowIndex) =>
        Array.from({ length: colCount }, (_, colIndex) => {
          const cell = asRecord(row[colIndex]) ?? {};
          const firstRun = asRecord(readArray(cell.runs)[0]) ?? {};
          const cellFont = fontFromRecord(
            asRecord(cell.font) ?? asRecord(firstRun.font),
            font,
          );
          const text = rawTableCellText(cell);
          const fontSize = cellFont.size;
          const textWidth = Math.max(1, cellW - 12);
          const cellLineHeight = effectiveLineHeight({
            text,
            width: textWidth,
            fontSize,
            lineHeight: cellFont.lineHeight,
            fallback: 1.15,
            wrap: cellFont.wrap,
          });
          const fill =
            fillColor(cell.fill ?? cell.color) ??
            (rowIndex === 0 ? "#F2F4F7" : "#FFFFFF");
          return (
            <Group
              key={`${rowIndex}-${colIndex}`}
              x={colIndex * cellW}
              y={rowIndex * cellH}
              onClick={(event) => {
                if (!interactive) return;
                event.cancelBubble = true;
                onCellSelect?.(rowIndex, colIndex);
              }}
              onTap={(event) => {
                if (!interactive) return;
                event.cancelBubble = true;
                onCellSelect?.(rowIndex, colIndex);
              }}
              onDblClick={(event) => {
                if (!interactive) return;
                event.cancelBubble = true;
                onCellSelect?.(rowIndex, colIndex);
                onCellEdit?.(rowIndex, colIndex);
              }}
              onDblTap={(event) => {
                if (!interactive) return;
                event.cancelBubble = true;
                onCellSelect?.(rowIndex, colIndex);
                onCellEdit?.(rowIndex, colIndex);
              }}
            >
              <Rect
                width={cellW}
                height={cellH}
                fill={fill}
                stroke={strokeColor(cell.stroke) ?? "#D0D5DD"}
                strokeWidth={strokeWidth(cell.stroke) || 1}
              />
              <Text
                x={6}
                y={4}
                width={textWidth}
                height={Math.max(1, cellH - 8)}
                text={text}
                fill={withHash(cellFont.color)}
                fontFamily={`${cellFont.family}, Helvetica, sans-serif`}
                fontSize={fontSize}
                fontStyle={rowIndex === 0 || cellFont.bold ? "bold" : "normal"}
                textDecoration={cellFont.underline ? "underline" : ""}
                lineHeight={cellLineHeight}
                letterSpacing={cellFont.letterSpacing}
                align={readString(cell.alignment) ?? "left"}
                verticalAlign="middle"
              />
            </Group>
          );
        }),
      )}
      <SelectedTableCellOutline
        cellH={cellH}
        cellW={cellW}
        colCount={colCount}
        rowCount={rowCount}
        selectedCell={selectedCell}
      />
    </Group>
  );
}

function RawDefaultTableElement({
  rows,
  width,
  height,
  interactive,
  selectedCell,
  onCellSelect,
  onCellEdit,
  font,
}: {
  rows: unknown[][];
  width: number;
  height: number;
  interactive: boolean;
  selectedCell?: { rowIndex: number; colIndex: number } | null;
  onCellSelect?: (rowIndex: number, colIndex: number) => void;
  onCellEdit?: (rowIndex: number, colIndex: number) => void;
  font: RenderTextFont;
}) {
  const colCount = Math.max(1, ...rows.map((row) => row.length));
  const bodyRowCount = Math.max(1, rows.length - 1);
  const headerH = clamp(height * 0.26, 46, 104);
  const bodyH = Math.max(1, height - headerH);
  const rowH = bodyH / bodyRowCount;
  const cellW = width / colCount;
  const headerPadX = clamp(width * 0.025, 18, 32);
  const bodyPadX = clamp(width * 0.018, 12, 26);
  const headerFontSize = clamp(font.size, 15, 30);
  const bodyFontSize = clamp(font.size * 0.9, 13, 24);
  const headerFill = "#F7F7FA";
  const bodyFill = "#FFFFFF";
  const lineColor = "#E8EAEE";
  const headerDivider = "#FFFFFF";

  return (
    <Group listening={interactive}>
      <Rect width={width} height={height} fill={bodyFill} />
      {Array.from({ length: colCount }, (_, colIndex) => {
        const cell = rows[0]?.[colIndex];
        const cellRecord = asRecord(cell) ?? {};
        const cellFont = fontFromRecord(asRecord(cellRecord.font), font);
        const text = rawTableCellText(cell);
        const fontSize = cellFont.size || headerFontSize;
        const textWidth = Math.max(1, cellW - headerPadX * 2);
        const cellLineHeight = effectiveLineHeight({
          text,
          width: textWidth,
          fontSize,
          lineHeight: cellFont.lineHeight,
          fallback: 1.15,
          wrap: "none",
        });
        const fill = fillColor(cellRecord.color ?? cellRecord.fill) ?? headerFill;
        return (
          <Group
            key={`default-header-${colIndex}`}
            x={colIndex * cellW}
            onClick={(event) => {
              if (!interactive) return;
              event.cancelBubble = true;
              onCellSelect?.(0, colIndex);
            }}
            onTap={(event) => {
              if (!interactive) return;
              event.cancelBubble = true;
              onCellSelect?.(0, colIndex);
            }}
            onDblClick={(event) => {
              if (!interactive) return;
              event.cancelBubble = true;
              onCellSelect?.(0, colIndex);
              onCellEdit?.(0, colIndex);
            }}
            onDblTap={(event) => {
              if (!interactive) return;
              event.cancelBubble = true;
              onCellSelect?.(0, colIndex);
              onCellEdit?.(0, colIndex);
            }}
          >
            <Rect width={cellW} height={headerH} fill={fill} />
            <Text
              x={headerPadX}
              y={0}
              width={textWidth}
              height={headerH}
              text={text}
              fill={withHash(cellFont.color)}
              fontFamily={`${cellFont.family}, Helvetica, sans-serif`}
              fontSize={fontSize}
              fontStyle="bold"
              textDecoration={cellFont.underline ? "underline" : ""}
              lineHeight={cellLineHeight}
              letterSpacing={cellFont.letterSpacing}
              align={readString(cellRecord.alignment) ?? "left"}
              verticalAlign="middle"
              wrap="none"
            />
            {colIndex > 0 ? (
              <Line
                points={[0, 0, 0, headerH]}
                stroke={headerDivider}
                strokeWidth={2}
              />
            ) : null}
          </Group>
        );
      })}
      <Line points={[0, headerH, width, headerH]} stroke={lineColor} strokeWidth={1} />
      {Array.from({ length: bodyRowCount }, (_, rowIndex) => {
        const y = headerH + rowIndex * rowH;
        return (
          <Group key={`default-body-row-${rowIndex}`} y={y}>
            {Array.from({ length: colCount }, (_, colIndex) => {
              const cell = rows[rowIndex + 1]?.[colIndex];
              const cellRecord = asRecord(cell) ?? {};
              const cellFont = fontFromRecord(asRecord(cellRecord.font), font);
              const text = rawTableCellText(cell);
              const fontSize = cellFont.size || bodyFontSize;
              const textWidth = Math.max(1, cellW - bodyPadX * 2);
              const cellLineHeight = effectiveLineHeight({
                text,
                width: textWidth,
                fontSize,
                lineHeight: cellFont.lineHeight,
                fallback: 1.15,
                wrap: cellFont.wrap,
              });
              const fill = fillColor(cellRecord.color ?? cellRecord.fill);
              return (
                <Group
                  key={`default-body-cell-${rowIndex}-${colIndex}`}
                  x={colIndex * cellW}
                  onClick={(event) => {
                    if (!interactive) return;
                    event.cancelBubble = true;
                    onCellSelect?.(rowIndex + 1, colIndex);
                  }}
                  onTap={(event) => {
                    if (!interactive) return;
                    event.cancelBubble = true;
                    onCellSelect?.(rowIndex + 1, colIndex);
                  }}
                  onDblClick={(event) => {
                    if (!interactive) return;
                    event.cancelBubble = true;
                    onCellSelect?.(rowIndex + 1, colIndex);
                    onCellEdit?.(rowIndex + 1, colIndex);
                  }}
                  onDblTap={(event) => {
                    if (!interactive) return;
                    event.cancelBubble = true;
                    onCellSelect?.(rowIndex + 1, colIndex);
                    onCellEdit?.(rowIndex + 1, colIndex);
                  }}
                >
                  <Rect
                    width={cellW}
                    height={rowH}
                    fill={fill ?? "rgba(0,0,0,0.01)"}
                  />
                  {text ? (
                    <Text
                      x={bodyPadX}
                      y={0}
                      width={textWidth}
                      height={rowH}
                      text={text}
                      fill={withHash(cellFont.color)}
                      fontFamily={`${cellFont.family}, Helvetica, sans-serif`}
                      fontSize={fontSize}
                      fontStyle={cellFont.bold ? "bold" : "normal"}
                      textDecoration={cellFont.underline ? "underline" : ""}
                      lineHeight={cellLineHeight}
                      letterSpacing={cellFont.letterSpacing}
                      align={readString(cellRecord.alignment) ?? "left"}
                      verticalAlign="middle"
                    />
                  ) : null}
                </Group>
              );
            })}
            {rowIndex < bodyRowCount - 1 ? (
              <Line points={[0, rowH, width, rowH]} stroke={lineColor} strokeWidth={1} />
            ) : null}
          </Group>
        );
      })}
      <SelectedTableCellOutline
        colCount={colCount}
        headerH={headerH}
        rowH={rowH}
        selectedCell={selectedCell}
        totalRows={rows.length}
        width={width}
      />
    </Group>
  );
}

function SelectedTableCellOutline({
  cellH,
  cellW,
  colCount,
  headerH,
  rowCount,
  rowH,
  selectedCell,
  totalRows,
  width,
}: {
  cellH?: number;
  cellW?: number;
  colCount: number;
  headerH?: number;
  rowCount?: number;
  rowH?: number;
  selectedCell?: { rowIndex: number; colIndex: number } | null;
  totalRows?: number;
  width?: number;
}) {
  if (!selectedCell) return null;
  if (selectedCell.colIndex < 0 || selectedCell.colIndex >= colCount) return null;

  if (headerH != null && rowH != null && width != null && totalRows != null) {
    if (selectedCell.rowIndex < 0 || selectedCell.rowIndex >= totalRows) return null;
    const defaultCellW = width / colCount;
    const selectedY =
      selectedCell.rowIndex === 0
        ? 0
        : headerH + (selectedCell.rowIndex - 1) * rowH;
    return (
      <Rect
        x={selectedCell.colIndex * defaultCellW}
        y={selectedY}
        width={defaultCellW}
        height={selectedCell.rowIndex === 0 ? headerH : rowH}
        fill="rgba(0,0,0,0)"
        stroke="#7C51F8"
        strokeWidth={2}
        listening={false}
      />
    );
  }

  if (cellW == null || cellH == null || rowCount == null) return null;
  if (selectedCell.rowIndex < 0 || selectedCell.rowIndex >= rowCount) return null;

  return (
    <Rect
      x={selectedCell.colIndex * cellW}
      y={selectedCell.rowIndex * cellH}
      width={cellW}
      height={cellH}
      fill="rgba(0,0,0,0)"
      stroke="#7C51F8"
      strokeWidth={2}
      listening={false}
    />
  );
}

function isDefaultTableElement(element: RawElement, rows: unknown[][]) {
  const headers = rows[0]?.map(rawTableCellText) ?? [];
  const hasDefaultName = readString(element.name) === DEFAULT_TABLE_NAME;
  const hasDefaultHeaders =
    headers.length === DEFAULT_TABLE_HEADERS.length &&
    DEFAULT_TABLE_HEADERS.every((header, index) => headers[index] === header);

  return hasDefaultName || hasDefaultHeaders;
}

function rawTableRows(element: RawElement) {
  const columns = readArray(element.columns);
  const rows = readArray(element.rows);
  return [columns, ...rows].filter((row) => Array.isArray(row)) as unknown[][];
}

function rawTableCellText(cell: unknown) {
  if (typeof cell === "string" || typeof cell === "number") {
    return String(cell);
  }
  const record = asRecord(cell);
  if (!record) return "";
  const runs = readArray(record.runs);
  if (runs.length > 0) {
    return runs
      .map((run) => readString(asRecord(run)?.text) ?? "")
      .join("");
  }
  const textRecord = asRecord(record.text);
  return readString(textRecord?.text) ?? readString(record.text) ?? "";
}

function rawFont(element: RawElement) {
  const font = asRecord(element.font) ?? {};
  return fontFromRecord(font, {
    family: "Arial",
    size: 18,
    color: "#111827",
    bold: false,
    italic: false,
    underline: false,
    lineHeight: 1.15,
    letterSpacing: 0,
    wrap: "word",
  });
}

function fontFromRecord(
  font: UnknownRecord | null,
  fallback: RenderTextFont,
): RenderTextFont {
  return {
    family: readString(font?.family) ?? fallback.family,
    size: readNumber(font?.size) ?? fallback.size,
    color: readString(font?.color) ?? fallback.color,
    bold: readBoolean(font?.bold) ?? fallback.bold,
    italic: readBoolean(font?.italic) ?? fallback.italic,
    underline:
      readBoolean(font?.underline) ??
      (readString(font?.text_decoration) === "underline" ||
        readString(font?.textDecoration) === "underline"
        ? true
        : fallback.underline),
    lineHeight:
      readNumber(font?.line_height) ??
      readNumber(font?.lineHeight) ??
      fallback.lineHeight,
    letterSpacing:
      readNumber(font?.letter_spacing) ??
      readNumber(font?.letterSpacing) ??
      fallback.letterSpacing,
    wrap: readString(font?.wrap) ?? fallback.wrap,
  };
}

function fillColor(fill: unknown) {
  const value = asRecord(fill);
  return withHash(readString(value?.color));
}

function strokeColor(stroke: unknown) {
  const value = asRecord(stroke);
  return withHash(readString(value?.color));
}

function strokeWidth(stroke: unknown) {
  const value = asRecord(stroke);
  return readNumber(value?.width) ?? 0;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function withHash(value: string | null | undefined) {
  if (!value) return undefined;
  return value.startsWith("#") || value.startsWith("rgb") ? value : `#${value}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
