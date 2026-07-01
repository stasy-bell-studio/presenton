"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import {
  Mark,
  mergeAttributes,
  type Editor,
  type JSONContent,
} from "@tiptap/core";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { Font, TextRun } from "../lib/slide-schema";
import {
  mergeAdjacentTextRuns,
  type TextSelectionRange,
} from "../lib/text-runs";

type RunStyleAttrs = {
  family?: string | null;
  size?: number | null;
  color?: string | null;
  bold?: boolean | null;
  italic?: boolean | null;
  underline?: boolean | null;
  lineHeight?: number | null;
  letterSpacing?: number | null;
  wrap?: Font["wrap"] | null;
};

const RunStyle = Mark.create({
  name: "runStyle",
  inclusive: true,
  addAttributes() {
    const attribute = () => ({
      default: null,
      parseHTML: () => null,
      renderHTML: () => ({}),
    });

    return {
      family: attribute(),
      size: attribute(),
      color: attribute(),
      bold: attribute(),
      italic: attribute(),
      underline: attribute(),
      lineHeight: attribute(),
      letterSpacing: attribute(),
      wrap: attribute(),
    };
  },
  parseHTML() {
    return [{ tag: "span[data-slide-run-style]" }];
  },
  renderHTML({ mark, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-slide-run-style": "true",
        style: runStyleAttrsToCss(mark.attrs as RunStyleAttrs),
      }),
      0,
    ];
  },
});

const TIPTAP_EXTENSIONS = [
  StarterKit.configure({
    heading: false,
    bulletList: false,
    orderedList: false,
    blockquote: false,
    codeBlock: false,
    horizontalRule: false,
  }),
  Underline,
  RunStyle,
];

export function TiptapInlineTextEditor({
  autoFocus = true,
  baseFont,
  editorStyle,
  runs,
  onBlurOutside,
  onCommitShortcut,
  onEscape,
  onRunsChange,
  onSelectionChange,
}: {
  autoFocus?: boolean;
  baseFont: Font;
  editorStyle: CSSProperties;
  runs: TextRun[];
  onBlurOutside: () => void;
  onCommitShortcut: () => void;
  onEscape: () => void;
  onRunsChange: (runs: TextRun[]) => void;
  onSelectionChange: (range: TextSelectionRange | null) => void;
}) {
  const lastEmittedSignatureRef = useRef<string | null>(null);
  const lastSelectionSignatureRef = useRef<string | null>(null);
  const didAutoFocusRef = useRef(false);
  const callbacksRef = useLatestRef({
    onBlurOutside,
    onCommitShortcut,
    onEscape,
    onRunsChange,
    onSelectionChange,
  });
  const baseFontSignature = useMemo(() => JSON.stringify(baseFont), [baseFont]);
  const stableBaseFont = useMemo(
    () => JSON.parse(baseFontSignature) as Font,
    [baseFontSignature],
  );
  const stableBaseFontRef = useLatestRef(stableBaseFont);
  const content = useMemo(
    () => textRunsToTiptapContent(runs, stableBaseFont),
    [runs, stableBaseFont],
  );
  const contentSignature = useMemo(() => textRunsSignature(runs), [runs]);
  const editorContentStyle = useMemo(
    () => tiptapEditorStyle(stableBaseFont, runs),
    [runs, stableBaseFont],
  );
  const emitSelection = useCallback(
    (editor: Editor) => {
      const range = selectionRangeFromEditor(editor);
      const signature = selectionRangeSignature(range);
      if (signature === lastSelectionSignatureRef.current) return;
      lastSelectionSignatureRef.current = signature;
      callbacksRef.current.onSelectionChange(range);
    },
    [callbacksRef],
  );

  const editor = useEditor({
    extensions: TIPTAP_EXTENSIONS,
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "template-v2-tiptap-inline-prosemirror",
        style: editorContentStyle,
        "data-inline-edit-ignore": "true",
      },
      handleDOMEvents: {
        mousedown: (_view, event) => {
          event.stopPropagation();
          return false;
        },
        pointerdown: (_view, event) => {
          event.stopPropagation();
          return false;
        },
        keydown: (_view, event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            callbacksRef.current.onEscape();
            return true;
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            callbacksRef.current.onCommitShortcut();
            return true;
          }
          return false;
        },
      },
    },
    onUpdate: ({ editor }) => {
      const nextRuns = tiptapContentToTextRuns(
        editor.getJSON(),
        stableBaseFontRef.current,
      );
      lastEmittedSignatureRef.current = textRunsSignature(nextRuns);
      callbacksRef.current.onRunsChange(nextRuns);
      emitSelection(editor);
    },
    onSelectionUpdate: ({ editor }) => {
      emitSelection(editor);
    },
    onFocus: ({ editor }) => {
      emitSelection(editor);
    },
    onBlur: ({ event }) => {
      const relatedTarget = event.relatedTarget;
      if (
        relatedTarget instanceof HTMLElement &&
        relatedTarget.closest("[data-inline-edit-ignore='true']")
      ) {
        return;
      }
      callbacksRef.current.onBlurOutside();
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          ...editor.options.editorProps.attributes,
          style: editorContentStyle,
        },
      },
    });
  }, [editor, editorContentStyle]);

  useEffect(() => {
    if (!editor) return;
    if (contentSignature === lastEmittedSignatureRef.current) return;
    const { from, to } = editor.state.selection;
    const wasFocused = editor.isFocused;
    lastEmittedSignatureRef.current = contentSignature;
    editor.commands.setContent(content, false);
    const maxPosition = Math.max(1, editor.state.doc.content.size);
    editor.commands.setTextSelection({
      from: clampPosition(from, maxPosition),
      to: clampPosition(to, maxPosition),
    });
    if (wasFocused) editor.commands.focus();
    emitSelection(editor);
  }, [content, contentSignature, editor, emitSelection]);

  useEffect(() => {
    if (!editor || !autoFocus) return;
    if (didAutoFocusRef.current) return;
    didAutoFocusRef.current = true;
    const timeout = window.setTimeout(() => {
      if (editor.isDestroyed) return;
      editor.commands.focus();
      emitSelection(editor);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [autoFocus, editor, emitSelection]);

  return (
    <div
      data-inline-edit-ignore="true"
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      style={editorStyle}
    >
      <EditorContent editor={editor} />
      <style>{TIPTAP_INLINE_EDITOR_CSS}</style>
    </div>
  );
}

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

function textRunsToTiptapContent(runs: TextRun[], baseFont: Font): JSONContent {
  const content: JSONContent[] = [];
  const sourceRuns = runs.length > 0 ? runs : [{ text: " ", font: baseFont }];

  for (const run of sourceRuns) {
    const font = normalizeFont(run.font, baseFont);
    const marks = [
      {
        type: "runStyle",
        attrs: fontToRunStyleAttrs(font),
      },
    ];
    const parts = (run.text || " ").split("\n");
    parts.forEach((part, index) => {
      if (index > 0) content.push({ type: "hardBreak" });
      if (part) content.push({ type: "text", text: part, marks });
    });
  }

  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: content.length > 0 ? content : [{ type: "text", text: " " }],
      },
    ],
  };
}

function tiptapContentToTextRuns(doc: JSONContent, baseFont: Font): TextRun[] {
  const runs: TextRun[] = [];
  let lastFont = baseFont;
  let hasParagraph = false;

  const append = (text: string, font: Font) => {
    if (!text) return;
    lastFont = font;
    runs.push({ text, font });
  };

  const visit = (node: JSONContent) => {
    if (node.type === "paragraph") {
      if (hasParagraph) append("\n", lastFont);
      hasParagraph = true;
      node.content?.forEach(visit);
      return;
    }
    if (node.type === "hardBreak") {
      append("\n", lastFont);
      return;
    }
    if (node.type === "text") {
      append(node.text ?? "", fontFromMarks(node.marks, baseFont));
      return;
    }
    node.content?.forEach(visit);
  };

  doc.content?.forEach(visit);
  return mergeAdjacentTextRuns(runs);
}

function fontFromMarks(marks: JSONContent["marks"], baseFont: Font): Font {
  const runStyle = marks?.find((mark) => mark.type === "runStyle");
  const font = runStyle?.attrs
    ? fontFromRunStyleAttrs(runStyle.attrs as RunStyleAttrs, baseFont)
    : { ...baseFont };
  if (marks?.some((mark) => mark.type === "bold")) {
    font.bold = true;
  }
  if (marks?.some((mark) => mark.type === "italic")) {
    font.italic = true;
  }
  if (marks?.some((mark) => mark.type === "underline")) {
    font.underline = true;
  }
  return font;
}

function selectionRangeFromEditor(editor: Editor) {
  const { from, to } = editor.state.selection;
  return {
    start: editor.state.doc.textBetween(0, from, "\n", "\n").length,
    end: editor.state.doc.textBetween(0, to, "\n", "\n").length,
  };
}

function selectionRangeSignature(range: TextSelectionRange) {
  return `${range.start}:${range.end}`;
}

function textRunsSignature(runs: TextRun[]) {
  return JSON.stringify(runs);
}

function clampPosition(position: number, maxPosition: number) {
  return Math.min(maxPosition, Math.max(1, position));
}

function normalizeFont(font: TextRun["font"], baseFont: Font): Font {
  return {
    ...baseFont,
    ...(font ?? {}),
  };
}

function fontToRunStyleAttrs(font: Font): RunStyleAttrs {
  return {
    family: font.family,
    size: font.size,
    color: font.color,
    bold: font.bold,
    italic: font.italic,
    underline: font.underline,
    lineHeight: font.line_height,
    letterSpacing: font.letter_spacing,
    wrap: font.wrap,
  };
}

function fontFromRunStyleAttrs(attrs: RunStyleAttrs, baseFont: Font): Font {
  return {
    ...baseFont,
    family: attrs.family ?? baseFont.family,
    size: attrs.size ?? baseFont.size,
    color: attrs.color ?? baseFont.color,
    bold: attrs.bold ?? baseFont.bold,
    italic: attrs.italic ?? baseFont.italic,
    underline: attrs.underline ?? baseFont.underline,
    line_height: attrs.lineHeight ?? baseFont.line_height,
    letter_spacing: attrs.letterSpacing ?? baseFont.letter_spacing,
    wrap: attrs.wrap ?? baseFont.wrap,
  };
}

function runStyleAttrsToCss(attrs: RunStyleAttrs) {
  const styles = [
    attrs.family ? `font-family:${cssFontFamily(attrs.family)}` : null,
    attrs.size != null ? `font-size:${attrs.size}px` : null,
    attrs.color ? `color:${cssColor(attrs.color)}` : null,
    attrs.bold != null ? `font-weight:${attrs.bold ? 700 : 400}` : null,
    attrs.italic != null
      ? `font-style:${attrs.italic ? "italic" : "normal"}`
      : null,
    attrs.underline != null
      ? `text-decoration:${attrs.underline ? "underline" : "none"}`
      : null,
    attrs.lineHeight != null ? `line-height:${attrs.lineHeight}` : null,
    attrs.letterSpacing != null ? `letter-spacing:${attrs.letterSpacing}px` : null,
    attrs.wrap === "none" ? "white-space:pre" : null,
  ].filter(Boolean);
  return styles.join(";");
}

function tiptapEditorStyle(font: Font, runs: TextRun[]) {
  const rootLineHeight = rootLineHeightPx(font, runs);
  return [
    "outline:none",
    "width:100%",
    "height:100%",
    "min-height:100%",
    "box-sizing:border-box",
    "margin:0",
    "padding:0",
    "white-space:pre-wrap",
    "overflow-wrap:break-word",
    `font-family:${cssFontFamily(font.family ?? "Arial")}`,
    `font-size:${font.size ?? 18}px`,
    `color:${cssColor(font.color ?? "111827")}`,
    font.bold ? "font-weight:700" : "font-weight:400",
    font.italic ? "font-style:italic" : "font-style:normal",
    font.underline ? "text-decoration:underline" : "text-decoration:none",
    `line-height:${rootLineHeight}px`,
    `letter-spacing:${font.letter_spacing ?? 0}px`,
  ].join(";");
}

function rootLineHeightPx(baseFont: Font, runs: TextRun[]) {
  const sourceRuns = runs.length > 0 ? runs : [{ text: " ", font: baseFont }];
  return Math.max(
    1,
    ...sourceRuns.map((run) => {
      const font = normalizeFont(run.font, baseFont);
      return (font.size ?? baseFont.size ?? 18) * (font.line_height ?? 1.15);
    }),
  );
}

function cssColor(color: string) {
  return color.startsWith("#") ? color : `#${color}`;
}

function cssFontFamily(family: string) {
  return `${family}, Helvetica, sans-serif`;
}

const TIPTAP_INLINE_EDITOR_CSS = `
.template-v2-tiptap-inline-prosemirror p {
  line-height: inherit;
  margin: 0;
}
.template-v2-tiptap-inline-prosemirror * {
  box-sizing: border-box;
}
`;
