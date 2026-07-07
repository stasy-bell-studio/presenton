import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  MoreVertical,
  Plus,
  Rows3,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { TableCellSelection, TableSlideElement } from "@/components/slide-editor/state/state";
import {
  canApplyComponentLayerAction,
  type ComponentLayerAction,
} from "@/components/slide-editor/selection/layering";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { withHash } from "@/components/slide-editor/utils/color";
import {
  elementBox,
  setTableRowsFromStrings,
  tableRowsAsStrings,
} from "@/components/slide-editor/model/element-model";
import type { TableCell } from "@/components/slide-editor/types";
import { DeferredColorInput } from "@/components/slide-editor/toolbar/DeferredColorInput";
import {
  FloatingToolbar,
  FloatingToolbarPanel,
  type FloatingToolbarBox,
} from "@/components/slide-editor/toolbar/FloatingToolbar";

type TableCellAlignment = NonNullable<TableCell["alignment"]>;

const TABLE_CELL_ALIGNMENTS = ["left", "center", "right"] as const satisfies
  readonly TableCellAlignment[];

const TABLE_COMPONENT_LAYER_ACTIONS: Array<{
  action: ComponentLayerAction;
  label: string;
  shortcut: string;
}> = [
  {
    action: "bring-to-front",
    label: "Bring to Front",
    shortcut: "⌥⌘]",
  },
  {
    action: "bring-forward",
    label: "Bring Forward",
    shortcut: "⌘]",
  },
  {
    action: "send-backward",
    label: "Send Backward",
    shortcut: "⌘[",
  },
  {
    action: "send-to-back",
    label: "Send Back",
    shortcut: "⌥⌘[",
  },
];

export type TableSelectionActions = {
  componentCount?: number;
  componentIndex?: number;
  deleteLabel?: string;
  onDelete: () => void;
  onDuplicate: () => void;
  onLayerAction?: (action: ComponentLayerAction) => void;
};

export function TableToolbar({
  anchorBox,
  element,
  index,
  scale,
  selectedCell,
  selectionActions,
  onChange,
}: {
  anchorBox?: FloatingToolbarBox | null;
  element: TableSlideElement;
  index: number;
  scale: number;
  selectedCell: TableCellSelection | null;
  selectionActions?: TableSelectionActions | null;
  onChange: (index: number, element: TableSlideElement) => void;
}) {
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [componentMenuOpen, setComponentMenuOpen] = useState(false);
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
  const activeCell =
    activeRow === 0
      ? element.columns[activeColumn]
      : element.rows[activeRow - 1]?.[activeColumn];
  const activeCellFillColor =
    activeCell?.color?.color ??
    (activeCell as TableCell & { fill?: { color?: string | null } | null })
      ?.fill?.color;
  const colorPickerValue = activeCellFillColor ?? "FFFFFF";
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
    if (!tableMenuOpen && !componentMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-inline-edit-ignore='true']")) return;
      if (toolbarRef.current?.contains(event.target as Node)) return;
      setTableMenuOpen(false);
      setComponentMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [componentMenuOpen, tableMenuOpen]);

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
  const runTableMenuAction = (action: () => void) => {
    action();
    setTableMenuOpen(false);
  };
  const runComponentMenuAction = (action: () => void) => {
    action();
    setComponentMenuOpen(false);
  };

  return (
    <>
      <FloatingToolbar
        anchorBox={
          anchorBox ?? {
            x: box.x * scale,
            y: box.y * scale,
            width: box.w * scale,
            height: box.h * scale,
          }
        }
        fallbackWidth={selectionActions ? 350 : 290}
        inlineEditIgnore
      >
        <div ref={toolbarRef} style={toolbarGroupStyle}>
          <div style={toolbarShellStyle}>
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
                  background: activeCellFillColor
                    ? withHash(activeCellFillColor)
                    : "transparent",
                }}
              />
              <DeferredColorInput
                ref={colorInputRef}
                aria-hidden="true"
                tabIndex={-1}
                value={colorPickerValue}
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
            <Divider />
            <button
              type="button"
              aria-label="Table cell actions"
              aria-expanded={tableMenuOpen}
              title="Table cell actions"
              style={{
                ...iconButtonStyle,
                ...(tableMenuOpen ? activeButtonStyle : null),
              }}
              onClick={() => {
                setComponentMenuOpen(false);
                setTableMenuOpen((open) => !open);
              }}
            >
              <MoreVertical size={20} strokeWidth={2.4} />
            </button>
            <TableToolbarMenu
              canAddColumn={canAddColumn}
              canAddRow={canAddRow}
              canDeleteColumn={canDeleteColumn}
              canDeleteRow={canDeleteRow}
              canMoveColumnLeft={canMoveColumnLeft}
              canMoveColumnRight={canMoveColumnRight}
              menuOpen={tableMenuOpen}
              onAddColumn={() => runTableMenuAction(addColumn)}
              onAddRow={() => runTableMenuAction(addRow)}
              onDeleteColumn={() => runTableMenuAction(deleteColumn)}
              onDeleteRow={() => runTableMenuAction(deleteRow)}
              onMoveColumnLeft={() =>
                runTableMenuAction(() => moveColumn("left"))
              }
              onMoveColumnRight={() =>
                runTableMenuAction(() => moveColumn("right"))
              }
            />
          </div>
          {selectionActions ? (
            <div style={componentToolbarShellStyle}>
              <ComponentSelectionDropdown
                open={componentMenuOpen}
                onOpenChange={(open) => {
                  if (open) setTableMenuOpen(false);
                  setComponentMenuOpen(open);
                }}
                selectionActions={
                  selectionActions
                    ? {
                      ...selectionActions,
                      onDelete: () =>
                        runComponentMenuAction(selectionActions.onDelete),
                      onDuplicate: () =>
                        runComponentMenuAction(selectionActions.onDuplicate),
                      onLayerAction: selectionActions.onLayerAction
                        ? (action) =>
                          runComponentMenuAction(() =>
                            selectionActions.onLayerAction?.(action),
                          )
                        : undefined,
                    }
                    : null
                }
              />
            </div>
          ) : null}
        </div>
      </FloatingToolbar>
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
    <FloatingToolbarPanel style={menuStyle}>
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
    </FloatingToolbarPanel>
  );
}

function ComponentSelectionDropdown({
  open,
  onOpenChange,
  selectionActions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectionActions?: TableSelectionActions | null;
}) {
  if (!selectionActions) return null;
  const hasLayerActions =
    selectionActions.onLayerAction &&
    typeof selectionActions.componentIndex === "number" &&
    typeof selectionActions.componentCount === "number";

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="More"
          aria-label="More"
          className={cn(
            "grid h-8 w-8 place-items-center rounded-[4px] border-0 bg-transparent font-manrope text-black hover:bg-[#F6F6F9]",
            open && "bg-[#F6F6F9]",
          )}
        >
          <MoreVertical
            size={16}
            className="text-black"
            strokeWidth={1.33}
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-template-v2-floating-toolbar="true"
        data-inline-edit-ignore="true"
        align="end"
        sideOffset={12}
        collisionPadding={8}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        className="z-[10001] box-border w-[206px] rounded-[12px] border border-[#EDEEEF] bg-white py-2 font-syne text-[14px] font-normal leading-normal tracking-[0.14px] text-[#191919] shadow-[0_6px_18px_rgba(16,24,40,0.08)]"
      >
        <ComponentDropdownItem
          strong
          icon={Copy}
          label="Duplicate"
          onClick={selectionActions.onDuplicate}
        />
        {hasLayerActions
          ? TABLE_COMPONENT_LAYER_ACTIONS.map(({ action, label, shortcut }) => (
            <ComponentDropdownItem
              key={action}
              disabled={
                !canApplyComponentLayerAction(
                  selectionActions.componentIndex ?? -1,
                  selectionActions.componentCount ?? 0,
                  action,
                )
              }
              label={label}
              shortcut={shortcut}
              onClick={() => selectionActions.onLayerAction?.(action)}
            />
          ))
          : null}
        <DropdownMenuSeparator className="my-1 h-px bg-[#E7E8EC]" />
        <ComponentDropdownItem
          strong
          icon={Trash2}
          label={selectionActions.deleteLabel ?? "Delete Component"}
          onClick={selectionActions.onDelete}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ComponentDropdownItem({
  disabled,
  icon: Icon = undefined,
  label,
  shortcut,
  strong,
  onClick,
}: {
  disabled?: boolean;
  icon?: LucideIcon;
  label: string;
  shortcut?: string;
  strong?: boolean;
  onClick: () => void;
}) {
  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={onClick}
      style={{ cursor: disabled ? "not-allowed" : "pointer" }}
      className={cn(
        "flex w-full cursor-default items-center gap-2 rounded-none px-4 py-2.5 text-left font-syne text-[14px] font-normal leading-normal tracking-[0.14px] text-[#191919] outline-none hover:bg-[#F6F6F9] focus:bg-[#F6F6F9] focus:text-[#191919]",
        strong && "text-black",
        disabled &&
          "cursor-not-allowed text-[#A0A3AD] hover:bg-transparent focus:bg-transparent data-[disabled]:opacity-100",
      )}
    >
      {Icon ? <Icon size={16} strokeWidth={1.33} aria-hidden /> : null}
      <span>{label}</span>
      {shortcut ? (
        <span
          className={cn(
            "ml-auto inline-flex px-1.5 py-1 items-center justify-center rounded-[6px] bg-[#F6F6F9] font-manrope text-[14px] font-normal leading-none tracking-[0.14px] text-[#808080]",
            disabled && "bg-[#F7F7FA] text-[#B0B3BB]",
          )}
        >
          {shortcut}
        </span>
      ) : null}
    </DropdownMenuItem>
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
  shortcut,
  strong = false,
  onClick,
}: {
  disabled?: boolean;
  icon?: React.ReactNode;
  label: string;
  shortcut?: string;
  strong?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        ...menuItemStyle,
        ...(strong ? strongMenuItemStyle : null),
        opacity: disabled ? 0.38 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
    >
      {icon ? <span style={menuIconStyle}>{icon}</span> : null}
      <span>{label}</span>
      {shortcut ? <span style={menuShortcutStyle}>{shortcut}</span> : null}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" style={dividerStyle} />;
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

const toolbarGroupStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const componentToolbarShellStyle: CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  width: 44,
  height: 44,
  gap: 6,
  padding: 6,
  borderRadius: 6,
  background: "#FFFFFF",
  boxShadow: "0 0 4px rgba(0, 0, 0, 0.15)",
  color: "#191919",
  fontFamily:
    "var(--font-manrope), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: 14,
  fontWeight: 500,
  lineHeight: "16px",
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
  boxSizing: "border-box",
  borderRadius: 999,
  border: "1px solid rgba(15, 23, 42, 0.26)",
  boxShadow:
    "inset 0 0 0 1px rgba(255, 255, 255, 0.68), 0 1px 3px rgba(15, 23, 42, 0.22)",
  display: "block",
};

const hiddenColorInputStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  opacity: 0,
  pointerEvents: "none",
};

const menuStyle: CSSProperties = {
  width: 260,
  padding: "14px 0",
  borderRadius: 14,
  border: "1px solid #E7E8EC",
  background: "#FFFFFF",
  boxShadow: "0 20px 52px rgba(15, 23, 42, 0.22)",
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

const strongMenuItemStyle: CSSProperties = {
  color: "#000000",
};

const menuIconStyle: CSSProperties = {
  width: 22,
  height: 22,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#111827",
};

const menuShortcutStyle: CSSProperties = {
  marginLeft: "auto",
  padding: "4px 6px",
  borderRadius: 6,
  background: "#F6F6F9",
  color: "#808080",
  fontSize: 12,
  lineHeight: 1,
  whiteSpace: "nowrap",
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
