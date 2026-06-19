import { Fragment, useMemo, type CSSProperties, type ReactNode } from "react";
import type { Font, TextElement, TextRun } from "../../../lib/slide-schema";
import { elementBox, textContent } from "../../../lib/element-model";
import { rootPath, type ElementPath } from "../../../lib/element-path";
import type { ResolvedLayoutItem } from "../../../lib/layout-resolver";
import { renderMarkdownTextRuns } from "../../../lib/markdown-text";
import { fitFontToBox } from "../../../lib/textMeasure";
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

  // Pre-compute the effective (post-shrink) fontSize for every text
  // element on this slide. The DOM overlay is what the user actually sees
  // in the interactive editor, so without shrinking here the preview
  // overflows visibly while the export silently fits the text — diverging
  // from PPTX export, PDF export, and presentation mode.
  const effectiveFontSizes = useMemo(() => {
    const sizes = new Map<string, number>();
    items.forEach((item) => {
      const element = item.element;
      if (element.type !== "text") return;
      sizes.set(item.path, computeEffectiveFontSize(element));
    });
    return sizes;
  }, [items]);

  return (
    <DomElementLayer>
      {items.map((item) => {
        const element = item.element;
        if (element.type !== "text" || item.sourcePath === editingPath) {
          return null;
        }

        const valign = element.alignment?.vertical ?? "top";
        const effective =
          effectiveFontSizes.get(item.path) ?? element.font?.size;
        const renderedRuns = renderMarkdownTextRuns(element.runs);
        const renderedText = textContent({ ...element, runs: renderedRuns });
        return (
          <div
            key={item.path}
            style={{
              ...elementBoxStyle(element, scale),
              ...fontStyle(
                { font: { ...(element.font ?? {}), size: effective } },
                scale,
              ),
              ...textBoxStyle,
              overflow: "hidden",
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
                    baseFont={{ ...(element.font ?? {}), size: effective }}
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
  runs,
  scale,
}: {
  baseFont: Font;
  runs: TextRun[];
  scale: number;
}) {
  return (
    <>
      {runs.map((run, index) => (
        <span
          key={`${index}-${run.text}`}
          style={fontStyle({ font: { ...baseFont, ...(run.font ?? {}) } }, scale)}
        >
          {run.text}
        </span>
      ))}
    </>
  );
}

function computeEffectiveFontSize(element: TextElement): number {
  return fitFontToBox(element, elementBox(element).h);
}

const textBoxStyle: CSSProperties = {
  display: "flex",
  ...wrappedTextStyle,
  whiteSpace: "pre-wrap",
};

const textContentStyle: CSSProperties = {
  width: "100%",
};
