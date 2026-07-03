import type { CSSProperties } from "react";
import type { TemplateFontOption } from "../lib/google-fonts";
import {
  rawTextListRunsForEditor,
  setRawTextListRunsContent,
} from "../lib/template-v2-text";
import type { TextSelectionRange } from "../lib/text-runs";
import type { BulletsSlideElement, TextSlideElement } from "../state";
import { TextToolbar } from "./TextToolbar";

const MARKER_OPTIONS = [
  { value: "bullet", label: "• Bullet" },
  { value: "number", label: "1. Number" },
  { value: "none", label: "None" },
] as const;

type MarkerValue = (typeof MARKER_OPTIONS)[number]["value"];

export function BulletsToolbar({
  element,
  index,
  scale,
  selectionRange,
  templateFonts,
  onChange,
}: {
  element: BulletsSlideElement;
  index: number;
  scale: number;
  selectionRange?: TextSelectionRange | null;
  templateFonts?: TemplateFontOption[];
  onChange: (index: number, element: BulletsSlideElement) => void;
}) {
  const marker = readMarker(element.marker);
  const textElement: TextSlideElement = {
    ...element,
    type: "text",
    runs: rawTextListRunsForEditor(element),
  };

  const updateMarker = (nextMarker: MarkerValue) => {
    onChange(index, {
      ...element,
      marker: nextMarker,
    });
  };

  const updateTextElement = (
    _index: number,
    nextTextElement: TextSlideElement,
  ) => {
    const nextListElement = setRawTextListRunsContent(
      {
        ...element,
        font: nextTextElement.font,
        opacity: nextTextElement.opacity,
      },
      nextTextElement.runs,
    ) as BulletsSlideElement;
    onChange(index, nextListElement);
  };

  return (
    <TextToolbar
      element={textElement}
      index={index}
      scale={scale}
      extraControls={
        <label style={styles.markerControl}>
          <select
            aria-label="List marker"
            title="List marker"
            value={marker}
            onChange={(event) => updateMarker(readMarker(event.target.value))}
            style={styles.markerSelect}
          >
            {MARKER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      }
      selectionRange={selectionRange}
      templateFonts={templateFonts}
      onChange={updateTextElement}
    />
  );
}

function readMarker(value: unknown): MarkerValue {
  return value === "number" || value === "none" ? value : "bullet";
}

const styles: Record<string, CSSProperties> = {
  markerControl: {
    display: "inline-flex",
    alignItems: "center",
    height: 34,
  },
  markerSelect: {
    height: 32,
    minWidth: 92,
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    background: "#ffffff",
    color: "#111827",
    fontSize: 13,
    fontWeight: 500,
    padding: "0 8px",
    outline: "none",
  },
};
