import { useCallback, useEffect, useRef, useState } from "react";
import type { TextSlideElement } from "../state";
import { PT_TO_PX, PX_PER_IN, withHash } from "../editorUtils";
import {
  elementBox,
  elementFont,
  setTextContent,
  textContent,
} from "../lib/element-model";
import { inlineStyles } from "./inlineStyles";

export function TextInlineEditor({
  element,
  index,
  scale,
  onChange,
  onClose,
}: {
  element: TextSlideElement;
  index: number;
  scale: number;
  onChange: (index: number, element: TextSlideElement) => void;
  onClose: () => void;
}) {
  const box = elementBox(element);
  const font = elementFont(element);
  const elementText = textContent(element);
  const [draft, setDraft] = useState(elementText);
  const elementTextRef = useRef(elementText);
  useEffect(() => {
    if (elementText === elementTextRef.current) return;
    elementTextRef.current = elementText;
    setDraft(elementText);
  }, [elementText]);

  const commit = useCallback(
    (value: string) => {
      const nextText = value || " ";
      if (nextText === textContent(element)) return;
      onChange(index, setTextContent(element, nextText));
    },
    [element, index, onChange],
  );

  return (
    <textarea
      autoFocus
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={(event) => {
        commit(event.currentTarget.value);
        onClose();
      }}
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
        fontSize: font.size * PT_TO_PX * (scale / PX_PER_IN),
        fontWeight: font.bold ? 700 : 400,
        fontStyle: font.italic ? "italic" : "normal",
        textAlign: element.alignment?.horizontal ?? "left",
        lineHeight: font.lineHeight ?? 1.15,
        background: "transparent",
        caretColor: withHash(font.color),
        letterSpacing:
          ((font.letterSpacing ?? 0) / 100) * PT_TO_PX * (scale / PX_PER_IN),
      }}
    />
  );
}
