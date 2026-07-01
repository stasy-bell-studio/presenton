"use client";

import { useEffect, useRef, type RefObject } from "react";
import type Konva from "konva";
import { Transformer } from "react-konva";

const CORNER_HANDLE_SIZE = 14;
const EDGE_HANDLE_LENGTH = 28;
const EDGE_HANDLE_THICKNESS = 9;
const ROTATION_HANDLE_SIZE = 44;
const ROTATION_ICON_PATH =
  "M11.0835 5.83331C11.0835 6.87166 10.7756 7.8867 10.1987 8.75006C9.62184 9.61341 8.8019 10.2863 7.84259 10.6837C6.88327 11.081 5.82767 11.185 4.80927 10.9824C3.79087 10.7799 2.85541 10.2798 2.12119 9.54562C1.38696 8.8114 0.886948 7.87594 0.684376 6.85754C0.481803 5.83914 0.585771 4.78354 0.983131 3.82422C1.38049 2.86491 2.0534 2.04498 2.91675 1.4681C3.78011 0.89122 4.79515 0.583313 5.8335 0.583313C7.3035 0.583313 8.70933 1.16665 9.76516 2.18165L11.0835 3.49998";
const SHADOW_EVENT_NAMESPACE = ".presentonSelectionShadows";
let rotationIconPath: Path2D | null = null;

type SelectionKind = "component" | "element" | null;

type TemplateV2SelectionTransformersProps = {
  nodeRefs: RefObject<Map<string, Konva.Node>>;
  parentComponentKey: string | null;
  selectedKey: string | null;
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
  context.translate(center - 9, center - 9);
  context.scale(1.5, 1.5);
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
    shadowBlur: isRotationHandle ? 8 : 4,
    shadowOffsetX: 0,
    shadowOffsetY: isRotationHandle ? 4 : 2,
    shadowOpacity: isRotationHandle ? 0.18 : 0.13,
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

export function TemplateV2SelectionTransformers({
  nodeRefs,
  parentComponentKey,
  selectedKey,
  selectionKind,
  suppressSelectedOutline = false,
}: TemplateV2SelectionTransformersProps) {
  const selectedTransformerRef = useRef<Konva.Transformer | null>(null);
  const contextTransformerRef = useRef<Konva.Transformer | null>(null);

  useEffect(() => {
    const selectedNode =
      selectedKey && !suppressSelectedOutline
        ? nodeRefs.current?.get(selectedKey)
        : null;
    const parentComponentNode = parentComponentKey
      ? nodeRefs.current?.get(parentComponentKey)
      : null;

    const selectedTransformer = selectedTransformerRef.current;
    if (selectedTransformer) {
      selectedTransformer.nodes(selectedNode ? [selectedNode] : []);
    }

    const contextTransformer = contextTransformerRef.current;
    if (contextTransformer) {
      contextTransformer.nodes(parentComponentNode ? [parentComponentNode] : []);
      applyContextBoundaryStyle(contextTransformer);
    }

    selectedTransformer?.getLayer()?.batchDraw();

    const transformers = [selectedTransformer, contextTransformer];
    const dragNodes = Array.from(
      new Set([selectedNode, parentComponentNode].filter(Boolean)),
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
        borderEnabled
        borderStroke="#7A5AF8"
        borderStrokeWidth={1}
        enabledAnchors={selectionKind === "component" ? undefined : []}
        resizeEnabled={selectionKind === "component"}
        rotateAnchorAngle={180}
        rotateAnchorOffset={42}
        rotateEnabled={selectionKind === "component"}
        rotateLineVisible={false}
      />
    </>
  );
}
