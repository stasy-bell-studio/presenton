import { useEffect, useState, type ReactNode } from "react";
import {
  Circle,
  Cloud,
  Scan,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { withHash } from "@/components/slide-editor/utils/color";
import {
  averageBorderRadius,
  elementBox,
  uniformBorderRadius,
} from "@/components/slide-editor/model/element-model";
import { EDITOR_STAGE_HEIGHT, EDITOR_STAGE_WIDTH } from "@/components/slide-editor/types";
import type { ShapeSlideElement } from "@/components/slide-editor/state/state";
import { DeferredColorInput } from "@/components/slide-editor/toolbar/DeferredColorInput";
import {
  FloatingToolbar,
  FloatingToolbarPanel,
  type FloatingToolbarBox,
} from "@/components/slide-editor/toolbar/FloatingToolbar";
import { OpacitySwatchIcon } from "@/components/slide-editor/toolbar/OpacitySwatchIcon";
import {
  numericInputMode,
  preventInvalidNumberInput,
  sanitizeNumericInput,
} from "@/components/slide-editor/toolbar/numericInput";

type ShapePanel =
  | "type"
  | "fill"
  | "stroke"
  | "radius"
  | "shadow"
  | "opacity"
  | null;

const SHAPE_TYPES: Array<{
  icon: typeof Square;
  label: string;
  value: ShapeSlideElement["type"];
}> = [
  { icon: Square, label: "Rectangle", value: "rectangle" },
  { icon: Circle, label: "Ellipse", value: "ellipse" },
];

const DEFAULT_SHAPE_SHADOW = {
  color: "#000000",
  blur: 10,
  opacity: 0.18,
  offset_x: 0.06,
  offset_y: 0.06,
};

export function ShapeToolbar({
  anchorBox,
  element,
  index,
  scale,
  onChange,
}: {
  anchorBox?: FloatingToolbarBox | null;
  element: ShapeSlideElement;
  index: number;
  scale: number;
  onChange: (index: number, element: ShapeSlideElement) => void;
}) {
  const [openPanel, setOpenPanel] = useState<ShapePanel>(null);
  const box = elementBox(element);
  const fill = element.fill ?? { color: "#FFFFFF", opacity: 1 };
  const stroke = element.stroke ?? {
    color: "#1A1A1A",
    opacity: 1,
    width: 0,
  };
  const shadow = element.shadow ?? DEFAULT_SHAPE_SHADOW;
  const shadowEnabled = element.shadow != null;
  const isRectangle = element.type === "rectangle";
  const maxRadius = Math.max(
    1,
    Math.min(128, box.w / 2, box.h / 2),
  );
  const radius = isRectangle
    ? Math.min(maxRadius, averageBorderRadius(element.border_radius))
    : 0;

  const update = (changes: Partial<ShapeSlideElement>) => {
    onChange(index, { ...element, ...changes } as ShapeSlideElement);
  };

  const updateType = (type: ShapeSlideElement["type"]) => {
    const next = { ...element, type } as ShapeSlideElement &
      Record<string, unknown>;
    if (type === "ellipse") delete next.border_radius;
    onChange(index, next);
    setOpenPanel(null);
  };

  const togglePanel = (panel: Exclude<ShapePanel, null>) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  return (
    <FloatingToolbar
      anchorBox={
        anchorBox ?? {
          x: box.x * scale,
          y: box.y * scale,
          width: box.w * scale,
          height: box.h * scale,
        }
      }
      fallbackWidth={380}
      inlineEditIgnore
      className="inline-flex items-center gap-3 rounded-[6px] bg-white px-[10px] py-[6px] text-[#191919] shadow-[0_0_4px_rgba(0,0,0,0.15)]"
    >
      <div className="relative">
        <button
          type="button"
          aria-label="Shape fill"
          aria-expanded={openPanel === "fill"}
          title="Shape fill"
          onClick={() => togglePanel("fill")}
          className={cn(
            "grid h-[22px] w-[22px] place-items-center rounded-[999px] border border-[#D7DAE3] hover:bg-[#F8F8FA]",
            openPanel === "fill" && "ring-2 ring-[#2E90FA]/30",
          )}
        >
          <span
            aria-hidden="true"
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: withHash(fill.color) }}
          />
        </button>
        {openPanel === "fill" ? (
          <Panel className="w-[220px] space-y-3 p-3">
            <ColorField
              label="Fill color"
              color={fill.color}
              onCommit={(color) => update({ fill: { ...fill, color } })}
            />
            <SliderField
              label="Fill opacity"
              value={fill.opacity ?? 1}
              min={0}
              max={1}
              step={0.01}
              formatValue={(value) => `${Math.round(value * 100)}%`}
              onCommit={(opacity) =>
                update({ fill: { ...fill, opacity } })
              }
            />
          </Panel>
        ) : null}
      </div>

      <div className="relative">
        <ToolbarButton
          title="Shape border"
          pressed={openPanel === "stroke"}
          onClick={() => togglePanel("stroke")}
        >
          <LineWidthIcon />
        </ToolbarButton>
        {openPanel === "stroke" ? (
          <Panel className="w-[220px] space-y-3 p-3">
            <ColorField
              label="Border color"
              color={stroke.color}
              onCommit={(color) => update({ stroke: { ...stroke, color } })}
            />
            <SliderField
              label="Border width"
              value={stroke.width ?? 0}
              min={0}
              max={16}
              step={0.5}
              formatValue={(value) => `${formatNumber(value)}pt`}
              onCommit={(width) => update({ stroke: { ...stroke, width } })}
            />
            <SliderField
              label="Border opacity"
              value={stroke.opacity ?? 1}
              min={0}
              max={1}
              step={0.01}
              formatValue={(value) => `${Math.round(value * 100)}%`}
              onCommit={(opacity) =>
                update({ stroke: { ...stroke, opacity } })
              }
            />
          </Panel>
        ) : null}
      </div>

      <div className="relative">
        <ToolbarButton
          title="Shape type"
          pressed={openPanel === "type"}
          onClick={() => togglePanel("type")}
        >
          {isRectangle ? <Square size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
        </ToolbarButton>
        {openPanel === "type" ? (
          <Panel className="w-[180px] p-3">
            <div className="space-y-1.5">
              {SHAPE_TYPES.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={element.type === option.value}
                    onClick={() => updateType(option.value)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-[#F4F3FF]",
                      element.type === option.value &&
                        "bg-[#F4F1FF] text-[#7A5AF8]",
                    )}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </Panel>
        ) : null}
      </div>

      {isRectangle ? (
        <div className="relative">
          <ToolbarButton
            title="Border radius"
            pressed={openPanel === "radius"}
            onClick={() => togglePanel("radius")}
          >
            <Scan size={16} aria-hidden="true" />
          </ToolbarButton>
          {openPanel === "radius" ? (
            <Panel className="w-[220px] p-3">
              <SliderField
                label="Border radius"
                value={radius}
                min={0}
                max={maxRadius}
                step={Math.max(0.001, maxRadius / 100)}
                formatValue={(value) => formatNumber(value)}
                onCommit={(value) =>
                  update({ border_radius: uniformBorderRadius(value) })
                }
              />
            </Panel>
          ) : null}
        </div>
      ) : null}

      <Divider />

      <div className="relative">
        <ToolbarButton
          title="Shape shadow"
          pressed={openPanel === "shadow" || shadowEnabled}
          onClick={() => togglePanel("shadow")}
        >
          <Cloud size={16} strokeWidth={1.7} aria-hidden="true" />
        </ToolbarButton>
        {openPanel === "shadow" ? (
          <Panel className="left-auto right-0 w-[244px] translate-x-0 space-y-3 p-3">
            <label className="flex items-center justify-between text-xs font-medium text-[#191919]">
              <span>Drop shadow</span>
              <button
                type="button"
                role="switch"
                aria-checked={shadowEnabled}
                onClick={() =>
                  update({ shadow: shadowEnabled ? undefined : shadow })
                }
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  shadowEnabled ? "bg-[#7C51F8]" : "bg-[#D1D5DB]",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                    shadowEnabled ? "translate-x-[18px]" : "translate-x-0.5",
                  )}
                />
              </button>
            </label>
            {shadowEnabled ? (
              <>
                <div className="h-px bg-[#EDEEEF]" />
                <ColorField
                  label="Shadow color"
                  color={shadow.color ?? "#000000"}
                  onCommit={(color) => update({ shadow: { ...shadow, color } })}
                />
                <NumberField
                  label="Blur"
                  value={shadow.blur ?? DEFAULT_SHAPE_SHADOW.blur}
                  min={0}
                  max={100}
                  step={1}
                  onCommit={(blur) => update({ shadow: { ...shadow, blur } })}
                />
                <SliderField
                  label="Shadow opacity"
                  value={shadow.opacity ?? DEFAULT_SHAPE_SHADOW.opacity}
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
                    label="Offset X"
                    value={shadow.offset_x ?? DEFAULT_SHAPE_SHADOW.offset_x}
                    min={-2}
                    max={2}
                    step={0.01}
                    onCommit={(offset_x) =>
                      update({ shadow: { ...shadow, offset_x } })
                    }
                  />
                  <NumberField
                    label="Offset Y"
                    value={shadow.offset_y ?? DEFAULT_SHAPE_SHADOW.offset_y}
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
          title="Shape opacity"
          pressed={openPanel === "opacity"}
          onClick={() => togglePanel("opacity")}
        >
          <OpacitySwatchIcon />
        </ToolbarButton>
        {openPanel === "opacity" ? (
          <Panel className="left-auto right-0 w-[220px] translate-x-0 p-3">
            <SliderField
              label="Shape opacity"
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
    </FloatingToolbar>
  );
}

export function ToolbarButton({
  children,
  onClick,
  pressed,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "relative flex h-7 min-w-7 items-center justify-center gap-1 rounded-[2px] border-0 bg-transparent px-1 text-[#05070A] hover:bg-[#F8F8FA]",
        pressed && "bg-[#F4F1FF] text-[#7C3AED]",
      )}
    >
      {children}
    </button>
  );
}

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <FloatingToolbarPanel
      className={cn(
        "absolute left-1/2 top-[calc(100%+10px)] z-10 box-border -translate-x-1/2 rounded-lg bg-white shadow-[0_0_4px_rgba(0,0,0,0.16)]",
        className,
      )}
    >
      {children}
    </FloatingToolbarPanel>
  );
}

export function Divider() {
  return <span aria-hidden="true" className="h-[23px] w-px flex-none bg-[#EDEEEF]" />;
}

export function ColorField({
  color,
  label,
  onCommit,
}: {
  color: string;
  label: string;
  onCommit: (color: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-[#4B5563]">
      <span>{label}</span>
      <span className="relative flex h-8 min-w-[104px] items-center gap-2 rounded-md border border-[#EDEEEF] px-2">
        <span
          aria-hidden="true"
          className="h-4 w-4 rounded-full border border-black/10"
          style={{ backgroundColor: withHash(color) }}
        />
        <span className="font-mono text-[11px] text-[#191919]">
          {withHash(color).toUpperCase()}
        </span>
        <DeferredColorInput
          aria-label={label}
          value={color}
          onCommit={onCommit}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
    </label>
  );
}

export function NumberField({
  label,
  max,
  min,
  onCommit,
  step,
  suffix,
  value,
}: {
  label: string;
  max?: number;
  min?: number;
  onCommit: (value: number) => void;
  step: number;
  suffix?: string;
  value: number;
}) {
  const [draft, setDraft] = useState(() => formatNumber(value));
  const numericInputOptions = {
    allowDecimal: true,
    min,
  };

  useEffect(() => {
    setDraft(formatNumber(value));
  }, [value]);

  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(formatNumber(value));
      return;
    }
    const next = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    setDraft(formatNumber(next));
    if (next !== value) onCommit(next);
  };

  return (
    <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-[#4B5563]">
      <span className="font-semibold">{label}</span>
      <span className="flex min-w-0 flex-1 items-center rounded-md border border-[#EDEEEF] bg-white px-2 focus-within:border-[#7C51F8]">
        <input
          aria-label={label}
          type="text"
          inputMode={numericInputMode(numericInputOptions)}
          value={draft}
          onChange={(event) =>
            setDraft(
              sanitizeNumericInput(event.target.value, numericInputOptions),
            )
          }
          onBlur={commit}
          onKeyDown={(event) => {
            if (preventInvalidNumberInput(event, numericInputOptions)) return;
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              const parsed = Number.parseFloat(draft);
              const current = Number.isFinite(parsed) ? parsed : value;
              const direction = event.key === "ArrowUp" ? 1 : -1;
              setDraft(formatNumber(current + step * direction));
            }
          }}
          className="h-8 min-w-0 flex-1 border-0 bg-transparent text-right text-xs text-[#191919] outline-none"
        />
        {suffix ? (
          <span className="ml-1 text-[10px] text-[#9CA3AF]">{suffix}</span>
        ) : null}
      </span>
    </label>
  );
}

export function SliderField({
  formatValue,
  label,
  max,
  min,
  onCommit,
  step,
  value,
}: {
  formatValue: (value: number) => string;
  label: string;
  max: number;
  min: number;
  onCommit: (value: number) => void;
  step: number;
  value: number;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (next: number) => {
    setDraft(next);
    if (next !== value) onCommit(next);
  };

  return (
    <label className="block text-xs text-[#4B5563]">
      <span className="mb-2 flex items-center justify-between">
        <span>{label}</span>
        <span className="font-medium text-[#191919]">{formatValue(draft)}</span>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => setDraft(Number(event.target.value))}
        onBlur={(event) => commit(Number(event.currentTarget.value))}
        onKeyUp={(event) => commit(Number(event.currentTarget.value))}
        onPointerUp={(event) => commit(Number(event.currentTarget.value))}
        className="w-full cursor-pointer accent-[#7A5AF8]"
      />
    </label>
  );
}

export function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(3)).toString();
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
