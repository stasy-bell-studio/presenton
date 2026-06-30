import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronLeft,
  ChevronRight,
  Columns3,
  MoreVertical,
  Plus,
  Rows3,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { TableCellSelection, TableSlideElement } from "../state";
import { withHash } from "../editorUtils";
import {
  elementBox,
  setTableRowsFromStrings,
  tableRowsAsStrings,
} from "../lib/element-model";
import type { TableCell } from "../lib/slide-schema";
import { DeferredColorInput } from "./DeferredColorInput";

type TableCellAlignment = NonNullable<TableCell["alignment"]>;

const TABLE_CELL_ALIGNMENTS = ["left", "center", "right"] as const satisfies
  readonly TableCellAlignment[];

export function TableToolbar({
  element,
  index,
  scale,
  selectedCell,
  onChange,
}: {
  element: TableSlideElement;
  index: number;
  scale: number;
  selectedCell: TableCellSelection | null;
  onChange: (index: number, element: TableSlideElement) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const box = elementBox(element);
  const rows = tableRowsAsStrings(element);
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const activeRow = Math.min(
    rows.length - 1,
    Math.max(0, selectedCell?.rowIndex ?? 0),
  );
  const activeColumn = Math.min(
    columnCount - 1,
    Math.max(0, selectedCell?.colIndex ?? 0),
  );
  const activeLabel =
    rows[activeRow]?.[activeColumn]?.trim() ||
    rows[0]?.[activeColumn]?.trim() ||
    "Table";
  const activeCell =
    activeRow === 0
      ? element.columns[activeColumn]
      : element.rows[activeRow - 1]?.[activeColumn];
  const activeCellFillColor =
    activeCell?.color?.color ?? (activeRow === 0 ? "F7F7FA" : "FFFFFF");
  const activeCellAlignment: TableCellAlignment =
    activeCell?.alignment ?? "left";
  const ActiveCellAlignmentIcon =
    activeCellAlignment === "center"
      ? AlignCenter
      : activeCellAlignment === "right"
        ? AlignRight
        : AlignLeft;
  const canAddRow = rows.length < 8;
  const canAddColumn = columnCount < 6;
  const canDeleteRow = rows.length > 2;
  const canDeleteColumn = columnCount > 1;
  const canMoveColumnLeft = activeColumn > 0;
  const canMoveColumnRight = activeColumn < columnCount - 1;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (toolbarRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const normalizeRows = (nextRows: string[][]) =>
    nextRows.map((row) =>
      Array.from({ length: columnCount }, (_, colIndex) => row[colIndex] ?? ""),
    );

  const commitRows = (nextRows: string[][]) => {
    onChange(index, setTableRowsFromStrings(element, nextRows));
  };

  const addRow = () => {
    if (!canAddRow) return;
    const nextRows = normalizeRows(rows);
    const insertIndex = Math.min(nextRows.length, activeRow + 1);
    nextRows.splice(
      insertIndex,
      0,
      Array.from({ length: columnCount }, () => ""),
    );
    commitRows(nextRows);
  };

  const deleteRow = () => {
    if (!canDeleteRow) return;
    const nextRows = normalizeRows(rows);
    nextRows.splice(activeRow, 1);
    commitRows(nextRows);
  };

  const addColumn = () => {
    if (!canAddColumn) return;
    const insertIndex = Math.min(columnCount, activeColumn + 1);
    commitRows(
      rows.map((row) => {
        const next = Array.from(
          { length: columnCount },
          (_, colIndex) => row[colIndex] ?? "",
        );
        next.splice(insertIndex, 0, "");
        return next;
      }),
    );
  };

  const deleteColumn = () => {
    if (!canDeleteColumn) return;
    commitRows(
      rows.map((row) =>
        Array.from({ length: columnCount }, (_, colIndex) => row[colIndex] ?? "")
          .filter((_, colIndex) => colIndex !== activeColumn),
      ),
    );
  };

  const moveColumn = (direction: "left" | "right") => {
    const targetColumn =
      direction === "left" ? activeColumn - 1 : activeColumn + 1;
    if (targetColumn < 0 || targetColumn >= columnCount) return;
    commitRows(
      rows.map((row) => {
        const next = Array.from(
          { length: columnCount },
          (_, colIndex) => row[colIndex] ?? "",
        );
        [next[activeColumn], next[targetColumn]] = [
          next[targetColumn],
          next[activeColumn],
        ];
        return next;
      }),
    );
  };

  const openColorPicker = () => {
    colorInputRef.current?.click();
  };
  const updateActiveCell = (
    patchCell: (cell: TableCell | undefined) => TableCell,
  ) => {
    if (activeRow === 0) {
      onChange(index, {
        ...element,
        columns: element.columns.map((cell, colIndex) =>
          colIndex === activeColumn ? patchCell(cell) : cell,
        ),
      });
      return;
    }

    onChange(index, {
      ...element,
      rows: element.rows.map((row, rowIndex) =>
        rowIndex === activeRow - 1
          ? Array.from(
              { length: columnCount },
              (_, colIndex) =>
                colIndex === activeColumn
                  ? patchCell(row[colIndex])
                  : row[colIndex] ?? { runs: [] },
            )
          : row,
      ),
    });
  };
  const updateActiveCellFillColor = (color: string) => {
    updateActiveCell((cell) => ({
      ...(cell ?? { runs: [] }),
      color: {
        ...(cell?.color ?? {}),
        color,
      },
    }));
  };
  const cycleActiveCellAlignment = () => {
    const activeIndex = TABLE_CELL_ALIGNMENTS.indexOf(activeCellAlignment);
    const nextAlignment =
      TABLE_CELL_ALIGNMENTS[
        (activeIndex + 1) % TABLE_CELL_ALIGNMENTS.length
      ] ?? "left";
    updateActiveCell((cell) => ({
      ...(cell ?? { runs: [] }),
      alignment: nextAlignment,
    }));
  };
  const runMenuAction = (action: () => void) => {
    action();
    setMenuOpen(false);
  };

  return (
    <>
      <div
        ref={toolbarRef}
        style={{
          ...toolbarPositionStyle,
          left: box.x * scale + (box.w * scale) / 2,
          top: Math.max(8, box.y * scale - 58),
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div style={toolbarShellStyle}>
          <button
            type="button"
            style={labelButtonStyle}
            title={activeLabel}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {truncateLabel(activeLabel).toUpperCase()}
          </button>
          <Divider />
          <button
            type="button"
            aria-label="Cell background color"
            title="Cell background"
            style={iconButtonStyle}
            onClick={openColorPicker}
          >
            <span
              style={{
                ...colorDotStyle,
                background: withHash(activeCellFillColor),
              }}
            />
            <DeferredColorInput
              ref={colorInputRef}
              aria-hidden="true"
              tabIndex={-1}
              value={activeCellFillColor}
              onCommit={updateActiveCellFillColor}
              style={hiddenColorInputStyle}
            />
          </button>
          <Divider />
          <button
            type="button"
            aria-label="Table alignment"
            title={`Align ${nextAlignmentLabel(activeCellAlignment)}`}
            style={iconButtonStyle}
            onClick={cycleActiveCellAlignment}
          >
            <ActiveCellAlignmentIcon size={20} strokeWidth={2.25} />
          </button>
          <Divider />
          <button
            type="button"
            aria-label="Table actions"
            aria-expanded={menuOpen}
            title="Table actions"
            style={{
              ...iconButtonStyle,
              ...(menuOpen ? activeButtonStyle : null),
            }}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreVertical size={20} strokeWidth={2.4} />
          </button>
          <Divider />
          <button
            type="button"
            aria-label="Delete row"
            title="Delete row"
            disabled={!canDeleteRow}
            style={{
              ...iconButtonStyle,
              opacity: canDeleteRow ? 1 : 0.36,
              cursor: canDeleteRow ? "pointer" : "not-allowed",
            }}
            onClick={deleteRow}
          >
            <Trash2 size={20} strokeWidth={2.25} />
          </button>
          <TableToolbarMenu
            canAddColumn={canAddColumn}
            canAddRow={canAddRow}
            canDeleteColumn={canDeleteColumn}
            canDeleteRow={canDeleteRow}
            canMoveColumnLeft={canMoveColumnLeft}
            canMoveColumnRight={canMoveColumnRight}
            menuOpen={menuOpen}
            onAddColumn={() => runMenuAction(addColumn)}
            onAddRow={() => runMenuAction(addRow)}
            onDeleteColumn={() => runMenuAction(deleteColumn)}
            onDeleteRow={() => runMenuAction(deleteRow)}
            onMoveColumnLeft={() => runMenuAction(() => moveColumn("left"))}
            onMoveColumnRight={() => runMenuAction(() => moveColumn("right"))}
          />
        </div>
      </div>
      <TableEdgeAddButtons
        box={box}
        canAddColumn={canAddColumn}
        canAddRow={canAddRow}
        onAddColumn={addColumn}
        onAddRow={addRow}
        scale={scale}
      />
    </>
  );
}

function TableToolbarMenu({
  canAddColumn,
  canAddRow,
  canDeleteColumn,
  canDeleteRow,
  canMoveColumnLeft,
  canMoveColumnRight,
  menuOpen,
  onAddColumn,
  onAddRow,
  onDeleteColumn,
  onDeleteRow,
  onMoveColumnLeft,
  onMoveColumnRight,
}: {
  canAddColumn: boolean;
  canAddRow: boolean;
  canDeleteColumn: boolean;
  canDeleteRow: boolean;
  canMoveColumnLeft: boolean;
  canMoveColumnRight: boolean;
  menuOpen: boolean;
  onAddColumn: () => void;
  onAddRow: () => void;
  onDeleteColumn: () => void;
  onDeleteRow: () => void;
  onMoveColumnLeft: () => void;
  onMoveColumnRight: () => void;
}) {
  if (!menuOpen) return null;

  return (
    <div style={menuStyle}>
      <MenuItem
        disabled={!canDeleteRow}
        icon={<Rows3 size={20} strokeWidth={2.2} />}
        label="Delete Row"
        onClick={onDeleteRow}
      />
      <MenuItem
        disabled={!canDeleteColumn}
        icon={<Columns3 size={20} strokeWidth={2.2} />}
        label="Delete Column"
        onClick={onDeleteColumn}
      />
      <MenuItem
        disabled={!canAddRow}
        icon={<Plus size={20} strokeWidth={2.4} />}
        label="Add Row"
        onClick={onAddRow}
      />
      <MenuItem
        disabled={!canAddColumn}
        icon={<Plus size={20} strokeWidth={2.4} />}
        label="Add Column"
        onClick={onAddColumn}
      />
      <div style={menuDividerStyle} />
      <MenuItem
        disabled={!canMoveColumnRight}
        icon={<ChevronRight size={20} strokeWidth={2.4} />}
        label="Move Column Right"
        onClick={onMoveColumnRight}
      />
      <MenuItem
        disabled={!canMoveColumnLeft}
        icon={<ChevronLeft size={20} strokeWidth={2.4} />}
        label="Move Column Left"
        onClick={onMoveColumnLeft}
      />
    </div>
  );
}

function TableEdgeAddButtons({
  box,
  canAddColumn,
  canAddRow,
  onAddColumn,
  onAddRow,
  scale,
}: {
  box: ReturnType<typeof elementBox>;
  canAddColumn: boolean;
  canAddRow: boolean;
  onAddColumn: () => void;
  onAddRow: () => void;
  scale: number;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Add column"
        title="Add column"
        disabled={!canAddColumn}
        style={{
          ...edgeColumnButtonStyle,
          left: box.x * scale + box.w * scale + 2,
          top: box.y * scale + box.h * scale * 0.22,
          height: Math.min(178, Math.max(96, box.h * scale * 0.3)),
          opacity: canAddColumn ? 1 : 0.45,
          cursor: canAddColumn ? "pointer" : "not-allowed",
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onAddColumn}
      >
        +
      </button>
      <button
        type="button"
        aria-label="Add row"
        title="Add row"
        disabled={!canAddRow}
        style={{
          ...edgeRowButtonStyle,
          left: box.x * scale + 14,
          top: box.y * scale + box.h * scale + 2,
          width: Math.min(280, Math.max(160, box.w * scale * 0.18)),
          opacity: canAddRow ? 1 : 0.45,
          cursor: canAddRow ? "pointer" : "not-allowed",
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onAddRow}
      >
        +
      </button>
    </>
  );
}

function MenuItem({
  disabled = false,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        ...menuItemStyle,
        opacity: disabled ? 0.38 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
    >
      <span style={menuIconStyle}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" style={dividerStyle} />;
}

function truncateLabel(label: string) {
  return label.length > 12 ? `${label.slice(0, 11)}…` : label;
}

function nextAlignmentLabel(alignment: TableCellAlignment) {
  const activeIndex = TABLE_CELL_ALIGNMENTS.indexOf(alignment);
  return (
    TABLE_CELL_ALIGNMENTS[
      (activeIndex + 1) % TABLE_CELL_ALIGNMENTS.length
    ] ?? "left"
  );
}

const toolbarShellStyle: CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  height: 44,
  padding: "0 11px",
  borderRadius: 14,
  border: "1px solid #E7E8EC",
  background: "#FFFFFF",
  color: "#191919",
  boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)",
  fontFamily:
    "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const toolbarPositionStyle: CSSProperties = {
  position: "absolute",
  zIndex: 10,
  transform: "translateX(-50%)",
};

const labelButtonStyle: CSSProperties = {
  minWidth: 76,
  maxWidth: 130,
  height: 34,
  border: 0,
  background: "transparent",
  color: "#191919",
  padding: "0 8px",
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: 0,
  textAlign: "left",
  cursor: "pointer",
};

const iconButtonStyle: CSSProperties = {
  position: "relative",
  width: 34,
  height: 34,
  border: 0,
  borderRadius: 6,
  background: "transparent",
  color: "#0F172A",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};

const activeButtonStyle: CSSProperties = {
  background: "#F6F3FF",
};

const dividerStyle: CSSProperties = {
  width: 1,
  height: 28,
  margin: "0 8px",
  background: "#E7E8EC",
};

const colorDotStyle: CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 999,
  display: "block",
};

const hiddenColorInputStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  opacity: 0,
  pointerEvents: "none",
};

const menuStyle: CSSProperties = {
  position: "absolute",
  top: 52,
  left: "50%",
  transform: "translateX(-50%)",
  width: 260,
  padding: "14px 0",
  borderRadius: 14,
  border: "1px solid #E7E8EC",
  background: "#FFFFFF",
  boxShadow: "0 20px 52px rgba(15, 23, 42, 0.22)",
  zIndex: 12,
};

const menuItemStyle: CSSProperties = {
  width: "100%",
  height: 44,
  border: 0,
  background: "transparent",
  color: "#191919",
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "0 24px",
  fontSize: 15,
  fontWeight: 500,
  letterSpacing: 0,
  textAlign: "left",
};

const menuIconStyle: CSSProperties = {
  width: 22,
  height: 22,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#111827",
};

const menuDividerStyle: CSSProperties = {
  height: 1,
  margin: "10px 0",
  background: "#ECEDEF",
};

const edgeColumnButtonStyle: CSSProperties = {
  position: "absolute",
  zIndex: 9,
  width: 28,
  border: 0,
  borderRadius: "0 16px 16px 0",
  background: "#FFFFFF",
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.16)",
  color: "#111827",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  fontSize: 17,
  fontWeight: 500,
  lineHeight: 1,
};

const edgeRowButtonStyle: CSSProperties = {
  position: "absolute",
  zIndex: 9,
  height: 28,
  border: 0,
  borderRadius: "0 0 16px 16px",
  background: "#FFFFFF",
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.16)",
  color: "#111827",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  fontSize: 17,
  fontWeight: 500,
  lineHeight: 1,
};
