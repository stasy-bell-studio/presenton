import type { ReactNode } from "react";
import type { SlideElement } from "../lib/slide-schema";
import { rootPath, type ElementPath } from "../lib/element-path";
import type { TemplateFontOption } from "../lib/google-fonts";
import type { TextSelectionRange } from "../lib/text-runs";
import {
  BulletsToolbar,
  ChartToolbar,
  DesignVariablesToolbar,
  ImageToolbar,
  LineToolbar,
  ShapeToolbar,
  SvgToolbar,
  TableToolbar,
  TextToolbar,
} from "../inline";
import { getElementDefinition, type ElementToolbarKey } from "../registry";
import type { TableCellSelection } from "../state";

type ElementToolbarProps = {
  element: SlideElement;
  index: number;
  path: ElementPath;
  scale: number;
  selectedTableCell: TableCellSelection | null;
  templateFonts?: TemplateFontOption[];
  textSelectionRange?: TextSelectionRange | null;
  onChange: (index: number, element: SlideElement, path?: ElementPath) => void;
  onEditChart?: (index: number, path?: ElementPath) => void;
  onEditImage: (index: number, path?: ElementPath) => void;
  onEditText?: (index: number, path?: ElementPath) => void;
};

const TOOLBAR_RENDERERS = {
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
  bullets: ({ element, index, onChange, path, scale }) =>
    element.type === "text-list" ? (
      <BulletsToolbar
        element={element}
        index={index}
        scale={scale}
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
  shape: ({ element, index, onChange, path, scale }) =>
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
  svg: ({ element, index, onChange, path, scale }) =>
    element.type === "svg" ? (
      <SvgToolbar
        element={element}
        index={index}
        scale={scale}
        onChange={(index, element) => onChange(index, element, path)}
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
              ? rootPath(selectedTableCell.elementIndex)
              : null)) === path
            ? selectedTableCell
            : null
        }
        onChange={(index, element) => onChange(index, element, path)}
      />
    ) : null,
} satisfies Record<
  ElementToolbarKey,
  (props: ElementToolbarProps) => ReactNode
>;

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

  const toolbar = getElementDefinition(props.element.type).toolbar;
  if (toolbar == null) return null;

  return TOOLBAR_RENDERERS[toolbar](props);
}
