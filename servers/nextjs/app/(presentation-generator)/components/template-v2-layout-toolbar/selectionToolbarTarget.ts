import {
  isTemplateV2LayoutElement,
  type TemplateV2LayoutElement,
} from "./TemplateV2LayoutToolbar";
import { findFirstComponentLayoutElement } from "./layoutToolbarTarget";
import type {
  TemplateV2ToolbarBox,
  TemplateV2ToolbarElementSelection,
  TemplateV2ToolbarSelection,
} from "./selectionToolbarTypes";

type RawRecord = Record<string, unknown>;

export type TemplateV2SelectionToolbarTarget = {
  selection: TemplateV2ToolbarElementSelection;
  element: TemplateV2LayoutElement;
  box: TemplateV2ToolbarBox;
};

type SelectionToolbarTargetOptions = {
  selection: TemplateV2ToolbarSelection;
  selectedBox: TemplateV2ToolbarBox | null;
  selectedComponent: RawRecord | null;
  selectedElement: RawRecord | null;
  absoluteBoxForSelection: (
    selection: TemplateV2ToolbarSelection,
  ) => TemplateV2ToolbarBox | null;
};

export function getTemplateV2SelectionToolbarTarget({
  selection,
  selectedBox,
  selectedComponent,
  selectedElement,
  absoluteBoxForSelection,
}: SelectionToolbarTargetOptions): TemplateV2SelectionToolbarTarget | null {
  if (
    selection?.kind === "element" &&
    selectedElement &&
    selectedBox &&
    isTemplateV2LayoutElement(selectedElement)
  ) {
    return { selection, element: selectedElement, box: selectedBox };
  }

  if (selection?.kind !== "component" || !selectedComponent) return null;

  const layoutRoot = findFirstComponentLayoutElement(
    readArray(selectedComponent.elements),
  );
  if (!layoutRoot) return null;

  const elementSelection: TemplateV2ToolbarElementSelection = {
    kind: "element",
    componentIndex: selection.componentIndex,
    elementPath: layoutRoot.elementPath,
  };
  const box = absoluteBoxForSelection(elementSelection);
  return box
    ? { selection: elementSelection, element: layoutRoot.element, box }
    : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
