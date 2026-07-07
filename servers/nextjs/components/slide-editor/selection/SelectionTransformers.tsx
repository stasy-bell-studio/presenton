"use client";

import { useEffect, useRef, type RefObject } from "react";
import type Konva from "konva";
import { Transformer } from "react-konva";

const CORNER_HANDLE_SIZE = 14;
const EDGE_HANDLE_LENGTH = 28;
const EDGE_HANDLE_THICKNESS = 9;
const ROTATION_HANDLE_SIZE = 28;
const ROTATION_HANDLE_INSET = 6;
const ROTATION_ICON_SCALE = 1.2;
const ROTATION_ICON_PATH =
  "M11.0835 5.83331C11.0835 6.87166 10.7756 7.8867 10.1987 8.75006C9.62184 9.61341 8.8019 10.2863 7.84259 10.6837C6.88327 11.081 5.82767 11.185 4.80927 10.9824C3.79087 10.7799 2.85541 10.2798 2.12119 9.54562C1.38696 8.8114 0.886948 7.87594 0.684376 6.85754C0.481803 5.83914 0.585771 4.78354 0.983131 3.82422C1.38049 2.86491 2.0534 2.04498 2.91675 1.4681C3.78011 0.89122 4.79515 0.583313 5.8335 0.583313C7.3035 0.583313 8.70933 1.16665 9.76516 2.18165L11.0835 3.49998";
const SHADOW_EVENT_NAMESPACE = ".presentonSelectionShadows";
const MULTI_SELECTION_GROUP_DASH = [5, 5];
const MULTI_SELECTION_MEMBER_DASH = [7, 4];
let rotationIconPath: Path2D | null = null;

type SelectionKind = "component" | "multi-component" | "element" | null;

type RotationAnchorPlacement = {
  angle: number;
  offset: number;
};

const DEFAULT_ROTATION_ANCHOR_PLACEMENT: RotationAnchorPlacement = {
  angle: 45,
  offset: -(ROTATION_HANDLE_SIZE / 2 + ROTATION_HANDLE_INSET),
};

type TemplateV2SelectionTransformersProps = {
  nodeRefs: RefObject<Map<string, Konva.Node>>;
  parentComponentKey: string | null;
  selectedKey: string | null;
  selectedKeys?: string[];
  selectionKind: SelectionKind;
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
  context.setAttr("lineWidth", 1.16667);
  context.setAttr("lineCap", "round");
  context.setAttr("lineJoin", "round");
  context.translate(center - 7, center - 7);
  context.scale(ROTATION_ICON_SCALE, ROTATION_ICON_SCALE);
  if (!rotationIconPath && typeof Path2D !== "undefined") {
    rotationIconPath = new Path2D(ROTATION_ICON_PATH);
  }
  if (rotationIconPath) context.stroke(rotationIconPath);
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

  const width = Math.abs(node.width() * node.scaleX());
  const height = Math.abs(node.height() * node.scaleY());
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return DEFAULT_ROTATION_ANCHOR_PLACEMENT;
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const inset = ROTATION_HANDLE_SIZE / 2 + ROTATION_HANDLE_INSET;
  const targetX = width > inset * 2 ? width - inset : width / 2;
  const targetY = height > inset * 2 ? inset : height / 2;
  const dx = targetX - centerX;
  const dy = targetY - centerY;
  const distanceToTarget = Math.hypot(dx, dy);
  if (distanceToTarget < 0.5) return DEFAULT_ROTATION_ANCHOR_PLACEMENT;

  const dirX = dx / distanceToTarget;
  const dirY = dy / distanceToTarget;
  let distanceToEdge = Infinity;
  if (dirY < 0) distanceToEdge = Math.min(distanceToEdge, -centerY / dirY);
  else if (dirY > 0) {
    distanceToEdge = Math.min(distanceToEdge, (height - centerY) / dirY);
  }
  if (dirX < 0) distanceToEdge = Math.min(distanceToEdge, -centerX / dirX);
  else if (dirX > 0) {
    distanceToEdge = Math.min(distanceToEdge, (width - centerX) / dirX);
  }
  if (!Number.isFinite(distanceToEdge)) return DEFAULT_ROTATION_ANCHOR_PLACEMENT;

  return {
    angle: (Math.atan2(dirX, -dirY) * 180) / Math.PI,
    offset: distanceToTarget - distanceToEdge,
  };
}

export function TemplateV2SelectionTransformers({
  nodeRefs,
  parentComponentKey,
  selectedKey,
  selectedKeys,
  selectionKind,
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

    return () => {
      dragNodes.forEach((node) => node.off(SHADOW_EVENT_NAMESPACE));
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
        enabledAnchors={selectionKind === "component" ? undefined : []}
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
