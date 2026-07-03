import type { ReactNode } from "react";
import type { SlideElement } from "../lib/slide-schema";
import type { TemplateFontOption } from "../lib/google-fonts";
import type { TextSelectionRange } from "../lib/text-runs";
import {
  BulletsToolbar,
  ChartToolbar,
  ImageToolbar,
  LineToolbar,
  ShapeToolbar,
  TableToolbar,
} from "../inline";
import type { TableCellSelection } from "../state";
import { DesignVariablesToolbar } from "../inline/DesignVariablesToolbar";
import { TextToolbar } from "../inline/TextToolbar";

type ElementToolbarProps = {
  element: SlideElement;
  index: number;
  path: string;
  scale: number;
  selectedTableCell: TableCellSelection | null;
  templateFonts?: TemplateFontOption[];
  textSelectionRange?: TextSelectionRange | null;
  onChange: (index: number, element: SlideElement, path?: string) => void;
  onEditChart?: (index: number, path?: string) => void;
  onEditImage: (index: number, path?: string) => void;
  onEditText?: (index: number, path?: string) => void;
};

type ToolbarRenderer = (props: ElementToolbarProps) => ReactNode;

const TOOLBAR_RENDERERS: Partial<
  Record<SlideElement["type"], ToolbarRenderer>
> = {
  text: ({
    element,
    index,
    onChange,
    path,
    scale,
    templateFonts,
    textSelectionRange,
  }) =>
    element.type === "text" ? (
      <TextToolbar
        element={element}
        index={index}
        scale={scale}
        selectionRange={textSelectionRange}
        templateFonts={templateFonts}
        onChange={(index, element) => onChange(index, element, path)}
      />
    ) : null,
  "text-list": ({
    element,
    index,
    onChange,
    path,
    scale,
    templateFonts,
    textSelectionRange,
  }) =>
    element.type === "text-list" ? (
      <BulletsToolbar
        element={element}
        index={index}
        scale={scale}
        selectionRange={textSelectionRange}
        templateFonts={templateFonts}
        onChange={(index, element) => onChange(index, element, path)}
      />
    ) : null,
  image: ({ element, index, onChange, onEditImage, path, scale }) =>
    element.type === "image" ? (
      <ImageToolbar
        element={element}
        index={index}
        scale={scale}
        onChange={(index, element) => onChange(index, element, path)}
        onUpload={(index) => onEditImage(index, path)}
      />
    ) : null,
  rectangle: ({ element, index, onChange, path, scale }) =>
    element.type === "rectangle" || element.type === "ellipse" ? (
      <ShapeToolbar
        element={element}
        index={index}
        scale={scale}
        onChange={(index, element) => onChange(index, element, path)}
      />
    ) : null,
  ellipse: ({ element, index, onChange, path, scale }) =>
    element.type === "rectangle" || element.type === "ellipse" ? (
      <ShapeToolbar
        element={element}
        index={index}
        scale={scale}
        onChange={(index, element) => onChange(index, element, path)}
      />
    ) : null,
  line: ({ element, index, onChange, path, scale }) =>
    element.type === "line" ? (
      <LineToolbar
        element={element}
        index={index}
        scale={scale}
        onChange={(index, element) => onChange(index, element, path)}
      />
    ) : null,
  chart: ({ element, index, onChange, onEditChart, path, scale }) =>
    element.type === "chart" ? (
      <ChartToolbar
        element={element}
        index={index}
        scale={scale}
        onChange={(index, element) => onChange(index, element, path)}
        onEdit={onEditChart ? (index) => onEditChart(index, path) : undefined}
      />
    ) : null,

  table: ({ element, index, onChange, path, scale, selectedTableCell }) =>
    element.type === "table" ? (
      <TableToolbar
        element={element}
        index={index}
        scale={scale}
        selectedCell={
          (selectedTableCell?.elementPath ??
            (selectedTableCell
              ? String(selectedTableCell.elementIndex)
              : null)) === path
            ? selectedTableCell
            : null
        }
        onChange={(index, element) => onChange(index, element, path)}
      />
    ) : null,
};

export function ElementToolbar(props: ElementToolbarProps) {
  if (props.element.design_variables?.length) {
    return (
      <DesignVariablesToolbar
        element={props.element}
        index={props.index}
        scale={props.scale}
        onChange={(index, element) =>
          props.onChange(index, element, props.path)
        }
      />
    );
  }

  const renderToolbar = TOOLBAR_RENDERERS[props.element.type];
  return renderToolbar ? renderToolbar(props) : null;
}
