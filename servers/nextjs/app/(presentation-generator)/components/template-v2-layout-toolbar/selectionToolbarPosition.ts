import type { TemplateV2SelectionToolbarTarget } from "./selectionToolbarTarget";
import type {
  TemplateV2ToolbarBox,
  TemplateV2ToolbarSelection,
} from "./selectionToolbarTypes";

type Size = {
  width: number;
  height: number;
};

const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 720;
const COMPACT_SELECTION_TOOLBAR_WIDTH = 420;
const CONTAINER_SELECTION_TOOLBAR_WIDTH = 760;
const TOOLBAR_HEIGHT = 40;
const TOOLBAR_GAP = 8;
const TOOLBAR_MARGIN = 8;

export function getTemplateV2SelectionToolbarAnchorBox({
  layoutTarget,
  selectedBox,
  selection,
}: {
  layoutTarget: TemplateV2SelectionToolbarTarget | null;
  selectedBox: TemplateV2ToolbarBox | null;
  selection: TemplateV2ToolbarSelection;
}) {
  return selection?.kind === "component"
    ? selectedBox
    : layoutTarget?.box ?? null;
}

export function hasTemplateV2SelectionToolbar({
  anchorBox,
  isEditMode,
  layoutTarget,
  selection,
}: {
  anchorBox: TemplateV2ToolbarBox | null;
  isEditMode: boolean;
  layoutTarget: TemplateV2SelectionToolbarTarget | null;
  selection: TemplateV2ToolbarSelection;
}) {
  return Boolean(
    isEditMode &&
      anchorBox &&
      (selection?.kind === "component" || layoutTarget),
  );
}

export function getTemplateV2SelectionToolbarPosition({
  anchorBox,
  layoutTarget,
  root,
}: {
  anchorBox: TemplateV2ToolbarBox | null;
  layoutTarget: TemplateV2SelectionToolbarTarget | null;
  root: HTMLElement | null;
}) {
  if (!anchorBox) return null;
  return viewportToolbarPosition({
    root,
    anchorBox,
    toolbarWidth: toolbarWidthForTarget(layoutTarget),
  });
}

function toolbarWidthForTarget(
  layoutTarget: TemplateV2SelectionToolbarTarget | null,
) {
  return layoutTarget?.element.type === "container"
    ? CONTAINER_SELECTION_TOOLBAR_WIDTH
    : COMPACT_SELECTION_TOOLBAR_WIDTH;
}

function toolbarPosition({
  anchorBox,
  bounds,
  toolbarWidth,
}: {
  anchorBox: TemplateV2ToolbarBox;
  bounds?: Size;
  toolbarWidth: number;
}) {
  const boundary = bounds ?? { width: STAGE_WIDTH, height: STAGE_HEIGHT };
  const canFitAbove = anchorBox.y >= TOOLBAR_HEIGHT + TOOLBAR_MARGIN;
  const top = canFitAbove
    ? anchorBox.y - TOOLBAR_HEIGHT - TOOLBAR_GAP
    : Math.min(
        boundary.height - TOOLBAR_HEIGHT - TOOLBAR_MARGIN,
        anchorBox.y + anchorBox.height + TOOLBAR_GAP,
      );
  return {
    left: Math.max(
      TOOLBAR_MARGIN,
      Math.min(anchorBox.x, boundary.width - toolbarWidth - TOOLBAR_MARGIN),
    ),
    top: Math.max(TOOLBAR_MARGIN, top),
  };
}

function viewportToolbarPosition({
  anchorBox,
  root,
  toolbarWidth,
}: {
  anchorBox: TemplateV2ToolbarBox;
  root: HTMLElement | null;
  toolbarWidth: number;
}) {
  if (typeof window === "undefined" || !root) {
    return toolbarPosition({ anchorBox, toolbarWidth });
  }

  const rect = root.getBoundingClientRect();
  const scaleX = rect.width > 0 ? rect.width / STAGE_WIDTH : 1;
  const scaleY = rect.height > 0 ? rect.height / STAGE_HEIGHT : 1;
  return toolbarPosition({
    anchorBox: {
      x: rect.left + anchorBox.x * scaleX,
      y: rect.top + anchorBox.y * scaleY,
      width: anchorBox.width * scaleX,
      height: anchorBox.height * scaleY,
    },
    bounds: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    toolbarWidth,
  });
}
