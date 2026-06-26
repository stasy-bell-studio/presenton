import Konva from "konva";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { Group, Line, Rect, Text, Transformer } from "react-konva";
import {
  SLIDE_H,
  SLIDE_W,
  type Slide,
  type SlideElement,
} from "../../lib/slide-schema";
import { elementBox, resizeElement } from "../../lib/element-model";
import {
  getElementAtPath,
  isRootPath,
  rootIndexFromPath,
  rootPath,
  type ElementPath,
} from "../../lib/element-path";
import {
  flattenResolvedLayoutNode,
  isLayoutElement,
  resolveElementLayoutTree,
  resolveSlideLayout,
  type ResolvedLayoutItem,
} from "../../lib/layout-resolver";
import { textElementOverflows } from "../../lib/textMeasure";
import { clamp } from "../../editorUtils";
import { getComponentRun } from "../../state";
import { useGroupDrag } from "./hooks/useGroupDrag";
import { KonvaElement } from "./KonvaElement";
import {
  SELECTION_STROKE,
  type ElementEvents,
  type SurfaceInteractionPreview,
  type SurfaceInteractionTarget,
} from "./types";

type Bounds = { x: number; y: number; width: number; height: number };
type OutlineBounds = Bounds & { rotation?: number };
type PressPoint = { x: number; y: number };
type ComponentPress = {
  index: number;
  indexes: number[];
  point: PressPoint;
  timer: ReturnType<typeof setTimeout>;
};
type ElementLayerProps = {
  editingBulletsIndex?: number | null;
  editingChartIndex?: number | null;
  editingSvgIndex?: number | null;
  editingTableIndex?: number | null;
  editingTextIndex?: number | null;
  activeSurfaceInteraction?: SurfaceInteractionTarget;
  interactive: boolean;
  nodeRefs: RefObject<Array<Konva.Node | null>>;
  pathNodeRefs: MutableRefObject<Record<ElementPath, Konva.Node | null>>;
  normalizedSelectionBox: Bounds | null;
  bulletsRenderMode?: "canvas" | "proxy";
  chartRenderMode?: "canvas" | "proxy";
  onChange?: (index: number, element: SlideElement) => void;
  onChangeAtPath?: (path: ElementPath, element: SlideElement) => void;
  onChangeMany?: (
    updates: Array<{ index: number; element: SlideElement }>,
  ) => void;
  onDelete?: () => void;
  onEditBullets?: (index: number, path?: ElementPath) => void;
  onEditChart?: (index: number, path?: ElementPath) => void;
  onEditComponentRun?: (indexes: number[]) => void;
  onEditImage?: (index: number, path?: ElementPath) => void;
  onEditSvg?: (index: number, path?: ElementPath) => void;
  onEditTable?: (index: number, path?: ElementPath) => void;
  onEditText?: (index: number, path?: ElementPath) => void;
  onSelect?: (index: number, additive?: boolean, path?: ElementPath) => void;
  onSelectMany?: (indexes: number[]) => void;
  onSelectTableCell?: (
    index: number,
    rowIndex: number,
    colIndex: number,
    path?: ElementPath,
  ) => void;
  onSurfaceInteractionChange?: (target: SurfaceInteractionTarget) => void;
  scale: number;
  selectedBounds: Bounds | null;
  selectedIndexes: number[];
  selectedIsComponentContainer: boolean;
  selectedPath?: ElementPath | null;
  slide: Slide;
  surfaceId?: string;
  tableRenderMode?: "canvas" | "proxy";
  textRenderMode?: "canvas" | "proxy";
  transformerRef: RefObject<Konva.Transformer | null>;
  width: number;
  height: number;
};

const COMPONENT_LONG_PRESS_MS = 550;
const COMPONENT_LONG_PRESS_MOVE_TOLERANCE = 8;
const SUPPRESS_SELECT_AFTER_LONG_PRESS_MS = 400;
const INLINE_EDIT_DOUBLE_CLICK_MS = 450;
const COMPONENT_OUTLINE_STROKE = "#D6DAE2";
const COMPONENT_OUTLINE_DASH = [4, 4];
const SELECTION_CORNER_ANCHORS = new Set([
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "rotater",
]);
const SELECTION_HORIZONTAL_SIDE_ANCHORS = new Set([
  "top-center",
  "bottom-center",
]);
const SELECTION_VERTICAL_SIDE_ANCHORS = new Set([
  "middle-left",
  "middle-right",
]);
const SELECTION_CORNER_HANDLE_SIZE = 18;
const SELECTION_SIDE_HANDLE_THICKNESS = 9;
const SELECTION_SIDE_HANDLE_LENGTH = 30;

function hashKey(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function slideElementKey(element: SlideElement) {
  const explicitKey =
    element.componentInstanceId ??
    element.name ??
    element.componentSlot ??
    element.componentId;
  return explicitKey ?? `${element.type}-${hashKey(JSON.stringify(element))}`;
}

function styleSelectionAnchor(anchor: Konva.Rect) {
  const anchorName = anchor.name().split(" ")[0];

  anchor.setAttrs({
    fill: "#ffffff",
    stroke: "#D6DAE2",
    strokeWidth: 1,
    shadowColor: "rgba(15, 23, 42, 0.16)",
    shadowBlur: 8,
    shadowOffsetY: 2,
    shadowOpacity: 1,
  });

  if (SELECTION_HORIZONTAL_SIDE_ANCHORS.has(anchorName)) {
    anchor.setAttrs({
      width: SELECTION_SIDE_HANDLE_LENGTH,
      height: SELECTION_SIDE_HANDLE_THICKNESS,
      offsetX: SELECTION_SIDE_HANDLE_LENGTH / 2,
      offsetY: SELECTION_SIDE_HANDLE_THICKNESS / 2,
      cornerRadius: SELECTION_SIDE_HANDLE_THICKNESS / 2,
    });
    return;
  }

  if (SELECTION_VERTICAL_SIDE_ANCHORS.has(anchorName)) {
    anchor.setAttrs({
      width: SELECTION_SIDE_HANDLE_THICKNESS,
      height: SELECTION_SIDE_HANDLE_LENGTH,
      offsetX: SELECTION_SIDE_HANDLE_THICKNESS / 2,
      offsetY: SELECTION_SIDE_HANDLE_LENGTH / 2,
      cornerRadius: SELECTION_SIDE_HANDLE_THICKNESS / 2,
    });
    return;
  }

  if (SELECTION_CORNER_ANCHORS.has(anchorName)) {
    anchor.setAttrs({
      width: SELECTION_CORNER_HANDLE_SIZE,
      height: SELECTION_CORNER_HANDLE_SIZE,
      offsetX: SELECTION_CORNER_HANDLE_SIZE / 2,
      offsetY: SELECTION_CORNER_HANDLE_SIZE / 2,
      cornerRadius: SELECTION_CORNER_HANDLE_SIZE / 2,
    });
  }
}

export function ElementLayer(props: ElementLayerProps) {
  return useElementLayerContent(props);
}

function useElementLayerContent({
  editingBulletsIndex,
  editingChartIndex,
  editingSvgIndex,
  editingTableIndex,
  editingTextIndex,
  activeSurfaceInteraction,
  interactive,
  nodeRefs,
  pathNodeRefs,
  normalizedSelectionBox,
  bulletsRenderMode = "canvas",
  chartRenderMode = "canvas",
  onChange,
  onChangeAtPath,
  onChangeMany,
  onDelete,
  onEditBullets,
  onEditChart,
  onEditComponentRun,
  onEditImage,
  onEditSvg,
  onEditTable,
  onEditText,
  onSelect,
  onSelectMany,
  onSelectTableCell,
  onSurfaceInteractionChange,
  scale,
  selectedBounds,
  selectedIndexes,
  selectedIsComponentContainer,
  selectedPath,
  slide,
  surfaceId,
  tableRenderMode = "canvas",
  textRenderMode = "canvas",
  transformerRef,
  width,
  height,
}: ElementLayerProps) {
  const { endGroupDrag, moveGroupDrag, startGroupDrag } = useGroupDrag({
    nodeRefs,
    onChangeMany,
    scale,
    selectedIndexes,
    slide,
    transformerRef,
  });

  // Pretext-measured overflow set, only computed in the live editor — never
  // on export rasters, since the badge is a UI affordance, not deck content.
  const resolvedLayoutItems = useMemo(() => resolveSlideLayout(slide), [slide]);
  const overflowingIndices = useMemo(() => {
    if (!interactive) return null;
    const out = new Set<number>();
    resolvedLayoutItems.forEach((item) => {
      if (item.element.type === "text" && textElementOverflows(item.element)) {
        out.add(item.rootIndex);
      }
    });
    return out;
  }, [interactive, resolvedLayoutItems]);

  const [hoveredOverflow, setHoveredOverflow] = useState<number | null>(null);
  const componentPressRef = useRef<ComponentPress | null>(null);
  const chartOverlayFrameRef = useRef<number | null>(null);
  const chartOverlayPreviewRef = useRef<{
    path: ElementPath;
    preview: SurfaceInteractionPreview;
  } | null>(null);
  const surfaceInteractionTargetRef = useRef<SurfaceInteractionTarget>(null);
  const lastClickRef = useRef<{ path: ElementPath; ts: number } | null>(null);
  const suppressSelectRef = useRef<Set<number> | null>(null);
  const suppressSelectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const eventPoint = (
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ): PressPoint | null => {
    const nativeEvent = event.evt;
    if ("touches" in nativeEvent) {
      const touch = nativeEvent.touches[0] ?? nativeEvent.changedTouches[0];
      return touch ? { x: touch.clientX, y: touch.clientY } : null;
    }
    return { x: nativeEvent.clientX, y: nativeEvent.clientY };
  };

  const clearComponentPress = () => {
    if (componentPressRef.current) {
      clearTimeout(componentPressRef.current.timer);
      componentPressRef.current = null;
    }
  };

  useEffect(
    () => () => {
      clearComponentPress();
      if (surfaceInteractionTargetRef.current) {
        onSurfaceInteractionChange?.(null);
      }
      if (suppressSelectTimerRef.current) {
        clearTimeout(suppressSelectTimerRef.current);
      }
      if (chartOverlayFrameRef.current != null) {
        cancelAnimationFrame(chartOverlayFrameRef.current);
      }
    },
    [onSurfaceInteractionChange],
  );

  const chartOverlayForPath = (path: ElementPath) => {
    if (typeof document === "undefined" || !surfaceId) return null;
    const overlays = document.querySelectorAll<HTMLElement>(
      "[data-slide-chart-path][data-slide-surface-id]",
    );
    return (
      Array.from(overlays).find(
        (node) =>
          node.dataset.slideSurfaceId === surfaceId &&
          node.dataset.slideChartPath === path,
      ) ?? null
    );
  };

  const applyChartOverlayPreview = (
    path: ElementPath,
    preview: SurfaceInteractionPreview,
  ) => {
    if (!surfaceId || typeof window === "undefined") return;
    chartOverlayPreviewRef.current = { path, preview };
    if (chartOverlayFrameRef.current != null) return;
    chartOverlayFrameRef.current = window.requestAnimationFrame(() => {
      chartOverlayFrameRef.current = null;
      const current = chartOverlayPreviewRef.current;
      if (!current) return;
      const node = chartOverlayForPath(current.path);
      if (!node) return;
      node.style.left = `${current.preview.x * scale}px`;
      node.style.top = `${current.preview.y * scale}px`;
      node.style.width = `${current.preview.width * scale}px`;
      node.style.height = `${current.preview.height * scale}px`;
      node.style.transform = current.preview.rotation
        ? `rotate(${current.preview.rotation}deg)`
        : "";
      node.style.transformOrigin = "top left";
    });
  };

  const clearChartOverlayPreview = () => {
    chartOverlayPreviewRef.current = null;
    if (chartOverlayFrameRef.current != null) {
      cancelAnimationFrame(chartOverlayFrameRef.current);
      chartOverlayFrameRef.current = null;
    }
  };

  const setSurfaceInteractionTarget = (target: SurfaceInteractionTarget) => {
    const current = surfaceInteractionTargetRef.current;
    const keyForTarget = (item: SurfaceInteractionTarget) => {
      if (!item) return "";
      return `${item.path}:${item.rootIndexes.join(",")}`;
    };
    const currentKey = current
      ? keyForTarget(current)
      : "";
    const nextKey = target ? keyForTarget(target) : "";
    if (currentKey === nextKey) return;
    surfaceInteractionTargetRef.current = target;
    onSurfaceInteractionChange?.(target);
  };

  const interactionTargetFor = (index: number, path: ElementPath) => {
    const rootIndexes =
      selectedIndexes.includes(index) && selectedIndexes.length > 0
        ? selectedIndexes
        : [index];
    return { path, rootIndexes };
  };

  const previewFromNode = (
    el: SlideElement,
    node: Konva.Node,
  ): SurfaceInteractionPreview => {
    const scaleX = "scaleX" in node ? node.scaleX() : 1;
    const scaleY = "scaleY" in node ? node.scaleY() : 1;
    const widthValue = "width" in node ? node.width() : elementBox(el).w * scale;
    const heightValue =
      "height" in node ? node.height() : elementBox(el).h * scale;
    const previewWidth = Math.max(0.1, (widthValue * scaleX) / scale);
    const previewHeight = Math.max(0.1, (heightValue * scaleY) / scale);
    const rawX = node.x() / scale;
    const rawY = node.y() / scale;
    return {
      x: el.type === "ellipse" ? rawX - previewWidth / 2 : rawX,
      y: el.type === "ellipse" ? rawY - previewHeight / 2 : rawY,
      width: previewWidth,
      height: previewHeight,
      rotation: node.rotation(),
    };
  };

  const interactionTargetWithPreview = (
    index: number,
    path: ElementPath,
    el: SlideElement,
    node: Konva.Node,
  ) => {
    if (el.type !== "chart") {
      return interactionTargetFor(index, path);
    }
    const preview = previewFromNode(el, node);
    applyChartOverlayPreview(path, preview);
    return {
      ...interactionTargetFor(index, path),
      preview,
    };
  };

  const suppressNextSelect = (indexes: number[]) => {
    if (suppressSelectTimerRef.current) {
      clearTimeout(suppressSelectTimerRef.current);
    }
    suppressSelectRef.current = new Set(indexes);
    suppressSelectTimerRef.current = setTimeout(() => {
      suppressSelectRef.current = null;
      suppressSelectTimerRef.current = null;
    }, SUPPRESS_SELECT_AFTER_LONG_PRESS_MS);
  };

  const startComponentPress = (
    index: number,
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    clearComponentPress();
    const componentRun = getComponentRun(slide.elements, index);
    if (!componentRun || componentRun.indexes.length <= 1) return;
    const point = eventPoint(event);
    if (!point) return;

    componentPressRef.current = {
      index,
      indexes: componentRun.indexes,
      point,
      timer: setTimeout(() => {
        const press = componentPressRef.current;
        if (!press || press.index !== index) return;
        componentPressRef.current = null;
        suppressNextSelect(press.indexes);
        if (onEditComponentRun) {
          onEditComponentRun(press.indexes);
        } else {
          onSelectMany?.(press.indexes);
        }
      }, COMPONENT_LONG_PRESS_MS),
    };
  };

  const moveComponentPress = (
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    const press = componentPressRef.current;
    if (!press) return;
    const point = eventPoint(event);
    if (!point) return;
    const dx = point.x - press.point.x;
    const dy = point.y - press.point.y;
    if (Math.hypot(dx, dy) > COMPONENT_LONG_PRESS_MOVE_TOLERANCE) {
      clearComponentPress();
    }
  };

  const shouldSuppressSelect = (index: number) => {
    const suppress = suppressSelectRef.current;
    if (!suppress?.has(index)) return false;
    if (suppressSelectTimerRef.current) {
      clearTimeout(suppressSelectTimerRef.current);
      suppressSelectTimerRef.current = null;
    }
    suppressSelectRef.current = null;
    return true;
  };

  const openInlineEditor = (
    index: number,
    el: SlideElement,
    path: ElementPath,
  ) => {
    if (el.type === "text") onEditText?.(index, path);
    if (el.type === "text-list") onEditBullets?.(index, path);
    if (el.type === "chart") onEditChart?.(index, path);
    if (el.type === "image") onEditImage?.(index, path);
    if (el.type === "svg") onEditSvg?.(index, path);
    if (el.type === "table") onEditTable?.(index, path);
  };

  const canInlineEdit = (el: SlideElement) =>
    el.type === "text" ||
    el.type === "text-list" ||
    el.type === "chart" ||
    el.type === "image" ||
    el.type === "svg" ||
    el.type === "table";

  const commonEvents = (
    index: number,
    el: SlideElement,
    path: ElementPath = rootPath(index),
    nested = false,
  ) => ({
    draggable: interactive && !nested,
    onClick: (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (shouldSuppressSelect(index)) {
        event.cancelBubble = true;
        return false;
      }
      onSelect?.(
        index,
        event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey,
        path,
      );
      const now = Date.now();
      const lastClick = lastClickRef.current;
      const isRepeatedClick =
        lastClick?.path === path &&
        now - lastClick.ts <= INLINE_EDIT_DOUBLE_CLICK_MS;
      lastClickRef.current = { path, ts: now };
      if (
        isRepeatedClick &&
        canInlineEdit(el) &&
        !event.evt.shiftKey &&
        !event.evt.metaKey &&
        !event.evt.ctrlKey
      ) {
        event.cancelBubble = true;
        openInlineEditor(index, el, path);
      }
      return true;
    },
    onDblClick: (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (!canInlineEdit(el)) return;
      event.cancelBubble = true;
      onSelect?.(index, false, path);
      openInlineEditor(index, el, path);
    },
    onTap: (event: Konva.KonvaEventObject<TouchEvent>) => {
      if (shouldSuppressSelect(index)) {
        event.cancelBubble = true;
        return false;
      }
      onSelect?.(index, false, path);
      return true;
    },
    onMouseDown: (event: Konva.KonvaEventObject<MouseEvent>) => {
      startComponentPress(index, event);
    },
    onMouseMove: (event: Konva.KonvaEventObject<MouseEvent>) => {
      moveComponentPress(event);
    },
    onMouseUp: clearComponentPress,
    onMouseLeave: clearComponentPress,
    onTouchStart: (event: Konva.KonvaEventObject<TouchEvent>) => {
      startComponentPress(index, event);
    },
    onTouchMove: (event: Konva.KonvaEventObject<TouchEvent>) => {
      moveComponentPress(event);
    },
    onTouchEnd: clearComponentPress,
    onTouchCancel: clearComponentPress,
    onDragStart: (event: Konva.KonvaEventObject<DragEvent>) => {
      clearComponentPress();
      const target = interactionTargetWithPreview(index, path, el, event.target);
      setSurfaceInteractionTarget(target);
      startGroupDrag(index);
    },
    onDragMove: (event: Konva.KonvaEventObject<DragEvent>) => {
      moveGroupDrag(index, event);
      setSurfaceInteractionTarget(
        interactionTargetWithPreview(index, path, el, event.target),
      );
    },
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
      if (endGroupDrag(index, event)) {
        setSurfaceInteractionTarget(null);
        return;
      }
      const box = elementBox(el);
      const rawX = event.target.x() / scale;
      const rawY = event.target.y() / scale;
      const nextX = el.type === "ellipse" ? rawX - box.w / 2 : rawX;
      const nextY = el.type === "ellipse" ? rawY - box.h / 2 : rawY;
      const next = resizeElement(el, {
        x: nextX,
        y: nextY,
      });
      if (path === rootPath(index)) onChange?.(index, next);
      else onChangeAtPath?.(path, next);
      setSurfaceInteractionTarget(null);
      if (el.type === "chart") {
        window.requestAnimationFrame(clearChartOverlayPreview);
      }
    },
    onTransformStart: (event: Konva.KonvaEventObject<Event>) => {
      clearComponentPress();
      setSurfaceInteractionTarget(
        interactionTargetWithPreview(index, path, el, event.target),
      );
    },
    onTransform: (event: Konva.KonvaEventObject<Event>) => {
      setSurfaceInteractionTarget(
        interactionTargetWithPreview(index, path, el, event.target),
      );
    },
    onTransformEnd: (event: Konva.KonvaEventObject<Event>) => {
      const node = event.target;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      const nextW = Math.max(0.1, (node.width() * scaleX) / scale);
      const nextH = Math.max(0.1, (node.height() * scaleY) / scale);
      const rawX = node.x() / scale;
      const rawY = node.y() / scale;
      const nextX = el.type === "ellipse" ? rawX - nextW / 2 : rawX;
      const nextY = el.type === "ellipse" ? rawY - nextH / 2 : rawY;
      node.scaleX(1);
      node.scaleY(1);
      const transformed = {
        ...resizeElement(el, {
          x: nextX,
          y: nextY,
          w: clamp(nextW, 0.1, SLIDE_W),
          h: clamp(nextH, 0.1, SLIDE_H),
        }),
        rotation: node.rotation(),
      } as SlideElement;
      const next =
        nested && (transformed.type === "text" || transformed.type === "text-list")
          ? ({
              ...transformed,
              layout: {
                ...(transformed.layout ?? {}),
                alignSelf: transformed.layout?.alignSelf ?? "flex-start",
              },
            } as SlideElement)
          : transformed;
      if (path === rootPath(index)) onChange?.(index, next);
      else onChangeAtPath?.(path, next);
      setSurfaceInteractionTarget(null);
      if (el.type === "chart") {
        window.requestAnimationFrame(clearChartOverlayPreview);
      }
    },
  });

  const selectedIsNested = Boolean(selectedPath && !isRootPath(selectedPath));
  const selectedNestedElement = useMemo(
    () => (selectedIsNested ? getElementAtPath(slide, selectedPath) : null),
    [selectedIsNested, selectedPath, slide],
  );
  const canResizeSelection =
    !selectedIsNested ||
    selectedNestedElement?.type === "text" ||
    selectedNestedElement?.type === "text-list";
  const selectedRootElement =
    !selectedIsNested && selectedIndexes.length === 1
      ? slide.elements[selectedIndexes[0]]
      : null;
  const selectedRun =
    !selectedIsNested && selectedIndexes.length > 0
      ? getComponentRun(slide.elements, selectedIndexes[0])
      : null;
  const selectedIsWholeComponentRun =
    Boolean(selectedRun) &&
    selectedIndexes.length > 1 &&
    selectedIndexes.length === selectedRun?.indexes.length &&
    selectedIndexes.every((index) => selectedRun?.indexes.includes(index));
  const componentOutlineBounds = useMemo<OutlineBounds | null>(() => {
    if (!interactive) return null;

    if (selectedPath && !isRootPath(selectedPath)) {
      const rootIndex = rootIndexFromPath(selectedPath);
      const root = slide.elements[rootIndex];
      if (!root) return null;
      const box = elementBox(root);
      return {
        x: box.x * scale,
        y: box.y * scale,
        width: box.w * scale,
        height: box.h * scale,
        rotation: root.rotation ?? 0,
      };
    }

    if (selectedIndexes.length > 1) {
      return boundsForRootIndexes(slide.elements, selectedIndexes, scale);
    }

    if (selectedRootElement && isLayoutElement(selectedRootElement)) {
      const box = elementBox(selectedRootElement);
      return {
        x: box.x * scale,
        y: box.y * scale,
        width: box.w * scale,
        height: box.h * scale,
        rotation: selectedRootElement.rotation ?? 0,
      };
    }

    const run = selectedRun;
    if (!run || selectedIndexes.length !== 1 || run.indexes.length <= 1) {
      return null;
    }
    return boundsForRootIndexes(slide.elements, run.indexes, scale);
  }, [
    interactive,
    scale,
    selectedIndexes,
    selectedIsWholeComponentRun,
    selectedPath,
    selectedRootElement,
    selectedRun,
    slide,
  ]);

  const shouldForceCanvasForPath = (path: ElementPath) => {
    if (!activeSurfaceInteraction) return false;
    if (!isRootPath(activeSurfaceInteraction.path)) {
      return path === activeSurfaceInteraction.path;
    }
    const rootIndex = rootIndexFromPath(path);
    return activeSurfaceInteraction.rootIndexes.includes(rootIndex);
  };

  const renderModeForPath = (
    renderMode: "canvas" | "proxy",
    path: ElementPath,
  ) => (shouldForceCanvasForPath(path) ? "canvas" : renderMode);

  return (
    <>
      {slide.elements.map((el, index) => {
        const path = rootPath(index);
        const elementKey = slideElementKey(el);
        const forceCanvasForElement = shouldForceCanvasForPath(path);
        const elementBulletsRenderMode = renderModeForPath(
          bulletsRenderMode,
          path,
        );
        const elementChartRenderMode = chartRenderMode;
        const elementTableRenderMode = renderModeForPath(tableRenderMode, path);
        const elementTextRenderMode = renderModeForPath(textRenderMode, path);

        return isLayoutElement(el) ? (
          <LayoutRootElement
            key={elementKey}
            element={el}
            bulletsRenderMode={elementBulletsRenderMode}
            chartRenderMode={elementChartRenderMode}
            forceCanvasRenderForPath={shouldForceCanvasForPath}
            index={index}
            scale={scale}
            tableRenderMode={elementTableRenderMode}
            textRenderMode={elementTextRenderMode}
            selected={selectedPath === path && !selectedIsComponentContainer}
            selectedPath={selectedPath}
            setRef={(node) => {
              nodeRefs.current[index] = node;
            }}
            events={commonEvents(index, el)}
            onSelectTableCell={onSelectTableCell}
            nestedEvents={(item) =>
              commonEvents(index, item.element, item.sourcePath, true)
            }
            setPathRef={(path, node) => {
              pathNodeRefs.current[path] = node;
            }}
          />
        ) : (
          <KonvaElement
            key={elementKey}
            element={el}
            bulletsRenderMode={elementBulletsRenderMode}
            chartRenderMode={elementChartRenderMode}
            index={index}
            scale={scale}
            tableRenderMode={elementTableRenderMode}
            textRenderMode={elementTextRenderMode}
            selected={selectedPath === path}
            editing={
              !forceCanvasForElement &&
              (editingTextIndex === index ||
                editingBulletsIndex === index ||
                editingChartIndex === index ||
                editingSvgIndex === index ||
                editingTableIndex === index)
            }
            onTableCellClick={
              el.type === "table"
                ? (rowIndex, colIndex) =>
                    onSelectTableCell?.(
                      index,
                      rowIndex,
                      colIndex,
                      path,
                    )
                : undefined
            }
            setRef={(node) => {
              nodeRefs.current[index] = node;
            }}
            events={commonEvents(index, el)}
          />
        );
      })}
      {overflowingIndices
        ? slide.elements.map((el, index) => {
            if (!overflowingIndices.has(index)) return null;
            const box = elementBox(el);
            const badgeX = box.x * scale + box.w * scale - 10;
            const badgeY = box.y * scale - 10;
            return (
              <Group
                key={`overflow-${slideElementKey(el)}`}
                x={badgeX}
                y={badgeY}
                onMouseEnter={(event) => {
                  setHoveredOverflow(index);
                  event.target
                    .getStage()
                    ?.container()
                    .style.setProperty("cursor", "help");
                }}
                onMouseLeave={(event) => {
                  setHoveredOverflow((current) =>
                    current === index ? null : current,
                  );
                  event.target
                    .getStage()
                    ?.container()
                    .style.removeProperty("cursor");
                }}
              >
                <Rect
                  width={20}
                  height={20}
                  fill="#d83b3b"
                  cornerRadius={10}
                  shadowColor="rgba(216,59,59,0.45)"
                  shadowBlur={6}
                  shadowOffsetY={2}
                />
                <Text
                  width={20}
                  height={20}
                  text="!"
                  fill="#ffffff"
                  fontSize={13}
                  fontStyle="bold"
                  align="center"
                  verticalAlign="middle"
                  listening={false}
                />
              </Group>
            );
          })
        : null}
      {overflowingIndices && hoveredOverflow != null
        ? (() => {
            const el = slide.elements[hoveredOverflow];
            if (!el) return null;
            const tooltipW = 248;
            const tooltipH = 50;
            const box = elementBox(el);
            // Anchor: under the badge, right-aligned to the element's right
            // edge, then clamped so we never paint off-stage.
            const anchorX = box.x * scale + box.w * scale - 10 + 20;
            const anchorY = box.y * scale - 10 + 26;
            const x = clamp(
              anchorX - tooltipW,
              4,
              Math.max(4, width - tooltipW - 4),
            );
            const y = clamp(anchorY, 4, Math.max(4, height - tooltipH - 4));
            return (
              <Group x={x} y={y} listening={false}>
                <Rect
                  width={tooltipW}
                  height={tooltipH}
                  fill="#1a1a1a"
                  cornerRadius={6}
                  opacity={0.96}
                  shadowColor="rgba(0,0,0,0.5)"
                  shadowBlur={10}
                  shadowOffsetY={3}
                />
                <Text
                  x={10}
                  y={8}
                  width={tooltipW - 20}
                  text="Text overflows its box"
                  fill="#ffffff"
                  fontSize={12}
                  fontStyle="bold"
                />
                <Text
                  x={10}
                  y={25}
                  width={tooltipW - 20}
                  text="Increase the height, shrink the font, or trim the text."
                  fill="#cdd2dd"
                  fontSize={11}
                  lineHeight={1.35}
                />
              </Group>
            );
          })()
        : null}
      {interactive && componentOutlineBounds ? (
        <Rect
          x={componentOutlineBounds.x}
          y={componentOutlineBounds.y}
          width={componentOutlineBounds.width}
          height={componentOutlineBounds.height}
          rotation={componentOutlineBounds.rotation ?? 0}
          stroke={COMPONENT_OUTLINE_STROKE}
          strokeWidth={1.5}
          dash={COMPONENT_OUTLINE_DASH}
          listening={false}
        />
      ) : null}
      {interactive &&
      !selectedIsComponentContainer &&
      (selectedIndexes.length > 0 || selectedIsNested) ? (
        <Transformer
          ref={transformerRef}
          rotateEnabled
          resizeEnabled
          enabledAnchors={canResizeSelection ? undefined : []}
          anchorSize={SELECTION_CORNER_HANDLE_SIZE}
          anchorStyleFunc={styleSelectionAnchor}
          borderStroke={SELECTION_STROKE}
          borderStrokeWidth={1.5}
          anchorFill="#ffffff"
          anchorStroke="#D6DAE2"
          anchorStrokeWidth={1}
          keepRatio={false}
        />
      ) : null}
      {interactive && selectedBounds && onDelete ? (
        <DeleteSelectionButton
          height={height}
          onDelete={onDelete}
          selectedBounds={selectedBounds}
          width={width}
        />
      ) : null}
      {interactive && normalizedSelectionBox ? (
        <Rect
          x={normalizedSelectionBox.x}
          y={normalizedSelectionBox.y}
          width={normalizedSelectionBox.width}
          height={normalizedSelectionBox.height}
          fill="rgba(88, 132, 255, 0.12)"
          stroke="#6f93ff"
          strokeWidth={1}
          dash={[6, 4]}
          listening={false}
        />
      ) : null}
    </>
  );
}

function boundsForRootIndexes(
  elements: SlideElement[],
  indexes: number[],
  scale: number,
): Bounds | null {
  const boxes = indexes
    .map((index) => elements[index])
    .filter((element): element is SlideElement => Boolean(element))
    .map(elementBox);
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.w));
  const maxY = Math.max(...boxes.map((box) => box.y + box.h));
  return {
    x: minX * scale,
    y: minY * scale,
    width: (maxX - minX) * scale,
    height: (maxY - minY) * scale,
  };
}

const passiveEvents: ElementEvents = {
  draggable: false,
  onClick: () => false,
  onTap: () => false,
  onDragStart: () => undefined,
  onDragMove: () => undefined,
  onDragEnd: () => undefined,
  onTransformStart: () => undefined,
  onTransform: () => undefined,
  onTransformEnd: () => undefined,
};

function LayoutRootElement({
  bulletsRenderMode,
  chartRenderMode,
  element,
  events,
  forceCanvasRenderForPath,
  index,
  nestedEvents,
  onSelectTableCell,
  scale,
  selected,
  selectedPath,
  setRef,
  setPathRef,
  tableRenderMode,
  textRenderMode,
}: {
  bulletsRenderMode?: "canvas" | "proxy";
  chartRenderMode?: "canvas" | "proxy";
  element: SlideElement;
  events: ElementEvents;
  forceCanvasRenderForPath: (path: ElementPath) => boolean;
  index: number;
  nestedEvents: (item: ResolvedLayoutItem) => ElementEvents;
  onSelectTableCell?: (
    index: number,
    rowIndex: number,
    colIndex: number,
    path?: ElementPath,
  ) => void;
  scale: number;
  selected: boolean;
  selectedPath?: ElementPath | null;
  setRef: (node: Konva.Node | null) => void;
  setPathRef: (path: ElementPath, node: Konva.Node | null) => void;
  tableRenderMode?: "canvas" | "proxy";
  textRenderMode?: "canvas" | "proxy";
}) {
  const box = elementBox(element);
  const resolved = flattenResolvedLayoutNode(
    resolveElementLayoutTree(element, {
      rootIndex: index,
      path: String(index),
      parentPath: null,
      depth: 0,
      mode: "absolute",
    }),
  ).filter((item) => item.path !== String(index));
  const x = box.x * scale;
  const y = box.y * scale;
  const width = box.w * scale;
  const height = box.h * scale;
  const isComponentRoot = Boolean(element.componentId);
  const hitTarget = (
    <Rect
      ref={setRef}
      name={`element-${index}`}
      x={x}
      y={y}
      width={width}
      height={height}
      rotation={element.rotation ?? 0}
      fill="rgba(255,255,255,0.01)"
      {...events}
    />
  );

  return (
    <>
      {element.type === "container" && (element.fill || element.stroke) ? (
        <KonvaElement
          element={element}
          index={index}
          scale={scale}
          selected={false}
          setRef={() => undefined}
          events={passiveEvents}
        />
      ) : null}
      {isComponentRoot ? null : hitTarget}
      {resolved.map((item) => (
        <ResolvedKonvaItem
          key={item.path}
          item={item}
          bulletsRenderMode={
            forceCanvasRenderForPath(item.sourcePath)
              ? "canvas"
              : bulletsRenderMode
          }
          chartRenderMode={
            chartRenderMode
          }
          index={index}
          scale={scale}
          selected={selectedPath === item.sourcePath}
          tableRenderMode={
            forceCanvasRenderForPath(item.sourcePath)
              ? "canvas"
              : tableRenderMode
          }
          textRenderMode={
            forceCanvasRenderForPath(item.sourcePath) ? "canvas" : textRenderMode
          }
          events={nestedEvents(item)}
          setRef={(node) => setPathRef(item.sourcePath, node)}
          onTableCellClick={
            item.element.type === "table"
              ? (rowIndex, colIndex) =>
                  onSelectTableCell?.(
                    index,
                    rowIndex,
                    colIndex,
                    item.sourcePath,
                  )
              : undefined
          }
        />
      ))}
      {isComponentRoot ? hitTarget : null}
      {selected ? (
        <Rect
          x={x}
          y={y}
          width={width}
          height={height}
          rotation={element.rotation ?? 0}
          stroke={SELECTION_STROKE}
          strokeWidth={1.5}
          listening={false}
        />
      ) : null}
    </>
  );
}

function ResolvedKonvaItem({
  bulletsRenderMode,
  chartRenderMode,
  events,
  index,
  item,
  onTableCellClick,
  scale,
  selected,
  setRef,
  tableRenderMode,
  textRenderMode,
}: {
  bulletsRenderMode?: "canvas" | "proxy";
  chartRenderMode?: "canvas" | "proxy";
  events: ElementEvents;
  index: number;
  item: ResolvedLayoutItem;
  onTableCellClick?: (rowIndex: number, colIndex: number) => void;
  scale: number;
  selected: boolean;
  setRef: (node: Konva.Node | null) => void;
  tableRenderMode?: "canvas" | "proxy";
  textRenderMode?: "canvas" | "proxy";
}) {
  return (
    <KonvaElement
      element={item.element}
      bulletsRenderMode={bulletsRenderMode}
      chartRenderMode={chartRenderMode}
      index={index}
      scale={scale}
      tableRenderMode={tableRenderMode}
      textRenderMode={textRenderMode}
      selected={selected}
      onTableCellClick={onTableCellClick}
      setRef={setRef}
      events={events}
    />
  );
}

function DeleteSelectionButton({
  height,
  onDelete,
  selectedBounds,
  width,
}: {
  height: number;
  onDelete: () => void;
  selectedBounds: Bounds;
  width: number;
}) {
  return (
    <Group
      x={clamp(selectedBounds.x, 4, width - 34)}
      y={clamp(selectedBounds.y + selectedBounds.height + 12, 4, height - 34)}
      onMouseDown={(event) => {
        event.cancelBubble = true;
      }}
      onClick={(event) => {
        event.cancelBubble = true;
        onDelete();
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onDelete();
      }}
      onMouseEnter={(event) => {
        event.target
          .getStage()
          ?.container()
          .style.setProperty("cursor", "pointer");
      }}
      onMouseLeave={(event) => {
        event.target.getStage()?.container().style.removeProperty("cursor");
      }}
    >
      <Rect
        width={30}
        height={30}
        fill="#b4232a"
        stroke="#ff8a8f"
        strokeWidth={1}
        cornerRadius={6}
        shadowColor="rgba(180,35,42,0.35)"
        shadowBlur={10}
        shadowOffsetY={5}
      />
      <Line points={[9, 10, 21, 10]} stroke="#f4f6fa" strokeWidth={1.8} />
      <Line points={[12, 8, 18, 8]} stroke="#f4f6fa" strokeWidth={1.8} />
      <Rect
        x={10}
        y={12}
        width={10}
        height={10}
        stroke="#f4f6fa"
        strokeWidth={1.8}
        cornerRadius={1}
      />
      <Line points={[13, 14, 13, 20]} stroke="#f4f6fa" strokeWidth={1.2} />
      <Line points={[17, 14, 17, 20]} stroke="#f4f6fa" strokeWidth={1.2} />
    </Group>
  );
}
