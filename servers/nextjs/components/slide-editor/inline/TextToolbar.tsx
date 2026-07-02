import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
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
import { withHash } from "../editorUtils";
import type { Font } from "../lib/slide-schema";
import {
  elementFont,
  mergeFont,
  mergeFontForTextSelection,
} from "../lib/element-model";
import {
  ensureGoogleFontLoaded,
  ensureTemplateFontLoaded,
  GOOGLE_FONT_OPTIONS,
  type TemplateFontOption,
} from "../lib/google-fonts";
import {
  fontForTextSelection,
  normalizedTextSelectionRange,
  textRunsContent,
  type TextSelectionRange,
} from "../lib/text-runs";
import { DeferredColorInput } from "./DeferredColorInput";
import { InlineToolbar } from "./InlineToolbar";

const SYSTEM_FONT_FAMILIES = [
  "Arial",
  "Helvetica",
  "Georgia",
  "Times New Roman",
];
const FONT_FAMILIES = [
  ...GOOGLE_FONT_OPTIONS.map(({ family }) => family),
  ...SYSTEM_FONT_FAMILIES,
];
const EMPTY_TEMPLATE_FONTS: TemplateFontOption[] = [];

const HORIZONTAL_ALIGNMENT_ICONS = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
};

const MIN_FONT_SIZE = 4;
const MAX_FONT_SIZE = 240;
const MIN_LETTER_SPACING = -200;
const MAX_LETTER_SPACING = 600;
const MIN_LINE_HEIGHT = 0.8;
const MAX_LINE_HEIGHT = 2.2;
const DEFAULT_LINE_HEIGHT = 1.15;

type TextToolbarPanel = "opacity" | "letterSpacing" | "lineHeight";

function clampFontSize(size: number) {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
}

function clampMetric(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatToolbarFontSize(size: number) {
  if (!Number.isFinite(size)) return "12";
  return Number.isInteger(size) ? String(size) : size.toFixed(1);
}

function formatLineHeight(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function formatLetterSpacing(value: number) {
  const points = value / 100;
  return `${points.toFixed(1).replace(/\.0$/, "")} pt`;
}

export function TextToolbar({
  element,
  index,
  scale,
  selectionRange,
  templateFonts = EMPTY_TEMPLATE_FONTS,
  onChange,
}: {
  element: TextSlideElement;
  index: number;
  scale: number;
  selectionRange?: TextSelectionRange | null;
  templateFonts?: TemplateFontOption[];
  onChange: (index: number, element: TextSlideElement) => void;
}) {
  const activeSelectionRange = normalizedTextSelectionRange(
    selectionRange,
    textRunsContent(element.runs).length,
  );
  const selectedFont = fontForTextSelection(element, activeSelectionRange);
  const font = elementFont({ font: selectedFont ?? element.font });
  const horizontalAlignment = element.alignment?.horizontal ?? "left";
  const letterSpacing = font.letterSpacing ?? 0;
  const lineHeight = font.lineHeight ?? DEFAULT_LINE_HEIGHT;
  const HorizontalAlignmentIcon =
    HORIZONTAL_ALIGNMENT_ICONS[horizontalAlignment];
  const templateFontFamilySet = new Set(
    templateFonts.map(({ family }) => family),
  );
  const googleFontOptions = GOOGLE_FONT_OPTIONS.filter(
    ({ family }) => !templateFontFamilySet.has(family),
  );
  const knownFontFamilySet = new Set([
    ...templateFontFamilySet,
    ...FONT_FAMILIES,
  ]);
  const customFontFamily = knownFontFamilySet.has(font.family)
    ? null
    : font.family;
  const [openPanel, setOpenPanel] = useState<TextToolbarPanel | null>(null);
  const [hoveredControl, setHoveredControl] = useState<string | null>(null);
  const closePanelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const clearScheduledPanelClose = () => {
    if (closePanelTimeoutRef.current == null) return;
    clearTimeout(closePanelTimeoutRef.current);
    closePanelTimeoutRef.current = null;
  };
  const openHoverPanel = (panel: TextToolbarPanel) => {
    clearScheduledPanelClose();
    setOpenPanel(panel);
  };
  const schedulePanelClose = () => {
    clearScheduledPanelClose();
    closePanelTimeoutRef.current = setTimeout(() => {
      setOpenPanel(null);
      closePanelTimeoutRef.current = null;
    }, 180);
  };
  useEffect(() => clearScheduledPanelClose, []);
  const updateFont = (fontPatch: Partial<Font>) => {
    onChange(
      index,
      activeSelectionRange
        ? mergeFontForTextSelection(element, activeSelectionRange, fontPatch)
        : mergeFont(element, fontPatch),
    );
  };
  const loadFontFamily = useCallback(
    (family: string) => {
      const templateFont = templateFonts.find(
        (fontOption) => fontOption.family === family,
      );
      if (templateFont) {
        void ensureTemplateFontLoaded(templateFont);
        return;
      }
      void ensureGoogleFontLoaded(family);
    },
    [templateFonts],
  );
  const updateFontFamily = (family: string) => {
    loadFontFamily(family);
    updateFont({ family });
  };
  const commitFontSize = (nextSize: number) => {
    if (!Number.isFinite(nextSize)) return;
    updateFont({ size: clampFontSize(nextSize) });
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
  const updateLetterSpacing = (nextLetterSpacing: number) => {
    if (!Number.isFinite(nextLetterSpacing)) return;
    updateFont({
      letter_spacing: clampMetric(
        nextLetterSpacing,
        MIN_LETTER_SPACING,
        MAX_LETTER_SPACING,
      ),
    });
  };
  const updateLineHeight = (nextLineHeight: number) => {
    if (!Number.isFinite(nextLineHeight)) return;
    updateFont({
      line_height: clampMetric(
        nextLineHeight,
        MIN_LINE_HEIGHT,
        MAX_LINE_HEIGHT,
      ),
    });
  };

  useEffect(() => {
    loadFontFamily(font.family);
  }, [font.family, loadFontFamily]);

  return (
    <InlineToolbar element={element} scale={scale} offset={52} unstyled>
      <div style={textToolbarStyles.toolbar}>
        <label style={textToolbarStyles.fontControl}>
          <select
            aria-label="Font family"
            title="Font family"
            value={font.family}
            onChange={(event) => updateFontFamily(event.target.value)}
            style={textToolbarStyles.fontSelect}
          >
            {customFontFamily ? (
              <option value={customFontFamily}>{customFontFamily}</option>
            ) : null}
            {templateFonts.length > 0 ? (
              <optgroup label="Template Fonts">
                {templateFonts.map(({ family }) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="Google Fonts">
              {googleFontOptions.map(({ family }) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </optgroup>
            <optgroup label="System Fonts">
              {SYSTEM_FONT_FAMILIES.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </optgroup>
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
            onCommit={(color) => updateFont({ color })}
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
            onClick={() => updateFont({ bold: !(font.bold ?? false) })}
          >
            <Bold size={18} strokeWidth={2.25} aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            title="Italic"
            controlId="italic"
            hoveredControl={hoveredControl}
            pressed={font.italic ?? false}
            setHoveredControl={setHoveredControl}
            onClick={() => updateFont({ italic: !(font.italic ?? false) })}
          >
            <Italic size={18} strokeWidth={2.25} aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            title="Underline"
            controlId="underline"
            hoveredControl={hoveredControl}
            pressed={font.underline ?? false}
            setHoveredControl={setHoveredControl}
            onClick={() => updateFont({ underline: !(font.underline ?? false) })}
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
          <div
            style={textToolbarStyles.metricControlWrap}
            onMouseEnter={() => openHoverPanel("letterSpacing")}
            onMouseLeave={schedulePanelClose}
            onFocus={() => openHoverPanel("letterSpacing")}
            onBlur={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return;
              schedulePanelClose();
            }}
          >
            <ToolbarButton
              title="Letter spacing"
              controlId="letter-spacing"
              hoveredControl={hoveredControl}
              pressed={openPanel === "letterSpacing" || letterSpacing !== 0}
              setHoveredControl={setHoveredControl}
              onClick={() => setOpenPanel("letterSpacing")}
            >
              <LetterSpacingIcon />
            </ToolbarButton>
            {openPanel === "letterSpacing" ? (
              <TextMetricPanel
                label="Letter spacing"
                value={letterSpacing}
                valueLabel={formatLetterSpacing(letterSpacing)}
                min={MIN_LETTER_SPACING}
                max={MAX_LETTER_SPACING}
                step={10}
                onChange={updateLetterSpacing}
              />
            ) : null}
          </div>
          <div
            style={textToolbarStyles.metricControlWrap}
            onMouseEnter={() => openHoverPanel("lineHeight")}
            onMouseLeave={schedulePanelClose}
            onFocus={() => openHoverPanel("lineHeight")}
            onBlur={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return;
              schedulePanelClose();
            }}
          >
            <ToolbarButton
              title="Line height"
              controlId="line-height"
              hoveredControl={hoveredControl}
              pressed={
                openPanel === "lineHeight" ||
                lineHeight !== DEFAULT_LINE_HEIGHT
              }
              setHoveredControl={setHoveredControl}
              onClick={() => setOpenPanel("lineHeight")}
            >
              <LineHeightIcon />
            </ToolbarButton>
            {openPanel === "lineHeight" ? (
              <TextMetricPanel
                label="Line height"
                value={lineHeight}
                valueLabel={formatLineHeight(lineHeight)}
                min={MIN_LINE_HEIGHT}
                max={MAX_LINE_HEIGHT}
                step={0.05}
                onChange={updateLineHeight}
              />
            ) : null}
          </div>
        </div>
        <Divider />
        <div
          style={textToolbarStyles.opacityControlWrap}
          onMouseEnter={() => openHoverPanel("opacity")}
          onMouseLeave={schedulePanelClose}
          onFocus={() => openHoverPanel("opacity")}
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            schedulePanelClose();
          }}
        >
          <ToolbarButton
            title="Opacity"
            controlId="opacity"
            hoveredControl={hoveredControl}
            pressed={openPanel === "opacity"}
            setHoveredControl={setHoveredControl}
            onClick={() =>
              setOpenPanel((current) => (current === "opacity" ? null : "opacity"))
            }
          >
            <OpacityIcon />
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

function LetterSpacingIcon() {
  return (
    <span aria-hidden="true" style={textToolbarStyles.textIcon}>
      <span style={textToolbarStyles.letterSpacingBar} />
      A
      <span style={textToolbarStyles.letterSpacingBar} />
    </span>
  );
}

function LineHeightIcon() {
  return (
    <span aria-hidden="true" style={textToolbarStyles.lineHeightIcon}>
      A
      <span style={textToolbarStyles.lineHeightLineTop} />
      <span style={textToolbarStyles.lineHeightLineBottom} />
    </span>
  );
}

function TextMetricPanel({
  label,
  value,
  valueLabel,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <>
      <span aria-hidden="true" style={textToolbarStyles.metricBridge} />
      <div style={textToolbarStyles.metricPanel}>
        <div style={textToolbarStyles.metricPanelHeader}>
          <span>{label}</span>
          <span style={textToolbarStyles.metricValue}>{valueLabel}</span>
        </div>
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          style={textToolbarStyles.metricInput}
        />
      </div>
    </>
  );
}

function OpacityIcon() {
  return <span aria-hidden="true" style={textToolbarStyles.opacityIcon} />;
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
  opacityIcon: {
    display: "inline-block",
    width: 19,
    height: 19,
    backgroundImage: "url('/Opacity.svg')",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "contain",
    flex: "0 0 auto",
    overflow: "hidden",
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
  metricControlWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
  },
  metricBridge: {
    position: "absolute",
    top: 22,
    right: -104,
    width: 278,
    height: 30,
    background: "transparent",
    pointerEvents: "auto",
  },
  metricPanel: {
    position: "absolute",
    top: 52,
    right: -104,
    width: 256,
    minHeight: 76,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 12,
    padding: "12px 18px",
    borderRadius: 6,
    border: 0,
    background: "#FFFFFF",
    boxShadow: "0 0 4px rgba(0, 0, 0, 0.15)",
  },
  metricPanelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    color: "#0B1220",
    fontFamily:
      "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    fontSize: 13,
    fontWeight: 600,
  },
  metricValue: {
    color: "#6B7280",
    fontWeight: 500,
  },
  metricInput: {
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
  letterSpacingBar: {
    display: "inline-block",
    width: 1.5,
    height: 22,
    background: "currentColor",
  },
  lineHeightIcon: {
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
  },
  lineHeightLineTop: {
    position: "absolute",
    top: 2,
    width: 18,
    height: 1.5,
    background: "currentColor",
  },
  lineHeightLineBottom: {
    position: "absolute",
    bottom: 1,
    width: 18,
    height: 1.5,
    background: "currentColor",
  },
} satisfies Record<string, CSSProperties>;
