import { Arc, Circle, Ellipse, Group, Line, Rect, Text } from "react-konva";
import type { ChartElement as ChartEl } from "../../lib/slide-schema";
import { PX_PER_IN, withHash } from "../../editorUtils";
import {
  primaryChartData,
  resolvedChartCategories,
  resolvedChartDatasets,
  type ResolvedChartDataset,
} from "../../lib/chart-data";
import { chartColor as getChartColor } from "../../lib/element-model";
import { renderMarkdownTextContent } from "../../lib/markdown-text";
import { rotationProps, shadowProps } from "./elementVisuals";
import { geometry, type ElementCommonProps } from "./types";

type ChartDatum = {
  label: string;
  value: number;
  color?: string | null;
};
type ChartDataset = Omit<ResolvedChartDataset, "name"> & {
  name: string;
};

type Plot = { x: number; y: number; w: number; h: number };
type AxisOptions = {
  showXAxis: boolean;
  showYAxis: boolean;
  xAxisTitle: string;
  yAxisTitle: string;
};
const DEFAULT_BAR_CHART_SOURCE = "presenton-default-bar-chart";
const DEFAULT_LINE_CHART_SOURCE = "presenton-default-line-chart";
const DEFAULT_AREA_CHART_SOURCE = "presenton-default-area-chart";
const DEFAULT_PIE_CHART_SOURCE = "presenton-default-pie-chart";
const DEFAULT_CHART_SOURCES = new Set([
  DEFAULT_BAR_CHART_SOURCE,
  DEFAULT_LINE_CHART_SOURCE,
  DEFAULT_AREA_CHART_SOURCE,
  DEFAULT_PIE_CHART_SOURCE,
]);

export function ChartElement({
  element,
  index,
  scale,
  selected,
  setRef,
  events,
  renderMode = "canvas",
  transparentBackground = false,
}: ElementCommonProps & {
  element: ChartEl;
  renderMode?: "canvas" | "proxy";
  transparentBackground?: boolean;
}) {
  const { x, y, width, height, stroke, strokeWidth } = geometry(
    element,
    scale,
    selected,
  );
  const data = primaryChartData(element).map((datum) => ({
    ...datum,
    label: markdownText(datum.label),
  }));
  const categories = resolvedChartCategories(element).map(markdownText);
  const datasets = resolvedChartDatasets(element).map((dataset) => ({
    ...dataset,
    name: markdownText(dataset.name),
  }));
  const max = Math.max(
    1,
    ...data.map((datum) => Math.abs(datum.value)),
    ...datasets.flatMap((dataset) =>
      dataset.values.map((value) => Math.abs(value)),
    ),
  );
  const title = markdownText(element.title);
  const unit = scale / PX_PER_IN;
  const titleH = title ? 24 * unit : 8;
  const pad = 12 * unit;
  const chartColor = withHash(getChartColor(element));
  const axisColor = withHash(element.axis_color ?? "9AA7BD");
  const labelColor = withHash(element.data_labels_color ?? "6A7894");
  const usesDefaultChartDesign = DEFAULT_CHART_SOURCES.has(element.source ?? "");
  const isDefaultBarChart =
    usesDefaultChartDesign && element.chart_type === "bar";
  const isDefaultLineChart =
    usesDefaultChartDesign && element.chart_type === "line";
  const isDefaultAreaChart =
    usesDefaultChartDesign && element.chart_type === "area";
  const isDefaultPieChart =
    usesDefaultChartDesign && element.chart_type === "pie";
  const hasTransparentBackground = transparentBackground;
  const axisOptions = {
    showXAxis: element.x_axis ?? true,
    showYAxis: element.y_axis ?? true,
    xAxisTitle: markdownText(element.x_axis_title),
    yAxisTitle: markdownText(element.y_axis_title),
  };
  const xAxisTitleH =
    axisOptions.xAxisTitle ? 14 * unit : 0;
  const yAxisTitleW =
    axisOptions.yAxisTitle ? 14 * unit : 0;
  const lineAxisValueW = axisOptions.showYAxis ? 28 * unit : 0;
  const plot = {
    x: pad + yAxisTitleW,
    y: titleH,
    w: Math.max(1, width - pad * 2 - yAxisTitleW),
    h: Math.max(1, height - titleH - pad - xAxisTitleH),
  };
  const linePlot = {
    ...plot,
    x: plot.x + lineAxisValueW,
    w: Math.max(1, plot.w - lineAxisValueW),
  };

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
      {renderMode === "proxy" ? null : (
        <>
          <Rect
            width={width}
            height={height}
            fill={hasTransparentBackground ? "rgba(255,255,255,0)" : "#ffffff"}
            opacity={hasTransparentBackground ? 1 : 0.92}
            cornerRadius={6}
            stroke={stroke ?? axisColor}
            strokeWidth={selected ? strokeWidth : hasTransparentBackground ? 0 : 0.5}
          />
          {title &&
          !isDefaultBarChart &&
          !isDefaultLineChart &&
          !isDefaultAreaChart &&
          !isDefaultPieChart ? (
            <Text
              x={pad}
              y={8 * (scale / PX_PER_IN)}
              width={width - pad * 2}
              height={14 * (scale / PX_PER_IN)}
              text={title}
              fontFamily="Arial, Helvetica, sans-serif"
              fontSize={9 * (scale / PX_PER_IN)}
              fontStyle="bold"
              fill={labelColor}
            />
          ) : null}
          {element.chart_type === "bar" ? (
            isDefaultBarChart ? (
              <DefaultBarChartParts
                data={data}
                categories={categories}
                datasets={datasets}
                element={element}
                width={width}
                height={height}
                color={chartColor}
                axisColor={axisColor}
                axisOptions={axisOptions}
                labelColor={labelColor}
              />
            ) : (
              <BarChartParts
                axisOptions={axisOptions}
                data={data}
                categories={categories}
                datasets={datasets}
                max={max}
                plot={plot}
                color={chartColor}
                axisColor={axisColor}
                labelColor={labelColor}
                scale={scale}
                showValues={element.data_labels ?? element.data_labels ?? false}
              />
            )
          ) : element.chart_type === "line" || element.chart_type === "area" ? (
            isDefaultLineChart ? (
              <DefaultLineChartParts
                categories={categories}
                data={data}
                datasets={datasets}
                element={element}
                width={width}
                height={height}
                color={chartColor}
                axisColor={axisColor}
                axisOptions={axisOptions}
                labelColor={labelColor}
              />
            ) : isDefaultAreaChart ? (
              <DefaultAreaChartParts
                categories={categories}
                data={data}
                datasets={datasets}
                element={element}
                width={width}
                height={height}
                color={chartColor}
                axisColor={axisColor}
                axisOptions={axisOptions}
                labelColor={labelColor}
              />
            ) : (
              <LineChartParts
                categories={categories}
                data={data}
                datasets={datasets}
                max={max}
                plot={linePlot}
                color={chartColor}
                axisColor={axisColor}
                axisOptions={axisOptions}
                labelColor={labelColor}
                scale={scale}
                showValues={element.data_labels ?? element.data_labels ?? false}
                showGrid={element.grid ?? true}
                fillArea={element.chart_type === "area"}
              />
            )
          ) : (
            isDefaultPieChart ? (
              <DefaultPieChartParts
                data={data}
                element={element}
                width={width}
                height={height}
              />
            ) : (
              <DonutChartParts
                data={data}
                plot={plot}
                color={chartColor}
                labelColor={labelColor}
                scale={scale}
                showValues={element.data_labels ?? element.data_labels ?? false}
                donut={element.chart_type === "donut"}
              />
            )
          )}
        </>
      )}
      {selected && renderMode === "proxy" ? (
        <Rect
          width={width}
          height={height}
          stroke={stroke}
          strokeWidth={strokeWidth}
          listening={false}
        />
      ) : null}
    </Group>
  );
}

function markdownText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? renderMarkdownTextContent([{ text }]) : "";
}

function chartDatumKey(datum: ChartDatum) {
  return `${datum.label}:${datum.value}:${datum.color ?? ""}`;
}

function seriesColor(element: ChartEl, index: number, fallback: string) {
  if (element.chart_type !== "pie" && element.chart_type !== "donut") {
    return element.series_colors?.[0] ?? element.color ?? fallback;
  }

  return (
    element.series_colors?.[index] ??
    (index === 0 ? element.color : null) ??
    fallback
  );
}

function BarChartParts({
  axisOptions,
  categories,
  data,
  datasets,
  max,
  plot,
  color,
  axisColor,
  labelColor,
  scale,
  showValues,
}: {
  axisOptions: AxisOptions;
  categories: string[];
  data: ChartDatum[];
  datasets: ChartDataset[];
  max: number;
  plot: Plot;
  color: string;
  axisColor: string;
  labelColor: string;
  scale: number;
  showValues: boolean;
}) {
  const axisTitleFontSize = 7 * (scale / PX_PER_IN);
  const gap = 8 * (scale / PX_PER_IN);
  const hasMultipleSeries = datasets.length > 1;
  const labels = hasMultipleSeries ? categories : data.map((datum) => datum.label);
  const categoryCount = Math.max(1, labels.length);
  const categoryStep = plot.w / categoryCount;
  const seriesCount = hasMultipleSeries ? datasets.length : 1;
  const groupGap = hasMultipleSeries ? Math.max(2, gap * 0.36) : gap;
  const barW = hasMultipleSeries
    ? Math.max(3, Math.min(18 * (scale / PX_PER_IN), (categoryStep * 0.64) / seriesCount))
    : Math.max(4, (plot.w - gap * (data.length - 1)) / data.length);
  const groupW = seriesCount * barW + Math.max(0, seriesCount - 1) * groupGap;
  return (
    <>
      {axisOptions.showXAxis ? (
        <Line
          points={[plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h]}
          stroke={axisColor}
          strokeWidth={1}
        />
      ) : null}
      {axisOptions.showYAxis ? (
        <Line
          points={[plot.x, plot.y, plot.x, plot.y + plot.h]}
          stroke={axisColor}
          strokeWidth={1}
        />
      ) : null}
      {(hasMultipleSeries
        ? labels.flatMap((label, categoryIndex) =>
            datasets.map((dataset, seriesIndex) => ({
              color: dataset.color,
              key: `${label}-${dataset.name}-${categoryIndex}-${seriesIndex}`,
              label,
              seriesIndex,
              value: dataset.values[categoryIndex] ?? 0,
              x:
                plot.x +
                categoryIndex * categoryStep +
                (categoryStep - groupW) / 2 +
                seriesIndex * (barW + groupGap),
            })),
          )
        : data.map((datum, index) => ({
            color: datum.color ?? color,
            key: `${chartDatumKey(datum)}:${index}`,
            label: datum.label,
            seriesIndex: index,
            value: datum.value,
            x: plot.x + index * (barW + gap),
          }))).map((datum) => {
        const barH = (datum.value / max) * plot.h * 0.82;
        const x = datum.x;
        const y = plot.y + plot.h - barH;
        return (
          <Group key={datum.key}>
            <Rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              fill={withHash(datum.color)}
              cornerRadius={2}
            />
            {showValues ? (
              <Text
                x={x}
                y={Math.max(plot.y, y - 12 * (scale / PX_PER_IN))}
                width={barW}
                height={10 * (scale / PX_PER_IN)}
                text={String(datum.value)}
                fontSize={7 * (scale / PX_PER_IN)}
                align="center"
                fill={labelColor}
              />
            ) : null}
          </Group>
        );
      })}
      {axisOptions.showXAxis
        ? labels.map((label, index) => (
            <Text
              key={`x-label-${label}-${index}`}
              x={plot.x + index * categoryStep}
              y={plot.y + plot.h + 2 * (scale / PX_PER_IN)}
              width={categoryStep}
              height={10 * (scale / PX_PER_IN)}
              text={label}
              fontSize={7 * (scale / PX_PER_IN)}
              align="center"
              fill={labelColor}
            />
          ))
        : null}
      {axisOptions.xAxisTitle ? (
        <Text
          x={plot.x}
          y={plot.y + plot.h + 4 * (scale / PX_PER_IN)}
          width={plot.w}
          height={10 * (scale / PX_PER_IN)}
          text={axisOptions.xAxisTitle}
          fontSize={axisTitleFontSize}
          align="center"
          fill={labelColor}
        />
      ) : null}
      {axisOptions.yAxisTitle ? (
        <Text
          x={3 * (scale / PX_PER_IN)}
          y={plot.y + plot.h}
          width={plot.h}
          height={10 * (scale / PX_PER_IN)}
          text={axisOptions.yAxisTitle}
          fontSize={axisTitleFontSize}
          align="center"
          fill={labelColor}
          rotation={-90}
        />
      ) : null}
    </>
  );
}

function DefaultBarChartParts({
  axisOptions,
  categories,
  data,
  datasets,
  element,
  width,
  height,
  color,
  axisColor,
  labelColor,
}: {
  axisOptions: AxisOptions;
  categories: string[];
  data: ChartDatum[];
  datasets: ChartDataset[];
  element: ChartEl;
  width: number;
  height: number;
  color: string;
  axisColor: string;
  labelColor: string;
}) {
  const rawTitle = element.title ?? "Weekly Report";
  const titleParts = rawTitle
    .split(/\r?\n/)
    .map((part) => markdownText(part).trim())
    .filter(Boolean);
  const title = titleParts[0] ?? "Weekly Report";
  const subtitle = titleParts.slice(1).join(" ");
  const hasMultipleSeries = datasets.length > 1;
  const legendItems = (hasMultipleSeries
    ? datasets
    : [
        {
          color: seriesColor(element, 0, color),
          name: markdownText(element.series?.[0]?.name ?? "Students Number"),
          values: data.map((datum) => datum.value),
        },
      ]).map((dataset, index) => ({
        ...dataset,
        color: withHash(dataset.color ?? seriesColor(element, index, color)),
      }));
  const labels = hasMultipleSeries ? categories : data.map((datum) => datum.label);
  const values = hasMultipleSeries
    ? datasets.flatMap((dataset) => dataset.values)
    : data.map((datum) => datum.value);
  const seriesColors = element.series_colors ?? [];
  const primaryColor = withHash(seriesColors[0] ?? color);
  const showGrid = element.grid ?? true;
  const maxTick = Math.max(200, Math.ceil(Math.max(1, ...values) / 50) * 50);
  const tickStep = maxTick / 4;
  const ticks = Array.from({ length: 5 }, (_, index) => index * tickStep);
  const titleFontSize = clamp(height * 0.064, 9, 18);
  const subtitleFontSize = clamp(height * 0.043, 6.5, 12);
  const tickFontSize = clamp(height * 0.043, 7, 13);
  const categoryFontSize = clamp(height * 0.041, 7, 13);
  const valueFontSize = clamp(height * 0.031, 5.5, 9);
  const legendFontSize = clamp(height * 0.039, 7, 12);
  const axisTitleFontSize = clamp(height * 0.031, 5.5, 9);
  const axisTitleGap = 5;
  const xAxisTitleSpace =
    axisOptions.xAxisTitle ? axisTitleFontSize + axisTitleGap : 0;
  const yAxisTitleSpace =
    axisOptions.yAxisTitle ? axisTitleFontSize + axisTitleGap : 0;
  const baseLeftPad = clamp(width * 0.125, 34, 58);
  const leftPad = baseLeftPad + yAxisTitleSpace;
  const rightPad = clamp(width * 0.08, 20, 38);
  const topPad = clamp(height * 0.25, 52, 76);
  const bottomPad = clamp(height * 0.16, 36, 52) + xAxisTitleSpace;
  const plotW = Math.max(1, width - leftPad - rightPad);
  const plotH = Math.max(1, height - topPad - bottomPad);
  const categoryCount = Math.max(1, labels.length);
  const step = plotW / categoryCount;
  const seriesCount = hasMultipleSeries ? datasets.length : 1;
  const innerGap = clamp(step * 0.05, 2, 5);
  const groupW = clamp(step * 0.62, 12, hasMultipleSeries ? 44 : 26);
  const barW = hasMultipleSeries
    ? clamp((groupW - innerGap * Math.max(0, seriesCount - 1)) / seriesCount, 4, 18)
    : clamp(step * 0.45, 10, 26);
  const actualGroupW =
    seriesCount * barW + innerGap * Math.max(0, seriesCount - 1);
  const baselineY = topPad + plotH;
  const titleY = clamp(height * 0.05, 8, 18);
  const subtitleY = titleY + titleFontSize + 1;
  const legendY = height - clamp(height * 0.06, 14, 25);
  const legendDotRadius = clamp(legendFontSize * 0.42, 3.5, 6);
  const legendWidth = Math.min(
    width * 0.9,
    legendItems.reduce(
      (sum, item) => sum + item.name.length * legendFontSize * 0.74 + 24,
      0,
    ),
  );
  let legendCursorX = (width - legendWidth) / 2;

  return (
    <>
      <Text
        x={0}
        y={titleY}
        width={width}
        text={title}
        fill="#303030"
        fontFamily="Georgia, Times New Roman, serif"
        fontSize={titleFontSize}
        fontStyle="bold"
        align="center"
      />
      {subtitle ? (
        <Text
          x={0}
          y={subtitleY}
          width={width}
          text={subtitle}
          fill="#303030"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize={subtitleFontSize}
          align="center"
        />
      ) : null}

      {ticks.map((tick) => {
        const y = baselineY - (tick / maxTick) * plotH;
        return (
          <Group key={tick}>
            {showGrid ? (
              <Line
                points={[leftPad, y, leftPad + plotW, y]}
                stroke={axisColor}
                strokeWidth={0.6}
              />
            ) : null}
            {axisOptions.showYAxis ? (
              <Text
                x={yAxisTitleSpace}
                y={y - tickFontSize / 2}
                width={baseLeftPad - 12}
                text={`${tick}`}
                fill="#747474"
                fontFamily="Georgia, Times New Roman, serif"
                fontSize={tickFontSize}
                fontStyle="bold"
                align="right"
              />
            ) : null}
          </Group>
        );
      })}

      {(hasMultipleSeries
        ? labels.flatMap((label, categoryIndex) =>
            datasets.map((dataset, seriesIndex) => ({
              color: withHash(dataset.color),
              key: `${label}-${dataset.name}-${categoryIndex}-${seriesIndex}`,
              label,
              value: dataset.values[categoryIndex] ?? 0,
              x:
                leftPad +
                categoryIndex * step +
                (step - actualGroupW) / 2 +
                seriesIndex * (barW + innerGap),
            })),
          )
        : data.map((datum, index) => ({
            color: primaryColor,
            key: `${chartDatumKey(datum)}:${index}`,
            label: datum.label,
            value: datum.value,
            x: leftPad + index * step + (step - barW) / 2,
          }))).map((datum) => {
        const barH = Math.max(1, (datum.value / maxTick) * plotH);
        const x = datum.x;
        const y = baselineY - barH;
        return (
          <Group key={datum.key}>
            <Text
              x={x - step * 0.1}
              y={y - valueFontSize - 4}
              width={barW + step * 0.2}
              text={`${datum.value}`}
              fill={labelColor}
              fontFamily="Georgia, Times New Roman, serif"
              fontSize={valueFontSize}
              align="center"
            />
            <Rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              fill={datum.color}
              cornerRadius={barW / 2}
            />
          </Group>
        );
      })}
      {axisOptions.showXAxis
        ? labels.map((label, index) => (
            <Text
              key={`default-bar-label-${label}-${index}`}
              x={leftPad + index * step}
              y={baselineY + 4}
              width={step}
              text={label}
              fill="#747474"
              fontFamily="Georgia, Times New Roman, serif"
              fontSize={categoryFontSize}
              fontStyle="bold"
              align="center"
              wrap="none"
            />
          ))
        : null}

      {axisOptions.xAxisTitle ? (
        <Text
          x={leftPad}
          y={
            baselineY +
            (axisOptions.showXAxis ? categoryFontSize + 4 : 0) +
            axisTitleGap
          }
          width={plotW}
          text={axisOptions.xAxisTitle}
          fill="#747474"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize={axisTitleFontSize}
          fontStyle="bold"
          align="center"
        />
      ) : null}
      {axisOptions.yAxisTitle ? (
        <Text
          x={Math.max(0, (yAxisTitleSpace - axisTitleFontSize) / 2)}
          y={baselineY}
          width={plotH}
          text={axisOptions.yAxisTitle}
          fill="#747474"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize={axisTitleFontSize}
          fontStyle="bold"
          align="center"
          rotation={-90}
        />
      ) : null}

      {legendItems.map((item, index) => {
        const textW = Math.min(
          width * 0.44,
          Math.max(24, item.name.length * legendFontSize * 0.74),
        );
        const itemX = legendCursorX;
        legendCursorX += textW + legendDotRadius * 2 + 18;
        return (
          <Group key={`legend-${item.name}-${index}`}>
            <Ellipse
              x={itemX}
              y={legendY + legendDotRadius}
              radiusX={legendDotRadius}
              radiusY={legendDotRadius}
              fill={item.color ?? primaryColor}
            />
            <Text
              x={itemX + legendDotRadius + 7}
              y={legendY}
              width={textW}
              height={legendFontSize * 1.4}
              text={item.name}
              fill="#747474"
              fontFamily="Georgia, Times New Roman, serif"
              fontSize={legendFontSize}
              fontStyle="bold"
              wrap="none"
            />
          </Group>
        );
      })}
    </>
  );
}

function DefaultLineChartParts({
  axisOptions,
  categories,
  data,
  datasets,
  element,
  width,
  height,
  color,
  axisColor,
  labelColor,
}: {
  axisOptions: AxisOptions;
  categories: string[];
  data: ChartDatum[];
  datasets: ChartDataset[];
  element: ChartEl;
  width: number;
  height: number;
  color: string;
  axisColor: string;
  labelColor: string;
}) {
  const titleParts = (element.title ?? "Enrollment Over Years")
    .split(/\r?\n/)
    .map((part) => markdownText(part).trim())
    .filter(Boolean);
  const title = titleParts[0] ?? "Enrollment Over Years";
  const subtitle = titleParts.slice(1).join(" ");
  const fallbackDataset = {
    color,
    name: markdownText(element.series?.[0]?.name ?? "Students Number"),
    values: data.map((datum) => datum.value),
  };
  const renderDatasets = datasets.length > 0 ? datasets : [fallbackDataset];
  const labels = categories.length > 0 ? categories : data.map((datum) => datum.label);
  const labelCount = Math.max(
    1,
    labels.length,
    ...renderDatasets.map((dataset) => dataset.values.length),
  );
  const labelItems = Array.from(
    { length: labelCount },
    (_, index) => labels[index] ?? `Item ${index + 1}`,
  );
  const values = renderDatasets.flatMap((dataset) => dataset.values);
  const showGrid = element.grid ?? true;
  const showValues = element.data_labels ?? false;
  const maxTick = niceChartMax(Math.max(1, ...values.map((value) => Math.abs(value))));
  const ticks = Array.from({ length: 5 }, (_, index) => (maxTick / 4) * index);
  const titleFontSize = clamp(height * 0.064, 9, 32);
  const subtitleFontSize = clamp(height * 0.045, 7, 24);
  const categoryFontSize = clamp(height * 0.045, 7, 24);
  const tickFontSize = clamp(height * 0.038, 6, 18);
  const valueFontSize = clamp(height * 0.032, 5, 14);
  const legendFontSize = clamp(height * 0.045, 7, 24);
  const axisTitleFontSize = clamp(height * 0.035, 6, 18);
  const lineStrokeWidth = clamp(height * 0.004, 1, 3);
  const dotRadius = clamp(legendFontSize * 0.42, 3.5, 11);
  const yTickSpace = axisOptions.showYAxis ? clamp(width * 0.06, 18, 54) : 0;
  const yAxisTitleSpace = axisOptions.yAxisTitle ? axisTitleFontSize + 5 : 0;
  const xAxisTitleSpace = axisOptions.xAxisTitle ? axisTitleFontSize + 6 : 0;
  const leftPad = clamp(width * 0.13, 24, 170) + yTickSpace + yAxisTitleSpace;
  const rightPad = clamp(width * 0.14, 24, 180);
  const plotY = clamp(height * 0.3, 38, 220);
  const baselineY = height - clamp(height * 0.19, 30, 140) - xAxisTitleSpace;
  const plotW = Math.max(1, width - leftPad - rightPad);
  const plotH = Math.max(1, baselineY - plotY);
  const xLabelY = baselineY + clamp(height * 0.018, 4, 14);
  const legendY = height - clamp(height * 0.08, 18, 64);
  const xForIndex = (index: number) =>
    leftPad + (labelCount <= 1 ? plotW / 2 : (index / (labelCount - 1)) * plotW);
  const yForValue = (value: number) =>
    plotY + plotH - (value / maxTick) * plotH * 0.86;
  const lineSeries = renderDatasets.map((dataset, seriesIndex) => ({
    ...dataset,
    color: withHash(dataset.color ?? seriesColor(element, seriesIndex, color)),
    points: labelItems.flatMap((_, index) => [
      xForIndex(index),
      yForValue(dataset.values[index] ?? 0),
    ]),
  }));
  const legendItems = lineSeries.map((dataset) => ({
    color: dataset.color,
    name: dataset.name,
    textWidth: Math.min(
      width * 0.36,
      Math.max(36, dataset.name.length * legendFontSize * 0.62),
    ),
  }));
  const legendGap = clamp(width * 0.024, 8, 20);
  const legendWidth =
    legendItems.reduce(
      (sum, item) => sum + dotRadius * 2 + 8 + item.textWidth,
      0,
    ) + legendGap * Math.max(0, legendItems.length - 1);
  let legendCursorX = Math.max(0, (width - legendWidth) / 2);

  return (
    <>
      <Text
        x={0}
        y={clamp(height * 0.09, 8, 68)}
        width={width}
        text={title}
        fill="#303030"
        fontFamily="Georgia, Times New Roman, serif"
        fontSize={titleFontSize}
        fontStyle="bold"
        align="center"
      />
      {subtitle ? (
        <Text
          x={0}
          y={clamp(height * 0.09, 8, 68) + titleFontSize + 1}
          width={width}
          text={subtitle}
          fill="#303030"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize={subtitleFontSize}
          align="center"
        />
      ) : null}

      {showGrid
        ? labelItems.map((label, index) => {
            const x = xForIndex(index);
            return (
              <Line
                key={`grid-x-${label}-${index}`}
                points={[x, plotY, x, baselineY]}
                stroke={axisColor}
                strokeWidth={0.7}
              />
            );
          })
        : null}
      {axisOptions.showYAxis
        ? ticks.map((tick) => {
            const y = plotY + plotH - (tick / maxTick) * plotH * 0.86;
            return (
              <Text
                key={tick}
                x={yAxisTitleSpace}
                y={y - tickFontSize / 2}
                width={Math.max(1, yTickSpace - 6)}
                text={axisTickLabel(tick)}
                fill="#747474"
                fontFamily="Georgia, Times New Roman, serif"
                fontSize={tickFontSize}
                fontStyle="bold"
                align="right"
              />
            );
          })
        : null}
      {lineSeries.map((dataset, index) => (
        <Line
          key={`default-line-series-${dataset.name}-${index}`}
          points={dataset.points}
          stroke={dataset.color}
          strokeWidth={lineStrokeWidth}
          tension={0.36}
          lineCap="round"
          lineJoin="round"
        />
      ))}
      {axisOptions.showXAxis
        ? labelItems.map((label, index) => (
            <Text
              key={`label-${label}-${index}`}
              x={xForIndex(index) - 22}
              y={xLabelY}
              width={44}
              text={label}
              fill="#747474"
              fontFamily="Georgia, Times New Roman, serif"
              fontSize={categoryFontSize}
              fontStyle="bold"
              align="center"
              wrap="none"
            />
          ))
        : null}
      {showValues
        ? lineSeries.flatMap((dataset, seriesIndex) =>
            labelItems.map((_, index) => {
              const value = dataset.values[index] ?? 0;
              const x = xForIndex(index);
              const y = yForValue(value);
              return (
                <Text
                  key={`value-${dataset.name}-${seriesIndex}-${index}`}
                  x={x - 18}
                  y={Math.max(plotY, y - valueFontSize - 4)}
                  width={36}
                  text={`${value}`}
                  fill={labelColor}
                  fontFamily="Georgia, Times New Roman, serif"
                  fontSize={valueFontSize}
                  align="center"
                />
              );
            }),
          )
        : null}
      {axisOptions.xAxisTitle ? (
        <Text
          x={leftPad}
          y={xLabelY + (axisOptions.showXAxis ? categoryFontSize + 4 : 0)}
          width={plotW}
          text={axisOptions.xAxisTitle}
          fill="#747474"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize={axisTitleFontSize}
          fontStyle="bold"
          align="center"
        />
      ) : null}
      {axisOptions.yAxisTitle ? (
        <Text
          x={Math.max(0, (yAxisTitleSpace - axisTitleFontSize) / 2)}
          y={baselineY}
          width={plotH}
          text={axisOptions.yAxisTitle}
          fill="#747474"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize={axisTitleFontSize}
          fontStyle="bold"
          align="center"
          rotation={-90}
        />
      ) : null}

      {legendItems.map((item, index) => {
        const itemX = legendCursorX;
        legendCursorX += dotRadius * 2 + 8 + item.textWidth + legendGap;
        return (
          <Group key={`default-line-legend-${item.name}-${index}`}>
            <Circle
              x={itemX + dotRadius}
              y={legendY + dotRadius}
              radius={dotRadius}
              fill={item.color}
            />
            <Text
              x={itemX + dotRadius * 2 + 8}
              y={legendY}
              width={item.textWidth}
              text={item.name}
              fill="#747474"
              fontFamily="Georgia, Times New Roman, serif"
              fontSize={legendFontSize}
              fontStyle="bold"
              wrap="none"
            />
          </Group>
        );
      })}
    </>
  );
}

function DefaultAreaChartParts({
  axisOptions,
  categories,
  data,
  datasets,
  element,
  width,
  height,
  color,
  axisColor,
  labelColor,
}: {
  axisOptions: AxisOptions;
  categories: string[];
  data: ChartDatum[];
  datasets: ChartDataset[];
  element: ChartEl;
  width: number;
  height: number;
  color: string;
  axisColor: string;
  labelColor: string;
}) {
  const titleParts = (element.title ?? "Enrollment Over Years")
    .split(/\r?\n/)
    .map((part) => markdownText(part).trim())
    .filter(Boolean);
  const title = titleParts[0] ?? "Enrollment Over Years";
  const subtitle = titleParts.slice(1).join(" ");
  const fallbackDataset = {
    color,
    name: markdownText(element.series?.[0]?.name ?? "Students Number"),
    values: data.map((datum) => datum.value),
  };
  const renderDatasets = datasets.length > 0 ? datasets : [fallbackDataset];
  const labels = categories.length > 0 ? categories : data.map((datum) => datum.label);
  const labelCount = Math.max(
    1,
    labels.length,
    ...renderDatasets.map((dataset) => dataset.values.length),
  );
  const labelItems = Array.from(
    { length: labelCount },
    (_, index) => labels[index] ?? `Item ${index + 1}`,
  );
  const values = renderDatasets.flatMap((dataset) => dataset.values);
  const showGrid = element.grid ?? true;
  const showValues = element.data_labels ?? false;
  const maxTick = niceChartMax(Math.max(1, ...values.map((value) => Math.abs(value))));
  const ticks = Array.from({ length: 5 }, (_, index) => (maxTick / 4) * index);
  const titleFontSize = clamp(height * 0.064, 9, 32);
  const subtitleFontSize = clamp(height * 0.045, 7, 24);
  const categoryFontSize = clamp(height * 0.045, 7, 24);
  const tickFontSize = clamp(height * 0.038, 6, 18);
  const valueFontSize = clamp(height * 0.032, 5, 14);
  const legendFontSize = clamp(height * 0.045, 7, 24);
  const axisTitleFontSize = clamp(height * 0.035, 6, 18);
  const lineStrokeWidth = clamp(height * 0.004, 1, 3);
  const dotRadius = clamp(legendFontSize * 0.42, 3.5, 11);
  const yTickSpace = axisOptions.showYAxis ? clamp(width * 0.06, 18, 54) : 0;
  const yAxisTitleSpace = axisOptions.yAxisTitle ? axisTitleFontSize + 5 : 0;
  const xAxisTitleSpace = axisOptions.xAxisTitle ? axisTitleFontSize + 6 : 0;
  const leftPad = clamp(width * 0.13, 24, 170) + yTickSpace + yAxisTitleSpace;
  const rightPad = clamp(width * 0.13, 24, 170);
  const plotY = clamp(height * 0.22, 34, 160);
  const baselineY = height - clamp(height * 0.23, 42, 160) - xAxisTitleSpace;
  const plotW = Math.max(1, width - leftPad - rightPad);
  const plotH = Math.max(1, baselineY - plotY);
  const xLabelY = baselineY + clamp(height * 0.052, 8, 22);
  const legendY = height - clamp(height * 0.08, 18, 64);
  const xForIndex = (index: number) =>
    leftPad + (labelCount <= 1 ? plotW / 2 : (index / (labelCount - 1)) * plotW);
  const yForValue = (value: number) =>
    baselineY - (value / maxTick) * plotH * 0.84;
  const areaSeries = renderDatasets.map((dataset, seriesIndex) => {
    const seriesPoints = labelItems.flatMap((_, index) => [
      xForIndex(index),
      yForValue(dataset.values[index] ?? 0),
    ]);
    return {
      ...dataset,
      areaPoints: [leftPad, baselineY, ...seriesPoints, leftPad + plotW, baselineY],
      color: withHash(dataset.color ?? seriesColor(element, seriesIndex, color)),
      points: seriesPoints,
    };
  });
  const legendItems = areaSeries.map((dataset) => ({
    color: dataset.color,
    name: dataset.name,
    textWidth: Math.min(
      width * 0.36,
      Math.max(36, dataset.name.length * legendFontSize * 0.62),
    ),
  }));
  const legendGap = clamp(width * 0.024, 8, 20);
  const legendWidth =
    legendItems.reduce(
      (sum, item) => sum + dotRadius * 2 + 8 + item.textWidth,
      0,
    ) + legendGap * Math.max(0, legendItems.length - 1);
  let legendCursorX = Math.max(0, (width - legendWidth) / 2);

  return (
    <>
      <Text
        x={0}
        y={clamp(height * 0.07, 8, 54)}
        width={width}
        text={title}
        fill="#303030"
        fontFamily="Georgia, Times New Roman, serif"
        fontSize={titleFontSize}
        fontStyle="bold"
        align="center"
      />
      {subtitle ? (
        <Text
          x={0}
          y={clamp(height * 0.07, 8, 54) + titleFontSize + 1}
          width={width}
          text={subtitle}
          fill="#303030"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize={subtitleFontSize}
          align="center"
        />
      ) : null}

      {showGrid
        ? ticks.map((tick) => {
            const y = baselineY - (tick / maxTick) * plotH;
            return (
              <Line
                key={`grid-y-${tick}`}
                points={[leftPad, y, leftPad + plotW, y]}
                stroke={axisColor}
                strokeWidth={0.7}
              />
            );
          })
        : null}
      {axisOptions.showYAxis
        ? ticks.map((tick) => {
            const y = baselineY - (tick / maxTick) * plotH;
            return (
              <Text
                key={tick}
                x={yAxisTitleSpace}
                y={y - tickFontSize / 2}
                width={Math.max(1, yTickSpace - 6)}
                text={axisTickLabel(tick)}
                fill="#747474"
                fontFamily="Georgia, Times New Roman, serif"
                fontSize={tickFontSize}
                fontStyle="bold"
                align="right"
              />
            );
          })
        : null}
      <Group
        clipX={leftPad}
        clipY={plotY}
        clipWidth={plotW}
        clipHeight={Math.max(1, baselineY - plotY)}
      >
        {areaSeries.map((dataset, index) => (
          <Line
            key={`default-area-fill-${dataset.name}-${index}`}
            points={dataset.areaPoints}
            closed
            fill={dataset.color}
            opacity={0.25}
            tension={0.34}
          />
        ))}
      </Group>
      {areaSeries.map((dataset, index) => (
        <Line
          key={`default-area-line-${dataset.name}-${index}`}
          points={dataset.points}
          stroke={dataset.color}
          strokeWidth={lineStrokeWidth}
          tension={0.34}
          lineCap="round"
          lineJoin="round"
        />
      ))}
      {axisOptions.showXAxis
        ? labelItems.map((label, index) => (
            <Text
              key={`label-${label}-${index}`}
              x={xForIndex(index) - 22}
              y={xLabelY}
              width={44}
              text={label}
              fill="#747474"
              fontFamily="Georgia, Times New Roman, serif"
              fontSize={categoryFontSize}
              fontStyle="bold"
              align="center"
              wrap="none"
            />
          ))
        : null}
      {showValues
        ? areaSeries.flatMap((dataset, seriesIndex) =>
            labelItems.map((_, index) => {
              const value = dataset.values[index] ?? 0;
              const x = xForIndex(index);
              const y = yForValue(value);
              return (
                <Text
                  key={`value-${dataset.name}-${seriesIndex}-${index}`}
                  x={x - 18}
                  y={Math.max(plotY, y - valueFontSize - 4)}
                  width={36}
                  text={`${value}`}
                  fill={labelColor}
                  fontFamily="Georgia, Times New Roman, serif"
                  fontSize={valueFontSize}
                  align="center"
                />
              );
            }),
          )
        : null}
      {axisOptions.xAxisTitle ? (
        <Text
          x={leftPad}
          y={xLabelY + (axisOptions.showXAxis ? categoryFontSize + 4 : 0)}
          width={plotW}
          text={axisOptions.xAxisTitle}
          fill="#747474"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize={axisTitleFontSize}
          fontStyle="bold"
          align="center"
        />
      ) : null}
      {axisOptions.yAxisTitle ? (
        <Text
          x={Math.max(0, (yAxisTitleSpace - axisTitleFontSize) / 2)}
          y={baselineY}
          width={plotH}
          text={axisOptions.yAxisTitle}
          fill="#747474"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize={axisTitleFontSize}
          fontStyle="bold"
          align="center"
          rotation={-90}
        />
      ) : null}

      {legendItems.map((item, index) => {
        const itemX = legendCursorX;
        legendCursorX += dotRadius * 2 + 8 + item.textWidth + legendGap;
        return (
          <Group key={`default-area-legend-${item.name}-${index}`}>
            <Circle
              x={itemX + dotRadius}
              y={legendY + dotRadius}
              radius={dotRadius}
              fill={item.color}
            />
            <Text
              x={itemX + dotRadius * 2 + 8}
              y={legendY}
              width={item.textWidth}
              text={item.name}
              fill="#747474"
              fontFamily="Georgia, Times New Roman, serif"
              fontSize={legendFontSize}
              fontStyle="bold"
              wrap="none"
            />
          </Group>
        );
      })}
    </>
  );
}

function LineChartParts({
  axisOptions,
  categories,
  data,
  datasets,
  max,
  plot,
  color,
  axisColor,
  labelColor,
  scale,
  showValues,
  showGrid,
  fillArea = false,
}: {
  axisOptions: AxisOptions;
  categories: string[];
  data: ChartDatum[];
  datasets: ChartDataset[];
  max: number;
  plot: Plot;
  color: string;
  axisColor: string;
  labelColor: string;
  scale: number;
  showValues: boolean;
  showGrid: boolean;
  fillArea?: boolean;
}) {
  const unit = scale / PX_PER_IN;
  const labelBand = 16 * unit;
  const plotH = Math.max(1, plot.h - labelBand);
  const axisTitleFontSize = 7 * unit;
  const tickFontSize = 7 * unit;
  const tickLabelW = 24 * unit;
  const maxTick = niceChartMax(max);
  const ticks = Array.from({ length: 5 }, (_, index) => (maxTick / 4) * index);
  const fallbackDataset = {
    color,
    name: "Series 1",
    values: data.map((datum) => datum.value),
  };
  const renderDatasets = datasets.length > 0 ? datasets : [fallbackDataset];
  const labels = categories.length > 0 ? categories : data.map((datum) => datum.label);
  const labelCount = Math.max(
    1,
    labels.length,
    ...renderDatasets.map((dataset) => dataset.values.length),
  );
  const labelItems = Array.from(
    { length: labelCount },
    (_, index) => labels[index] ?? `Item ${index + 1}`,
  );
  const xForIndex = (index: number) =>
    plot.x + (labelCount === 1 ? plot.w / 2 : (index / (labelCount - 1)) * plot.w);
  const yForValue = (value: number) =>
    plot.y + plotH - (value / maxTick) * plotH * 0.82;
  const lineSeries = renderDatasets.map((dataset) => {
    const points = labelItems.flatMap((_, index) => [
      xForIndex(index),
      yForValue(dataset.values[index] ?? 0),
    ]);
    return {
      ...dataset,
      areaPoints: [plot.x, plot.y + plotH, ...points, plot.x + plot.w, plot.y + plotH],
      color: withHash(dataset.color ?? color),
      points,
    };
  });
  return (
    <>
      {showGrid
        ? labelItems.map((label, index) => {
            const x = xForIndex(index);
            return (
              <Line
                key={`grid-x-${label}-${index}`}
                points={[x, plot.y, x, plot.y + plotH]}
                stroke={axisColor}
                strokeWidth={0.6}
                opacity={0.35}
              />
            );
          })
        : null}
      {axisOptions.showXAxis ? (
        <Line
          points={[plot.x, plot.y + plotH, plot.x + plot.w, plot.y + plotH]}
          stroke={axisColor}
          strokeWidth={1}
        />
      ) : null}
      {axisOptions.showYAxis ? (
        <>
          <Line
            points={[plot.x, plot.y, plot.x, plot.y + plotH]}
            stroke={axisColor}
            strokeWidth={1}
          />
          {ticks.map((tick) => {
            const y = plot.y + plotH - (tick / maxTick) * plotH * 0.82;
            return (
              <Text
                key={tick}
                x={plot.x - tickLabelW - 4 * unit}
                y={y - tickFontSize / 2}
                width={tickLabelW}
                height={10 * unit}
                text={axisTickLabel(tick)}
                fontSize={tickFontSize}
                align="right"
                fill={labelColor}
              />
            );
          })}
        </>
      ) : null}
      {fillArea
        ? lineSeries.map((dataset, index) => (
            <Line
              key={`area-fill-${dataset.name}-${index}`}
              points={dataset.areaPoints}
              closed
              fill={dataset.color}
              opacity={0.18}
              tension={0.28}
            />
          ))
        : null}
      {lineSeries.map((dataset, index) => (
        <Line
          key={`line-series-${dataset.name}-${index}`}
          points={dataset.points}
          stroke={dataset.color}
          strokeWidth={2}
          tension={0.28}
        />
      ))}
      {lineSeries.flatMap((dataset, seriesIndex) =>
        labelItems.map((_, index) => {
          const value = dataset.values[index] ?? 0;
          const cx = xForIndex(index);
          const cy = yForValue(value);
          return (
            <Group key={`${dataset.name}-${seriesIndex}-${index}`}>
              <Ellipse
                x={cx}
                y={cy}
                radiusX={3.5 * (scale / PX_PER_IN)}
                radiusY={3.5 * (scale / PX_PER_IN)}
                fill={dataset.color}
                stroke="#ffffff"
                strokeWidth={1}
              />
              {showValues ? (
                <Text
                  x={cx - 14 * unit}
                  y={Math.max(plot.y, cy - 13 * unit)}
                  width={28 * unit}
                  height={10 * unit}
                  text={String(value)}
                  fontSize={7 * unit}
                  align="center"
                  fill={labelColor}
                />
              ) : null}
            </Group>
          );
        }),
      )}
      {axisOptions.showXAxis
        ? labelItems.map((label, index) => (
            <Text
              key={`line-x-label-${label}-${index}`}
              x={xForIndex(index) - 14 * unit}
              y={plot.y + plotH + 4 * unit}
              width={28 * unit}
              height={10 * unit}
              text={label}
              fontSize={7 * unit}
              align="center"
              fill={labelColor}
            />
          ))
        : null}
      {axisOptions.xAxisTitle ? (
        <Text
          x={plot.x}
          y={plot.y + plotH + labelBand + 1 * unit}
          width={plot.w}
          height={10 * unit}
          text={axisOptions.xAxisTitle}
          fontSize={axisTitleFontSize}
          align="center"
          fill={labelColor}
        />
      ) : null}
      {axisOptions.yAxisTitle ? (
        <Text
          x={3 * unit}
          y={plot.y + plotH}
          width={plotH}
          height={10 * unit}
          text={axisOptions.yAxisTitle}
          fontSize={axisTitleFontSize}
          align="center"
          fill={labelColor}
          rotation={-90}
        />
      ) : null}
    </>
  );
}

function DefaultPieChartParts({
  data,
  element,
  width,
  height,
}: {
  data: ChartDatum[];
  element: ChartEl;
  width: number;
  height: number;
}) {
  const titleParts = (element.title ?? "Weekly Report")
    .split(/\r?\n/)
    .map((part) => markdownText(part).trim())
    .filter(Boolean);
  const title = titleParts[0] ?? "Weekly Report";
  const subtitle = titleParts.slice(1).join(" ");
  const showValues = element.data_labels ?? true;
  const valueLabelColor = withHash(element.data_labels_color ?? "191919");
  const total = Math.max(
    1,
    data.reduce((sum, datum) => sum + Math.abs(datum.value), 0),
  );
  const titleFontSize = clamp(height * 0.064, 9, 28);
  const subtitleFontSize = clamp(height * 0.043, 7, 20);
  const labelFontSize = clamp(height * 0.045, 8, 22);
  const legendFontSize = clamp(height * 0.036, 7, 18);
  const legendDotRadius = clamp(legendFontSize * 0.5, 4, 12);
  const radius = clamp(Math.min(width * 0.34, height * 0.31), 34, 210);
  const cx = width / 2;
  const cy = clamp(height * 0.54, radius + titleFontSize + 22, height - radius - 42);
  const orderedData =
    data.length === 3 ? [data[1], data[0], data[2]].filter(Boolean) : data;
  let rotation = -90;
  const slices = orderedData.map((datum) => {
    const angle = (Math.abs(datum.value) / total) * 360;
    const slice = { datum, angle, rotation };
    rotation += angle;
    return slice;
  });
  const titleY = clamp(height * 0.07, 7, 38);
  const subtitleY = titleY + titleFontSize + 1;
  const legendY = height - clamp(height * 0.12, 24, 72);
  const legendItems = data.map((datum) => {
    const textWidth = Math.max(
      36,
      Math.min(width * 0.22, datum.label.length * legendFontSize * 0.56),
    );
    return { datum, textWidth };
  });
  const legendGap = clamp(width * 0.055, 12, 46);
  const legendWidth =
    legendItems.reduce(
      (sum, item) => sum + legendDotRadius * 2 + 7 + item.textWidth,
      0,
    ) +
    legendGap * Math.max(0, legendItems.length - 1);
  let legendX = Math.max(0, (width - legendWidth) / 2);

  return (
    <>
      <Text
        x={0}
        y={titleY}
        width={width}
        text={title}
        fill="#303030"
        fontFamily="Georgia, Times New Roman, serif"
        fontSize={titleFontSize}
        fontStyle="bold"
        align="center"
      />
      {subtitle ? (
        <Text
          x={0}
          y={subtitleY}
          width={width}
          text={subtitle}
          fill="#303030"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize={subtitleFontSize}
          align="center"
        />
      ) : null}

      {slices.map(({ datum, angle, rotation: sliceRotation }) => (
        <Arc
          key={`slice-${chartDatumKey(datum)}`}
          x={cx}
          y={cy}
          innerRadius={0}
          outerRadius={radius}
          angle={angle}
          rotation={sliceRotation}
          fill={withHash(datum.color ?? element.color ?? "7555F6")}
        />
      ))}
      {showValues
        ? slices.map(({ datum, angle, rotation: sliceRotation }) => {
            const percent = Math.round((Math.abs(datum.value) / total) * 100);
            const text = `${percent}%`;
            const midAngle = ((sliceRotation + angle / 2) * Math.PI) / 180;
            const labelRadius = radius * 0.74;
            const labelX = cx + Math.cos(midAngle) * labelRadius;
            const labelY = cy + Math.sin(midAngle) * labelRadius;
            const pillW = Math.max(24, text.length * labelFontSize * 0.62 + 11);
            const pillH = labelFontSize * 1.34;
            return (
              <Group
                key={`label-${chartDatumKey(datum)}`}
                x={labelX - pillW / 2}
                y={labelY - pillH / 2}
              >
                <Rect
                  width={pillW}
                  height={pillH}
                  fill="#FFFFFF"
                  cornerRadius={pillH / 2}
                />
                <Text
                  y={1}
                  width={pillW}
                  height={pillH}
                  text={text}
                  fill={valueLabelColor}
                  fontFamily="Arial, Helvetica, sans-serif"
                  fontSize={labelFontSize}
                  align="center"
                  verticalAlign="middle"
                />
              </Group>
            );
          })
        : null}

      {legendItems.map(({ datum, textWidth }) => {
        const currentX = legendX;
        legendX += legendDotRadius * 2 + 7 + textWidth + legendGap;
        return (
          <Group key={`legend-${chartDatumKey(datum)}`} x={currentX} y={legendY}>
            <Circle
              x={legendDotRadius}
              y={legendDotRadius}
              radius={legendDotRadius}
              fill={withHash(datum.color ?? element.color ?? "7555F6")}
            />
            <Text
              x={legendDotRadius * 2 + 7}
              y={-1}
              width={textWidth}
              text={datum.label}
              fill="#252525"
              fontFamily="Arial, Helvetica, sans-serif"
              fontSize={legendFontSize}
              fontStyle="bold"
              wrap="none"
            />
          </Group>
        );
      })}
    </>
  );
}

function DonutChartParts({
  data,
  plot,
  color,
  labelColor,
  scale,
  showValues,
  donut = true,
}: {
  data: ChartDatum[];
  plot: Plot;
  color: string;
  labelColor: string;
  scale: number;
  showValues: boolean;
  donut?: boolean;
}) {
  const total = Math.max(
    1,
    data.reduce((sum, datum) => sum + datum.value, 0),
  );
  const radius = Math.min(plot.w * 0.26, plot.h * 0.42);
  const cx = plot.x + radius + 4 * (scale / PX_PER_IN);
  const cy = plot.y + plot.h / 2;
  const slices = data.reduce<
    Array<{ datum: ChartDatum; angle: number; rotation: number; index: number }>
  >((items, datum, index) => {
    const rotation =
      index === 0 ? -90 : items[index - 1].rotation + items[index - 1].angle;
    items.push({
      datum,
      index,
      rotation,
      angle: (datum.value / total) * 360,
    });
    return items;
  }, []);

  return (
    <>
      {slices.map(({ datum, angle, rotation }) => (
        <Arc
          key={chartDatumKey(datum)}
          x={cx}
          y={cy}
          innerRadius={donut ? radius * 0.55 : 0}
          outerRadius={radius}
          angle={angle}
          rotation={rotation}
          fill={withHash(datum.color ?? color)}
        />
      ))}
      {donut ? (
        <Text
          x={cx - radius * 0.5}
          y={cy - 6 * (scale / PX_PER_IN)}
          width={radius}
          height={12 * (scale / PX_PER_IN)}
          text={String(total)}
          fontSize={10 * (scale / PX_PER_IN)}
          fontStyle="bold"
          align="center"
          fill={color}
        />
      ) : null}
      {data.map((datum, index) => (
        <Group
          key={`legend-${chartDatumKey(datum)}`}
          x={cx + radius + 18 * (scale / PX_PER_IN)}
          y={plot.y + index * 18 * (scale / PX_PER_IN)}
        >
          <Rect
            width={8 * (scale / PX_PER_IN)}
            height={8 * (scale / PX_PER_IN)}
            fill={withHash(datum.color ?? color)}
          />
          <Text
            x={14 * (scale / PX_PER_IN)}
            y={-1 * (scale / PX_PER_IN)}
            width={Math.max(20, plot.w - radius * 2 - 24 * (scale / PX_PER_IN))}
            height={12 * (scale / PX_PER_IN)}
            text={`${datum.label}${showValues ? ` ${datum.value}` : ""}`}
            fontSize={7.5 * (scale / PX_PER_IN)}
            fill={labelColor}
          />
        </Group>
      ))}
    </>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function niceChartMax(value: number) {
  if (value <= 10) return Math.max(1, Math.ceil(value));
  if (value <= 100) return Math.ceil(value / 10) * 10;
  return Math.ceil(value / 50) * 50;
}

function axisTickLabel(value: number) {
  return Number.isInteger(value)
    ? `${value}`
    : value.toFixed(1).replace(/\.0$/, "");
}
