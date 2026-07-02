import { useState } from "react";
import {
  Cloud,
  Maximize2,
  Minus,
  Move,
  RotateCw,
  Square,
} from "lucide-react";
import { SLIDE_H, SLIDE_W } from "../lib/slide-schema";
import type { LineSlideElement } from "../state";
import {
  ColorField,
  Divider,
  NumberField,
  Panel,
  SliderField,
  ToolbarButton,
} from "./ShapeToolbar";

type LinePanel =
  | "stroke"
  | "position"
  | "size"
  | "rotation"
  | "shadow"
  | null;

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
  const shadow = element.shadow ?? {
    color: "#000000",
    blur: 8,
    opacity: 0.2,
    offset_x: 0.04,
    offset_y: 0.04,
  };
  const shadowEnabled = element.shadow != null;
  const toolbarLeft = Math.max(
    8,
    Math.min(position.x * scale, SLIDE_W * scale - 380),
  );

  const update = (changes: Partial<LineSlideElement>) => {
    onChange(index, { ...element, ...changes });
  };

  const togglePanel = (panel: Exclude<LinePanel, null>) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  return (
    <div
      style={{
        left: toolbarLeft,
        top: Math.max(8, position.y * scale - 52),
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className="fixed z-[10000] flex h-10 items-center rounded-md bg-white px-2.5 text-[#191919] shadow-[0_0_4px_rgba(0,0,0,0.15)]"
    >
      <span className="flex min-w-[64px] items-center gap-2 px-1 text-sm font-medium">
        <Minus size={18} aria-hidden="true" />
        Line
      </span>

      <Divider />

      <div className="relative">
        <ToolbarButton
          title="Line stroke"
          pressed={openPanel === "stroke"}
          onClick={() => togglePanel("stroke")}
        >
          <Square size={18} aria-hidden="true" />
        </ToolbarButton>
        {openPanel === "stroke" ? (
          <Panel className="w-[220px] space-y-3 p-3">
            <ColorField
              label="Line color"
              color={stroke.color}
              onCommit={(color) => update({ stroke: { ...stroke, color } })}
            />
            <NumberField
              label="Thickness"
              value={stroke.width}
              min={0}
              max={8}
              step={0.25}
              suffix="pt"
              onCommit={(width) => update({ stroke: { ...stroke, width } })}
            />
            <SliderField
              label="Stroke opacity"
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
          title="Position"
          pressed={openPanel === "position"}
          onClick={() => togglePanel("position")}
        >
          <Move size={18} aria-hidden="true" />
        </ToolbarButton>
        {openPanel === "position" ? (
          <Panel className="w-[240px] space-y-2 p-3">
            <NumberField
              label="X position"
              value={position.x}
              step={0.01}
              onCommit={(x) => update({ position: { ...position, x } })}
            />
            <NumberField
              label="Y position"
              value={position.y}
              step={0.01}
              onCommit={(y) => update({ position: { ...position, y } })}
            />
          </Panel>
        ) : null}
      </div>

      <div className="relative">
        <ToolbarButton
          title="Line dimensions"
          pressed={openPanel === "size"}
          onClick={() => togglePanel("size")}
        >
          <Maximize2 size={18} aria-hidden="true" />
        </ToolbarButton>
        {openPanel === "size" ? (
          <Panel className="w-[240px] space-y-2 p-3">
            <NumberField
              label="Length"
              value={size.width}
              min={0.01}
              max={SLIDE_W}
              step={0.01}
              onCommit={(width) => update({ size: { ...size, width } })}
            />
            <NumberField
              label="Height"
              value={size.height}
              min={0.01}
              max={SLIDE_H}
              step={0.01}
              onCommit={(height) => update({ size: { ...size, height } })}
            />
          </Panel>
        ) : null}
      </div>

      <div className="relative">
        <ToolbarButton
          title="Rotation"
          pressed={openPanel === "rotation"}
          onClick={() => togglePanel("rotation")}
        >
          <RotateCw size={18} aria-hidden="true" />
        </ToolbarButton>
        {openPanel === "rotation" ? (
          <Panel className="w-[180px] p-3">
            <NumberField
              label="Rotation"
              value={element.rotation ?? 0}
              min={-360}
              max={360}
              step={1}
              suffix="°"
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
          <Cloud size={18} aria-hidden="true" />
        </ToolbarButton>
        {openPanel === "shadow" ? (
          <Panel className="left-auto right-0 w-[240px] translate-x-0 space-y-3 p-3">
            <button
              type="button"
              aria-pressed={shadowEnabled}
              onClick={() =>
                update({ shadow: shadowEnabled ? undefined : shadow })
              }
              className="flex w-full items-center justify-between rounded-md border border-[#EDEEEF] px-3 py-2 text-xs font-medium text-[#191919]"
            >
              Shadow
              <span
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  shadowEnabled ? "bg-[#7C51F8]" : "bg-[#D1D5DB]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                    shadowEnabled ? "translate-x-[18px]" : "translate-x-0.5"
                  }`}
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
                  value={shadow.blur ?? 0}
                  min={0}
                  max={100}
                  step={1}
                  onCommit={(blur) => update({ shadow: { ...shadow, blur } })}
                />
                <SliderField
                  label="Shadow opacity"
                  value={shadow.opacity ?? 0.2}
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
                    value={shadow.offset_x ?? 0}
                    min={-2}
                    max={2}
                    step={0.01}
                    onCommit={(offset_x) =>
                      update({ shadow: { ...shadow, offset_x } })
                    }
                  />
                  <NumberField
                    label="Y"
                    value={shadow.offset_y ?? 0}
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
    </div>
  );
}
