import type Konva from "konva";
import type { SlideElement } from "../../lib/slide-schema";
import { elementBox } from "../../lib/element-model";

export const SELECTION_STROKE = "#7C51F8";

export type ElementEvents = {
  draggable: boolean;
  onClick: (event: Konva.KonvaEventObject<MouseEvent>) => boolean;
  onDblClick?: (event: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap: (event: Konva.KonvaEventObject<TouchEvent>) => boolean;
  onMouseDown?: (event: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseMove?: (event: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseUp?: () => void;
  onMouseLeave?: () => void;
  onTouchStart?: (event: Konva.KonvaEventObject<TouchEvent>) => void;
  onTouchMove?: (event: Konva.KonvaEventObject<TouchEvent>) => void;
  onTouchEnd?: () => void;
  onTouchCancel?: () => void;
  onDragStart: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformStart: (event: Konva.KonvaEventObject<Event>) => void;
  onTransform?: (event: Konva.KonvaEventObject<Event>) => void;
  onTransformEnd: (event: Konva.KonvaEventObject<Event>) => void;
};

export type ElementCommonProps = {
  index: number;
  scale: number;
  selected: boolean;
  editing?: boolean;
  setRef: (node: Konva.Node | null) => void;
  events: ElementEvents;
};

export type TableInteractionProps = {
  onTableCellClick?: (rowIndex: number, colIndex: number) => void;
};

export type SurfaceInteractionPreview = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

export type SurfaceInteractionTarget = {
  path: string;
  rootIndexes: number[];
  preview?: SurfaceInteractionPreview;
} | null;

export function geometry(
  element: Pick<SlideElement, "position" | "size">,
  scale: number,
  selected: boolean,
) {
  const box = elementBox(element);
  return {
    x: box.x * scale,
    y: box.y * scale,
    width: box.w * scale,
    height: box.h * scale,
    stroke: selected ? SELECTION_STROKE : undefined,
    strokeWidth: selected ? 1.5 : 0,
  };
}
