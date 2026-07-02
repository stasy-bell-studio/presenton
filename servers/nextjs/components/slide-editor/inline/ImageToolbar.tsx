import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  Info,
  Image as ImageIcon,
  Scan,
  X,
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
  const [cropDraft, setCropDraft] = useState({ x: focusX, y: focusY });
  const [isCropDragging, setIsCropDragging] = useState(false);
  const [radiusDraft, setRadiusDraft] = useState(radius);
  const [opacityDraft, setOpacityDraft] = useState(element.opacity ?? 1);

  useEffect(() => {
    setRadiusDraft(radius);
  }, [radius]);

  useEffect(() => {
    setOpacityDraft(element.opacity ?? 1);
  }, [element.opacity]);

  useEffect(() => {
    if (openPanel === "crop") {
      setCropDraft({ x: focusX, y: focusY });
    }
  }, [focusX, focusY, openPanel]);

  const update = (changes: Partial<ImageSlideElement>) => {
    onChange(index, { ...element, ...changes });
  };

  const commitCrop = (next = cropDraft) => {
    update({ fit: "cover", focus_x: next.x, focus_y: next.y });
  };

  const updateCropDraftFromPointer = (target: HTMLDivElement, clientX: number, clientY: number) => {
    const rect = target.getBoundingClientRect();
    const next = {
      x: clampPercent(((clientX - rect.left) / rect.width) * 100),
      y: clampPercent(((clientY - rect.top) / rect.height) * 100),
    };
    setCropDraft(next);
    return next;
  };

  const togglePanel = (panel: Exclude<ImagePanel, null>) => {
    const willOpen = openPanel !== panel;
    if (panel === "crop" && willOpen && fit !== "cover") {
      update({ fit: "cover" });
    }
    setOpenPanel(willOpen ? panel : null);
  };

  return (
    <>
      <div
        style={{
          left: Math.max(8, box.x * scale),
          top: Math.max(8, box.y * scale - 64),
        }}
        onMouseDown={(event) => event.stopPropagation()}
        className="fixed z-[10000] flex h-[39px] items-center rounded-[6px] bg-white px-2.5 text-[#191919] shadow-[0_0_4px_rgba(0,0,0,0.15)]">
        <div className="relative">
          <button
            type="button"
            title={`Image type: ${FIT_LABELS[fit]}`}
            aria-label={`Image type: ${FIT_LABELS[fit]}`}
            aria-expanded={openPanel === "fit"}
            onClick={() => togglePanel("fit")}
            className={cn(
              "flex min-w-[85px] items-center justify-between gap-2 rounded-md border-0 bg-transparent text-sm font-medium",
            )}
          >
            <span>{FIT_LABELS[fit]}</span>
            <ChevronDown
              size={18}
              aria-hidden="true"
              className={cn("transition-transform")}
            />
          </button>
          {openPanel === "fit" ? (
            <Panel className="flex min-w-[110px] flex-col gap-1 rounded-[12px] py-2.5">
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
                    "flex w-full items-center rounded-[12px] px-4 py-2.5 text-left text-xs text-[#000000] hover:bg-[#F4F3FF]",
                    fit === option.value && "bg-[#F4F1FF] text-[#7A5AF8]",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </Panel>
          ) : null}
        </div>

        <Divider />

        <button
          type="button"
          title="Replace image"
          aria-label="Replace image"
          onClick={() => {
            setOpenPanel(null);
            onUpload(index);
          }}
          className="p-1 rounded-[12px] border-0 bg-transparent text-[#05070A] hover:bg-[#F4F3FF]"
        >
          <ImageIcon size={18} aria-hidden="true" />
        </button>

        <Divider />

        <div className="relative">
          <button
            type="button"
            title="Image border radius"
            aria-label="Image border radius"
            aria-pressed={openPanel === "radius"}
            onClick={() => togglePanel("radius")}
            className={cn(
              "p-1 rounded-[12px] border-0 bg-transparent text-[#05070A] hover:bg-[#F4F3FF]",
              openPanel === "radius" && "bg-[#F4F1FF] text-[#7C3AED]",
            )}
          >
            <Scan size={18} aria-hidden="true" />
          </button>
          {openPanel === "radius" ? (
            <Panel className="flex min-w-[115px] items-center p-2.5">
              <input
                aria-label="Image border radius"
                type="range"
                min={0}
                max={maxRadius}
                step={Math.max(0.01, maxRadius / 100)}
                value={radiusDraft}
                onChange={(event) => setRadiusDraft(Number(event.target.value))}
                onKeyUp={(event) =>
                  update({
                    border_radius: uniformBorderRadius(
                      Number((event.target as HTMLInputElement).value),
                    ),
                  })
                }
                onPointerUp={(event) =>
                  update({
                    border_radius: uniformBorderRadius(
                      Number((event.target as HTMLInputElement).value),
                    ),
                  })
                }
                className="w-full cursor-pointer accent-[#7A5AF8]"
              />
            </Panel>
          ) : null}
        </div>

        <Divider />
        <div className="flex items-center gap-3">


          <div className="relative">
            <button
              type="button"
              title="Crop image"
              aria-label="Crop image"
              aria-pressed={openPanel === "crop"}
              onClick={() => togglePanel("crop")}
              className={cn(
                "p-1 rounded-[12px] border-0 bg-transparent text-[#05070A] hover:bg-[#F4F3FF]",
                openPanel === "crop" && "bg-[#F4F1FF] text-[#7C3AED]",
              )}
            >
              <Crop size={18} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            title="Flip horizontally"
            aria-label="Flip horizontally"
            aria-pressed={element.flip_h === true}
            onClick={() => update({ flip_h: !(element.flip_h ?? false) })}
            className={cn(
              "p-1 rounded-[12px] border-0 bg-transparent text-[#05070A] hover:bg-[#F4F3FF]",
              element.flip_h === true && "bg-[#F4F1FF] text-[#7C3AED]",
            )}
          >
            <FlipHorizontal2 size={18} aria-hidden="true" />
          </button>

          <button
            type="button"
            title="Flip vertically"
            aria-label="Flip vertically"
            aria-pressed={element.flip_v === true}
            onClick={() => update({ flip_v: !(element.flip_v ?? false) })}
            className={cn(
              "p-1 rounded-[12px] border-0 bg-transparent text-[#05070A] hover:bg-[#F4F3FF]",
              element.flip_v === true && "bg-[#F4F1FF] text-[#7C3AED]",
            )}
          >
            <FlipVertical2 size={18} aria-hidden="true" />
          </button>

        </div>
        <Divider />

        <div className="relative">
          <button
            type="button"
            title="Image opacity"
            aria-label="Image opacity"
            aria-pressed={openPanel === "opacity"}
            onClick={() => togglePanel("opacity")}
            className={cn(
              "p-1 rounded-[12px] border-0 bg-transparent text-[#05070A] hover:bg-[#F4F3FF]",
              openPanel === "opacity" && "bg-[#F4F1FF] text-[#7C3AED]",
            )}
          >
            <CheckerSwatch />
          </button>
          {openPanel === "opacity" ? (
            <Panel className="flex min-w-[115px] items-center p-2.5">
              <input
                aria-label="Image opacity"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={opacityDraft}
                onChange={(event) => setOpacityDraft(Number(event.target.value))}
                onKeyUp={(event) =>
                  update({ opacity: Number((event.target as HTMLInputElement).value) })
                }
                onPointerUp={(event) =>
                  update({ opacity: Number((event.target as HTMLInputElement).value) })
                }
                className="w-full cursor-pointer accent-[#7A5AF8]"
              />
            </Panel>
          ) : null}
        </div>
      </div>
      {openPanel === "crop" ? (
        <>
          <div
            className="absolute z-[6] rounded-[1px] border border-[#7A5AF8] bg-transparent"
            style={{
              left: box.x * scale,
              top: box.y * scale,
              width: box.w * scale,
              height: box.h * scale,
            }}
            onPointerDown={(event) => {
              const target = event.currentTarget;
              target.setPointerCapture(event.pointerId);
              setIsCropDragging(true);
              updateCropDraftFromPointer(target, event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              if (!isCropDragging) return;
              updateCropDraftFromPointer(
                event.currentTarget,
                event.clientX,
                event.clientY,
              );
            }}
            onPointerUp={(event) => {
              const next = updateCropDraftFromPointer(
                event.currentTarget,
                event.clientX,
                event.clientY,
              );
              setIsCropDragging(false);
              commitCrop(next);
            }}
          >
            <div className="pointer-events-none absolute left-1/3 top-0 h-full w-px bg-white/25" />
            <div className="pointer-events-none absolute left-2/3 top-0 h-full w-px bg-white/25" />
            <div className="pointer-events-none absolute top-1/3 h-px w-full bg-white/25" />
            <div className="pointer-events-none absolute top-2/3 h-px w-full bg-white/25" />
          </div>
          <div
            className="pointer-events-none absolute z-[10000] rounded-full bg-black/75 px-4 py-2 text-sm text-white"
            style={{
              left: (box.x + box.w / 2) * scale,
              top: Math.max(8, box.y * scale - 42),
              transform: "translateX(-50%)",
            }}
          >
            <span className="inline-flex items-center gap-2">
              <Info size={14} />
              Click and drag on the image to position it.
            </span>
          </div>
          <div
            className="absolute z-[10000] flex items-center gap-3 rounded-xl bg-white px-4 py-2 shadow-[0_4px_14px_rgba(0,0,0,0.16)]"
            style={{
              left: (box.x + box.w / 2) * scale,
              top: (box.y + box.h) * scale + 10,
              transform: "translateX(-50%)",
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <label className="flex min-w-[230px] items-center gap-2">
              <span className="w-4 text-xs font-semibold text-[#6B7280]">X</span>
              <input
                aria-label="Image crop focus X"
                type="range"
                min={0}
                max={100}
                step={1}
                value={cropDraft.x}
                onChange={(event) =>
                  setCropDraft((prev) => ({ ...prev, x: Number(event.target.value) }))
                }
                onKeyUp={(event) => {
                  const next = {
                    ...cropDraft,
                    x: Number((event.target as HTMLInputElement).value),
                  };
                  setCropDraft(next);
                  commitCrop(next);
                }}
                onPointerUp={(event) => {
                  const next = {
                    ...cropDraft,
                    x: Number((event.target as HTMLInputElement).value),
                  };
                  setCropDraft(next);
                  commitCrop(next);
                }}
                className="w-full cursor-pointer accent-[#7A5AF8]"
              />
            </label>
            <label className="flex min-w-[230px] items-center gap-2">
              <span className="w-4 text-xs font-semibold text-[#6B7280]">Y</span>
              <input
                aria-label="Image crop focus Y"
                type="range"
                min={0}
                max={100}
                step={1}
                value={cropDraft.y}
                onChange={(event) =>
                  setCropDraft((prev) => ({ ...prev, y: Number(event.target.value) }))
                }
                onKeyUp={(event) => {
                  const next = {
                    ...cropDraft,
                    y: Number((event.target as HTMLInputElement).value),
                  };
                  setCropDraft(next);
                  commitCrop(next);
                }}
                onPointerUp={(event) => {
                  const next = {
                    ...cropDraft,
                    y: Number((event.target as HTMLInputElement).value),
                  };
                  setCropDraft(next);
                  commitCrop(next);
                }}
                className="w-full cursor-pointer accent-[#7A5AF8]"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                commitCrop();
                setOpenPanel(null);
              }}
              className="rounded-md bg-[#111827] px-4 py-2 text-sm font-medium text-white"
            >
              Done
            </button>
            <button
              type="button"
              aria-label="Close crop controls"
              onClick={() => setOpenPanel(null)}
              className="rounded-md p-2 text-[#4B5563] hover:bg-[#F4F3FF]"
            >
              <X size={18} />
            </button>
          </div>
        </>
      ) : null}
    </>

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
        "absolute left-1/2 top-[calc(100%+8px)] z-10 box-border -translate-x-1/2 rounded-lg bg-white shadow-[0_0_4px_rgba(0,0,0,0.16)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-3 h-6 w-px flex-none bg-[#EDEEEF]" />;
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
