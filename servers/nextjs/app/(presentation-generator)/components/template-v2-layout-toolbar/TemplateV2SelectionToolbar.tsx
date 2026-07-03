"use client";

import { TemplateV2LayoutToolbar } from "./TemplateV2LayoutToolbar";
import type { ComponentLayerAction } from "../template-v2-layering/componentLayering";
import type { TemplateV2SelectionToolbarTarget } from "./selectionToolbarTarget";
import type {
  TemplateV2ToolbarBox,
  TemplateV2ToolbarSelection,
} from "./selectionToolbarTypes";

type TemplateV2SelectionToolbarProps = {
  anchorBox: TemplateV2ToolbarBox | null;
  canUngroupComponent: boolean;
  canUngroupLayoutTarget: boolean;
  componentCount: number;
  isEditMode: boolean;
  layoutTarget: TemplateV2SelectionToolbarTarget | null;
  position: { left: number; top: number } | null;
  selection: TemplateV2ToolbarSelection;
  selectionKey: string;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onLayoutChange: (changes: Record<string, unknown>) => void;
  onLayerAction: (action: ComponentLayerAction) => void;
  onUngroupComponent: () => void;
  onUngroupLayoutTarget: () => void;
};

export function TemplateV2SelectionToolbar({
  anchorBox,
  canUngroupComponent,
  canUngroupLayoutTarget,
  componentCount,
  isEditMode,
  layoutTarget,
  position,
  selection,
  selectionKey,
  onDeleteSelection,
  onDuplicateSelection,
  onLayoutChange,
  onLayerAction,
  onUngroupComponent,
  onUngroupLayoutTarget,
}: TemplateV2SelectionToolbarProps) {
  if (!isEditMode || !anchorBox) return null;

  return (
    <TemplateV2LayoutToolbar
      key={selectionKey}
      box={anchorBox}
      element={layoutTarget?.element ?? null}
      position={position ?? undefined}
      componentActions={
        selection?.kind === "component"
          ? {
              canUngroup: canUngroupComponent,
              componentCount,
              componentIndex: selection.componentIndex,
              onDelete: onDeleteSelection,
              onDuplicate: onDuplicateSelection,
              onLayerAction,
              onUngroup: onUngroupComponent,
            }
          : null
      }
      onChange={layoutTarget ? onLayoutChange : undefined}
      ungroupAction={
        canUngroupLayoutTarget
          ? {
              canUngroup: true,
              onUngroup: onUngroupLayoutTarget,
            }
          : null
      }
    />
  );
}
