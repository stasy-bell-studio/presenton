import Image from "next/image";
import {
  Check,
  ChevronDown,
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  Image as ImageIcon,
  RotateCcw,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from "@/components/slide-editor/model/model";
import {
  averageBorderRadius,
  elementBox,
  uniformBorderRadius,
} from "@/components/slide-editor/model/element-model";
import type { ImageSlideElement } from "@/components/slide-editor/state/state";
import {
  FloatingToolbar,
  FloatingToolbarPanel,
  type FloatingToolbarBox,
} from "@/components/slide-editor/toolbar/FloatingToolbar";
import { OpacitySwatchIcon } from "@/components/slide-editor/toolbar/OpacitySwatchIcon";
import { resolveBackendAssetSource } from "@/utils/api";

type ImagePanel = "fit" | "crop" | "opacity" | null;
type ImageFit = "contain" | "cover" | "fill";
type CropPoint = { x: number; y: number };
type CropFrame = { left: number; top: number; width: number; height: number };

const FIT_OPTIONS: Array<{ label: string; value: ImageFit }> = [
  { label: "Fill", value: "cover" },
  { label: "Contain", value: "contain" },
  { label: "Stretch", value: "fill" },
];

const FIT_LABELS: Record<ImageFit, string> = {
  contain: "Contain",
  cover: "Fill",
  fill: "Stretch",
};

const clampPercent = (value: number | null | undefined) =>
  Math.min(100, Math.max(0, value ?? 50));

const CROP_PRESETS: Array<{ label: string; point: CropPoint }> = [
  { label: "Top left", point: { x: 0, y: 0 } },
  { label: "Top", point: { x: 50, y: 0 } },
  { label: "Top right", point: { x: 100, y: 0 } },
  { label: "Left", point: { x: 0, y: 50 } },
  { label: "Center", point: { x: 50, y: 50 } },
  { label: "Right", point: { x: 100, y: 50 } },
  { label: "Bottom left", point: { x: 0, y: 100 } },
  { label: "Bottom", point: { x: 50, y: 100 } },
  { label: "Bottom right", point: { x: 100, y: 100 } },
];

const CROP_PANEL_WIDTH = 520;
const CROP_PANEL_HEIGHT = 96;
const CROP_PANEL_MARGIN = 10;
const IMAGE_TOOLBAR_HEIGHT = 44;
const IMAGE_TOOLBAR_TOP_OFFSET = 64;
const CROP_PANEL_TOOLBAR_GAP = 8;

function normalizeCropPoint(point: CropPoint): CropPoint {
  return {
    x: clampPercent(point.x),
    y: clampPercent(point.y),
  };
}

function cropPointLabel(value: number) {
  return `${Math.round(clampPercent(value))}%`;
}

function sameCropPoint(a: CropPoint, b: CropPoint) {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cropControlsPosition(frame: CropFrame) {
  const width = Math.min(CROP_PANEL_WIDTH, STAGE_WIDTH - CROP_PANEL_MARGIN * 2);
  const toolbarTop = Math.max(
    CROP_PANEL_MARGIN,
    frame.top - IMAGE_TOOLBAR_TOP_OFFSET,
  );
  const toolbarBottom = toolbarTop + IMAGE_TOOLBAR_HEIGHT;
  const minTopBelowToolbar = toolbarBottom + CROP_PANEL_TOOLBAR_GAP;
  const left = clampNumber(
    frame.left + frame.width / 2,
    CROP_PANEL_MARGIN + width / 2,
    STAGE_WIDTH - CROP_PANEL_MARGIN - width / 2,
  );
  const below = frame.top + frame.height + 12;
  const above = frame.top - CROP_PANEL_HEIGHT - 12;
  const top =
    below + CROP_PANEL_HEIGHT <= STAGE_HEIGHT - CROP_PANEL_MARGIN
      ? below
      : clampNumber(
          Math.max(above, minTopBelowToolbar),
          CROP_PANEL_MARGIN,
          STAGE_HEIGHT - CROP_PANEL_MARGIN - CROP_PANEL_HEIGHT,
        );

  return { left, top, width };
}

export function ImageToolbar({
  anchorBox,
  element,
  index,
  scale,
  onChange,
  onUpload,
}: {
  anchorBox?: FloatingToolbarBox | null;
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
  const imageSource = resolveBackendAssetSource(element.data ?? "");
  const cropFrame = {
    left: box.x * scale,
    top: box.y * scale,
    width: box.w * scale,
    height: box.h * scale,
  };
  const cropControls = cropControlsPosition(cropFrame);
  const [cropDraft, setCropDraft] = useState({ x: focusX, y: focusY });
  const [isCropDragging, setIsCropDragging] = useState(false);
  const [radiusDraft, setRadiusDraft] = useState(radius);
  const [opacityDraft, setOpacityDraft] = useState(element.opacity ?? 1);
  const committedCropRef = useRef({
    fit,
    point: { x: focusX, y: focusY },
  });

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

  useEffect(() => {
    committedCropRef.current = {
      fit,
      point: { x: focusX, y: focusY },
    };
  }, [fit, focusX, focusY]);

  const update = (changes: Partial<ImageSlideElement>) => {
    onChange(index, { ...element, ...changes });
  };

  const commitCrop = (next = cropDraft) => {
    const point = normalizeCropPoint(next);
    const committed = committedCropRef.current;
    if (committed.fit === "cover" && sameCropPoint(point, committed.point)) {
      return;
    }
    committedCropRef.current = { fit: "cover", point };
    update({ fit: "cover", focus_x: point.x, focus_y: point.y });
  };

  const updateCropDraftFromPointer = (
    target: HTMLDivElement,
    clientX: number,
    clientY: number,
  ) => {
    const rect = target.getBoundingClientRect();
    const next = normalizeCropPoint({
      x: clampPercent(((clientX - rect.left) / rect.width) * 100),
      y: clampPercent(((clientY - rect.top) / rect.height) * 100),
    });
    setCropDraft(next);
    return next;
  };

  const togglePanel = (panel: Exclude<ImagePanel, null>) => {
    const willOpen = openPanel !== panel;
    setOpenPanel(willOpen ? panel : null);
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
        fallbackWidth={330}
        inlineEditIgnore
        className="inline-flex items-center gap-3 rounded-[6px] bg-white px-[10px] py-[6px] text-[#191919] shadow-[0_0_4px_rgba(0,0,0,0.15)]"
      >
        <div className="relative">
          <button
            type="button"
            title={`Image type: ${FIT_LABELS[fit]}`}
            aria-label={`Image type: ${FIT_LABELS[fit]}`}
            aria-expanded={openPanel === "fit"}
            onClick={() => togglePanel("fit")}
            className="flex min-w-[83px] items-center justify-between gap-2 rounded-[10px] border-0 bg-transparent py-[6px] text-[14px] font-medium font-syne leading-4"
          >
            <span>{FIT_LABELS[fit]}</span>
            <ChevronDown
              size={14}
              strokeWidth={1.8}
              aria-hidden="true"
              className="transition-transform"
            />
          </button>
          {openPanel === "fit" ? (
            <Panel className="flex min-w-[170px] flex-col gap-1 rounded-[12px] p-2.5">
              {FIT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={fit === option.value}
                  onClick={() => {
                    update({ fit: option.value });
                  }}
                  className={cn(
                    "flex w-full items-center rounded-[8px] px-3 py-2 text-left text-[13px] text-[#191919] hover:bg-[#F4F3FF]",
                    fit === option.value && "bg-[#F4F1FF] text-[#7A5AF8]",
                  )}
                >
                  {option.label}
                </button>
              ))}
              <div className="my-1 h-px bg-[#EDEEEF]" />
              <label className="px-1 text-[12px] font-medium text-[#6B7280]">
                Radius
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
                  className="mt-2 w-full cursor-pointer accent-[#7A5AF8]"
                />
              </label>
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
          className="rounded-[2px] border-0 bg-transparent p-1 text-[#05070A] hover:bg-[#F4F3FF]"
        >
          <ImageIcon size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>

        <Divider />
        <div className="flex items-center gap-3">
          <button
            type="button"
            title="Crop image"
            aria-label="Crop image"
            aria-pressed={openPanel === "crop"}
            onClick={() => togglePanel("crop")}
            className={cn(
              "rounded-[2px] border-0 bg-transparent p-1 text-[#05070A] hover:bg-[#F4F3FF]",
              openPanel === "crop" && "bg-[#F4F1FF] text-[#7C3AED]",
            )}
          >
            <Crop size={16} strokeWidth={1.7} aria-hidden="true" />
          </button>

          <button
            type="button"
            title="Flip horizontally"
            aria-label="Flip horizontally"
            aria-pressed={element.flip_h === true}
            onClick={() => update({ flip_h: !(element.flip_h ?? false) })}
            className={cn(
              "rounded-[2px] border-0 bg-transparent p-1 text-[#05070A] hover:bg-[#F4F3FF]",
              element.flip_h === true && "bg-[#F4F1FF] text-[#7C3AED]",
            )}
          >
            <FlipHorizontal2 size={16} strokeWidth={1.7} aria-hidden="true" />
          </button>

          <button
            type="button"
            title="Flip vertically"
            aria-label="Flip vertically"
            aria-pressed={element.flip_v === true}
            onClick={() => update({ flip_v: !(element.flip_v ?? false) })}
            className={cn(
              "rounded-[2px] border-0 bg-transparent p-1 text-[#05070A] hover:bg-[#F4F3FF]",
              element.flip_v === true && "bg-[#F4F1FF] text-[#7C3AED]",
            )}
          >
            <FlipVertical2 size={16} strokeWidth={1.7} aria-hidden="true" />
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
              "rounded-[2px] border-0 bg-transparent p-1 text-[#05070A] hover:bg-[#F4F3FF]",
              openPanel === "opacity" && "bg-[#F4F1FF] text-[#7C3AED]",
            )}
          >
            <OpacitySwatchIcon />
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
      </FloatingToolbar>
      {openPanel === "crop" ? (
        <>
          <CropOverlay
            borderRadius={radius * scale}
            frame={cropFrame}
            imageSource={imageSource}
            isDragging={isCropDragging}
            point={cropDraft}
            flipH={element.flip_h === true}
            flipV={element.flip_v === true}
            onPointerDown={(event) => {
              const target = event.currentTarget;
              event.preventDefault();
              event.stopPropagation();
              target.setPointerCapture(event.pointerId);
              setIsCropDragging(true);
              updateCropDraftFromPointer(target, event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              if (!isCropDragging) return;
              event.preventDefault();
              event.stopPropagation();
              updateCropDraftFromPointer(
                event.currentTarget,
                event.clientX,
                event.clientY,
              );
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const next = updateCropDraftFromPointer(
                event.currentTarget,
                event.clientX,
                event.clientY,
              );
              setIsCropDragging(false);
              commitCrop(next);
            }}
            onPointerCancel={(event) => {
              event.stopPropagation();
              setIsCropDragging(false);
            }}
          />
          <CropControls
            point={cropDraft}
            position={cropControls}
            onChange={(point) => setCropDraft(normalizeCropPoint(point))}
            onCommit={(point = cropDraft) => commitCrop(point)}
            onDone={() => {
              commitCrop();
              setOpenPanel(null);
            }}
            onReset={() => {
              const next = { x: 50, y: 50 };
              setCropDraft(next);
              commitCrop(next);
            }}
            onClose={() => setOpenPanel(null)}
          />
        </>
      ) : null}
    </>

  );
}

function CropOverlay({
  borderRadius,
  frame,
  imageSource,
  isDragging,
  point,
  flipH,
  flipV,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  borderRadius: number;
  frame: CropFrame;
  imageSource: string;
  isDragging: boolean;
  point: CropPoint;
  flipH: boolean;
  flipV: boolean;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
}) {
  const transform = [flipH ? "scaleX(-1)" : "", flipV ? "scaleY(-1)" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      data-template-v2-floating-toolbar="true"
      data-inline-edit-ignore="true"
      className={cn(
        "absolute z-[8] overflow-hidden border-2 border-[#7C3AED] bg-white/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.16),0_0_0_1px_rgba(255,255,255,0.8)] touch-none",
        isDragging ? "cursor-grabbing" : "cursor-grab",
      )}
      style={{
        borderRadius,
        height: frame.height,
        left: frame.left,
        top: frame.top,
        width: frame.width,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {imageSource ? (
        <Image
          alt=""
          fill
          draggable={false}
          unoptimized
          src={imageSource}
          className="pointer-events-none absolute inset-0 h-full w-full select-none"
          sizes={`${Math.max(1, Math.round(frame.width))}px`}
          style={{
            objectFit: "cover",
            objectPosition: `${point.x}% ${point.y}%`,
            transform: transform || undefined,
          }}
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-black/[0.04]" />
      <div className="pointer-events-none absolute left-1/3 top-0 h-full w-px bg-white/60 shadow-[0_0_0_1px_rgba(0,0,0,0.12)]" />
      <div className="pointer-events-none absolute left-2/3 top-0 h-full w-px bg-white/60 shadow-[0_0_0_1px_rgba(0,0,0,0.12)]" />
      <div className="pointer-events-none absolute top-1/3 h-px w-full bg-white/60 shadow-[0_0_0_1px_rgba(0,0,0,0.12)]" />
      <div className="pointer-events-none absolute top-2/3 h-px w-full bg-white/60 shadow-[0_0_0_1px_rgba(0,0,0,0.12)]" />
      <div
        className="pointer-events-none absolute h-full w-px bg-[#7C3AED]/70"
        style={{ left: `${point.x}%` }}
      />
      <div
        className="pointer-events-none absolute h-px w-full bg-[#7C3AED]/70"
        style={{ top: `${point.y}%` }}
      />
      <div
        className="pointer-events-none absolute h-5 w-5 rounded-full border-2 border-white bg-[#7C3AED] shadow-[0_2px_8px_rgba(17,24,39,0.28)]"
        style={{
          left: `${point.x}%`,
          top: `${point.y}%`,
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}

function CropControls({
  point,
  position,
  onChange,
  onCommit,
  onDone,
  onReset,
  onClose,
}: {
  point: CropPoint;
  position: { left: number; top: number; width: number };
  onChange: (point: CropPoint) => void;
  onCommit: (point?: CropPoint) => void;
  onDone: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div
      data-template-v2-floating-toolbar="true"
      data-inline-edit-ignore="true"
      className="absolute z-[10000] flex h-[96px] items-center gap-3 rounded-[10px] border border-[#E7E8EC] bg-white px-3 py-2 font-syne text-[#191919] shadow-[0_8px_24px_rgba(16,24,40,0.14)]"
      style={{
        left: position.left,
        top: position.top,
        transform: "translateX(-50%)",
        width: position.width,
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="grid h-[74px] w-[74px] flex-none grid-cols-3 gap-1 rounded-[8px] border border-[#E5E7EB] bg-[#FAFAFB] p-1">
        {CROP_PRESETS.map((preset) => {
          const active = sameCropPoint(point, preset.point);
          return (
            <button
              key={preset.label}
              type="button"
              title={preset.label}
              aria-label={preset.label}
              aria-pressed={active}
              onClick={() => {
                onChange(preset.point);
                onCommit(preset.point);
              }}
              className={cn(
                "flex items-center justify-center rounded-[5px] hover:bg-white hover:shadow-sm",
                active && "bg-white text-[#7C3AED] shadow-sm",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 rounded-full bg-[#9CA3AF]",
                  active && "h-2 w-2 bg-[#7C3AED]",
                )}
              />
            </button>
          );
        })}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <CropSlider
          axis="X"
          value={point.x}
          onChange={(value) => onChange({ ...point, x: value })}
          onCommit={(value) => onCommit({ ...point, x: value })}
        />
        <CropSlider
          axis="Y"
          value={point.y}
          onChange={(value) => onChange({ ...point, y: value })}
          onCommit={(value) => onCommit({ ...point, y: value })}
        />
      </div>
      <div className="flex flex-none items-center gap-1.5">
        <button
          type="button"
          title="Reset crop"
          aria-label="Reset crop"
          onClick={onReset}
          className="rounded-[6px] p-2 text-[#4B5563] hover:bg-[#F4F3FF] hover:text-[#191919]"
        >
          <RotateCcw size={16} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          title="Apply crop"
          aria-label="Apply crop"
          onClick={onDone}
          className="rounded-[6px] bg-[#111827] p-2 text-white hover:bg-[#0B1220]"
        >
          <Check size={16} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          title="Close crop controls"
          aria-label="Close crop controls"
          onClick={onClose}
          className="rounded-[6px] p-2 text-[#4B5563] hover:bg-[#F4F3FF] hover:text-[#191919]"
        >
          <X size={17} strokeWidth={1.9} />
        </button>
      </div>
    </div>
  );
}

function CropSlider({
  axis,
  value,
  onChange,
  onCommit,
}: {
  axis: "X" | "Y";
  value: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[18px_minmax(0,1fr)_38px] items-center gap-2">
      <span className="text-[12px] font-semibold text-[#6B7280]">{axis}</span>
      <input
        aria-label={`Image crop focus ${axis}`}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onBlur={(event) => onCommit(Number(event.target.value))}
        onKeyUp={(event) => onCommit(Number((event.target as HTMLInputElement).value))}
        onPointerUp={(event) => onCommit(Number((event.target as HTMLInputElement).value))}
        className="w-full cursor-pointer accent-[#7A5AF8]"
      />
      <span className="text-right text-[12px] font-medium tabular-nums text-[#4B5563]">
        {cropPointLabel(value)}
      </span>
    </label>
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
    <FloatingToolbarPanel
      className={cn(
        "absolute left-1/2 top-[calc(100%+8px)] z-10 box-border -translate-x-1/2 rounded-lg bg-white shadow-[0_0_4px_rgba(0,0,0,0.16)]",
        className,
      )}
    >
      {children}
    </FloatingToolbarPanel>
  );
}

function Divider() {
  return <span aria-hidden="true" className="h-[23px] w-px flex-none bg-[#EDEEEF]" />;
}
