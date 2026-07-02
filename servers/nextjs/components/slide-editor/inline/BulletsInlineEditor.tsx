import type { BulletsSlideElement } from "../state";
import { withHash } from "../editorUtils";
import {
  elementBox,
  elementFont,
  setTextListStrings,
} from "../lib/element-model";
import { inlineStyles } from "./inlineStyles";

const TEMPLATE_V2_PX_PER_IN = 128;

export function BulletsInlineEditor({
  element,
  index,
  scale,
  draft,
  onDraftChange,
  onChange,
  onClose,
}: {
  element: BulletsSlideElement;
  index: number;
  scale: number;
  draft: string;
  onDraftChange: (draft: string) => void;
  onChange: (index: number, element: BulletsSlideElement) => void;
  onClose: () => void;
}) {
  const box = elementBox(element);
  const font = elementFont(element);
  return (
    <textarea
      autoFocus
      value={draft}
      onChange={(event) => {
        const nextDraft = event.target.value;
        onDraftChange(nextDraft);
        const items = nextDraft
          .split("\n")
          .map((item) => item.replace(/^\s*[•*-]\s?/, "").trimEnd())
          .filter((item) => item.trim())
          .slice(0, 8);
        onChange(index, setTextListStrings(element, items.length > 0 ? items : [" "]));
      }}
      onBlur={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.currentTarget.blur();
      }}
      style={{
        ...inlineStyles.textEditor,
        left: box.x * scale,
        top: box.y * scale,
        width: box.w * scale,
        height: box.h * scale,
        color: withHash(font.color),
        fontFamily: `${font.family}, Helvetica, sans-serif`,
        fontSize: font.size * (scale / TEMPLATE_V2_PX_PER_IN),
        lineHeight: font.lineHeight ?? 1.3,
      }}
    />
  );
}
