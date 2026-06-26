import { Arc, Circle, Group, Rect, Text } from "react-konva";
import type { InfographicElement as InfographicEl } from "../../lib/slide-schema";
import { withHash } from "../../editorUtils";
import { rotationProps, shadowProps } from "./elementVisuals";
import { geometry, SELECTION_STROKE, type ElementCommonProps } from "./types";

const GAUGE_BACKGROUND = "E5E7EB";
const GAUGE_FOREGROUND = "2563EB";
const GAUGE_TEXT = "172033";

export function InfographicElement({
  element,
  index,
  scale,
  selected,
  setRef,
  events,
}: ElementCommonProps & { element: InfographicEl }) {
  const { x, y, width, height, strokeWidth } = geometry(
    element,
    scale,
    selected,
  );

  return (
    <Group
      ref={setRef}
      name={`element-${index}`}
      x={x}
      y={y}
      width={width}
      height={height}
      {...rotationProps(element)}
      opacity={element.opacity ?? 1}
      {...shadowProps(element.shadow, scale)}
      {...events}
    >
      <Rect width={width} height={height} fill="rgba(0,0,0,0)" />
      {element.infographicType === "progress_bar" ? (
        <ProgressBarParts element={element} width={width} height={height} />
      ) : (
        <GaugeParts element={element} width={width} height={height} />
      )}
      {selected ? (
        <Rect
          width={width}
          height={height}
          stroke={SELECTION_STROKE}
          strokeWidth={strokeWidth}
          listening={false}
        />
      ) : null}
    </Group>
  );
}

function ProgressBarParts({
  element,
  width,
  height,
}: {
  element: InfographicEl;
  width: number;
  height: number;
}) {
  const progress = valueProgress(element);
  const radius = Math.min(height / 2, 8);
  const baseColor = element.baseColor ?? GAUGE_BACKGROUND;
  const highlightColor = element.highlightColor ?? GAUGE_FOREGROUND;

  return (
    <>
      <Rect
        width={width}
        height={height}
        cornerRadius={radius}
        fill={withHash(baseColor)}
      />
      <Rect
        width={width * progress}
        height={height}
        cornerRadius={radius}
        fill={withHash(highlightColor)}
      />
    </>
  );
}

function GaugeParts({
  element,
  width,
  height,
}: {
  element: InfographicEl;
  width: number;
  height: number;
}) {
  const progress = valueProgress(element);
  const valueAngle = 180 * progress;
  const thickness = Math.max(6, Math.min(width, height) * 0.18);
  const outerRadius = Math.max(1, Math.min(width * 0.43, height * 0.86));
  const innerRadius = Math.max(1, outerRadius - thickness);
  const middleRadius = (outerRadius + innerRadius) / 2;
  const capRadius = thickness / 2;
  const centerX = width / 2;
  const centerY = Math.min(height - capRadius, height * 0.86);
  const valueText = String(Math.round(element.value));
  const start = pointOnCircle(centerX, centerY, middleRadius, 180);
  const end = pointOnCircle(centerX, centerY, middleRadius, 180 + valueAngle);
  const baseColor = element.baseColor ?? GAUGE_BACKGROUND;
  const highlightColor = element.highlightColor ?? GAUGE_FOREGROUND;

  return (
    <>
      <Arc
        x={centerX}
        y={centerY}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        angle={180}
        rotation={180}
        fill={withHash(baseColor)}
      />
      <Circle
        x={start.x}
        y={start.y}
        radius={capRadius}
        fill={withHash(baseColor)}
      />
      <Circle
        x={pointOnCircle(centerX, centerY, middleRadius, 360).x}
        y={pointOnCircle(centerX, centerY, middleRadius, 360).y}
        radius={capRadius}
        fill={withHash(baseColor)}
      />
      {valueAngle > 0 ? (
        <>
          <Arc
            x={centerX}
            y={centerY}
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            angle={valueAngle}
            rotation={180}
            fill={withHash(highlightColor)}
          />
          <Circle
            x={start.x}
            y={start.y}
            radius={capRadius}
            fill={withHash(highlightColor)}
          />
          <Circle
            x={end.x}
            y={end.y}
            radius={capRadius}
            fill={withHash(highlightColor)}
          />
        </>
      ) : null}
      <Text
        x={0}
        y={height * 0.5}
        width={width}
        height={height * 0.3}
        text={valueText}
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize={Math.max(10, Math.min(width, height) * 0.22)}
        fontStyle="bold"
        align="center"
        verticalAlign="middle"
        fill={withHash(GAUGE_TEXT)}
      />
    </>
  );
}

function valueProgress(element: InfographicEl) {
  const range = element.maxValue - element.minValue;
  if (!Number.isFinite(range) || range === 0) return 0;
  return clamp01((element.value - element.minValue) / range);
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function pointOnCircle(x: number, y: number, radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: x + Math.cos(radians) * radius,
    y: y + Math.sin(radians) * radius,
  };
}
