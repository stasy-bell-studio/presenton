import Konva from "konva";
import { useEffect, useRef, type RefObject } from "react";
import type { Slide, SlideElement } from "../../../lib/slide-schema";
import { elementBox, resizeElement } from "../../../lib/element-model";

type GroupDragState = {
  index: number;
  nodePositions: Array<{ index: number; x: number; y: number }>;
  elements: Array<{ index: number; element: SlideElement }>;
};

export function useGroupDrag({
  nodeRefs,
  onChangeMany,
  scale,
  selectedIndexes,
  slide,
  transformerRef,
}: {
  nodeRefs: RefObject<Array<Konva.Node | null>>;
  onChangeMany?: (
    updates: Array<{ index: number; element: SlideElement }>,
  ) => void;
  scale: number;
  selectedIndexes: number[];
  slide: Slide;
  transformerRef: RefObject<Konva.Transformer | null>;
}) {
  const groupDragRef = useRef<GroupDragState | null>(null);
  const pendingDragDeltaRef = useRef<{ dx: number; dy: number } | null>(null);
  const dragFrameRef = useRef<number | null>(null);

  const applyGroupDragDelta = (
    groupDrag: GroupDragState,
    dx: number,
    dy: number,
  ) => {
    groupDrag.nodePositions.forEach((item) => {
      if (item.index === groupDrag.index) return;
      const node = nodeRefs.current[item.index];
      node?.position({ x: item.x + dx, y: item.y + dy });
    });
    transformerRef.current?.getLayer()?.batchDraw();
  };

  const flushPendingGroupDrag = () => {
    const pending = pendingDragDeltaRef.current;
    const groupDrag = groupDragRef.current;
    pendingDragDeltaRef.current = null;
    if (!pending || !groupDrag) return;
    applyGroupDragDelta(groupDrag, pending.dx, pending.dy);
  };

  const cancelPendingGroupDrag = () => {
    pendingDragDeltaRef.current = null;
    if (dragFrameRef.current === null || typeof window === "undefined") return;
    window.cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = null;
  };

  useEffect(
    () => () => {
      pendingDragDeltaRef.current = null;
      if (dragFrameRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
    },
    [],
  );

  const startGroupDrag = (index: number) => {
    cancelPendingGroupDrag();
    if (!selectedIndexes.includes(index) || selectedIndexes.length <= 1) {
      groupDragRef.current = null;
      return;
    }
    groupDragRef.current = {
      index,
      nodePositions: selectedIndexes.flatMap((selectedIndex) => {
        const node = nodeRefs.current[selectedIndex];
        return node ? [{ index: selectedIndex, x: node.x(), y: node.y() }] : [];
      }),
      elements: selectedIndexes.map((selectedIndex) => ({
        index: selectedIndex,
        element: slide.elements[selectedIndex],
      })),
    };
  };

  const moveGroupDrag = (
    index: number,
    event: Konva.KonvaEventObject<DragEvent>,
  ) => {
    const groupDrag = groupDragRef.current;
    if (!groupDrag || groupDrag.index !== index) return;
    const origin = groupDrag.nodePositions.find((item) => item.index === index);
    if (!origin) return;
    const dx = event.target.x() - origin.x;
    const dy = event.target.y() - origin.y;
    pendingDragDeltaRef.current = { dx, dy };
    if (dragFrameRef.current !== null) return;
    if (typeof window === "undefined") {
      flushPendingGroupDrag();
      return;
    }
    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      flushPendingGroupDrag();
    });
  };

  const endGroupDrag = (
    index: number,
    event: Konva.KonvaEventObject<DragEvent>,
  ) => {
    const groupDrag = groupDragRef.current;
    if (!groupDrag || groupDrag.index !== index) return false;
    if (dragFrameRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    flushPendingGroupDrag();
    const origin = groupDrag.nodePositions.find((item) => item.index === index);
    if (!origin) return true;
    const dx = (event.target.x() - origin.x) / scale;
    const dy = (event.target.y() - origin.y) / scale;
    onChangeMany?.(
      groupDrag.elements.map(({ index: selectedIndex, element }) => ({
        index: selectedIndex,
        element: (() => {
          const box = elementBox(element);
          return resizeElement(element, {
            x: box.x + dx,
            y: box.y + dy,
          });
        })(),
      })),
    );
    groupDragRef.current = null;
    return true;
  };

  return {
    endGroupDrag,
    moveGroupDrag,
    startGroupDrag,
  };
}
