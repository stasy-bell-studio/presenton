import type { ReactNode } from "react";
import type { SlideElement } from "../lib/slide-schema";
import { elementBox } from "../lib/element-model";
import { inlineStyles } from "./inlineStyles";

export function InlineToolbar({
  element,
  scale,
  children,
  offset = 48,
  unstyled = false,
}: {
  element: Pick<SlideElement, "position" | "size">;
  scale: number;
  children: ReactNode;
  offset?: number;
  unstyled?: boolean;
}) {
  const box = elementBox(element);
  return (
    <div
      data-inline-edit-ignore="true"
      style={{
        ...(unstyled ? unstyledToolbarStyle : inlineStyles.toolbar),
        left: Math.max(8, box.x * scale),
        top: Math.max(8, box.y * scale - offset),
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

const unstyledToolbarStyle = {
  position: "absolute",
  zIndex: 8,
} as const;
