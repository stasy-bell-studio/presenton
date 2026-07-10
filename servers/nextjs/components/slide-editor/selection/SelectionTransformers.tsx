"use client";

import { useEffect, useRef, type RefObject } from "react";
import type Konva from "konva";
import { Transformer } from "react-konva";
import {
  EDITOR_STAGE_HEIGHT,
  EDITOR_STAGE_WIDTH,
} from "@/components/slide-editor/types";

const CORNER_HANDLE_SIZE = 14;
const EDGE_HANDLE_LENGTH = 28;
const EDGE_HANDLE_THICKNESS = 9;
const ROTATION_HANDLE_SIZE = 28;
const ROTATION_HANDLE_GAP = 12;
const ROTATION_HANDLE_VIEWPORT_MARGIN = 3;
const ROTATION_ANCHOR_OFFSET = ROTATION_HANDLE_SIZE / 2 + ROTATION_HANDLE_GAP;
const ROTATION_ICON_SIZE = 18;
const ROTATION_ICON_VIEWBOX_SIZE = 24;
const REFRESH_CW_ICON_PATHS = [
  "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
  "M21 3v5h-5",
  "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
  "M8 16H3v5",
];
const SHADOW_EVENT_NAMESPACE = ".presentonSelectionShadows";
const ROTATION_ANCHOR_EVENT_NAMESPACE = ".presentonSelectionRotationAnchor";
const MULTI_SELECTION_GROUP_DASH = [5, 5];
const MULTI_SELECTION_MEMBER_DASH = [7, 4];
const HORIZONTAL_ONLY_ANCHORS = ["middle-left", "middle-right"];
let refreshCwIconPaths: Path2D[] | null = null;

type SelectionKind = "component" | "multi-component" | "element" | null;

type RotationAnchorSide = "top" | "bottom" | "right" | "left";

type RotationAnchorPlacement = {
  angle: number;
  offset: number;
  side: RotationAnchorSide;
};

const DEFAULT_ROTATION_ANCHOR_PLACEMENT: RotationAnchorPlacement = {
  angle: 0,
  offset: ROTATION_ANCHOR_OFFSET,
  side: "top",
};

const ROTATION_ANCHOR_CANDIDATES: RotationAnchorPlacement[] = [
  DEFAULT_ROTATION_ANCHOR_PLACEMENT,
  { angle: 180, offset: ROTATION_ANCHOR_OFFSET, side: "bottom" },
  { angle: 90, offset: ROTATION_ANCHOR_OFFSET, side: "right" },
  { angle: -90, offset: ROTATION_ANCHOR_OFFSET, side: "left" },
];

type TemplateV2SelectionTransformersProps = {
  nodeRefs: RefObject<Map<string, Konva.Node>>;
  parentComponentKey: string | null;
  selectedKey: string | null;
  selectedKeys?: string[];
  selectionKind: SelectionKind;
  horizontalResizeOnly?: boolean;
  suppressSelectedOutline?: boolean;
};

function drawRotationHandle(context: Konva.Context, shape: Konva.Shape) {
  const center = ROTATION_HANDLE_SIZE / 2;

  context.beginPath();
  context.arc(center, center, center - 1, 0, Math.PI * 2, false);
  context.closePath();
  context.fillStrokeShape(shape);

  context.save();
  context.setAttr("strokeStyle", "#111111");
  context.setAttr("lineWidth", 2);
  context.setAttr("lineCap", "round");
  context.setAttr("lineJoin", "round");
  context.translate(
    center - ROTATION_ICON_SIZE / 2,
    center - ROTATION_ICON_SIZE / 2,
  );
  context.scale(
    ROTATION_ICON_SIZE / ROTATION_ICON_VIEWBOX_SIZE,
    ROTATION_ICON_SIZE / ROTATION_ICON_VIEWBOX_SIZE,
  );
  if (!refreshCwIconPaths && typeof Path2D !== "undefined") {
    refreshCwIconPaths = REFRESH_CW_ICON_PATHS.map((path) => new Path2D(path));
  }
  refreshCwIconPaths?.forEach((path) => context.stroke(path));
  context.restore();
}

function styleAnchor(anchor: Konva.Rect) {
  const name = anchor.name();
  const isRotationHandle = name.includes("rotater");
  const isHorizontalEdge =
    name.includes("top-center") || name.includes("bottom-center");
  const isVerticalEdge =
    name.includes("middle-left") || name.includes("middle-right");

  let width = CORNER_HANDLE_SIZE;
  let height = CORNER_HANDLE_SIZE;
  if (isHorizontalEdge) {
    width = EDGE_HANDLE_LENGTH;
    height = EDGE_HANDLE_THICKNESS;
  } else if (isVerticalEdge) {
    width = EDGE_HANDLE_THICKNESS;
    height = EDGE_HANDLE_LENGTH;
  } else if (isRotationHandle) {
    width = ROTATION_HANDLE_SIZE;
    height = ROTATION_HANDLE_SIZE;
  }

  anchor.setAttrs({
    width,
    height,
    offsetX: width / 2,
    offsetY: height / 2,
    cornerRadius: Math.min(width, height) / 2,
    fill: "#FFFFFF",
    stroke: "#E5E7EB",
    strokeWidth: 1,
    shadowColor: "#101828",
    shadowBlur: isRotationHandle ? 5 : 4,
    shadowOffsetX: 0,
    shadowOffsetY: isRotationHandle ? 2 : 2,
    shadowOpacity: isRotationHandle ? 0.16 : 0.13,
    shadowForStrokeEnabled: false,
    perfectDrawEnabled: false,
  });

  if (isRotationHandle) anchor.sceneFunc(drawRotationHandle);
}

function drawContextBoundary(context: Konva.Context, shape: Konva.Shape) {
  const width = shape.width();
  const height = shape.height();

  context.save();
  context.setAttr("lineWidth", 2);
  context.setAttr("lineJoin", "miter");
  context.setLineDash([]);
  context.setAttr("strokeStyle", "#D9D9DE");
  context.beginPath();
  context.rect(0, 0, width, height);
  context.stroke();

  context.setLineDash([4, 8]);
  context.setAttr("strokeStyle", "#FFFFFF");
  context.beginPath();
  context.rect(0, 0, width, height);
  context.stroke();
  context.restore();
}

function applyContextBoundaryStyle(transformer: Konva.Transformer) {
  const back = transformer.findOne<Konva.Rect>(".back");
  back?.sceneFunc(drawContextBoundary);
  back?.setAttrs({
    shadowColor: "#101828",
    shadowBlur: 6,
    shadowOffsetX: 0,
    shadowOffsetY: 1,
    shadowOpacity: 0.16,
    shadowForStrokeEnabled: true,
    perfectDrawEnabled: false,
  });
}

function setTransformerShadowsEnabled(
  transformers: Array<Konva.Transformer | null>,
  enabled: boolean,
) {
  transformers.forEach((transformer) => {
    if (!transformer) return;
    transformer.find<Konva.Rect>("._anchor").forEach((anchor) => {
      anchor.shadowEnabled(enabled);
    });
    transformer.findOne<Konva.Rect>(".back")?.shadowEnabled(enabled);
  });
  transformers[0]?.getLayer()?.batchDraw();
}

function TemplateV2MultiSelectionMemberOutline({
  nodeRefs,
  selectedKey,
}: {
  nodeRefs: RefObject<Map<string, Konva.Node>>;
  selectedKey: string;
}) {
  const transformerRef = useRef<Konva.Transformer | null>(null);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;

    const node = nodeRefs.current?.get(selectedKey);
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();

    return () => {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
    };
  }, [nodeRefs, selectedKey]);

  return (
    <Transformer
      ref={transformerRef}
      anchorSize={0}
      borderDash={MULTI_SELECTION_MEMBER_DASH}
      borderEnabled
      borderStroke="#7A5AF8"
      borderStrokeWidth={1}
      enabledAnchors={[]}
      listening={false}
      resizeEnabled={false}
      rotateEnabled={false}
      rotateLineVisible={false}
    />
  );
}

function rotationAnchorPlacementForNode(
  node: Konva.Node | null | undefined,
): RotationAnchorPlacement {
  if (!node) return DEFAULT_ROTATION_ANCHOR_PLACEMENT;

  const width = Math.abs(node.width());
  const height = Math.abs(node.height());
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return DEFAULT_ROTATION_ANCHOR_PLACEMENT;
  }

  const absoluteTransform = node.getAbsoluteTransform().copy();
  const scoredPlacements = ROTATION_ANCHOR_CANDIDATES.map((placement) => {
    const anchorCenter = localRotationAnchorCenter(width, height, placement);
    const absoluteCenter = absoluteTransform.point(anchorCenter);
    return {
      placement,
      overflow: rotationAnchorOverflow(absoluteCenter),
    };
  });
  const visiblePlacement = scoredPlacements.find(
    ({ overflow }) => overflow.total === 0,
  );
  if (visiblePlacement) return visiblePlacement.placement;

  return scoredPlacements.reduce((best, current) =>
    current.overflow.total < best.overflow.total ? current : best,
  ).placement;
}

function localRotationAnchorCenter(
  width: number,
  height: number,
  placement: RotationAnchorPlacement,
) {
  switch (placement.side) {
    case "bottom":
      return { x: width / 2, y: height + placement.offset };
    case "right":
      return { x: width + placement.offset, y: height / 2 };
    case "left":
      return { x: -placement.offset, y: height / 2 };
    case "top":
    default:
      return { x: width / 2, y: -placement.offset };
  }
}

function rotationAnchorOverflow(point: { x: number; y: number }) {
  const clearance = ROTATION_HANDLE_SIZE / 2 + ROTATION_HANDLE_VIEWPORT_MARGIN;
  const left = Math.max(0, clearance - point.x);
  const top = Math.max(0, clearance - point.y);
  const right = Math.max(0, point.x + clearance - EDITOR_STAGE_WIDTH);
  const bottom = Math.max(0, point.y + clearance - EDITOR_STAGE_HEIGHT);

  return {
    left,
    top,
    right,
    bottom,
    total: left + top + right + bottom,
  };
}

function applyRotationAnchorPlacement(
  transformer: Konva.Transformer | null,
  node: Konva.Node | null | undefined,
) {
  if (!transformer) return;

  const placement = rotationAnchorPlacementForNode(node);
  transformer.rotateAnchorAngle(placement.angle);
  transformer.rotateAnchorOffset(placement.offset);
  transformer.forceUpdate();
  transformer.getLayer()?.batchDraw();
}

export function TemplateV2SelectionTransformers({
  nodeRefs,
  parentComponentKey,
  selectedKey,
  selectedKeys,
  selectionKind,
  horizontalResizeOnly = false,
  suppressSelectedOutline = false,
}: TemplateV2SelectionTransformersProps) {
  const selectedTransformerRef = useRef<Konva.Transformer | null>(null);
  const contextTransformerRef = useRef<Konva.Transformer | null>(null);
  const selectedNode = selectedKey ? nodeRefs.current?.get(selectedKey) : null;
  const isMultiComponentSelection = selectionKind === "multi-component";
  const multiSelectionMemberKeys =
    isMultiComponentSelection && !suppressSelectedOutline
      ? selectedKeys ?? []
      : [];
  const rotationAnchorPlacement =
    selectionKind === "component"
      ? rotationAnchorPlacementForNode(selectedNode)
      : DEFAULT_ROTATION_ANCHOR_PLACEMENT;

  useEffect(() => {
    const keys = selectedKeys?.length
      ? selectedKeys
      : selectedKey
        ? [selectedKey]
        : [];
    const selectedNodes = suppressSelectedOutline
      ? []
      : keys.flatMap((key) => {
          const node = nodeRefs.current?.get(key);
          return node ? [node] : [];
        });
    const parentComponentNode = parentComponentKey
      ? nodeRefs.current?.get(parentComponentKey)
      : null;

    const selectedTransformer = selectedTransformerRef.current;
    if (selectedTransformer) {
      selectedTransformer.nodes(selectedNodes);
    }

    const contextTransformer = contextTransformerRef.current;
    if (contextTransformer) {
      contextTransformer.nodes(parentComponentNode ? [parentComponentNode] : []);
      applyContextBoundaryStyle(contextTransformer);
    }

    const selectedRotationNode =
      selectionKind === "component" && selectedNodes.length === 1
        ? selectedNodes[0]
        : null;
    const refreshRotationAnchorPlacement = () => {
      applyRotationAnchorPlacement(selectedTransformer, selectedRotationNode);
    };
    refreshRotationAnchorPlacement();

    selectedTransformer?.getLayer()?.batchDraw();

    const transformers = [selectedTransformer, contextTransformer];
    const dragNodes = Array.from(
      new Set([...selectedNodes, parentComponentNode].filter(Boolean)),
    ) as Konva.Node[];
    const disableShadows = () =>
      setTransformerShadowsEnabled(transformers, false);
    const enableShadows = () =>
      setTransformerShadowsEnabled(transformers, true);

    dragNodes.forEach((node) => {
      node.on(`dragstart${SHADOW_EVENT_NAMESPACE}`, disableShadows);
      node.on(`dragend${SHADOW_EVENT_NAMESPACE}`, enableShadows);
    });
    selectedRotationNode?.on(
      `dragstart${ROTATION_ANCHOR_EVENT_NAMESPACE}`,
      refreshRotationAnchorPlacement,
    );
    selectedRotationNode?.on(
      `dragmove${ROTATION_ANCHOR_EVENT_NAMESPACE}`,
      refreshRotationAnchorPlacement,
    );
    selectedRotationNode?.on(
      `dragend${ROTATION_ANCHOR_EVENT_NAMESPACE}`,
      refreshRotationAnchorPlacement,
    );
    selectedRotationNode?.on(
      `transformend${ROTATION_ANCHOR_EVENT_NAMESPACE}`,
      refreshRotationAnchorPlacement,
    );

    return () => {
      dragNodes.forEach((node) => node.off(SHADOW_EVENT_NAMESPACE));
      selectedRotationNode?.off(ROTATION_ANCHOR_EVENT_NAMESPACE);
      enableShadows();
    };
  }, [
    nodeRefs,
    parentComponentKey,
    selectedKey,
    selectedKeys,
    selectionKind,
    suppressSelectedOutline,
  ]);

  return (
    <>
      <Transformer
        ref={contextTransformerRef}
        anchorCornerRadius={7}
        anchorFill="#FFFFFF"
        anchorSize={CORNER_HANDLE_SIZE}
        anchorStroke="#D0D5DD"
        anchorStrokeWidth={1}
        anchorStyleFunc={styleAnchor}
        borderStroke="#D9D9DE"
        borderStrokeWidth={1}
        rotateEnabled={false}
      />
      <Transformer
        ref={selectedTransformerRef}
        anchorCornerRadius={7}
        anchorFill="#FFFFFF"
        anchorSize={CORNER_HANDLE_SIZE}
        anchorStroke="#E5E7EB"
        anchorStrokeWidth={1}
        anchorStyleFunc={styleAnchor}
        borderDash={
          isMultiComponentSelection ? MULTI_SELECTION_GROUP_DASH : undefined
        }
        borderEnabled
        borderStroke={isMultiComponentSelection ? "#D9D9DE" : "#7A5AF8"}
        borderStrokeWidth={1}
        enabledAnchors={
          selectionKind === "component"
            ? horizontalResizeOnly
              ? HORIZONTAL_ONLY_ANCHORS
              : undefined
            : []
        }
        resizeEnabled={selectionKind === "component"}
        rotateAnchorAngle={rotationAnchorPlacement.angle}
        rotateAnchorOffset={rotationAnchorPlacement.offset}
        rotateEnabled={selectionKind === "component"}
        rotateLineVisible={false}
      />
      {multiSelectionMemberKeys.map((key) => (
        <TemplateV2MultiSelectionMemberOutline
          key={key}
          nodeRefs={nodeRefs}
          selectedKey={key}
        />
      ))}
    </>
  );
}
