import { Arc, Circle, Group, Line, Rect, Text } from "react-konva";
import type { ChartType } from "../../lib/slide-schema";

type UnknownRecord = Record<string, any>;
type RawElement = UnknownRecord;
type RawChartDataset = {
  color: string;
  name: string;
  values: number[];
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

export function TemplateV2ChartElement({
  element,
  width,
  height,
  interactive,
}: {
  element: RawElement;
  width: number;
  height: number;
  interactive: boolean;
}) {
  const rawCategories = readArray(element.categories).map(String);
  const chartType = rawChartType(element.chart_type ?? element.chartType);
  const rawColors = readArray(element.series_colors ?? element.seriesColors).map(String);
  const usesUnifiedColor =
    chartType === "bar" || chartType === "line" || chartType === "area";
  const colors = usesUnifiedColor
    ? [rawColors[0] ?? readString(element.color) ?? "7C51F8"]
    : rawColors;
  const datasets = rawChartDatasets(element, rawCategories, colors);
  const categories = rawChartCategories(rawCategories, datasets);
  const values = datasets[0]?.values ?? [];
  const max = Math.max(
    1,
    ...datasets.flatMap((dataset) =>
      dataset.values.map((value) => Math.abs(value)),
    ),
    ...values.map((value) => Math.abs(value)),
  );
  const color = withHash(colors[0] ?? "#7C51F8");
  const axisColor = withHash(readString(element.axis_color)) ?? "#98A2B3";
  const showXAxis = readBoolean(element.x_axis ?? element.xAxis) ?? true;
  const showYAxis = readBoolean(element.y_axis ?? element.yAxis) ?? true;
  const showGrid = readBoolean(element.grid) ?? true;
  const title = readString(element.title) ?? "";
  const xAxisTitle =
    readString(element.x_axis_title ?? element.xAxisTitle)?.trim() ?? "";
  const yAxisTitle =
    readString(element.y_axis_title ?? element.yAxisTitle)?.trim() ?? "";
  const pad = 24;
  const axisTitleFontSize = 12;
  const axisValueFontSize = 12;
  const isLineLikeChart = chartType === "line" || chartType === "area";
  const xAxisValueH = isLineLikeChart && showXAxis ? 18 : 0;
  const yAxisValueW = isLineLikeChart && showYAxis ? 42 : 0;
  const xAxisTitleH = xAxisTitle ? 18 : 0;
  const yAxisTitleW = yAxisTitle ? 18 : 0;
  const plotX = pad + yAxisTitleW + yAxisValueW;
  const plotY = pad;
  const plotW = Math.max(1, width - plotX - pad);
  const plotH = Math.max(1, height - pad * 2 - xAxisValueH - xAxisTitleH);
  const usesDefaultChartDesign = DEFAULT_CHART_SOURCES.has(
    readString(element.source) ?? "",
  );

  if (chartType === "line" && usesDefaultChartDesign) {
    return (
      <RawDefaultLineChart
        element={element}
        width={width}
        height={height}
        categories={categories}
        datasets={datasets}
        values={values}
        colors={colors}
        interactive={interactive}
      />
    );
  }

  if (chartType === "area" && usesDefaultChartDesign) {
    return (
      <RawDefaultAreaChart
        element={element}
        width={width}
        height={height}
        categories={categories}
        datasets={datasets}
        values={values}
        colors={colors}
        interactive={interactive}
      />
    );
  }

  if (isLineLikeChart) {
    const maxTick = niceChartMax(max);
    const ticks = Array.from({ length: 5 }, (_, index) => (maxTick / 4) * index);
    const lineLabels =
      categories.length > 0
        ? categories
        : values.map((_, index) => `Item ${index + 1}`);
    const lineDatasets =
      datasets.length > 0
        ? datasets
        : [{ color: colors[0] ?? "7C51F8", name: "Series 1", values }];
    const lineLabelCount = Math.max(
      1,
      lineLabels.length,
      ...lineDatasets.map((dataset) => dataset.values.length),
    );
    const labels = Array.from(
      { length: lineLabelCount },
      (_, index) => lineLabels[index] ?? `Item ${index + 1}`,
    );
    const xForIndex = (index: number) =>
      plotX +
      (lineLabelCount <= 1 ? plotW / 2 : (index / (lineLabelCount - 1)) * plotW);
    const yForValue = (value: number) =>
      plotY + plotH - (value / maxTick) * plotH * 0.82;
    const lineSeries = lineDatasets.map((dataset) => {
      const points = labels.flatMap((_, index) => [
        xForIndex(index),
        yForValue(dataset.values[index] ?? 0),
      ]);
      return {
        ...dataset,
        areaPoints: [plotX, plotY + plotH, ...points, plotX + plotW, plotY + plotH],
        color: withHash(dataset.color) ?? color ?? "#7C51F8",
        points,
      };
    });
    return (
      <Group listening={interactive}>
        <Rect width={width} height={height} fill="rgba(255,255,255,0.01)" />
        {showGrid
          ? labels.map((label, index) => {
              const x = xForIndex(index);
              return (
                <Line
                  key={`grid-x-${label}-${index}`}
                  points={[x, plotY, x, plotY + plotH]}
                  stroke={axisColor}
                  strokeWidth={1}
                  opacity={0.35}
                />
              );
            })
          : null}
        {showYAxis ? (
          <>
            <Line points={[plotX, plotY, plotX, plotY + plotH]} stroke={axisColor} strokeWidth={1} />
            {ticks.map((tick) => {
              const y = yForValue(tick);
              return (
                <Text
                  key={tick}
                  x={plotX - yAxisValueW - 8}
                  y={y - axisValueFontSize / 2}
                  width={Math.max(1, yAxisValueW - 10)}
                  text={axisTickLabel(tick)}
                  fill="#667085"
                  fontSize={axisValueFontSize}
                  align="right"
                />
              );
            })}
          </>
        ) : null}
        {showXAxis ? (
          <Line points={[plotX, plotY + plotH, plotX + plotW, plotY + plotH]} stroke={axisColor} strokeWidth={1} />
        ) : null}
        {chartType === "area"
          ? lineSeries.map((dataset, index) => (
              <Line
                key={`area-fill-${dataset.name}-${index}`}
                points={dataset.areaPoints}
                closed
                fill={dataset.color}
                opacity={0.18}
                tension={0.25}
              />
            ))
          : null}
        {lineSeries.map((dataset, index) => (
          <Line
            key={`line-series-${dataset.name}-${index}`}
            points={dataset.points}
            stroke={dataset.color}
            strokeWidth={3}
            tension={0.25}
            lineCap="round"
            lineJoin="round"
          />
        ))}
        <Text x={plotX} y={4} width={plotW} text={title} fill="#344054" fontSize={14} />
        {showXAxis
          ? labels.map((label, index) => (
              <Text
                key={`${label}-${index}`}
                x={xForIndex(index) - 28}
                y={plotY + plotH + 4}
                width={56}
                text={label}
                fill="#667085"
                fontSize={axisValueFontSize}
                align="center"
              />
            ))
          : null}
        {xAxisTitle ? (
          <Text
            x={plotX}
            y={plotY + plotH + (showXAxis ? xAxisValueH : 0) + 4}
            width={plotW}
            text={xAxisTitle}
            fill="#667085"
            fontSize={axisTitleFontSize}
            align="center"
          />
        ) : null}
        {yAxisTitle ? (
          <Text
            x={4}
            y={plotY + plotH}
            width={plotH}
            text={yAxisTitle}
            fill="#667085"
            fontSize={axisTitleFontSize}
            align="center"
            rotation={-90}
          />
        ) : null}
      </Group>
    );
  }

  if (chartType === "pie" || chartType === "donut") {
    if (chartType === "pie" && usesDefaultChartDesign) {
      return (
        <RawDefaultPieChart
          element={element}
          width={width}
          height={height}
          categories={categories}
          values={values}
          colors={colors}
          interactive={interactive}
        />
      );
    }

    const total = values.reduce((sum, value) => sum + Math.abs(value), 0) || 1;
    const outerRadius = Math.max(1, Math.min(width, height) * 0.38);
    const innerRadius = chartType === "donut" ? outerRadius * 0.55 : 0;
    let rotation = -90;
    return (
      <Group listening={interactive}>
        {values.map((value, index) => {
          const angle = (Math.abs(value) / total) * 360;
          const segmentRotation = rotation;
          rotation += angle;
          return (
            <Arc
              key={index}
              x={width / 2}
              y={height / 2}
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              angle={angle}
              rotation={segmentRotation}
              fill={withHash(colors[index] ?? color)}
            />
          );
        })}
        <Text
          x={24}
          y={4}
          width={Math.max(1, width - 48)}
          text={readString(element.title) ?? ""}
          fill="#344054"
          fontSize={14}
          align="center"
        />
      </Group>
    );
  }

  if (chartType === "bar" && usesDefaultChartDesign) {
    return (
      <RawDefaultBarChart
        element={element}
        width={width}
        height={height}
        categories={categories}
        datasets={datasets}
        values={values}
        colors={colors}
        interactive={interactive}
      />
    );
  }

  const hasMultipleSeries = datasets.length > 1;
  const barLabels =
    categories.length > 0
      ? categories
      : values.map((_, index) => `Item ${index + 1}`);
  const categoryCount = Math.max(1, barLabels.length);
  const categoryStep = plotW / categoryCount;
  const seriesCount = hasMultipleSeries ? datasets.length : 1;
  const barGap = 8;
  const groupGap = hasMultipleSeries ? Math.max(3, barGap * 0.5) : barGap;
  const barW = hasMultipleSeries
    ? Math.max(4, Math.min(24, (categoryStep * 0.68) / seriesCount))
    : values.length > 0
      ? Math.max(4, (plotW - barGap * (values.length - 1)) / values.length)
      : 0;
  const groupW =
    seriesCount * barW + Math.max(0, seriesCount - 1) * groupGap;
  return (
    <Group listening={interactive}>
      <Rect width={width} height={height} fill="rgba(255,255,255,0.01)" />
      {showYAxis ? (
        <Line points={[plotX, plotY, plotX, plotY + plotH]} stroke={axisColor} strokeWidth={1} />
      ) : null}
      {showXAxis ? (
        <Line points={[plotX, plotY + plotH, plotX + plotW, plotY + plotH]} stroke={axisColor} strokeWidth={1} />
      ) : null}
      {(hasMultipleSeries
        ? barLabels.flatMap((label, categoryIndex) =>
            datasets.map((dataset, seriesIndex) => ({
              color:
                withHash(dataset.color) ??
                withHash(colors[seriesIndex]) ??
                color ??
                "#7C51F8",
              key: `${label}-${dataset.name}-${categoryIndex}-${seriesIndex}`,
              value: dataset.values[categoryIndex] ?? 0,
              x:
                plotX +
                categoryIndex * categoryStep +
                (categoryStep - groupW) / 2 +
                seriesIndex * (barW + groupGap),
            })),
          )
        : values.map((value, index) => ({
            color: withHash(colors[index] ?? colors[0]) ?? color ?? "#7C51F8",
            key: `${barLabels[index] ?? "bar"}-${index}`,
            value,
            x: plotX + index * (barW + barGap),
          }))).map((bar) => {
        const value = bar.value;
        const barH = (value / max) * plotH;
        return (
          <Group key={bar.key} x={bar.x}>
            <Rect
              y={plotY + plotH - barH}
              width={barW}
              height={barH}
              fill={bar.color}
            />
          </Group>
        );
      })}
      {showXAxis
        ? barLabels.map((label, index) => (
            <Text
              key={`generic-bar-label-${label}-${index}`}
              x={plotX + index * categoryStep}
              y={plotY + plotH + 4}
              width={categoryStep}
              text={label}
              fill="#667085"
              fontSize={10}
              align="center"
            />
          ))
        : null}
      <Text x={plotX} y={4} width={plotW} text={title} fill="#344054" fontSize={14} />
      {xAxisTitle ? (
        <Text
          x={plotX}
          y={plotY + plotH + 16}
          width={plotW}
          text={xAxisTitle}
          fill="#667085"
          fontSize={axisTitleFontSize}
          align="center"
        />
      ) : null}
      {yAxisTitle ? (
        <Text
          x={4}
          y={plotY + plotH}
          width={plotH}
          text={yAxisTitle}
          fill="#667085"
          fontSize={axisTitleFontSize}
          align="center"
          rotation={-90}
        />
      ) : null}
    </Group>
  );
}

function RawDefaultPieChart({
  element,
  width,
  height,
  categories,
  values,
  colors,
  interactive,
}: {
  element: RawElement;
  width: number;
  height: number;
  categories: string[];
  values: number[];
  colors: string[];
  interactive: boolean;
}) {
  const titleParts = (readString(element.title) ?? "Weekly Report")
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  const title = titleParts[0] ?? "Weekly Report";
  const subtitle = titleParts.slice(1).join(" ");
  const showValues = readBoolean(element.data_labels ?? element.dataLabels) ?? true;
  const valueLabelColor =
    withHash(readString(element.data_labels_color)) ?? "#111111";
  const labelCount = Math.max(1, categories.length, values.length);
  const labels = Array.from({ length: labelCount }, (_, index) =>
    categories[index] ?? `Category ${index + 1}`,
  );
  const normalizedValues =
    values.length > 0 ? values : Array.from({ length: labelCount }, () => 0);
  const total = Math.max(
    1,
    normalizedValues.reduce((sum, value) => sum + Math.abs(value), 0),
  );
  const titleFontSize = clamp(height * 0.056, 12, 42);
  const subtitleFontSize = clamp(height * 0.04, 8, 29);
  const labelFontSize = clamp(height * 0.038, 8, 28);
  const legendFontSize = clamp(height * 0.031, 8, 26);
  const legendDotRadius = clamp(legendFontSize * 0.6, 4, 15);
  const radius = clamp(Math.min(width * 0.31, height * 0.24), 42, 290);
  const cx = width / 2;
  const cy = clamp(
    height * 0.52,
    radius + titleFontSize + subtitleFontSize + 14,
    height - radius - legendFontSize * 2.6,
  );
  const sliceIndexes =
    labelCount === 3 ? [1, 0, 2] : Array.from({ length: labelCount }, (_, index) => index);
  let rotation = -90;
  const slices = sliceIndexes.map((dataIndex) => {
    const value = Math.abs(normalizedValues[dataIndex] ?? 0);
    const angle = (value / total) * 360;
    const slice = {
      dataIndex,
      angle,
      rotation,
      value,
      label: labels[dataIndex] ?? `Category ${dataIndex + 1}`,
      color: withHash(colors[dataIndex] ?? colors[0]) ?? "#7555F6",
    };
    rotation += angle;
    return slice;
  });
  const titleY = clamp(height * 0.09, 12, 76);
  const subtitleY = titleY + titleFontSize + 2;
  const legendY = height - clamp(height * 0.105, 24, 86);
  const legendItems = labels.map((label, index) => {
    const textWidth = Math.max(
      42,
      Math.min(width * 0.24, label.length * legendFontSize * 0.62),
    );
    return {
      label,
      textWidth,
      color: withHash(colors[index] ?? colors[0]) ?? "#7555F6",
    };
  });
  const legendGap = clamp(width * 0.04, 10, 74);
  const legendWidth =
    legendItems.reduce(
      (sum, item) => sum + legendDotRadius * 2 + 14 + item.textWidth,
      0,
    ) +
    legendGap * Math.max(0, legendItems.length - 1);
  let legendX = Math.max(0, (width - legendWidth) / 2);

  return (
    <Group listening={interactive}>
      <Rect width={width} height={height} fill="#FFFFFF" />
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

      {slices.map((slice) => (
        <Arc
          key={`slice-${slice.label}-${slice.dataIndex}`}
          x={cx}
          y={cy}
          innerRadius={0}
          outerRadius={radius}
          angle={slice.angle}
          rotation={slice.rotation}
          fill={slice.color}
        />
      ))}
      {showValues
        ? slices.map((slice) => {
            const percent = Math.round((slice.value / total) * 100);
            const text = `${percent}%`;
            const midAngle = ((slice.rotation + slice.angle / 2) * Math.PI) / 180;
            const labelRadius = radius * 0.74;
            const labelX = cx + Math.cos(midAngle) * labelRadius;
            const labelY = cy + Math.sin(midAngle) * labelRadius;
            const pillW = Math.max(56, text.length * labelFontSize * 0.62 + 18);
            const pillH = labelFontSize * 1.34;
            return (
              <Group
                key={`label-${slice.label}-${slice.dataIndex}`}
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

      {legendItems.map((item, index) => {
        const currentX = legendX;
        legendX += legendDotRadius * 2 + 14 + item.textWidth + legendGap;
        return (
          <Group key={`legend-${item.label}-${index}`} x={currentX} y={legendY}>
            <Circle
              x={legendDotRadius}
              y={legendDotRadius}
              radius={legendDotRadius}
              fill={item.color}
            />
            <Text
              x={legendDotRadius * 2 + 14}
              y={0}
              width={item.textWidth}
              text={item.label}
              fill="#252525"
              fontFamily="Arial, Helvetica, sans-serif"
              fontSize={legendFontSize}
              fontStyle="bold"
              wrap="none"
            />
          </Group>
        );
      })}
    </Group>
  );
}

function RawDefaultBarChart({
  element,
  width,
  height,
  categories,
  datasets,
  values,
  colors,
  interactive,
}: {
  element: RawElement;
  width: number;
  height: number;
  categories: string[];
  datasets: RawChartDataset[];
  values: number[];
  colors: string[];
  interactive: boolean;
}) {
  const titleParts = (readString(element.title) ?? "Weekly Report")
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  const title = titleParts[0] ?? "Weekly Report";
  const subtitle = titleParts.slice(1).join(" ");
  const series = readArray(element.series).filter(isRecord);
  const firstSeries = asRecord(series[0]) ?? {};
  const legendLabel = readString(firstSeries.name) ?? "Students Number";
  const hasMultipleSeries = datasets.length > 1;
  const chartLabels =
    categories.length > 0
      ? categories
      : values.map((_, index) => `Item ${index + 1}`);
  const scaleValues = hasMultipleSeries
    ? datasets.flatMap((dataset) => dataset.values)
    : values;
  const legendItems = hasMultipleSeries
    ? datasets.map((dataset, index) => ({
        color: withHash(dataset.color) ?? withHash(colors[index]) ?? "#4D20C5",
        label: dataset.name,
      }))
    : [
        {
          color: withHash(colors[0] ?? "#4D20C5") ?? "#4D20C5",
          label: legendLabel,
        },
      ];
  const axisColor = withHash(readString(element.axis_color)) ?? "#D8D8D8";
  const labelColor =
    withHash(readString(element.data_labels_color)) ?? "#4B55A5";
  const showXAxis = readBoolean(element.x_axis ?? element.xAxis) ?? true;
  const showYAxis = readBoolean(element.y_axis ?? element.yAxis) ?? true;
  const xAxisTitle =
    readString(element.x_axis_title ?? element.xAxisTitle)?.trim() ?? "";
  const yAxisTitle =
    readString(element.y_axis_title ?? element.yAxisTitle)?.trim() ?? "";
  const showGrid = readBoolean(element.grid) ?? true;
  const maxTick = Math.max(200, Math.ceil(Math.max(1, ...scaleValues) / 50) * 50);
  const tickStep = maxTick / 4;
  const ticks = Array.from({ length: 5 }, (_, index) => index * tickStep);
  const titleFontSize = clamp(height * 0.064, 9, 38);
  const subtitleFontSize = clamp(height * 0.043, 7, 25);
  const tickFontSize = clamp(height * 0.043, 7, 28);
  const categoryFontSize = clamp(height * 0.041, 7, 28);
  const valueFontSize = clamp(height * 0.031, 6, 20);
  const legendFontSize = clamp(height * 0.039, 7, 26);
  const axisTitleFontSize = clamp(height * 0.031, 6, 20);
  const axisTitleGap = 5;
  const xAxisTitleSpace =
    xAxisTitle ? axisTitleFontSize + axisTitleGap : 0;
  const yAxisTitleSpace =
    yAxisTitle ? axisTitleFontSize + axisTitleGap : 0;
  const baseLeftPad = clamp(width * 0.125, 34, 118);
  const leftPad = baseLeftPad + yAxisTitleSpace;
  const rightPad = clamp(width * 0.08, 20, 78);
  const topPad = clamp(height * 0.25, 52, 150);
  const bottomPad = clamp(height * 0.16, 36, 98) + xAxisTitleSpace;
  const plotW = Math.max(1, width - leftPad - rightPad);
  const plotH = Math.max(1, height - topPad - bottomPad);
  const categoryCount = Math.max(1, chartLabels.length);
  const step = plotW / categoryCount;
  const seriesCount = hasMultipleSeries ? datasets.length : 1;
  const innerGap = clamp(step * 0.05, 2, 10);
  const groupW = clamp(step * 0.66, 12, hasMultipleSeries ? 100 : 58);
  const barW = hasMultipleSeries
    ? clamp(
        (groupW - innerGap * Math.max(0, seriesCount - 1)) / seriesCount,
        4,
        42,
      )
    : clamp(step * 0.45, 10, 58);
  const actualGroupW =
    seriesCount * barW + innerGap * Math.max(0, seriesCount - 1);
  const baselineY = topPad + plotH;
  const titleY = clamp(height * 0.05, 8, 38);
  const subtitleY = titleY + titleFontSize + 1;
  const legendY = height - clamp(height * 0.06, 14, 48);
  const legendDotRadius = clamp(legendFontSize * 0.42, 3.5, 13);
  const legendGap = clamp(width * 0.035, 8, 58);
  const legendWidth =
    legendItems.reduce(
      (sum, item) =>
        sum +
        legendDotRadius * 2 +
        14 +
        Math.min(width * 0.44, item.label.length * legendFontSize * 0.74),
      0,
    ) + legendGap * Math.max(0, legendItems.length - 1);
  let legendCursorX = Math.max(0, (width - legendWidth) / 2);

  return (
    <Group listening={interactive}>
      <Rect width={width} height={height} fill="#FFFFFF" />
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
                strokeWidth={1}
              />
            ) : null}
            {showYAxis ? (
              <Text
                x={yAxisTitleSpace}
                y={y - tickFontSize / 2}
                width={Math.max(1, baseLeftPad - 12)}
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
        ? chartLabels.flatMap((label, categoryIndex) =>
            datasets.map((dataset, seriesIndex) => ({
              color:
                withHash(dataset.color) ??
                withHash(colors[seriesIndex]) ??
                "#4D20C5",
              key: `${label}-${dataset.name}-${categoryIndex}-${seriesIndex}`,
              value: dataset.values[categoryIndex] ?? 0,
              x:
                leftPad +
                categoryIndex * step +
                (step - actualGroupW) / 2 +
                seriesIndex * (barW + innerGap),
            })),
          )
        : values.map((value, index) => ({
            color: withHash(colors[index] ?? colors[0] ?? "#4D20C5") ?? "#4D20C5",
            key: `${chartLabels[index] ?? "bar"}-${index}`,
            value,
            x: leftPad + index * step + (step - barW) / 2,
          }))).map((bar) => {
        const value = bar.value;
        const barH = Math.max(1, (value / maxTick) * plotH);
        const x = bar.x;
        const y = baselineY - barH;
        return (
          <Group key={bar.key}>
            <Text
              x={x - step * 0.1}
              y={y - valueFontSize - 8}
              width={barW + step * 0.2}
              text={`${value}`}
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
              fill={bar.color}
              cornerRadius={barW / 2}
            />
          </Group>
        );
      })}
      {showXAxis
        ? chartLabels.map((label, index) => (
            <Text
              key={`default-bar-label-${label}-${index}`}
              x={leftPad + index * step}
              y={baselineY + 8}
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

      {xAxisTitle ? (
        <Text
          x={leftPad}
          y={baselineY + (showXAxis ? categoryFontSize + 8 : 0) + axisTitleGap}
          width={plotW}
          text={xAxisTitle}
          fill="#747474"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize={axisTitleFontSize}
          fontStyle="bold"
          align="center"
        />
      ) : null}
      {yAxisTitle ? (
        <Text
          x={Math.max(0, (yAxisTitleSpace - axisTitleFontSize) / 2)}
          y={baselineY}
          width={plotH}
          text={yAxisTitle}
          fill="#747474"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize={axisTitleFontSize}
          fontStyle="bold"
          align="center"
          rotation={-90}
        />
      ) : null}

      {legendItems.map((item, index) => {
        const textWidth = Math.min(
          width * 0.44,
          Math.max(40, item.label.length * legendFontSize * 0.74),
        );
        const itemX = legendCursorX;
        legendCursorX += legendDotRadius * 2 + 14 + textWidth + legendGap;
        return (
          <Group key={`default-bar-legend-${item.label}-${index}`}>
            <Circle
              x={itemX + legendDotRadius}
              y={legendY + legendDotRadius}
              radius={legendDotRadius}
              fill={item.color}
            />
            <Text
              x={itemX + legendDotRadius * 2 + 14}
              y={legendY}
              width={textWidth}
              height={legendFontSize * 1.4}
              text={item.label}
              fill="#747474"
              fontFamily="Georgia, Times New Roman, serif"
              fontSize={legendFontSize}
              fontStyle="bold"
              wrap="none"
            />
          </Group>
        );
      })}
    </Group>
  );
}

function RawDefaultAreaChart({
  element,
  width,
  height,
  categories,
  datasets,
  values,
  colors,
  interactive,
}: {
  element: RawElement;
  width: number;
  height: number;
  categories: string[];
  datasets: RawChartDataset[];
  values: number[];
  colors: string[];
  interactive: boolean;
}) {
  const titleParts = (readString(element.title) ?? "Enrollment Over Years")
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  const title = titleParts[0] ?? "Enrollment Over Years";
  const subtitle = titleParts.slice(1).join(" ");
  const series = readArray(element.series).filter(isRecord);
  const firstSeries = asRecord(series[0]) ?? {};
  const fallbackAreaColor =
    withHash(readString(element.color) ?? colors[0]) ?? "#7555F6";
  const renderDatasets =
    datasets.length > 0
      ? datasets
      : [
          {
            color: fallbackAreaColor,
            name: readString(firstSeries.name) ?? "Students Number",
            values,
          },
        ];
  const axisColor = withHash(readString(element.axis_color)) ?? "#D8D8D8";
  const labelColor =
    withHash(readString(element.data_labels_color)) ?? fallbackAreaColor;
  const showXAxis = readBoolean(element.x_axis ?? element.xAxis) ?? true;
  const showYAxis = readBoolean(element.y_axis ?? element.yAxis) ?? false;
  const showGrid = readBoolean(element.grid) ?? true;
  const showValues = readBoolean(element.data_labels ?? element.dataLabels) ?? false;
  const xAxisTitle =
    readString(element.x_axis_title ?? element.xAxisTitle)?.trim() ?? "";
  const yAxisTitle =
    readString(element.y_axis_title ?? element.yAxisTitle)?.trim() ?? "";
  const labelCount = Math.max(
    1,
    categories.length,
    values.length,
    ...renderDatasets.map((dataset) => dataset.values.length),
  );
  const labels = Array.from({ length: labelCount }, (_, index) =>
    categories[index] ?? `Item ${index + 1}`,
  );
  const allValues = renderDatasets.flatMap((dataset) => dataset.values);
  const maxTick = niceChartMax(
    Math.max(1, ...allValues.map((value) => Math.abs(value))),
  );
  const ticks = Array.from({ length: 5 }, (_, index) => (maxTick / 4) * index);
  const titleFontSize = clamp(height * 0.056, 9, 46);
  const subtitleFontSize = clamp(height * 0.04, 7, 30);
  const categoryFontSize = clamp(height * 0.043, 7, 32);
  const tickFontSize = clamp(height * 0.034, 6, 24);
  const valueFontSize = clamp(height * 0.026, 5, 18);
  const legendFontSize = clamp(height * 0.041, 7, 31);
  const axisTitleFontSize = clamp(height * 0.03, 6, 22);
  const lineStrokeWidth = clamp(height * 0.0042, 1, 3.5);
  const legendDotRadius = clamp(legendFontSize * 0.42, 3.5, 14);
  const yTickSpace = showYAxis ? clamp(width * 0.06, 18, 78) : 0;
  const yAxisTitleSpace = yAxisTitle ? axisTitleFontSize + 5 : 0;
  const xAxisTitleSpace = xAxisTitle ? axisTitleFontSize + 6 : 0;
  const leftPad = clamp(width * 0.13, 24, 190) + yTickSpace + yAxisTitleSpace;
  const rightPad = clamp(width * 0.13, 24, 190);
  const plotY = clamp(height * 0.22, 34, 190);
  const baselineY = height - clamp(height * 0.23, 42, 210) - xAxisTitleSpace;
  const plotW = Math.max(1, width - leftPad - rightPad);
  const plotH = Math.max(1, baselineY - plotY);
  const xLabelWidth = Math.max(
    28,
    Math.min(100, plotW / Math.max(1, labelCount - 1)),
  );
  const titleY = clamp(height * 0.07, 8, 76);
  const subtitleY = titleY + titleFontSize + 1;
  const xLabelY = baselineY + clamp(height * 0.052, 8, 46);
  const legendY = height - clamp(height * 0.08, 18, 76);
  const xForIndex = (index: number) =>
    leftPad + (labelCount <= 1 ? plotW / 2 : (index / (labelCount - 1)) * plotW);
  const yForValue = (value: number) =>
    baselineY - (value / maxTick) * plotH * 0.84;
  const areaSeries = renderDatasets.map((dataset, index) => {
    const points = labels.flatMap((_, labelIndex) => [
      xForIndex(labelIndex),
      yForValue(dataset.values[labelIndex] ?? 0),
    ]);
    const seriesColor =
      withHash(dataset.color) ??
      withHash(colors[index]) ??
      fallbackAreaColor;
    return {
      ...dataset,
      areaPoints: [leftPad, baselineY, ...points, leftPad + plotW, baselineY],
      color: seriesColor,
      points,
    };
  });
  const legendGap = clamp(width * 0.024, 8, 58);
  const legendItems = areaSeries.map((dataset) => ({
    color: dataset.color,
    label: dataset.name,
    textWidth: Math.min(
      width * 0.36,
      Math.max(36, dataset.name.length * legendFontSize * 0.62),
    ),
  }));
  const legendWidth =
    legendItems.reduce(
      (sum, item) => sum + legendDotRadius * 2 + 14 + item.textWidth,
      0,
    ) + legendGap * Math.max(0, legendItems.length - 1);
  let legendX = Math.max(0, (width - legendWidth) / 2);

  return (
    <Group listening={interactive}>
      <Rect width={width} height={height} fill="#FFFFFF" />
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

      {showGrid
        ? ticks.map((tick) => {
            const y = baselineY - (tick / maxTick) * plotH;
            return (
              <Line
                key={`grid-y-${tick}`}
                points={[leftPad, y, leftPad + plotW, y]}
                stroke={axisColor}
                strokeWidth={1}
              />
            );
          })
        : null}
      {showYAxis
        ? ticks.map((tick) => {
            const y = baselineY - (tick / maxTick) * plotH;
            return (
              <Text
                key={tick}
                x={yAxisTitleSpace}
                y={y - tickFontSize / 2}
                width={Math.max(1, yTickSpace - 18)}
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
      {showXAxis
        ? labels.map((label, index) => (
            <Text
              key={`label-${label}-${index}`}
              x={xForIndex(index) - xLabelWidth / 2}
              y={xLabelY}
              width={xLabelWidth}
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
            labels.map((_, index) => {
              const value = dataset.values[index] ?? 0;
              return (
                <Text
                  key={`value-${dataset.name}-${seriesIndex}-${index}`}
                  x={xForIndex(index) - 26}
                  y={Math.max(plotY, yForValue(value) - valueFontSize - 8)}
                  width={52}
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
      {xAxisTitle ? (
        <Text
          x={leftPad}
          y={xLabelY + (showXAxis ? categoryFontSize + 6 : 0)}
          width={plotW}
          text={xAxisTitle}
          fill="#747474"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize={axisTitleFontSize}
          fontStyle="bold"
          align="center"
        />
      ) : null}
      {yAxisTitle ? (
        <Text
          x={Math.max(0, (yAxisTitleSpace - axisTitleFontSize) / 2)}
          y={baselineY}
          width={plotH}
          text={yAxisTitle}
          fill="#747474"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize={axisTitleFontSize}
          fontStyle="bold"
          align="center"
          rotation={-90}
        />
      ) : null}

      {legendItems.map((item, index) => {
        const itemX = legendX;
        legendX += legendDotRadius * 2 + 14 + item.textWidth + legendGap;
        return (
          <Group key={`default-area-legend-${item.label}-${index}`}>
            <Circle
              x={itemX + legendDotRadius}
              y={legendY + legendDotRadius}
              radius={legendDotRadius}
              fill={item.color}
            />
            <Text
              x={itemX + legendDotRadius * 2 + 14}
              y={legendY}
              width={item.textWidth}
              text={item.label}
              fill="#747474"
              fontFamily="Georgia, Times New Roman, serif"
              fontSize={legendFontSize}
              fontStyle="bold"
              wrap="none"
            />
          </Group>
        );
      })}
    </Group>
  );
}

function RawDefaultLineChart({
  element,
  width,
  height,
  categories,
  datasets,
  values,
  colors,
  interactive,
}: {
  element: RawElement;
  width: number;
  height: number;
  categories: string[];
  datasets: RawChartDataset[];
  values: number[];
  colors: string[];
  interactive: boolean;
}) {
  const titleParts = (readString(element.title) ?? "Enrollment Over Years")
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  const title = titleParts[0] ?? "Enrollment Over Years";
  const subtitle = titleParts.slice(1).join(" ");
  const series = readArray(element.series).filter(isRecord);
  const firstSeries = asRecord(series[0]) ?? {};
  const fallbackLineColor =
    withHash(colors[0] ?? readString(element.color)) ?? "#4D20C5";
  const renderDatasets =
    datasets.length > 0
      ? datasets
      : [
          {
            color: fallbackLineColor,
            name: readString(firstSeries.name) ?? "Students Number",
            values,
          },
        ];
  const axisColor = withHash(readString(element.axis_color)) ?? "#D8D8D8";
  const labelColor =
    withHash(readString(element.data_labels_color)) ?? fallbackLineColor;
  const showXAxis = readBoolean(element.x_axis ?? element.xAxis) ?? true;
  const showYAxis = readBoolean(element.y_axis ?? element.yAxis) ?? false;
  const showGrid = readBoolean(element.grid) ?? true;
  const showValues = readBoolean(element.data_labels ?? element.dataLabels) ?? false;
  const xAxisTitle =
    readString(element.x_axis_title ?? element.xAxisTitle)?.trim() ?? "";
  const yAxisTitle =
    readString(element.y_axis_title ?? element.yAxisTitle)?.trim() ?? "";
  const labelCount = Math.max(
    1,
    categories.length,
    values.length,
    ...renderDatasets.map((dataset) => dataset.values.length),
  );
  const labels = Array.from({ length: labelCount }, (_, index) =>
    categories[index] ?? `Item ${index + 1}`,
  );
  const allValues = renderDatasets.flatMap((dataset) => dataset.values);
  const maxTick = niceChartMax(
    Math.max(1, ...allValues.map((value) => Math.abs(value))),
  );
  const ticks = Array.from({ length: 5 }, (_, index) => (maxTick / 4) * index);
  const titleFontSize = clamp(height * 0.056, 9, 46);
  const subtitleFontSize = clamp(height * 0.04, 7, 30);
  const categoryFontSize = clamp(height * 0.043, 7, 32);
  const tickFontSize = clamp(height * 0.034, 6, 24);
  const valueFontSize = clamp(height * 0.026, 5, 18);
  const legendFontSize = clamp(height * 0.041, 7, 31);
  const axisTitleFontSize = clamp(height * 0.03, 6, 22);
  const lineStrokeWidth = clamp(height * 0.0042, 1, 3.5);
  const legendDotRadius = clamp(legendFontSize * 0.42, 3.5, 14);
  const yTickSpace = showYAxis ? clamp(width * 0.06, 18, 78) : 0;
  const yAxisTitleSpace = yAxisTitle ? axisTitleFontSize + 5 : 0;
  const xAxisTitleSpace = xAxisTitle ? axisTitleFontSize + 6 : 0;
  const leftPad = clamp(width * 0.13, 24, 190) + yTickSpace + yAxisTitleSpace;
  const rightPad = clamp(width * 0.14, 24, 200);
  const plotY = clamp(height * 0.3, 38, 230);
  const baselineY = height - clamp(height * 0.19, 30, 145) - xAxisTitleSpace;
  const plotW = Math.max(1, width - leftPad - rightPad);
  const plotH = Math.max(1, baselineY - plotY);
  const xLabelWidth = Math.max(
    28,
    Math.min(100, plotW / Math.max(1, labelCount - 1)),
  );
  const titleY = clamp(height * 0.09, 8, 76);
  const subtitleY = titleY + titleFontSize + 1;
  const xLabelY = baselineY + clamp(height * 0.018, 4, 16);
  const legendY = height - clamp(height * 0.08, 18, 76);
  const xForIndex = (index: number) =>
    leftPad + (labelCount <= 1 ? plotW / 2 : (index / (labelCount - 1)) * plotW);
  const yForValue = (value: number) =>
    plotY + plotH - (value / maxTick) * plotH * 0.86;
  const lineSeries = renderDatasets.map((dataset, index) => ({
    ...dataset,
    color:
      withHash(dataset.color) ??
      withHash(colors[index]) ??
      fallbackLineColor,
    points: labels.flatMap((_, labelIndex) => [
      xForIndex(labelIndex),
      yForValue(dataset.values[labelIndex] ?? 0),
    ]),
  }));
  const legendGap = clamp(width * 0.024, 8, 58);
  const legendItems = lineSeries.map((dataset) => ({
    color: dataset.color,
    label: dataset.name,
    textWidth: Math.min(
      width * 0.36,
      Math.max(36, dataset.name.length * legendFontSize * 0.62),
    ),
  }));
  const legendWidth =
    legendItems.reduce(
      (sum, item) => sum + legendDotRadius * 2 + 14 + item.textWidth,
      0,
    ) + legendGap * Math.max(0, legendItems.length - 1);
  let legendX = Math.max(0, (width - legendWidth) / 2);

  return (
    <Group listening={interactive}>
      <Rect width={width} height={height} fill="#FFFFFF" />
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

      {showGrid
        ? labels.map((label, index) => {
            const x = xForIndex(index);
            return (
              <Line
                key={`grid-x-${label}-${index}`}
                points={[x, plotY, x, baselineY]}
                stroke={axisColor}
                strokeWidth={1}
              />
            );
          })
        : null}
      {showYAxis
        ? ticks.map((tick) => {
            const y = yForValue(tick);
            return (
              <Text
                key={tick}
                x={yAxisTitleSpace}
                y={y - tickFontSize / 2}
                width={Math.max(1, yTickSpace - 18)}
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
      {showXAxis
        ? labels.map((label, index) => (
            <Text
              key={`label-${label}-${index}`}
              x={xForIndex(index) - xLabelWidth / 2}
              y={xLabelY}
              width={xLabelWidth}
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
            labels.map((_, index) => {
              const value = dataset.values[index] ?? 0;
              return (
                <Text
                  key={`value-${dataset.name}-${seriesIndex}-${index}`}
                  x={xForIndex(index) - 26}
                  y={Math.max(plotY, yForValue(value) - valueFontSize - 8)}
                  width={52}
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
      {xAxisTitle ? (
        <Text
          x={leftPad}
          y={xLabelY + (showXAxis ? categoryFontSize + 6 : 0)}
          width={plotW}
          text={xAxisTitle}
          fill="#747474"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize={axisTitleFontSize}
          fontStyle="bold"
          align="center"
        />
      ) : null}
      {yAxisTitle ? (
        <Text
          x={Math.max(0, (yAxisTitleSpace - axisTitleFontSize) / 2)}
          y={baselineY}
          width={plotH}
          text={yAxisTitle}
          fill="#747474"
          fontFamily="Georgia, Times New Roman, serif"
          fontSize={axisTitleFontSize}
          fontStyle="bold"
          align="center"
          rotation={-90}
        />
      ) : null}

      {legendItems.map((item, index) => {
        const itemX = legendX;
        legendX += legendDotRadius * 2 + 14 + item.textWidth + legendGap;
        return (
          <Group key={`default-line-legend-${item.label}-${index}`}>
            <Circle
              x={itemX + legendDotRadius}
              y={legendY + legendDotRadius}
              radius={legendDotRadius}
              fill={item.color}
            />
            <Text
              x={itemX + legendDotRadius * 2 + 14}
              y={legendY}
              width={item.textWidth}
              text={item.label}
              fill="#747474"
              fontFamily="Georgia, Times New Roman, serif"
              fontSize={legendFontSize}
              fontStyle="bold"
              wrap="none"
            />
          </Group>
        );
      })}
    </Group>
  );
}

function rawChartDatasets(
  element: RawElement,
  categories: string[],
  colors: string[],
): RawChartDataset[] {
  const rawSeries = readArray(element.series).filter(isRecord);
  const seriesLength = Math.max(
    categories.length,
    ...rawSeries.map(
      (item) => readArray(item.values ?? item.data).length,
    ),
  );
  const normalizedLength = Math.max(1, seriesLength);

  return rawSeries.map((item, index) => {
    const values = readArray(item.values ?? item.data).map(
      (value) => readNumber(value) ?? 0,
    );
    return {
      color: colors[index] ?? colors[0] ?? "7C51F8",
      name: readString(item.name) ?? `Series ${index + 1}`,
      values: normalizeRawSeriesValues(values, normalizedLength),
    };
  });
}

function rawChartCategories(
  categories: string[],
  datasets: RawChartDataset[],
): string[] {
  if (categories.length > 0) return categories;
  const length = Math.max(
    1,
    ...datasets.map((dataset) => dataset.values.length),
  );
  return Array.from({ length }, (_, index) => `Item ${index + 1}`);
}

function normalizeRawSeriesValues(values: number[], length: number) {
  const clipped = values.slice(0, length);
  if (clipped.length >= length) return clipped;
  return [
    ...clipped,
    ...Array.from({ length: length - clipped.length }, () => 0),
  ];
}

export function rawChartType(value: unknown): ChartType {
  switch (readString(value)) {
    case "area":
      return "area";
    case "line":
      return "line";
    case "pie":
      return "pie";
    case "donut":
      return "donut";
    default:
      return "bar";
  }
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

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(asRecord(value));
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function withHash(value: string | null | undefined) {
  if (!value) return undefined;
  return value.startsWith("#") || value.startsWith("rgb") ? value : `#${value}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
