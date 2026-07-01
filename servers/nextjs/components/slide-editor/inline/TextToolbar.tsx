import { useState, type CSSProperties, type ReactNode } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Italic,
  Link,
  Underline,
} from "lucide-react";
import type { TextSlideElement } from "../state";
import type { Font } from "../lib/slide-schema";
import { withHash } from "../editorUtils";
import {
  elementFont,
  mergeFont,
  type ResolvedFont,
} from "../lib/element-model";
import { DeferredColorInput } from "./DeferredColorInput";
import { InlineToolbar } from "./InlineToolbar";

const FONT_FAMILIES = [
  "Syne",
  "Inter",
  "Arial",
  "Helvetica",
  "Georgia",
  "Times New Roman",
  "Playfair Display",
  "Montserrat",
  "Poppins",
  "Roboto",
];

const HORIZONTAL_ALIGNMENT_ICONS = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
};

const MIN_FONT_SIZE = 4;
const MAX_FONT_SIZE = 240;
export type TextToolbarFontPatch = Partial<
  Pick<Font, "family" | "size" | "color" | "bold" | "italic" | "underline">
>;

function clampFontSize(size: number) {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
}

function formatToolbarFontSize(size: number) {
  if (!Number.isFinite(size)) return "12";
  return Number.isInteger(size) ? String(size) : size.toFixed(1);
}

export function TextToolbar({
  activeFont,
  element,
  index,
  onFontPatch,
  scale,
  onChange,
}: {
  activeFont?: Partial<ResolvedFont> | null;
  element: TextSlideElement;
  index: number;
  onFontPatch?: (patch: TextToolbarFontPatch) => void;
  scale: number;
  onChange: (index: number, element: TextSlideElement) => void;
}) {
  const elementResolvedFont = elementFont(element);
  const font = { ...elementResolvedFont, ...(activeFont ?? {}) };
  const horizontalAlignment = element.alignment?.horizontal ?? "left";
  const verticalAlignment = element.alignment?.vertical ?? "top";
  const HorizontalAlignmentIcon =
    HORIZONTAL_ALIGNMENT_ICONS[horizontalAlignment];
  const fontFamilies = FONT_FAMILIES.includes(font.family)
    ? FONT_FAMILIES
    : [font.family, ...FONT_FAMILIES];
  const [openPanel, setOpenPanel] = useState<"opacity" | null>(null);
  const [hoveredControl, setHoveredControl] = useState<string | null>(null);
  const applyFontPatch = (patch: TextToolbarFontPatch) => {
    if (onFontPatch) {
      onFontPatch(patch);
      return;
    }
    onChange(index, mergeFont(element, patch));
  };
  const commitFontSize = (nextSize: number) => {
    if (!Number.isFinite(nextSize)) return;
    applyFontPatch({ size: clampFontSize(nextSize) });
  };
  const updateFontSize = (value: string) => {
    commitFontSize(Number.parseFloat(value));
  };
  const stepFontSize = (delta: number) => {
    const currentSize = Number.isFinite(font.size) ? font.size : 12;
    commitFontSize(currentSize + delta);
  };

  const updateAlignment = (
    alignment: NonNullable<TextSlideElement["alignment"]>,
  ) => {
    onChange(index, {
      ...element,
      alignment: {
        ...(element.alignment ?? {}),
        ...alignment,
      },
    });
  };

  const updateOpacity = (nextOpacity: number) => {
    onChange(index, {
      ...element,
      opacity: nextOpacity,
    });
  };

  return (
    <InlineToolbar element={element} scale={scale} offset={52} unstyled>
      <div style={textToolbarStyles.toolbar}>
        <label style={textToolbarStyles.fontControl}>
          <select
            aria-label="Font family"
            title="Font family"
            value={font.family}
            onChange={(event) =>
              applyFontPatch({ family: event.target.value })
            }
            style={textToolbarStyles.fontSelect}
          >
            {fontFamilies.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>
          <ChevronDown
            size={18}
            aria-hidden="true"
            style={textToolbarStyles.selectIcon}
          />
        </label>
        <Divider />
        <div style={textToolbarStyles.fontSizeControl}>
          <input
            aria-label="Font size"
            title="Font size"
            type="text"
            inputMode="decimal"
            value={formatToolbarFontSize(font.size)}
            onChange={(event) => updateFontSize(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                stepFontSize(1);
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                stepFontSize(-1);
              }
            }}
            style={textToolbarStyles.fontSizeInput}
          />
          <span style={textToolbarStyles.fontSizeStepper}>
            <button
              type="button"
              aria-label="Increase font size"
              title="Increase font size"
              onClick={() => stepFontSize(1)}
              style={textToolbarStyles.fontSizeStepButton}
            >
              <span style={textToolbarStyles.fontSizeArrowUp} />
            </button>
            <button
              type="button"
              aria-label="Decrease font size"
              title="Decrease font size"
              onClick={() => stepFontSize(-1)}
              style={textToolbarStyles.fontSizeStepButton}
            >
              <span style={textToolbarStyles.fontSizeArrowDown} />
            </button>
          </span>
        </div>
        <Divider />
        <label
          aria-label="Text color"
          title="Text color"
          style={textToolbarStyles.colorControl}
          onMouseEnter={() => setHoveredControl("color")}
          onMouseLeave={() => setHoveredControl(null)}
        >
          <span
            aria-hidden="true"
            style={{
              ...textToolbarStyles.colorDot,
              background: withHash(font.color),
            }}
          />
          <DeferredColorInput
            aria-label="Text color"
            value={font.color}
            onCommit={(color) => applyFontPatch({ color })}
            style={textToolbarStyles.hiddenInput}
          />
        </label>
        <Divider />
        <div style={textToolbarStyles.modeGroup}>
          <ToolbarButton
            title="Bold"
            controlId="bold"
            hoveredControl={hoveredControl}
            pressed={font.bold ?? false}
            setHoveredControl={setHoveredControl}
            onClick={() =>
              applyFontPatch({ bold: !(font.bold ?? false) })
            }
          >
            <Bold size={18} strokeWidth={2.25} aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            title="Italic"
            controlId="italic"
            hoveredControl={hoveredControl}
            pressed={font.italic ?? false}
            setHoveredControl={setHoveredControl}
            onClick={() =>
              applyFontPatch({ italic: !(font.italic ?? false) })
            }
          >
            <Italic size={18} strokeWidth={2.25} aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            title="Underline"
            controlId="underline"
            hoveredControl={hoveredControl}
            pressed={font.underline ?? false}
            setHoveredControl={setHoveredControl}
            onClick={() =>
              applyFontPatch({ underline: !(font.underline ?? false) })
            }
          >
            <Underline size={18} strokeWidth={2.25} aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            title="Horizontal alignment"
            controlId="horizontal-alignment"
            hoveredControl={hoveredControl}
            setHoveredControl={setHoveredControl}
            onClick={() =>
              updateAlignment({
                horizontal:
                  horizontalAlignment === "left"
                    ? "center"
                    : horizontalAlignment === "center"
                      ? "right"
                      : "left",
              })
            }
          >
            <HorizontalAlignmentIcon
              size={18}
              strokeWidth={2.2}
              aria-hidden="true"
            />
          </ToolbarButton>
          <ToolbarButton
            title="Vertical alignment"
            controlId="vertical-alignment"
            hoveredControl={hoveredControl}
            setHoveredControl={setHoveredControl}
            onClick={() =>
              updateAlignment({
                vertical:
                  verticalAlignment === "top"
                    ? "middle"
                    : verticalAlignment === "middle"
                      ? "bottom"
                      : "top",
              })
            }
          >
            <VerticalTextIcon />
          </ToolbarButton>
          <ToolbarButton
            title="Text baseline"
            controlId="text-baseline"
            hoveredControl={hoveredControl}
            setHoveredControl={setHoveredControl}
          >
            <BaselineTextIcon />
          </ToolbarButton>
        </div>
        <Divider />
        <div
          style={textToolbarStyles.opacityControlWrap}
          onMouseEnter={() => setOpenPanel("opacity")}
          onMouseLeave={() => setOpenPanel(null)}
          onFocus={() => setOpenPanel("opacity")}
          onBlur={() => setOpenPanel(null)}
        >
          <ToolbarButton
            title=""
            controlId="opacity"
            hoveredControl={hoveredControl}
            pressed={openPanel === "opacity"}
            setHoveredControl={setHoveredControl}
            onClick={() =>
              setOpenPanel((current) => (current === "opacity" ? null : "opacity"))
            }
          >
            <CheckerSwatch />
          </ToolbarButton>
          {openPanel === "opacity" ? (
            <>
              <span aria-hidden="true" style={textToolbarStyles.opacityBridge} />
              <div style={textToolbarStyles.opacityPanel}>
                <input
                  aria-label="Text opacity"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={element.opacity ?? 1}
                  onChange={(event) => updateOpacity(Number(event.target.value))}
                  style={textToolbarStyles.opacityInput}
                />
              </div>
            </>
          ) : null}
        </div>
        <Divider />
        <ToolbarButton
          title="Link"
          controlId="link"
          hoveredControl={hoveredControl}
          setHoveredControl={setHoveredControl}
        >
          <Link size={18} strokeWidth={2.4} aria-hidden="true" />
        </ToolbarButton>
      </div>
    </InlineToolbar>
  );
}

function ToolbarButton({
  children,
  controlId,
  hoveredControl,
  onClick,
  pressed,
  setHoveredControl,
  title,
}: {
  children: ReactNode;
  controlId: string;
  hoveredControl: string | null;
  onClick?: () => void;
  pressed?: boolean;
  setHoveredControl: (control: string | null) => void;
  title: string;
}) {
  const hovered = hoveredControl === controlId;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => setHoveredControl(controlId)}
      onMouseLeave={() => setHoveredControl(null)}
      style={{
        ...textToolbarStyles.button,
        ...(hovered ? textToolbarStyles.buttonHover : {}),
        ...(pressed ? textToolbarStyles.buttonActive : {}),
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" style={textToolbarStyles.divider} />;
}

function VerticalTextIcon() {
  return (
    <span aria-hidden="true" style={textToolbarStyles.textIcon}>
      <span style={textToolbarStyles.verticalTextBar} />
      A
      <span style={textToolbarStyles.verticalTextBar} />
    </span>
  );
}

function BaselineTextIcon() {
  return (
    <span aria-hidden="true" style={textToolbarStyles.baselineIcon}>
      A
      <span style={textToolbarStyles.baselineLine} />
    </span>
  );
}

function CheckerSwatch() {
  return (
    <span aria-hidden="true" style={textToolbarStyles.checkerSwatch}>
      {Array.from({ length: 12 }).map((_, index) => (
        <span
          key={index}
          style={{
            ...textToolbarStyles.checkerPixel,
            background:
              index % 2 === Math.floor(index / 3) % 2
                ? "#111827"
                : "rgba(17, 24, 39, 0.08)",
          }}
        />
      ))}
    </span>
  );
}

const textToolbarStyles = {
  toolbar: {
    display: "inline-flex",
    alignItems: "center",
    boxSizing: "border-box",
    height: 36,
    width: 580,
    maxWidth: "calc(100vw - 32px)",
    padding: "0 10px",
    border: 0,
    borderRadius: 6,
    background: "#FFFFFF",
    boxShadow: "0 0 4px rgba(0, 0, 0, 0.15)",
    gap: 12,
  },
  fontControl: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    width: 111.2,
    height: 36,
    flex: "0 0 auto",
  },
  fontSelect: {
    width: "100%",
    height: "100%",
    appearance: "none",
    border: 0,
    outline: "none",
    background: "transparent",
    color: "#0B1220",
    fontFamily:
      "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    fontSize: 20,
    fontWeight: 400,
    cursor: "pointer",
    padding: "0 24px 0 0",
  },
  selectIcon: {
    position: "absolute",
    right: 0,
    pointerEvents: "none",
    color: "#0B1220",
  },
  fontSizeControl: {
    width: 70,
    height: 36,
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flex: "0 0 auto",
  },
  fontSizeInput: {
    width: 36,
    height: 28,
    boxSizing: "border-box",
    border: 0,
    outline: "none",
    background: "transparent",
    color: "#0B1220",
    fontFamily:
      "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    fontSize: 14,
    fontWeight: 400,
    textAlign: "center",
    padding: 0,
    flex: "0 0 auto",
  },
  fontSizeStepper: {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    width: 12,
    height: 24,
    flex: "0 0 auto",
  },
  fontSizeStepButton: {
    width: 12,
    height: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: 0,
    borderRadius: 2,
    background: "transparent",
    padding: 0,
    cursor: "pointer",
    color: "#05070A",
  },
  fontSizeArrowUp: {
    width: 0,
    height: 0,
    borderLeft: "4px solid transparent",
    borderRight: "4px solid transparent",
    borderBottom: "6px solid currentColor",
  },
  fontSizeArrowDown: {
    width: 0,
    height: 0,
    borderLeft: "4px solid transparent",
    borderRight: "4px solid transparent",
    borderTop: "6px solid currentColor",
  },
  divider: {
    width: 1,
    height: 24,
    background: "#E5E7EB",
    flex: "0 0 auto",
  },
  modeGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    flex: "0 0 auto",
  },
  button: {
    boxSizing: "border-box",
    width: 22,
    height: 22,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: 0,
    borderRadius: 2,
    background: "transparent",
    color: "#05070A",
    cursor: "pointer",
    padding: 4,
    flex: "0 0 auto",
  },
  buttonHover: {
    background: "#F8F8FA",
  },
  buttonActive: {
    color: "#7C51F8",
    background: "#F4F1FF",
  },
  colorControl: {
    position: "relative",
    width: 22,
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    cursor: "pointer",
    flex: "0 0 auto",
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    boxShadow: "inset 0 0 0 1px rgba(17, 24, 39, 0.12)",
  },
  hiddenInput: {
    position: "absolute",
    inset: 0,
    opacity: 0,
    cursor: "pointer",
  },
  opacityControlWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
  },
  opacityBridge: {
    position: "absolute",
    top: 22,
    right: -100,
    width: 278,
    height: 30,
    background: "transparent",
    pointerEvents: "auto",
  },
  checkerSwatch: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 6px)",
    gridAutoRows: 6,
    gap: 0,
    width: 18,
    height: 24,
    overflow: "hidden",
  },
  checkerPixel: {
    width: 6,
    height: 6,
  },
  opacityPanel: {
    position: "absolute",
    top: 52,
    right: -88,
    width: 256,
    height: 64,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 20px",
    borderRadius: 6,
    border: 0,
    background: "#FFFFFF",
    boxShadow: "0 0 4px rgba(0, 0, 0, 0.15)",
  },
  opacityInput: {
    width: "100%",
    accentColor: "#7C51F8",
    cursor: "pointer",
  },
  textIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    color: "currentColor",
    fontSize: 18,
    lineHeight: 1,
    fontFamily: "Georgia, 'Times New Roman', serif",
  },
  verticalTextBar: {
    display: "inline-block",
    width: 1.5,
    height: 22,
    background: "currentColor",
  },
  baselineIcon: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 24,
    color: "currentColor",
    fontSize: 19,
    lineHeight: 1,
    fontFamily: "Georgia, 'Times New Roman', serif",
    textDecoration: "underline",
    textUnderlineOffset: 3,
  },
  baselineLine: {
    position: "absolute",
    top: 2,
    width: 18,
    height: 1.5,
    background: "currentColor",
  },
} satisfies Record<string, CSSProperties>;
