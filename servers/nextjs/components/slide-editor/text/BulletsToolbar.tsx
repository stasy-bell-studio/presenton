import type { TemplateFontOption } from "@/components/slide-editor/text/google-fonts";
import type { Marker } from "@/components/slide-editor/types";
import {
  rawTextListRunsForEditor,
  setRawTextListRunsContent,
} from "@/components/slide-editor/text/template-v2-text";
import type { TextSelectionRange } from "@/components/slide-editor/text/text-runs";
import type { BulletsSlideElement, TextSlideElement } from "@/components/slide-editor/state/state";
import { TextToolbar } from "@/components/slide-editor/text/TextToolbar";

export function BulletsToolbar({
  element,
  index,
  anchorBox,
  scale,
  selectionRange,
  templateFonts,
  onChange,
}: {
  element: BulletsSlideElement;
  index: number;
  anchorBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
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
      },
      nextTextElement.runs,
    ) as BulletsSlideElement;
    onChange(index, nextListElement);
  };

  return (
    <TextToolbar
      element={textElement}
      index={index}
      anchorBox={anchorBox}
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
