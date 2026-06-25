import { useMemo } from "react";
import { Group, Rect, Text } from "react-konva";
import type { TextElement as TextEl } from "../../lib/slide-schema";
import { elementFont, textContent } from "../../lib/element-model";
import { renderMarkdownTextRuns } from "../../lib/markdown-text";
import { PT_TO_PX, PX_PER_IN, withHash } from "../../editorUtils";
import { rotationProps, shadowProps } from "./elementVisuals";
import { geometry, type ElementCommonProps } from "./types";

export function TextElement({
  element,
  index,
  scale,
  selected,
  editing,
  setRef,
  events,
  renderMode = "canvas",
}: ElementCommonProps & {
  element: TextEl;
  renderMode?: "canvas" | "proxy";
}) {
  const { x, y, width, height, stroke, strokeWidth } = geometry(
    element,
    scale,
    selected,
  );
  const font = elementFont(element);
  const fontSize = font.size * PT_TO_PX * (scale / PX_PER_IN);
  const verticalAlign = element.alignment?.vertical ?? "top";
  const isTopAligned = verticalAlign === "top";
  const renderedRuns = useMemo(
    () => renderMarkdownTextRuns(element.runs),
    [element.runs],
  );
  const renderedText = textContent({ ...element, runs: renderedRuns });

  return (
    <Group
      ref={setRef}
      name={`element-${index}`}
      x={x}
      y={y}
      width={width}
      height={height}
      {...rotationProps(element)}
      opacity={element.opacity ?? 1}
      {...shadowProps(element.shadow, scale)}
      {...events}
    >
      <Rect width={width} height={height} fill="rgba(255,255,255,0.01)" />
      {editing || renderMode === "proxy" ? null : (
        <Text
          width={width}
          height={isTopAligned ? undefined : height}
          text={renderedText}
          fill={withHash(font.color)}
          fontFamily={`${font.family}, Helvetica, sans-serif`}
          fontSize={fontSize}
          fontStyle={`${font.bold ? "bold" : "normal"} ${font.italic ? "italic" : ""}`}
          align={element.alignment?.horizontal ?? "left"}
          verticalAlign={verticalAlign}
          lineHeight={font.lineHeight ?? 1.15}
          letterSpacing={
            ((font.letterSpacing ?? 0) / 100) * PT_TO_PX * (scale / PX_PER_IN)
          }
          wrap={font.wrap ?? "word"}
          listening={false}
        />
      )}
      {selected ? (
        <Rect
          width={width}
          height={height}
          stroke={stroke}
          strokeWidth={strokeWidth}
          listening={false}
        />
      ) : null}
    </Group>
  );
}
