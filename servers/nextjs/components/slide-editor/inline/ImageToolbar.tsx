import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  averageBorderRadius,
  elementBox,
  uniformBorderRadius,
} from "../lib/element-model";
import type { ImageSlideElement } from "../state";

type ImagePanel = "radius" | "fit" | "crop" | "opacity" | null;
type ImageFit = "contain" | "cover" | "fill";

const FIT_OPTIONS: Array<{ label: string; value: ImageFit }> = [
  { label: "Fill", value: "fill" },
  { label: "Cover", value: "cover" },
  { label: "Contain", value: "contain" },
];

const FIT_LABELS: Record<ImageFit, string> = {
  contain: "Contain",
  cover: "Cover",
  fill: "Fill",
};

const clampPercent = (value: number | null | undefined) =>
  Math.min(100, Math.max(0, value ?? 50));

export function ImageToolbar({
  element,
  index,
  scale,
  onChange,
  onUpload,
}: {
  element: ImageSlideElement;
  index: number;
  scale: number;
  onChange: (index: number, element: ImageSlideElement) => void;
  onUpload: (index: number) => void;
}) {
  const [openPanel, setOpenPanel] = useState<ImagePanel>(null);
  const fit = element.fit ?? "contain";
  const maxRadius = Math.max(
    0.01,
    Math.min(element.size?.width ?? 1, element.size?.height ?? 1) / 2,
  );
  const radius = Math.min(
    maxRadius,
    averageBorderRadius(element.border_radius),
  );
  const focusX = clampPercent(element.focus_x);
  const focusY = clampPercent(element.focus_y);
  const box = elementBox(element);

  const update = (changes: Partial<ImageSlideElement>) => {
    onChange(index, { ...element, ...changes });
  };

  const togglePanel = (panel: Exclude<ImagePanel, null>) => {
    const willOpen = openPanel !== panel;
    if (panel === "crop" && willOpen && fit !== "cover") {
      update({ fit: "cover" });
    }
    setOpenPanel(willOpen ? panel : null);
  };

  return (
    <div
      className="absolute z-[8]"
      style={{
        left: Math.max(8, box.x * scale),
        top: Math.max(8, box.y * scale - 64),
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="relative z-[9] flex h-[36px] items-center rounded-[6px] bg-white px-2.5 text-[#191919] shadow-[0_0_4px_rgba(0,0,0,0.16)]">
        <button
          type="button"
          title={`Image type: ${FIT_LABELS[fit]}`}
          aria-label={`Image type: ${FIT_LABELS[fit]}`}
          aria-expanded={openPanel === "fit"}
          onClick={() => togglePanel("fit")}
          className={cn(
            "flex h-9 min-w-[85px] items-center justify-between gap-2 rounded-md border-0 bg-transparent px-2 text-sm font-medium ",

          )}
        >
          <span>{FIT_LABELS[fit]}</span>
          <ChevronDown
            size={18}
            strokeWidth={2.2}
            aria-hidden="true"
            className={cn(
              "transition-transform",
              // openPanel === "fit" && "rotate-180",
            )}
          />
        </button>

        <Divider />

        <ToolbarButton
          title="Upload image"
          onClick={() => {
            setOpenPanel(null);
            onUpload(index);
          }}
        >
          <ImageIcon size={14} aria-hidden="true" />
        </ToolbarButton>

        <Divider />

        <ToolbarButton
          title="Border radius"
          pressed={openPanel === "radius"}
          onClick={() => togglePanel("radius")}
        >
          <BorderRadiusIcon />
        </ToolbarButton>

        <Divider />
        <div className="flex items-center gap-3">


          <ToolbarButton
            title="Crop image"
            pressed={openPanel === "crop"}
            onClick={() => togglePanel("crop")}
          >
            <Crop size={16} aria-hidden="true" />
          </ToolbarButton>

          <ToolbarButton
            title="Flip horizontally"
            pressed={element.flip_h === true}
            onClick={() => update({ flip_h: !(element.flip_h ?? false) })}
          >
            <FlipHorizontal2 size={16} aria-hidden="true" />
          </ToolbarButton>

          <ToolbarButton
            title="Flip vertically"
            pressed={element.flip_v === true}
            onClick={() => update({ flip_v: !(element.flip_v ?? false) })}
          >
            <FlipVertical2 size={16} aria-hidden="true" />
          </ToolbarButton>

        </div>
        <Divider />

        <ToolbarButton
          title="Image opacity"
          pressed={openPanel === "opacity"}
          onClick={() => togglePanel("opacity")}
        >
          <CheckerSwatch />
        </ToolbarButton>

        {openPanel === "radius" ? (
          <Panel className="flex h-16 items-center px-5">
            <input
              aria-label="Image border radius"
              type="range"
              min={0}
              max={maxRadius}
              step={Math.max(0.01, maxRadius / 100)}
              value={radius}
              onChange={(event) =>
                update({
                  border_radius: uniformBorderRadius(
                    Number(event.target.value),
                  ),
                })
              }
              className="w-full cursor-pointer accent-[#8B00FF]"
            />
          </Panel>
        ) : null}

        {openPanel === "fit" ? (
          <Panel className="flex flex-col max-w-[110px] gap-1 rounded-[12px] py-2.5">
            {FIT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={fit === option.value}
                onClick={() => {
                  update({ fit: option.value });
                  setOpenPanel(null);
                }}
                className={cn(
                  "flex w-full items-center rounded-[12px] px-4 py-2.5 text-left text-xs  text-[#000000] hover:bg-[#F8F8FA]",
                  fit === option.value && "bg-[#F4F1FF] text-[#7C3AED]",
                )}
              >
                {option.label}
              </button>
            ))}
          </Panel>
        ) : null}

        {openPanel === "crop" ? (
          <Panel className="flex h-16 items-center gap-2 px-3">
            <FocusSlider
              axis="X"
              value={focusX}
              onChange={(focus_x) => update({ fit: "cover", focus_x })}
            />
            <FocusSlider
              axis="Y"
              value={focusY}
              onChange={(focus_y) => update({ fit: "cover", focus_y })}
            />
          </Panel>
        ) : null}

        {openPanel === "opacity" ? (
          <Panel className="flex h-16 items-center px-5">
            <input
              aria-label="Image opacity"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={element.opacity ?? 1}
              onChange={(event) =>
                update({ opacity: Number(event.target.value) })
              }
              className="w-full cursor-pointer accent-[#8B00FF]"
            />
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute left-0 top-[calc(100%+8px)] z-10 box-border w-full rounded-lg bg-white shadow-[0_0_4px_rgba(0,0,0,0.16)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function FocusSlider({
  axis,
  value,
  onChange,
}: {
  axis: "X" | "Y";
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2">
      <span className="w-3 text-xs font-bold text-[#111827]">{axis}</span>
      <input
        aria-label={`Image crop focus ${axis}`}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-w-0 flex-1 cursor-pointer accent-[#8B00FF]"
      />
      <span className="w-8 text-right text-[11px] text-[#4B5563]">
        {Math.round(value)}%
      </span>
    </label>
  );
}

function ToolbarButton({
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
        "flex  flex-none items-center justify-center rounded-md border-0 bg-transparent  text-[#05070A] hover:bg-[#F8F8FA]",
        pressed && "bg-[#F4F1FF] text-[#7C3AED]",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-3 h-6 w-px flex-none bg-[#EDEEEF]" />;
}

function BorderRadiusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1.75 4.08333V2.91667C1.75 2.60725 1.87292 2.3105 2.09171 2.09171C2.3105 1.87292 2.60725 1.75 2.91667 1.75H4.08333" stroke="black" strokeWidth="1.16667" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.9165 1.75H11.0832C11.3926 1.75 11.6893 1.87292 11.9081 2.09171C12.1269 2.3105 12.2498 2.60725 12.2498 2.91667V4.08333" stroke="black" strokeWidth="1.16667" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.2498 9.91666V11.0833C12.2498 11.3927 12.1269 11.6895 11.9081 11.9083C11.6893 12.1271 11.3926 12.25 11.0832 12.25H9.9165" stroke="black" strokeWidth="1.16667" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.08333 12.25H2.91667C2.60725 12.25 2.3105 12.1271 2.09171 11.9083C1.87292 11.6895 1.75 11.3927 1.75 11.0833V9.91666" stroke="black" strokeWidth="1.16667" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckerSwatch() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 17 17" fill="none">
      <rect width="3.24" height="3.24" fill="#0E1014" />
      <rect x="3.23975" y="3.23965" width="3.24" height="3.24" fill="#4F5155" />
      <rect x="9.71973" y="3.23965" width="3.24" height="3.24" fill="#A2A5A9" />
      <rect x="3.23975" y="9.7207" width="3.24" height="3.24" fill="#4F5155" />
      <rect x="9.71973" y="9.7207" width="3.24" height="3.24" fill="#A2A5A9" />
      <rect x="6.48047" width="3.24" height="3.24" fill="#848588" />
      <rect x="12.9604" width="3.24" height="3.24" fill="#C3C4C9" />
      <rect y="6.47928" width="3.24" height="3.24" fill="#0E1014" />
      <rect x="6.48047" y="6.47928" width="3.24" height="3.24" fill="#848588" />
      <rect x="12.9604" y="6.47928" width="3.24" height="3.24" fill="#C3C4C9" />
      <rect y="12.9604" width="3.24" height="3.24" fill="#0E1014" />
      <rect x="6.48047" y="12.9604" width="3.24" height="3.24" fill="#848588" />
      <rect x="12.9604" y="12.9604" width="3.24" height="3.24" fill="#C3C4C9" />
    </svg>
  );
}
