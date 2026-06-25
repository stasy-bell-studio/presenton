import { Fragment, type CSSProperties, type ReactNode } from "react";
import { textListStrings } from "../../../lib/element-model";
import { rootPath, type ElementPath } from "../../../lib/element-path";
import type { ResolvedLayoutItem } from "../../../lib/layout-resolver";
import { renderMarkdownTextRuns } from "../../../lib/markdown-text";
import type { TextRun } from "../../../lib/slide-schema";
import {
  DomElementLayer,
  elementBoxStyle,
  fontStyle,
  wrappedTextStyle,
} from "../shared";

export function BulletsDomElement({
  editingBulletsIndex,
  editingBulletsPath,
  items,
  scale,
}: {
  editingBulletsIndex?: number | null;
  editingBulletsPath?: ElementPath | null;
  items: ResolvedLayoutItem[];
  scale: number;
}) {
  const editingPath =
    editingBulletsPath ??
    (editingBulletsIndex != null ? rootPath(editingBulletsIndex) : null);

  return (
    <DomElementLayer>
      {items.map((item) => {
        const element = item.element;
        if (element.type !== "text-list" || item.sourcePath === editingPath) {
          return null;
        }
        const items = textListStrings(element);

        return (
          <ListTag
            key={item.path}
            style={{
              ...elementBoxStyle(element, scale),
              ...fontStyle(
                {
                  font: {
                    ...(element.font ?? {}),
                    lineHeight: element.font?.lineHeight ?? 1.3,
                  },
                },
                scale,
              ),
              ...listStyle,
              listStyleType:
                element.marker === "none"
                  ? "none"
                  : element.marker === "number"
                    ? "decimal"
                    : "disc",
            }}
          >
            {items.map((item, itemIndex) => (
              <li
                key={`${item}-${itemIndex}`}
                style={{
                  ...itemStyle,
                  marginBottom: itemIndex === items.length - 1 ? 0 : 0.05 * scale,
                }}
              >
                <MarkdownListItem text={item} />
              </li>
            ))}
          </ListTag>
        );
      })}
    </DomElementLayer>
  );
}

const ListTag = "ul";

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: "1.1em",
  ...wrappedTextStyle,
  whiteSpace: "normal",
};

const itemStyle: CSSProperties = {
  paddingLeft: "0.15em",
};

function MarkdownListItem({ text }: { text: string }) {
  const runs = renderMarkdownTextRuns([{ text }]);
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
