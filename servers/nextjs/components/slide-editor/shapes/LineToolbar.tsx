import { useState } from "react";
import {
  ChevronDown,
  Cloud,
  Maximize2,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SLIDE_H, SLIDE_W } from "@/components/slide-editor/schema/slide-schema";
import type { LineSlideElement } from "@/components/slide-editor/state/state";
import { OpacitySwatchIcon } from "@/components/slide-editor/toolbar/OpacitySwatchIcon";
import { withHash } from "@/components/slide-editor/utils/color";
import {
  ColorField,
  Divider,
  NumberField,
  Panel,
  SliderField,
  ToolbarButton,
} from "@/components/slide-editor/shapes/ShapeToolbar";

type LinePanel =
  | "width"
  | "color"
  | "style"
  | "transform"
  | "shadow"
  | "opacity"
  | null;

type LineStyleKey = "solid" | "dashed" | "dotted";

const LINE_STYLE_OPTIONS: Array<{
  key: LineStyleKey;
  label: string;
  dash: number[];
}> = [
  { key: "solid", label: "Solid", dash: [] },
  { key: "dashed", label: "Dashed", dash: [10, 6] },
  { key: "dotted", label: "Dotted", dash: [2, 4] },
];

const DEFAULT_LINE_SHADOW = {
  color: "#000000",
  blur: 8,
  opacity: 0.2,
  offset_x: 0.04,
  offset_y: 0.04,
};

export function LineToolbar({
  element,
  index,
  scale,
  onChange,
}: {
  element: LineSlideElement;
  index: number;
  scale: number;
  onChange: (index: number, element: LineSlideElement) => void;
}) {
  const [openPanel, setOpenPanel] = useState<LinePanel>(null);
  const position = element.position ?? { x: 0, y: 0 };
  const size = element.size ?? { width: 0.1, height: 0.01 };
  const stroke = element.stroke;
  const shadow = element.shadow ?? DEFAULT_LINE_SHADOW;
  const shadowEnabled = element.shadow != null;
  const currentStyle = lineStyleFromDash(stroke.dash);
  const toolbarLeft = Math.max(
    8,
    Math.min(position.x * scale, SLIDE_W * scale - 430),
  );

  const update = (changes: Partial<LineSlideElement>) => {
    onChange(index, { ...element, ...changes });
  };

  const setStroke = (changes: Partial<LineSlideElement["stroke"]>) => {
    update({ stroke: { ...stroke, ...changes } });
  };

  const togglePanel = (panel: Exclude<LinePanel, null>) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  return (
    <div
      data-template-v2-floating-toolbar="true"
      data-inline-edit-ignore="true"
      style={{
        left: toolbarLeft,
        top: Math.max(8, position.y * scale - 52),
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className="fixed z-[10000] inline-flex h-10 items-center gap-3 rounded-[6px] bg-white px-[10px] py-[6px] text-[#191919] shadow-[0_0_4px_rgba(0,0,0,0.15)]"
    >
      <div className="relative">
        <button
          type="button"
          title="Line style"
          aria-label="Line style"
          aria-expanded={openPanel === "style"}
          onClick={() => togglePanel("style")}
          className={cn(
            "flex min-w-[92px] items-center justify-between gap-2 rounded-[10px] border-0 bg-transparent py-[6px] text-[14px] font-medium font-syne leading-4 text-[#191919] hover:bg-[#F8F8FA]",
            openPanel === "style" && "bg-[#F4F1FF] text-[#7C3AED]",
          )}
        >
          <span className="inline-flex items-center gap-2">
            <Minus size={16} strokeWidth={1.8} aria-hidden="true" />
            {currentStyle.label}
          </span>
          <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
        </button>
        {openPanel === "style" ? (
          <Panel className="w-[200px] overflow-hidden rounded-[12px] border border-[#E8E9EE] py-2 shadow-[0_8px_24px_rgba(16,24,40,0.12)]">
            {LINE_STYLE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={currentStyle.key === option.key}
                onClick={() => setStroke({ dash: option.dash })}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-[14px] font-manrope text-[#191919] hover:bg-[#F8F8FA]",
                  currentStyle.key === option.key && "bg-[#F4F1FF] text-[#7C3AED]",
                )}
              >
                <span>{option.label}</span>
                <LinePreview dash={option.dash} />
              </button>
            ))}
          </Panel>
        ) : null}
      </div>

      <Divider />

      <div className="relative">
        <ToolbarButton
          title="Line border"
          pressed={openPanel === "width"}
          onClick={() => togglePanel("width")}
        >
          <LineWidthIcon />
        </ToolbarButton>
        {openPanel === "width" ? (
          <Panel className="w-[220px] space-y-3 p-3">
            <ColorField
              label="Border color"
              color={stroke.color}
              onCommit={(color) => setStroke({ color })}
            />
            <NumberField
              label="Border width"
              value={stroke.width}
              min={0}
              max={8}
              step={0.25}
              suffix="pt"
              onCommit={(width) => setStroke({ width })}
            />
            <SliderField
              label="Border opacity"
              value={stroke.opacity ?? 1}
              min={0}
              max={1}
              step={0.01}
              formatValue={(value) => `${Math.round(value * 100)}%`}
              onCommit={(opacity) => setStroke({ opacity })}
            />
          </Panel>
        ) : null}
      </div>

      <div className="relative">
        <ToolbarButton
          title="Line color"
          pressed={openPanel === "color"}
          onClick={() => togglePanel("color")}
        >
          <span
            aria-hidden="true"
            className="h-4 w-4 rounded-full border border-black/10"
            style={{ backgroundColor: withHash(stroke.color) }}
          />
        </ToolbarButton>
        {openPanel === "color" ? (
          <Panel className="w-[220px] p-3">
            <ColorField
              label="Line color"
              color={stroke.color}
              onCommit={(color) => setStroke({ color })}
            />
          </Panel>
        ) : null}
      </div>

      <Divider />

      <div className="relative">
        <ToolbarButton
          title="Line transform"
          pressed={openPanel === "transform"}
          onClick={() => togglePanel("transform")}
        >
          <Maximize2 size={16} strokeWidth={1.8} aria-hidden="true" />
        </ToolbarButton>
        {openPanel === "transform" ? (
          <Panel className="w-[260px] space-y-3 p-3">
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="X"
                value={position.x}
                step={0.01}
                onCommit={(x) => update({ position: { ...position, x } })}
              />
              <NumberField
                label="Y"
                value={position.y}
                step={0.01}
                onCommit={(y) => update({ position: { ...position, y } })}
              />
              <NumberField
                label="W"
                value={size.width}
                min={0.01}
                max={SLIDE_W}
                step={0.01}
                onCommit={(width) => update({ size: { ...size, width } })}
              />
              <NumberField
                label="H"
                value={size.height}
                min={0.01}
                max={SLIDE_H}
                step={0.01}
                onCommit={(height) => update({ size: { ...size, height } })}
              />
            </div>
            <NumberField
              label="Rotation"
              value={element.rotation ?? 0}
              min={-360}
              max={360}
              step={1}
              suffix="deg"
              onCommit={(rotation) => update({ rotation })}
            />
          </Panel>
        ) : null}
      </div>

      <Divider />

      <div className="relative">
        <ToolbarButton
          title="Line shadow"
          pressed={openPanel === "shadow" || shadowEnabled}
          onClick={() => togglePanel("shadow")}
        >
          <Cloud size={16} strokeWidth={1.7} aria-hidden="true" />
        </ToolbarButton>
        {openPanel === "shadow" ? (
          <Panel className="left-auto right-0 w-[244px] translate-x-0 space-y-3 p-3">
            <button
              type="button"
              aria-pressed={shadowEnabled}
              onClick={() =>
                update({ shadow: shadowEnabled ? undefined : shadow })
              }
              className="flex w-full items-center justify-between rounded-md border border-[#EDEEEF] px-3 py-2 text-xs font-medium text-[#191919]"
            >
              Drop shadow
              <span
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  shadowEnabled ? "bg-[#7C51F8]" : "bg-[#D1D5DB]",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                    shadowEnabled ? "translate-x-[18px]" : "translate-x-0.5",
                  )}
                />
              </span>
            </button>
            {shadowEnabled ? (
              <>
                <ColorField
                  label="Shadow color"
                  color={shadow.color ?? "#000000"}
                  onCommit={(color) => update({ shadow: { ...shadow, color } })}
                />
                <NumberField
                  label="Blur"
                  value={shadow.blur ?? DEFAULT_LINE_SHADOW.blur}
                  min={0}
                  max={100}
                  step={1}
                  onCommit={(blur) => update({ shadow: { ...shadow, blur } })}
                />
                <SliderField
                  label="Shadow opacity"
                  value={shadow.opacity ?? DEFAULT_LINE_SHADOW.opacity}
                  min={0}
                  max={1}
                  step={0.01}
                  formatValue={(value) => `${Math.round(value * 100)}%`}
                  onCommit={(opacity) =>
                    update({ shadow: { ...shadow, opacity } })
                  }
                />
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="X"
                    value={shadow.offset_x ?? DEFAULT_LINE_SHADOW.offset_x}
                    min={-2}
                    max={2}
                    step={0.01}
                    onCommit={(offset_x) =>
                      update({ shadow: { ...shadow, offset_x } })
                    }
                  />
                  <NumberField
                    label="Y"
                    value={shadow.offset_y ?? DEFAULT_LINE_SHADOW.offset_y}
                    min={-2}
                    max={2}
                    step={0.01}
                    onCommit={(offset_y) =>
                      update({ shadow: { ...shadow, offset_y } })
                    }
                  />
                </div>
              </>
            ) : null}
          </Panel>
        ) : null}
      </div>

      <div className="relative">
        <ToolbarButton
          title="Line opacity"
          pressed={openPanel === "opacity"}
          onClick={() => togglePanel("opacity")}
        >
          <OpacitySwatchIcon />
        </ToolbarButton>
        {openPanel === "opacity" ? (
          <Panel className="left-auto right-0 w-[220px] translate-x-0 p-3">
            <SliderField
              label="Line opacity"
              value={element.opacity ?? 1}
              min={0}
              max={1}
              step={0.01}
              formatValue={(value) => `${Math.round(value * 100)}%`}
              onCommit={(opacity) => update({ opacity })}
            />
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

function lineStyleFromDash(dash: unknown): (typeof LINE_STYLE_OPTIONS)[number] {
  const dashArray = Array.isArray(dash)
    ? dash.filter((item): item is number => typeof item === "number")
    : [];
  return (
    LINE_STYLE_OPTIONS.find(
      (option) =>
        option.dash.length === dashArray.length &&
        option.dash.every((value, index) => value === dashArray[index]),
    ) ?? LINE_STYLE_OPTIONS[0]
  );
}

function LineWidthIcon() {
  return (
    <span className="flex h-4 w-[13.7px] flex-col justify-center gap-[1.14px]" aria-hidden>
      <span className="h-[1.71px] w-full bg-current" />
      <span className="h-[3.43px] w-full bg-current" />
      <span className="h-[5.71px] w-full bg-current" />
    </span>
  );
}

function LinePreview({ dash }: { dash: number[] }) {
  return (
    <svg aria-hidden="true" className="h-4 w-14" viewBox="0 0 56 16">
      <line
        x1="4"
        y1="8"
        x2="52"
        y2="8"
        stroke="currentColor"
        strokeDasharray={dash.length ? dash.join(" ") : undefined}
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}
