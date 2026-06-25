import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { Font, TextRun } from "../../../lib/slide-schema";
import { textContent } from "../../../lib/element-model";
import { rootPath, type ElementPath } from "../../../lib/element-path";
import type { ResolvedLayoutItem } from "../../../lib/layout-resolver";
import { renderMarkdownTextRuns } from "../../../lib/markdown-text";
import {
  DomElementLayer,
  elementBoxStyle,
  fontStyle,
  wrappedTextStyle,
} from "../shared";

export function TextDomElement({
  editingTextIndex,
  editingTextPath,
  items,
  scale,
}: {
  editingTextIndex?: number | null;
  editingTextPath?: ElementPath | null;
  items: ResolvedLayoutItem[];
  scale: number;
}) {
  const editingPath =
    editingTextPath ??
    (editingTextIndex != null ? rootPath(editingTextIndex) : null);
  const renderSemanticRichTextForPptx = isPptxExportRender();

  return (
    <DomElementLayer>
      {items.map((item) => {
        const element = item.element;
        if (element.type !== "text" || item.sourcePath === editingPath) {
          return null;
        }

        const valign = element.alignment?.vertical ?? "top";
        const renderedRuns = renderMarkdownTextRuns(element.runs);
        const renderedText = textContent({ ...element, runs: renderedRuns });
        return (
          <div
            key={item.path}
            style={{
              ...elementBoxStyle(element, scale),
              ...fontStyle({ font: element.font ?? {} }, scale),
              ...textBoxStyle,
              overflow: element.font?.wrap === "none" ? "visible" : "hidden",
              whiteSpace: element.font?.wrap === "none" ? "pre" : "pre-wrap",
              wordBreak:
                element.font?.wrap === "none" ? "normal" : "break-word",
              alignItems:
                valign === "middle"
                  ? "center"
                  : valign === "bottom"
                    ? "flex-end"
                    : "flex-start",
              textAlign: element.alignment?.horizontal ?? "left",
            }}
          >
            {renderSemanticRichTextForPptx ? (
              <SemanticRichTextRuns runs={renderedRuns} />
            ) : (
              <div style={textContentStyle}>
                {renderedRuns.length > 1 ||
                renderedRuns.some((run) => run.font) ? (
                  <RichTextRuns
                    baseFont={element.font ?? {}}
                    preferBaseColor={shouldPreferBaseColor(renderedRuns)}
                    runs={renderedRuns}
                    scale={scale}
                  />
                ) : (
                  renderedText
                )}
              </div>
            )}
          </div>
        );
      })}
    </DomElementLayer>
  );
}

function isPptxExportRender() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("format") === "pptx";
}

// The bundled PPTX scraper preserves rich runs from semantic inline tags.
// Styled nested spans are interpreted as separate positioned text shapes.
function SemanticRichTextRuns({ runs }: { runs: TextRun[] }) {
  return (
    <>
      {runs.map((run, index) => (
        <Fragment key={`${index}-${run.text}`}>
          {semanticRunContent(run)}
        </Fragment>
      ))}
    </>
  );
}

function semanticRunContent(run: TextRun): ReactNode {
  let content: ReactNode = run.text;
  if (run.font?.italic) {
    content = <em>{content}</em>;
  }
  if (run.font?.bold) {
    content = <strong>{content}</strong>;
  }
  return content;
}

function RichTextRuns({
  baseFont,
  preferBaseColor,
  runs,
  scale,
}: {
  baseFont: Font;
  preferBaseColor: boolean;
  runs: TextRun[];
  scale: number;
}) {
  return (
    <>
      {runs.map((run, index) => (
        <span
          key={`${index}-${run.text}`}
          style={fontStyle(
            {
              font: {
                ...baseFont,
                ...(run.font ?? {}),
                ...(preferBaseColor && baseFont.color
                  ? { color: baseFont.color }
                  : {}),
              },
            },
            scale,
          )}
        >
          {run.text}
        </span>
      ))}
    </>
  );
}

function shouldPreferBaseColor(runs: TextRun[]) {
  const colors = new Set(
    runs
      .map((run) => run.font?.color?.trim().toLowerCase())
      .filter((color): color is string => Boolean(color)),
  );
  return colors.size <= 1;
}

const textBoxStyle: CSSProperties = {
  display: "flex",
  ...wrappedTextStyle,
  whiteSpace: "pre-wrap",
};

const textContentStyle: CSSProperties = {
  width: "100%",
};
