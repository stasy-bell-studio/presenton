import type {
  ChartElement,
  ChartSeries,
} from "@/components/slide-editor/types";
import { rawChartType } from "@/components/slide-editor/charts/chart-data";
import {
  readArray,
  readNumber,
  readString,
  type RawElement,
  type UnknownRecord,
} from "@/components/slide-editor/model/core";

export function rawChartToEditorChart(element: RawElement): ChartElement {
  const categories = readArray(element.categories).map(String);
  const series = readArray(element.series)
    .map((value, index): ChartSeries | null => {
      const record =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as UnknownRecord)
          : null;
      if (!record) return null;
      const values = readArray(record.values ?? record.data).map(
        (item) => readNumber(item) ?? 0,
      );
      return {
        name: readString(record.name) ?? `Series ${index + 1}`,
        values,
      };
    })
    .filter((value): value is ChartSeries => value != null);
  const chartType = rawChartType(element.chart_type ?? element.chartType);
  const supportedSeries =
    chartType === "pie" || chartType === "donut" ? series.slice(0, 1) : series;
  const normalizedSeries =
    supportedSeries.length > 0
      ? supportedSeries
      : [{ name: "Series 1", values: [0] }];
  const categoryLength = Math.max(
    categories.length,
    ...normalizedSeries.map((item) => item.values.length),
  );
  const normalizedCategories =
    categories.length > 0
      ? Array.from(
          { length: categoryLength },
          (_, index) => categories[index] ?? `Item ${index + 1}`,
        )
      : Array.from({ length: categoryLength }, (_, index) => `Item ${index + 1}`);
  const colors = readArray(element.colors).map(String);
  const chartColors =
    colors.length > 0 ? colors : [readString(element.color) ?? "7C51F8"];
  const firstSeries = normalizedSeries[0];
  const data = normalizedCategories.slice(0, 8).map((label, index) => ({
    label,
    value: firstSeries.values[index] ?? 0,
    color: normalizedSeries.length === 1
      ? chartColors[index % chartColors.length] ?? chartColors[0]
      : chartColors[0],
  }));

  return {
    ...withoutRemovedChartFields(element),
    type: "chart",
    chart_type: chartType,
    data: data.length > 0 ? data : [{ label: "Item 1", value: 0 }],
    categories: normalizedCategories,
    series: normalizedSeries,
    colors: chartColors,
    axis_color: element.axis_color ?? element.axisColor,
    grid_color: element.grid_color ?? element.gridColor,
    x_axis: element.x_axis ?? element.xAxis,
    y_axis: element.y_axis ?? element.yAxis,
    x_axis_grid: element.x_axis_grid ?? element.xAxisGrid,
    y_axis_grid: element.y_axis_grid ?? element.yAxisGrid,
    x_axis_title: element.x_axis_title ?? element.xAxisTitle,
    y_axis_title: element.y_axis_title ?? element.yAxisTitle,
    data_labels: element.data_labels ?? element.dataLabels,
    legend: element.legend ?? element.showLegend,
  };
}

export function editorChartToRawChart(source: RawElement, chart: UnknownRecord) {
  return {
    ...withoutRemovedChartFields(source),
    ...withoutRemovedChartFields(chart),
    type: "chart",
    position: source.position,
    size: source.size,
    rotation: source.rotation,
    layout: source.layout,
    chart_type: chart.chart_type ?? chart.chartType ?? source.chart_type,
    colors: chart.colors ?? source.colors,
    axis_color: chart.axis_color ?? chart.axisColor ?? source.axis_color,
    grid_color: chart.grid_color ?? chart.gridColor ?? source.grid_color,
    x_axis: chart.x_axis ?? chart.xAxis ?? source.x_axis,
    y_axis: chart.y_axis ?? chart.yAxis ?? source.y_axis,
    x_axis_grid:
      chart.x_axis_grid ??
      chart.xAxisGrid ??
      source.x_axis_grid ??
      source.xAxisGrid,
    y_axis_grid:
      chart.y_axis_grid ??
      chart.yAxisGrid ??
      source.y_axis_grid ??
      source.yAxisGrid,
    x_axis_title: hasOwn(chart, "x_axis_title")
      ? chart.x_axis_title
      : chart.xAxisTitle ?? source.x_axis_title ?? source.xAxisTitle,
    y_axis_title: hasOwn(chart, "y_axis_title")
      ? chart.y_axis_title
      : chart.yAxisTitle ?? source.y_axis_title ?? source.yAxisTitle,
    data_labels: chart.data_labels ?? chart.dataLabels ?? source.data_labels,
    legend:
      chart.legend ??
      chart.showLegend ??
      source.legend ??
      source.showLegend,
  };
}

function withoutRemovedChartFields(element: UnknownRecord) {
  const sanitized = { ...element };
  delete sanitized.data_labels_color;
  delete sanitized.dataLabelsColor;
  delete sanitized.labelColor;
  delete sanitized.grid;
  delete sanitized.axisColor;
  delete sanitized.chartType;
  delete sanitized.dataLabels;
  delete sanitized.gridColor;
  delete sanitized.showLegend;
  delete sanitized.xAxis;
  delete sanitized.xAxisGrid;
  delete sanitized.xAxisTitle;
  delete sanitized.yAxis;
  delete sanitized.yAxisGrid;
  delete sanitized.yAxisTitle;
  return sanitized;
}

function hasOwn(record: UnknownRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}
