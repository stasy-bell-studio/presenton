import type {
  ChartDatum,
  ChartElement,
  ChartSeries,
} from "./slide-schema";

export type ResolvedChartDataset = {
  name: string;
  values: number[];
  color: string;
};

export const DEFAULT_CHART_COLORS = [
  "7F22FE",
  "155DFC",
  "F59E0B",
  "12B76A",
  "EF4444",
  "06B6D4",
  "8B5CF6",
  "64748B",
];

export function resolvedChartCategories(element: ChartElement): string[] {
  const categories = (element.categories ?? [])
    .map((category) => category.trim())
    .filter(Boolean)
    .slice(0, 24);
  if (categories.length > 0) return categories;

  const seriesLength = Math.max(
    0,
    ...(element.series ?? []).map((series) => series.values.length),
  );
  if (seriesLength > 0) {
    return Array.from({ length: seriesLength }, (_, index) => `Item ${index + 1}`);
  }

  return [];
}

export function resolvedChartDatasets(
  element: ChartElement,
): ResolvedChartDataset[] {
  const categories = resolvedChartCategories(element);
  const series = (element.series ?? []).slice(0, 12);
  if (series.length > 0) {
    return series.map((item, index) => ({
      name: item.name,
      values: normalizeSeriesValues(item, categories.length),
      color: chartSeriesColor(element, index),
    }));
  }

  return [];
}

export function primaryChartData(element: ChartElement): ChartDatum[] {
  const categories = resolvedChartCategories(element);
  const first = resolvedChartDatasets(element)[0];
  if (!first) return [];
  return categories.slice(0, Math.max(1, first.values.length)).map((label, index) => ({
    label,
    value: first.values[index] ?? 0,
    color: chartSeriesColor(element, index),
  }));
}

export function chartSeriesColor(element: ChartElement, index: number) {
  return (
    element.series_colors?.[index] ??
    (index === 0 ? element.color : null) ??
    DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length]
  );
}

export function chartPointColor(element: ChartElement, index: number) {
  return (
    element.series_colors?.[index] ??
    DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length]
  );
}

export function chartDataFromSeries(
  categories: string[],
  series: ChartSeries[],
  fallbackColor?: string | null,
): ChartDatum[] {
  const first = series[0];
  if (!first) return [];
  const labels =
    categories.length > 0
      ? categories
      : first.values.map((_, index) => `Item ${index + 1}`);

  return labels.slice(0, 8).map((label, index) => ({
    label,
    value: first.values[index] ?? 0,
    color: fallbackColor ?? undefined,
  }));
}

export function chartDataToCsv(element: ChartElement) {
  const categories = resolvedChartCategories(element);
  const datasets = resolvedChartDatasets(element);
  const rows = [
    ["", ...datasets.map((dataset) => dataset.name)],
    ...categories.map((category, index) => [
      category,
      ...datasets.map((dataset) => String(dataset.values[index] ?? 0)),
    ]),
  ];

  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function normalizeSeriesValues(series: ChartSeries, length: number) {
  const values = series.values.slice(0, Math.max(1, length || series.values.length));
  if (length <= values.length) return values;
  return [...values, ...Array.from({ length: length - values.length }, () => 0)];
}

function escapeCsvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
