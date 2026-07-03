"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Box,
  ChevronDown,
  ChevronUp,
  Copy,
  MoreVertical,
  PaintBucket,
  Plus,
  PlusCircle,
  Scan,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Ungroup,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ColorField,
  Divider,
  NumberField,
  Panel,
} from "@/components/slide-editor/inline/ShapeToolbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  addLayoutItemChanges,
  layoutItemStats,
  removeLastLayoutItemChanges,
} from "../template-v2-layout/layoutItems";
import { isFlowLayoutElement } from "../template-v2-layout/flowLayout";
import {
  canApplyComponentLayerAction,
  type ComponentLayerAction,
} from "../template-v2-layering/componentLayering";

type RawRecord = Record<string, unknown>;
type LayoutElementType =
  | "container"
  | "flex"
  | "grid"
  | "list-view"
  | "grid-view";
type PanelId =
  | "horizontal-alignment"
  | "vertical-alignment"
  | "items"
  | "fill"
  | "stroke"
  | "radius"
  | "padding"
  | "shadow"
  | "component-menu"
  | null;

export type TemplateV2LayoutToolbarBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TemplateV2LayoutElement = RawRecord & {
  type: LayoutElementType;
};

type TemplateV2SelectionComponentActions = {
  canUngroup: boolean;
  componentIndex: number;
  componentCount: number;
  onDelete: () => void;
  onDuplicate: () => void;
  onLayerAction: (action: ComponentLayerAction) => void;
  onUngroup: () => void;
};

type TemplateV2UngroupAction = {
  canUngroup: boolean;
  onUngroup: () => void;
};

type TemplateV2LayoutToolbarProps = {
  box: TemplateV2LayoutToolbarBox;
  element?: TemplateV2LayoutElement | null;
  onChange?: (changes: RawRecord) => void;
  position?: { left: number; top: number };
  componentActions?: TemplateV2SelectionComponentActions | null;
  ungroupAction?: TemplateV2UngroupAction | null;
};

const COMPONENT_LAYER_ACTIONS: Array<{
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

const HORIZONTAL_ALIGNMENTS = ["left", "center", "right"] as const;
const VERTICAL_ALIGNMENTS = ["top", "middle", "bottom"] as const;
const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 720;

function asRecord(value: unknown): RawRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RawRecord)
    : {};
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value ? value : fallback;
}

function readColor(value: unknown, fallback: string) {
  const color = readString(value, fallback);
  return color.startsWith("#") ? color : `#${color}`;
}

function capitalize(value: string) {
  return value
    .replace("flex-", "")
    .replace(/(^|[-_])\w/g, (part) => part.replace(/[-_]/, "").toUpperCase());
}

function ControlButton({
  children,
  open,
  title,
  onClick,
}: {
  children: ReactNode;
  open?: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={open}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-md border-0 bg-transparent px-2 text-sm font-manrope font-medium text-black hover:bg-[#F8F8FA]",
        open && "bg-[#F4F1FF] text-[#7C3AED]",
      )}
    >
      {children}
    </button>
  );
}

function SelectControl({
  id,
  label,
  onChange,
  onToggle,
  openPanel,
  options,
  value,
}: {
  id: Exclude<PanelId, null>;
  label: string;
  onChange: (value: string) => void;
  onToggle: (panel: Exclude<PanelId, null>) => void;
  openPanel: PanelId;
  options: ReadonlyArray<{ label: string; value: string }>;
  value: string;
}) {
  const open = openPanel === id;
  const selectedLabel = options.find((option) => option.value === value)?.label;

  return (
    <div className="relative">
      <ControlButton title={label} open={open} onClick={() => onToggle(id)}>
        <span className="text-[#667085]">{label}:</span>
        <span>{selectedLabel ?? capitalize(value)}</span>
        <ChevronDown size={14} aria-hidden />
      </ControlButton>
      {open ? (
        <Panel className="min-w-[140px] p-1.5">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={option.value === value}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex w-full rounded-md px-3 py-2 text-left text-xs hover:bg-[#F4F3FF]",
                option.value === value && "bg-[#F4F1FF] text-[#7A5AF8]",
              )}
            >
              {option.label}
            </button>
          ))}
        </Panel>
      ) : null}
    </div>
  );
}

function PanelControl({
  children,
  icon,
  id,
  label,
  onToggle,
  openPanel,
  panelClassName = "w-[250px] p-3",
}: {
  children: ReactNode;
  icon: ReactNode;
  id: Exclude<PanelId, null>;
  label: string;
  onToggle: (panel: Exclude<PanelId, null>) => void;
  openPanel: PanelId;
  panelClassName?: string;
}) {
  const open = openPanel === id;
  return (
    <div className="relative">
      <ControlButton title={label} open={open} onClick={() => onToggle(id)}>
        {icon}
        <span>{label}</span>
      </ControlButton>
      {open ? <Panel className={panelClassName}>{children}</Panel> : null}
    </div>
  );
}

type LayoutControlsProps = {
  element: TemplateV2LayoutElement;
  onChange: (changes: RawRecord) => void;
  onToggle: (panel: Exclude<PanelId, null>) => void;
  openPanel: PanelId;
};

function FlowControls({
  element,
  onChange,
  onToggle,
  openPanel,
}: LayoutControlsProps) {
  return (
    <>
      <GapControl element={element} onChange={onChange} />
      <Divider />
      <ItemsControl
        element={element}
        onChange={onChange}
        openPanel={openPanel}
        onToggle={onToggle}
      />
    </>
  );
}

function GapControl({
  element,
  onChange,
}: {
  element: TemplateV2LayoutElement;
  onChange: (changes: RawRecord) => void;
}) {
  const value = readGapValue(element);
  const commit = (nextValue: number) => {
    const gap = Math.max(0, Math.round(nextValue * 10) / 10);
    onChange({ gap, column_gap: gap, row_gap: gap });
  };

  return (
    <label className="flex h-10 items-center gap-2 px-1 text-sm font-medium text-[#191919]">
      <span>Gap</span>
      <span className="flex h-8 items-center rounded-md bg-white">
        <input
          type="number"
          min={0}
          step={1}
          aria-label="Gap"
          value={formatGapValue(value)}
          onChange={(event) => {
            const nextValue = Number(event.target.value);
            if (Number.isFinite(nextValue)) commit(nextValue);
          }}
          className="h-8 w-9 border-0 bg-transparent p-0 text-center text-sm font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="flex h-7 w-4 flex-col items-center justify-center">
          <button
            type="button"
            title="Increase gap"
            aria-label="Increase gap"
            onClick={() => commit(value + 1)}
            className="grid h-3 w-4 place-items-center rounded-sm text-[#05070A] hover:bg-[#F8F8FA]"
          >
            <ChevronUp size={11} strokeWidth={2.4} aria-hidden />
          </button>
          <button
            type="button"
            title="Decrease gap"
            aria-label="Decrease gap"
            onClick={() => commit(value - 1)}
            className="grid h-3 w-4 place-items-center rounded-sm text-[#05070A] hover:bg-[#F8F8FA]"
          >
            <ChevronDown size={11} strokeWidth={2.4} aria-hidden />
          </button>
        </span>
      </span>
    </label>
  );
}

function ItemsControl({
  element,
  onChange,
  onToggle,
  openPanel,
}: LayoutControlsProps) {
  const { canAdd, canRemove, children } = layoutItemStats(element);
  const addItem = () => {
    if (!canAdd) return;
    onChange(addLayoutItemChanges(element));
    onToggle("items");
  };
  const removeItem = () => {
    if (!canRemove) return;
    const changes = removeLastLayoutItemChanges(element);
    if (changes) onChange(changes);
    onToggle("items");
  };
  const open = openPanel === "items";

  return (
    <div className="relative">
      <button
        type="button"
        title="Items"
        aria-label="Items"
        aria-expanded={open}
        onClick={() => onToggle("items")}
        className={cn(
          "grid h-8 w-8 place-items-center rounded-md border-0 bg-transparent text-[#05070A] hover:bg-[#F8F8FA]",
          open && "bg-[#F4F1FF] text-[#7C3AED]",
        )}
      >
        <PlusCircle size={20} strokeWidth={2.2} aria-hidden />
      </button>
      {open ? (
        <Panel className="w-[245px] overflow-hidden p-0">
          <button
            type="button"
            disabled={!canAdd}
            onClick={addItem}
            className={cn(
              "flex h-[78px] w-full items-center gap-4 px-7 text-left text-[13px] font-medium text-[#191919] hover:bg-[#F8F8FA]",
              !canAdd &&
              "cursor-not-allowed text-[#A0A3AD] hover:bg-transparent",
            )}
          >
            <Plus size={20} strokeWidth={2.2} aria-hidden />
            <span>Add Item</span>
          </button>
          <div className="h-px bg-[#E7E8EC]" aria-hidden />
          <button
            type="button"
            disabled={!canRemove}
            onClick={removeItem}
            className={cn(
              "flex h-[78px] w-full items-center gap-4 px-7 text-left text-[13px] font-medium text-[#191919] hover:bg-[#F8F8FA]",
              !canRemove &&
              "cursor-not-allowed text-[#A0A3AD] hover:bg-transparent",
            )}
          >
            <Trash2 size={20} strokeWidth={2.2} aria-hidden />
            <span>Last Item</span>
            <span className="ml-auto text-[11px] text-[#8A8D96]">
              {children.length}
            </span>
          </button>
        </Panel>
      ) : null}
    </div>
  );
}

function readGapValue(element: RawRecord) {
  return readNumber(
    element.gap,
    readNumber(element.column_gap, readNumber(element.row_gap)),
  );
}

function formatGapValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function ContainerControls({
  box,
  element,
  onChange,
  onToggle,
  openPanel,
}: {
  box: TemplateV2LayoutToolbarBox;
  element: TemplateV2LayoutElement;
  onChange: (changes: RawRecord) => void;
  onToggle: (panel: Exclude<PanelId, null>) => void;
  openPanel: PanelId;
}) {
  const alignment = asRecord(element.alignment);
  const fill = asRecord(element.fill);
  const stroke = asRecord(element.stroke);
  const padding = asRecord(element.padding);
  const shadow = asRecord(element.shadow);
  const borderRadius = asRecord(element.border_radius);
  const radius =
    typeof element.border_radius === "number"
      ? element.border_radius
      : readNumber(borderRadius.radius, readNumber(borderRadius.tl));
  const maxRadius = Math.max(0, Math.min(box.width, box.height) / 2);
  const shadowEnabled = readNumber(shadow.opacity, 0.2) > 0;

  return (
    <>
      <SelectControl
        id="horizontal-alignment"
        label="Horizontal"
        value={readString(alignment.horizontal, "left")}
        options={HORIZONTAL_ALIGNMENTS.map((value) => ({
          label: capitalize(value),
          value,
        }))}
        openPanel={openPanel}
        onToggle={onToggle}
        onChange={(horizontal) =>
          onChange({ alignment: { ...alignment, horizontal } })
        }
      />
      <SelectControl
        id="vertical-alignment"
        label="Vertical"
        value={readString(alignment.vertical, "top")}
        options={VERTICAL_ALIGNMENTS.map((value) => ({
          label: capitalize(value),
          value,
        }))}
        openPanel={openPanel}
        onToggle={onToggle}
        onChange={(vertical) =>
          onChange({ alignment: { ...alignment, vertical } })
        }
      />

      <PanelControl
        id="fill"
        label="Fill"
        icon={<PaintBucket size={15} aria-hidden />}
        openPanel={openPanel}
        onToggle={onToggle}
        panelClassName="w-[240px] space-y-3 p-3"
      >
        <ColorField
          label="Color"
          color={readColor(fill.color, "#FFFFFF")}
          onCommit={(color) => onChange({ fill: { ...fill, color } })}
        />
        <NumberField
          label="Opacity"
          value={readNumber(fill.opacity, 1)}
          min={0}
          max={1}
          step={0.05}
          onCommit={(opacity) => onChange({ fill: { ...fill, opacity } })}
        />
      </PanelControl>

      <PanelControl
        id="stroke"
        label="Border"
        icon={<Square size={15} aria-hidden />}
        openPanel={openPanel}
        onToggle={onToggle}
        panelClassName="w-[240px] space-y-3 p-3"
      >
        <ColorField
          label="Color"
          color={readColor(stroke.color, "#1A1A1A")}
          onCommit={(color) => onChange({ stroke: { ...stroke, color } })}
        />
        <NumberField
          label="Width"
          value={readNumber(stroke.width)}
          min={0}
          max={32}
          step={0.25}
          suffix="px"
          onCommit={(width) => onChange({ stroke: { ...stroke, width } })}
        />
        <NumberField
          label="Opacity"
          value={readNumber(stroke.opacity, 1)}
          min={0}
          max={1}
          step={0.05}
          onCommit={(opacity) => onChange({ stroke: { ...stroke, opacity } })}
        />
      </PanelControl>

      <PanelControl
        id="radius"
        label="Radius"
        icon={<Scan size={15} aria-hidden />}
        openPanel={openPanel}
        onToggle={onToggle}
        panelClassName="w-[220px] p-3"
      >
        <NumberField
          label="Radius"
          value={radius}
          min={0}
          max={maxRadius}
          step={0.5}
          suffix="px"
          onCommit={(value) =>
            onChange({
              border_radius: { tl: value, tr: value, br: value, bl: value },
            })
          }
        />
      </PanelControl>

      <PanelControl
        id="padding"
        label="Padding"
        icon={<SlidersHorizontal size={15} aria-hidden />}
        openPanel={openPanel}
        onToggle={onToggle}
        panelClassName="grid w-[290px] grid-cols-2 gap-2 p-3"
      >
        {(["top", "right", "bottom", "left"] as const).map((side) => (
          <NumberField
            key={side}
            label={capitalize(side)}
            value={readNumber(padding[side])}
            min={0}
            step={0.5}
            suffix="px"
            onCommit={(value) =>
              onChange({ padding: { ...padding, [side]: value } })
            }
          />
        ))}
      </PanelControl>

      <PanelControl
        id="shadow"
        label="Shadow"
        icon={<Sparkles size={15} aria-hidden />}
        openPanel={openPanel}
        onToggle={onToggle}
        panelClassName="w-[280px] space-y-3 p-3"
      >
        <label className="flex items-center justify-between text-xs text-[#4B5563]">
          <span>Enabled</span>
          <input
            type="checkbox"
            checked={shadowEnabled}
            onChange={(event) =>
              onChange({
                shadow: {
                  ...shadow,
                  blur: readNumber(shadow.blur, 8),
                  offset_y: readNumber(shadow.offset_y, 4),
                  opacity: event.target.checked
                    ? Math.max(0.2, readNumber(shadow.opacity, 0.2))
                    : 0,
                },
              })
            }
            className="h-4 w-4 accent-[#7A5AF8]"
          />
        </label>
        <ColorField
          label="Color"
          color={readColor(shadow.color, "#000000")}
          onCommit={(color) => onChange({ shadow: { ...shadow, color } })}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Blur"
            value={readNumber(shadow.blur)}
            min={0}
            max={100}
            step={0.5}
            suffix="px"
            onCommit={(blur) => onChange({ shadow: { ...shadow, blur } })}
          />
          <NumberField
            label="Opacity"
            value={readNumber(shadow.opacity, 0.2)}
            min={0}
            max={1}
            step={0.05}
            onCommit={(opacity) => onChange({ shadow: { ...shadow, opacity } })}
          />
          <NumberField
            label="X"
            value={readNumber(shadow.offset_x)}
            step={0.5}
            suffix="px"
            onCommit={(offset_x) =>
              onChange({ shadow: { ...shadow, offset_x } })
            }
          />
          <NumberField
            label="Y"
            value={readNumber(shadow.offset_y)}
            step={0.5}
            suffix="px"
            onCommit={(offset_y) =>
              onChange({ shadow: { ...shadow, offset_y } })
            }
          />
        </div>
      </PanelControl>
    </>
  );
}

function ComponentMoreMenu({
  actions,
  onOpenChange,
  openPanel,
}: {
  actions: TemplateV2SelectionComponentActions;
  onOpenChange: (open: boolean) => void;
  openPanel: PanelId;
}) {
  const open = openPanel === "component-menu";
  const run = (callback: () => void) => callback();

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
        align="end"
        sideOffset={12}
        collisionPadding={8}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        className="z-[10001] box-border w-[206px] rounded-[12px] border border-[#EDEEEF] bg-white py-2 font-syne text-[14px] font-normal leading-normal tracking-[0.14px] text-[#191919] shadow-[0_6px_18px_rgba(16,24,40,0.08)]"
      >
        <ToolbarMenuItem
          strong
          icon={Copy}
          label="Duplicate"
          onClick={() => run(actions.onDuplicate)}
        />
        {COMPONENT_LAYER_ACTIONS.map(({ action, label, shortcut }) => {
          const disabled = !canApplyComponentLayerAction(
            actions.componentIndex,
            actions.componentCount,
            action,
          );
          return (
            <ToolbarMenuItem
              key={action}
              disabled={disabled}
              label={label}
              shortcut={shortcut}
              onClick={() => run(() => actions.onLayerAction(action))}
            />
          );
        })}
        <DropdownMenuSeparator className="my-1 h-px bg-[#E7E8EC]" />
        <ToolbarMenuItem
          strong
          icon={Trash2}
          label="Delete Slide"
          onClick={() => run(actions.onDelete)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ToolbarMenuItem({
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
            "ml-auto inline-flex px-1.5 py-1 items-center justify-center rounded-[6px] bg-[#F6F6F9]  font-manrope text-[14px] font-normal leading-none tracking-[0.14px] text-[#808080]",
            disabled && "bg-[#F7F7FA] text-[#B0B3BB]",
          )}
        >
          {shortcut}
        </span>
      ) : null}
    </DropdownMenuItem>
  );
}

export function TemplateV2LayoutToolbar({
  box,
  element,
  onChange,
  position,
  componentActions,
  ungroupAction: flowUngroupAction,
}: TemplateV2LayoutToolbarProps) {
  const [openPanel, setOpenPanel] = useState<PanelId>(null);
  const layoutType = element ? normalizedLayoutType(element) : null;
  const hasFlowControls = Boolean(
    element && onChange && (layoutType === "flex" || layoutType === "grid"),
  );
  const hasContainerControls = Boolean(
    element && onChange && layoutType === "container",
  );
  const hasLayoutControls = hasFlowControls || hasContainerControls;
  const ungroupAction = componentActions?.canUngroup
    ? componentActions
    : flowUngroupAction?.canUngroup
      ? flowUngroupAction
      : null;
  if (!componentActions && !hasLayoutControls && !ungroupAction) return null;

  const estimatedWidth = toolbarWidthEstimate({
    componentActions,
    hasUngroupAction: Boolean(ungroupAction),
    hasContainerControls,
    hasFlowControls,
  });
  const left =
    position?.left ??
    Math.max(8, Math.min(box.x, STAGE_WIDTH - estimatedWidth - 8));
  const top =
    position?.top ??
    (box.y >= 58
      ? box.y - 50
      : Math.min(STAGE_HEIGHT - 50, box.y + box.height + 10));
  const togglePanel = (panel: Exclude<PanelId, null>) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };
  const setPanelOpen = (panel: Exclude<PanelId, null>, open: boolean) => {
    setOpenPanel((current) =>
      open ? panel : current === panel ? null : current,
    );
  };

  const toolbar = (
    <div
      data-template-v2-floating-toolbar="true"
      style={{ left, top }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className="fixed z-[10000] flex h-10 items-center rounded-[10px] bg-white px-2.5 text-[#191919] shadow-[0_0_4px_rgba(0,0,0,0.15)]"
    >
      {ungroupAction ? (
        <>
          <ControlButton title="Ungroup" onClick={ungroupAction.onUngroup}>

            <span>Ungroup</span>
          </ControlButton>
          <Divider />
        </>
      ) : null}
      {hasFlowControls && element && onChange ? (
        <FlowControls
          element={element}
          onChange={onChange}
          openPanel={openPanel}
          onToggle={togglePanel}
        />
      ) : hasContainerControls && element && onChange ? (
        <>
          <span className="flex items-center gap-1.5 px-1 text-xs font-semibold">
            <Box size={15} aria-hidden />
            {capitalize(element.type)}
          </span>
          <Divider />
          <ContainerControls
            box={box}
            element={element}
            onChange={onChange}
            openPanel={openPanel}
            onToggle={togglePanel}
          />
        </>
      ) : null}
      {componentActions ? (
        <>
          {hasLayoutControls ? <Divider /> : null}
          <ComponentMoreMenu
            actions={componentActions}
            openPanel={openPanel}
            onOpenChange={(open) => setPanelOpen("component-menu", open)}
          />
        </>
      ) : null}
    </div>
  );

  return position && typeof document !== "undefined"
    ? createPortal(toolbar, document.body)
    : toolbar;
}

function normalizedLayoutType(element: TemplateV2LayoutElement) {
  if (element.type === "list-view") return "flex";
  if (element.type === "grid-view") return "grid";
  return element.type;
}

function toolbarWidthEstimate({
  componentActions,
  hasUngroupAction,
  hasContainerControls,
  hasFlowControls,
}: {
  componentActions?: TemplateV2SelectionComponentActions | null;
  hasUngroupAction: boolean;
  hasContainerControls: boolean;
  hasFlowControls: boolean;
}) {
  if (hasContainerControls) {
    return 700 + (componentActions ? 48 : 0);
  }
  return (
    (hasUngroupAction ? 116 : 0) +
    (hasFlowControls ? 130 : 0) +
    (componentActions ? 48 : 0) +
    28
  );
}

export function isTemplateV2LayoutElement(
  element: RawRecord | null | undefined,
): element is TemplateV2LayoutElement {
  return (
    element?.type === "container" ||
    isTemplateV2FlowLayoutElement(element)
  );
}

export function isTemplateV2FlowLayoutElement(
  element: RawRecord | null | undefined,
): element is TemplateV2LayoutElement {
  return (
    element?.type === "flex" ||
    element?.type === "grid" ||
    element?.type === "list-view" ||
    element?.type === "grid-view" ||
    Boolean(element && isFlowLayoutElement(element))
  );
}
