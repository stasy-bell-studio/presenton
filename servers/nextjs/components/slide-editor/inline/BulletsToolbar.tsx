import type { BulletsSlideElement } from "../state";
import { elementFont, mergeFont } from "../lib/element-model";
import { DeferredColorInput } from "./DeferredColorInput";
import { InlineToolbar } from "./InlineToolbar";
import { inlineStyles } from "./inlineStyles";

export function BulletsToolbar({
  element,
  index,
  scale,
  onChange,
}: {
  element: BulletsSlideElement;
  index: number;
  scale: number;
  onChange: (index: number, element: BulletsSlideElement) => void;
}) {
  const font = elementFont(element);
  return (
    <InlineToolbar element={element} scale={scale}>
      <input
        aria-label="Bullet font size"
        title="Font size"
        type="number"
        min={8}
        max={36}
        value={font.size}
        onChange={(event) =>
          onChange(index, mergeFont(element, { size: Number(event.target.value) || font.size }))
        }
        style={inlineStyles.numberInput}
      />
      <DeferredColorInput
        aria-label="Bullet color"
        title="Color"
        value={font.color}
        onCommit={(color) =>
          onChange(index, mergeFont(element, { color }))
        }
        style={inlineStyles.colorInput}
      />
      <input
        aria-label="Bullet line height"
        title="Line height"
        type="number"
        min={0.9}
        max={2}
        step={0.05}
        value={font.lineHeight ?? 1.3}
        onChange={(event) =>
          onChange(index, mergeFont(element, { line_height: Number(event.target.value) || font.lineHeight || 1.3 }))
        }
        style={inlineStyles.numberInput}
      />
    </InlineToolbar>
  );
}
