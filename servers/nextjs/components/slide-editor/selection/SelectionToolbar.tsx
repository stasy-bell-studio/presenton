"use client";

import {
  TemplateV2LayoutToolbar,
  type TemplateV2SelectionComponentActions,
} from "@/components/slide-editor/layout/LayoutToolbar";
import type { ComponentLayerAction } from "@/components/slide-editor/selection/layering";
import type {
  TemplateV2ChartSelectionToolbarTarget,
  TemplateV2SelectionToolbarTarget,
  TemplateV2TableSelectionToolbarTarget,
} from "@/components/slide-editor/selection/toolbarTarget";
import type {
  TemplateV2ToolbarBox,
  TemplateV2ToolbarSelection,
} from "@/components/slide-editor/selection/toolbarTypes";
import type { TemplateV2ToolbarViewportBounds } from "@/components/slide-editor/selection/toolbarPosition";
import type {
  ChartSlideElement,
  TableCellSelection,
  TableSlideElement,
} from "@/components/slide-editor/state/state";

type TemplateV2SelectionToolbarProps = {
  anchorBox: TemplateV2ToolbarBox | null;
  canUngroupComponent: boolean;
  canUngroupLayoutTarget: boolean;
  chartTarget: TemplateV2ChartSelectionToolbarTarget | null;
  componentCount: number;
  isEditMode: boolean;
  layoutTarget: TemplateV2SelectionToolbarTarget | null;
  position: { left: number; top: number } | null;
  selectedTableCell: TableCellSelection | null;
  selection: TemplateV2ToolbarSelection;
  selectionKey: string;
  tableTarget: TemplateV2TableSelectionToolbarTarget | null;
  targetComponentActions: TemplateV2SelectionComponentActions | null;
  toolbarBounds: TemplateV2ToolbarViewportBounds | null;
  onChartChange: (element: ChartSlideElement) => void;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onLayoutChange: (changes: Record<string, unknown>) => void;
  onLayerAction: (action: ComponentLayerAction) => void;
  onTableChange: (element: TableSlideElement) => void;
  onUngroupComponent: () => void;
  onUngroupLayoutTarget: () => void;
};

export function TemplateV2SelectionToolbar({
  anchorBox,
  canUngroupComponent,
  canUngroupLayoutTarget,
  chartTarget,
  componentCount,
  isEditMode,
  layoutTarget,
  position,
  selectedTableCell,
  selection,
  selectionKey,
  tableTarget,
  targetComponentActions,
  toolbarBounds,
  onChartChange,
  onDeleteSelection,
  onDuplicateSelection,
  onLayoutChange,
  onLayerAction,
  onTableChange,
  onUngroupComponent,
  onUngroupLayoutTarget,
}: TemplateV2SelectionToolbarProps) {
  if (!isEditMode || !anchorBox) return null;
  const componentActions =
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
      : targetComponentActions;

  return (
    <TemplateV2LayoutToolbar
      key={selectionKey}
      box={anchorBox}
      element={
        layoutTarget?.element ??
        chartTarget?.element ??
        tableTarget?.element ??
        null
      }
      position={position ?? undefined}
      bounds={toolbarBounds}
      componentActions={componentActions}
      onChartChange={chartTarget ? onChartChange : undefined}
      onChange={layoutTarget ? onLayoutChange : undefined}
      onTableChange={tableTarget ? onTableChange : undefined}
      selectedTableCell={selectedTableCell}
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
