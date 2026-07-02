import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Circle,
  Maximize2,
  Move,
  PaintBucket,
  Scan,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { withHash } from "../editorUtils";
import {
  averageBorderRadius,
  elementBox,
  uniformBorderRadius,
} from "../lib/element-model";
import { SLIDE_H, SLIDE_W } from "../lib/slide-schema";
import type { ShapeSlideElement } from "../state";
import { DeferredColorInput } from "./DeferredColorInput";

type ShapePanel =
  | "type"
  | "fill"
  | "stroke"
  | "radius"
  | "position"
  | "size"
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

export function ShapeToolbar({
  element,
  index,
  scale,
  onChange,
}: {
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
  const isRectangle = element.type === "rectangle";
  const maxRadius = Math.max(
    0.01,
    Math.min(0.5, box.w / 2, box.h / 2),
  );
  const radius = isRectangle
    ? Math.min(maxRadius, averageBorderRadius(element.border_radius))
    : 0;
  const toolbarLeft = Math.max(
    8,
    Math.min(box.x * scale, SLIDE_W * scale - 380),
  );

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
    <div
      style={{
        left: toolbarLeft,
        top: Math.max(8, box.y * scale - 52),
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className="fixed z-[10000] flex h-10 items-center rounded-md bg-white px-2.5 text-[#191919] shadow-[0_0_4px_rgba(0,0,0,0.15)]"
    >
      <div className="relative">
        <button
          type="button"
          aria-label="Shape type"
          aria-expanded={openPanel === "type"}
          title="Shape type"
          onClick={() => togglePanel("type")}
          className="flex min-w-[104px] items-center justify-between gap-2 rounded-md border-0 bg-transparent px-1 text-sm font-medium hover:bg-[#F8F8FA]"
        >
          <span>{isRectangle ? "Rectangle" : "Ellipse"}</span>
          <ChevronDown size={17} aria-hidden="true" />
        </button>
        {openPanel === "type" ? (
          <Panel className="min-w-[150px] p-1.5">
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
          </Panel>
        ) : null}
      </div>

      <Divider />

      <div className="relative">
        <ToolbarButton
          title="Shape fill"
          pressed={openPanel === "fill"}
          onClick={() => togglePanel("fill")}
        >
          <PaintBucket size={18} aria-hidden="true" />
          <ColorSwatch color={fill.color} />
        </ToolbarButton>
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
          <Square size={18} aria-hidden="true" />
          <ColorSwatch color={stroke.color} />
        </ToolbarButton>
        {openPanel === "stroke" ? (
          <Panel className="w-[220px] space-y-3 p-3">
            <ColorField
              label="Border color"
              color={stroke.color}
              onCommit={(color) => update({ stroke: { ...stroke, color } })}
            />
            <NumberField
              label="Border width"
              value={stroke.width ?? 0}
              min={0}
              max={8}
              step={0.25}
              suffix="pt"
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

      {isRectangle ? (
        <div className="relative">
          <ToolbarButton
            title="Border radius"
            pressed={openPanel === "radius"}
            onClick={() => togglePanel("radius")}
          >
            <Scan size={18} aria-hidden="true" />
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
          title="Position"
          pressed={openPanel === "position"}
          onClick={() => togglePanel("position")}
        >
          <Move size={18} aria-hidden="true" />
        </ToolbarButton>
        {openPanel === "position" ? (
          <Panel className="grid w-[220px] grid-cols-2 gap-2 p-3">
            <NumberField
              label="X"
              value={box.x}
              step={0.01}
              onCommit={(x) =>
                update({ position: { x, y: element.position?.y ?? box.y } })
              }
            />
            <NumberField
              label="Y"
              value={box.y}
              step={0.01}
              onCommit={(y) =>
                update({ position: { x: element.position?.x ?? box.x, y } })
              }
            />
          </Panel>
        ) : null}
      </div>

      <div className="relative">
        <ToolbarButton
          title="Size"
          pressed={openPanel === "size"}
          onClick={() => togglePanel("size")}
        >
          <Maximize2 size={18} aria-hidden="true" />
        </ToolbarButton>
        {openPanel === "size" ? (
          <Panel className="left-auto right-0 grid w-[220px] translate-x-0 grid-cols-2 gap-2 p-3">
            <NumberField
              label="W"
              value={box.w}
              min={0.01}
              max={SLIDE_W}
              step={0.01}
              onCommit={(width) =>
                update({ size: { width, height: element.size?.height ?? box.h } })
              }
            />
            <NumberField
              label="H"
              value={box.h}
              min={0.01}
              max={SLIDE_H}
              step={0.01}
              onCommit={(height) =>
                update({ size: { width: element.size?.width ?? box.w, height } })
              }
            />
          </Panel>
        ) : null}
      </div>

      <Divider />

      <div className="relative">
        <ToolbarButton
          title="Shape opacity"
          pressed={openPanel === "opacity"}
          onClick={() => togglePanel("opacity")}
        >
          <CheckerSwatch />
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
    </div>
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
        "relative flex h-7 min-w-7 items-center justify-center gap-1 rounded-md border-0 bg-transparent px-1 text-[#05070A] hover:bg-[#F8F8FA]",
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
    <div
      className={cn(
        "absolute left-1/2 top-[calc(100%+10px)] z-10 box-border -translate-x-1/2 rounded-lg bg-white shadow-[0_0_4px_rgba(0,0,0,0.16)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Divider() {
  return <span aria-hidden="true" className="mx-2.5 h-6 w-px flex-none bg-[#EDEEEF]" />;
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-white shadow-sm"
      style={{ backgroundColor: withHash(color) }}
    />
  );
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
          inputMode="decimal"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
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

function CheckerSwatch() {
  return (
    <span
      aria-hidden="true"
      className="h-[18px] w-[18px] bg-[conic-gradient(#111827_25%,#D1D5DB_0_50%,#111827_0_75%,#D1D5DB_0)] bg-[length:8px_8px]"
    />
  );
}
