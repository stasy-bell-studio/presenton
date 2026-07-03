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

export type ChartColorTargetMode = "point" | "series";

export type ChartColorTarget = {
  color: string;
  index: number;
  label: string;
  mode: ChartColorTargetMode;
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

export const CHART_THEME_COLORS = [
  "FF3B3B",
  "FF7417",
  "FFC20A",
  "5B5FF4",
  "EC4899",
];

export const CHART_SYSTEM_COLORS = [
  "000000",
  "303030",
  "666666",
  "A3A3A3",
  "E5E7EB",
  "FFFFFF",
  "38BDF8",
  "FACC15",
  "EC4899",
  "FB7185",
  "A855F7",
  "22C55E",
  "06B6D4",
  "F59E0B",
  "EF4444",
  "4F46E5",
  "7F22FE",
  "64748B",
];

export function resolvedChartCategories(element: ChartElement): string[] {
  if (element.categories && element.categories.length > 0) {
    return element.categories.slice(0, 24);
  }

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
  if (element.chart_type !== "pie" && element.chart_type !== "donut") {
    return (
      element.series_colors?.[0] ??
      element.color ??
      DEFAULT_CHART_COLORS[0]
    );
  }

  return (
    element.series_colors?.[index] ??
    (index === 0 ? element.color : null) ??
    DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length]
  );
}

export function normalizeChartColor(
  color: string | null | undefined,
  fallback = DEFAULT_CHART_COLORS[0],
) {
  const value = (color ?? fallback).trim().replace(/^#/, "");
  if (/^[0-9A-Fa-f]{6}$/.test(value)) return value.toUpperCase();
  if (/^[0-9A-Fa-f]{3}$/.test(value)) {
    return value
      .split("")
      .map((part) => `${part}${part}`)
      .join("")
      .toUpperCase();
  }
  return fallback;
}

export function chartColorTargetMode(
  element: ChartElement,
): ChartColorTargetMode {
  if (element.chart_type === "pie" || element.chart_type === "donut") {
    return "point";
  }
  return "series";
}

export function resolvedChartColorTargets(
  element: ChartElement,
): ChartColorTarget[] {
  const mode = chartColorTargetMode(element);
  if (mode === "series") {
    return [
      {
        color: normalizeChartColor(chartSeriesColor(element, 0)),
        index: 0,
        label: "Chart color",
        mode,
      },
    ];
  }

  if (mode === "point") {
    const categories = resolvedChartCategories(element);
    const pointCount = Math.min(
      12,
      Math.max(
        1,
        categories.length,
        element.data.length,
        element.series?.[0]?.values.length ?? 0,
      ),
    );
    return Array.from({ length: pointCount }, (_, index) => ({
      color: normalizeChartColor(chartSeriesColor(element, index)),
      index,
      label:
        categories[index] ??
        element.data[index]?.label ??
        `Item ${index + 1}`,
      mode,
    }));
  }

  return [];
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

export function chartDataFromSeriesWithColors(
  categories: string[],
  series: ChartSeries[],
  colors: string[],
  pointColors = false,
): ChartDatum[] {
  const first = series[0];
  if (!first) return [];
  const labels =
    categories.length > 0
      ? categories
      : first.values.map((_, index) => `Item ${index + 1}`);
  const fallbackColor = colors[0] ?? DEFAULT_CHART_COLORS[0];

  return labels.slice(0, 8).map((label, index) => ({
    label,
    value: first.values[index] ?? 0,
    color: pointColors ? colors[index] ?? fallbackColor : fallbackColor,
  }));
}

export function updateChartColorTarget(
  element: ChartElement,
  targetIndex: number,
  color: string,
): ChartElement {
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= 12) {
    return element;
  }

  const mode = chartColorTargetMode(element);
  const targets = resolvedChartColorTargets(element);
  const colorCount =
    mode === "point"
      ? Math.min(12, Math.max(targetIndex + 1, targets.length))
      : 1;
  const seriesColors = Array.from({ length: colorCount }, (_, index) =>
    normalizeChartColor(
      element.series_colors?.[index] ??
        (index === 0 ? element.color : null) ??
        DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length],
    ),
  );
  seriesColors[mode === "point" ? targetIndex : 0] = normalizeChartColor(color);

  const primaryColor = seriesColors[0] ?? normalizeChartColor(color);
  const data = chartDataFromSeriesWithColors(
    resolvedChartCategories(element),
    element.series ?? [],
    seriesColors,
    mode === "point",
  );
  const nextData =
    data.length > 0
      ? data
      : element.data.map((datum, index) => ({
          ...datum,
          color:
            mode === "point"
              ? seriesColors[index] ?? primaryColor
              : primaryColor,
        }));

  return {
    ...element,
    color: primaryColor,
    data: nextData,
    series_colors: seriesColors,
  };
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
