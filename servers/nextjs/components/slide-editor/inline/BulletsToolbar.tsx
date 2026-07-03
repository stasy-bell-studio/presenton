import type { TemplateFontOption } from "../lib/google-fonts";
import type { Marker } from "../lib/slide-schema";
import {
  rawTextListRunsForEditor,
  setRawTextListRunsContent,
} from "../lib/template-v2-text";
import type { TextSelectionRange } from "../lib/text-runs";
import type { BulletsSlideElement, TextSlideElement } from "../state";
import { TextToolbar } from "./TextToolbar";

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

  const updateMarker = (nextMarker: Marker) => {
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
      listMarker={marker}
      selectionRange={selectionRange}
      templateFonts={templateFonts}
      onChange={updateTextElement}
      onListMarkerChange={updateMarker}
    />
  );
}

function readMarker(value: unknown): Marker {
  return value === "number" || value === "none" ? value : "bullet";
}
