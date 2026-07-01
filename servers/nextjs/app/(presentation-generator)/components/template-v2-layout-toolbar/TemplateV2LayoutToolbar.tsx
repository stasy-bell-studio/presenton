"use client";

import { useState, type ReactNode } from "react";
import {
  AlignCenter,
  Box,
  ChevronDown,
  Grid3X3,
  PaintBucket,
  Scan,
  SlidersHorizontal,
  Sparkles,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ColorField,
  Divider,
  NumberField,
  Panel,
} from "@/components/slide-editor/inline/ShapeToolbar";

type RawRecord = Record<string, unknown>;
type LayoutElementType = "container" | "flex" | "grid";
type LayoutAlignment = "flex-start" | "center" | "flex-end" | "stretch";
type PanelId =
  | "horizontal-alignment"
  | "vertical-alignment"
  | "spacing"
  | "fill"
  | "stroke"
  | "radius"
  | "padding"
  | "shadow"
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

type TemplateV2LayoutToolbarProps = {
  box: TemplateV2LayoutToolbarBox;
  element: TemplateV2LayoutElement;
  onChange: (changes: RawRecord) => void;
};

const LAYOUT_ALIGNMENTS: Array<{
  label: string;
  value: LayoutAlignment;
}> = [
  { label: "Start", value: "flex-start" },
  { label: "Center", value: "center" },
  { label: "End", value: "flex-end" },
  { label: "Stretch", value: "stretch" },
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
        "flex h-7 items-center justify-center gap-1.5 rounded-md border-0 bg-transparent px-2 text-xs font-medium text-[#191919] hover:bg-[#F8F8FA]",
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

function FlexControls({
  element,
  onChange,
  onToggle,
  openPanel,
}: Omit<TemplateV2LayoutToolbarProps, "box"> & {
  onToggle: (panel: Exclude<PanelId, null>) => void;
  openPanel: PanelId;
}) {
  const direction = readString(element.direction, "row");
  const alignItems = readString(element.align_items, "stretch");
  const justifyContent = readString(element.justify_content, "flex-start");
  const horizontal = direction === "row" ? justifyContent : alignItems;
  const vertical = direction === "row" ? alignItems : justifyContent;

  return (
    <>
      <SelectControl
        id="horizontal-alignment"
        label="Horizontal"
        value={horizontal}
        options={LAYOUT_ALIGNMENTS}
        openPanel={openPanel}
        onToggle={onToggle}
        onChange={(value) =>
          onChange(
            direction === "row"
              ? { justify_content: value }
              : { align_items: value },
          )
        }
      />
      <SelectControl
        id="vertical-alignment"
        label="Vertical"
        value={vertical}
        options={LAYOUT_ALIGNMENTS}
        openPanel={openPanel}
        onToggle={onToggle}
        onChange={(value) =>
          onChange(
            direction === "row"
              ? { align_items: value }
              : { justify_content: value },
          )
        }
      />
      <PanelControl
        id="spacing"
        label="Spacing"
        icon={<SlidersHorizontal size={15} aria-hidden />}
        openPanel={openPanel}
        onToggle={onToggle}
        panelClassName="grid w-[280px] grid-cols-2 gap-2 p-3"
      >
        <NumberField
          label="Gap"
          value={readNumber(element.gap)}
          min={0}
          step={0.1}
          suffix="px"
          onCommit={(gap) => onChange({ gap })}
        />
        <NumberField
          label="Column"
          value={readNumber(element.column_gap)}
          min={0}
          step={0.1}
          suffix="px"
          onCommit={(column_gap) => onChange({ column_gap })}
        />
        <NumberField
          label="Row"
          value={readNumber(element.row_gap)}
          min={0}
          step={0.1}
          suffix="px"
          onCommit={(row_gap) => onChange({ row_gap })}
        />
      </PanelControl>
    </>
  );
}

function GridControls({
  element,
  onChange,
  onToggle,
  openPanel,
}: Omit<TemplateV2LayoutToolbarProps, "box"> & {
  onToggle: (panel: Exclude<PanelId, null>) => void;
  openPanel: PanelId;
}) {
  const alignItems = readString(element.align_items, "stretch");
  const justifyItems = readString(element.justify_items, "stretch");

  return (
    <>
      <SelectControl
        id="horizontal-alignment"
        label="Horizontal"
        value={justifyItems}
        options={LAYOUT_ALIGNMENTS}
        openPanel={openPanel}
        onToggle={onToggle}
        onChange={(value) => onChange({ justify_items: value })}
      />
      <SelectControl
        id="vertical-alignment"
        label="Vertical"
        value={alignItems}
        options={LAYOUT_ALIGNMENTS}
        openPanel={openPanel}
        onToggle={onToggle}
        onChange={(value) => onChange({ align_items: value })}
      />
      <PanelControl
        id="spacing"
        label="Spacing"
        icon={<SlidersHorizontal size={15} aria-hidden />}
        openPanel={openPanel}
        onToggle={onToggle}
        panelClassName="grid w-[280px] grid-cols-2 gap-2 p-3"
      >
        <NumberField
          label="Gap"
          value={readNumber(element.gap)}
          min={0}
          step={0.1}
          suffix="px"
          onCommit={(gap) => onChange({ gap })}
        />
        <NumberField
          label="Column"
          value={readNumber(element.column_gap)}
          min={0}
          step={0.1}
          suffix="px"
          onCommit={(column_gap) => onChange({ column_gap })}
        />
        <NumberField
          label="Row"
          value={readNumber(element.row_gap)}
          min={0}
          step={0.1}
          suffix="px"
          onCommit={(row_gap) => onChange({ row_gap })}
        />
      </PanelControl>
    </>
  );
}

function ContainerControls({
  box,
  element,
  onChange,
  onToggle,
  openPanel,
}: TemplateV2LayoutToolbarProps & {
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

export function TemplateV2LayoutToolbar({
  box,
  element,
  onChange,
}: TemplateV2LayoutToolbarProps) {
  const [openPanel, setOpenPanel] = useState<PanelId>(null);
  const estimatedWidth = element.type === "container" ? 700 : 440;
  const left = Math.max(8, Math.min(box.x, STAGE_WIDTH - estimatedWidth - 8));
  const top =
    box.y >= 58
      ? box.y - 50
      : Math.min(STAGE_HEIGHT - 50, box.y + box.height + 10);
  const togglePanel = (panel: Exclude<PanelId, null>) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };
  const TypeIcon =
    element.type === "grid" ? Grid3X3 : element.type === "container" ? Box : AlignCenter;

  return (
    <div
      style={{ left, top }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className="fixed z-[9] flex h-10 items-center rounded-md bg-white px-2.5 text-[#191919] shadow-[0_0_4px_rgba(0,0,0,0.15)]"
    >
      <span className="flex items-center gap-1.5 px-1 text-xs font-semibold">
        <TypeIcon size={15} aria-hidden />
        {capitalize(element.type)}
      </span>
      <Divider />

      {element.type === "flex" ? (
        <FlexControls
          element={element}
          onChange={onChange}
          openPanel={openPanel}
          onToggle={togglePanel}
        />
      ) : element.type === "grid" ? (
        <GridControls
          element={element}
          onChange={onChange}
          openPanel={openPanel}
          onToggle={togglePanel}
        />
      ) : (
        <ContainerControls
          box={box}
          element={element}
          onChange={onChange}
          openPanel={openPanel}
          onToggle={togglePanel}
        />
      )}
    </div>
  );
}

export function isTemplateV2LayoutElement(
  element: RawRecord | null | undefined,
): element is TemplateV2LayoutElement {
  return (
    element?.type === "container" ||
    element?.type === "flex" ||
    element?.type === "grid"
  );
}
