import type { Font, TextRun } from "./slide-schema";
import type { TextSelectionRange } from "./text-runs";

export type TemplateV2InlineEditKind = "text" | "text-list" | "svg";

export type TemplateV2InlineEditBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TemplateV2TextEditStyle = {
  family: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  lineHeight: number;
  letterSpacing: number;
  wrap: Font["wrap"] | string;
  horizontal: "left" | "center" | "right";
  vertical: "top" | "middle" | "bottom";
};

export type TemplateV2InlineEdit<Selection> =
  | {
      kind: TemplateV2InlineEditKind;
      selection: Selection;
      draft: string;
      frame?: TemplateV2InlineEditBox | null;
      style?: TemplateV2TextEditStyle;
      runs?: TextRun[];
      textSelectionRange?: TextSelectionRange | null;
    }
  | null;
