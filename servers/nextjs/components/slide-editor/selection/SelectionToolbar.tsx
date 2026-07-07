"use client";

import { TemplateV2LayoutToolbar } from "@/components/slide-editor/layout/LayoutToolbar";
import type { ComponentLayerAction } from "@/components/slide-editor/selection/layering";
import type { TemplateV2SelectionToolbarTarget } from "@/components/slide-editor/selection/toolbarTarget";
import type {
  TemplateV2ToolbarBox,
  TemplateV2ToolbarSelection,
} from "@/components/slide-editor/selection/toolbarTypes";
import type { TemplateV2ToolbarViewportBounds } from "@/components/slide-editor/selection/toolbarPosition";

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
  toolbarBounds: TemplateV2ToolbarViewportBounds | null;
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
  toolbarBounds,
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
      bounds={toolbarBounds}
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
