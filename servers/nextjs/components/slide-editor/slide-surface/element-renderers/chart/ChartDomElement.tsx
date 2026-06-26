import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PieController,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import type { ChartConfiguration, ChartDataset, Plugin } from "chart.js";
import { memo, useEffect, useMemo, useRef } from "react";
import type { ChartElement as ChartEl } from "../../../lib/slide-schema";
import type { ResolvedLayoutItem } from "../../../lib/layout-resolver";
import { PX_PER_IN, withHash } from "../../../editorUtils";
import {
  chartPointColor,
  resolvedChartCategories,
  resolvedChartDatasets,
} from "../../../lib/chart-data";
import { renderMarkdownTextContent } from "../../../lib/markdown-text";
import { DomElementLayer, elementBoxStyle } from "../shared";
import type {
  SurfaceInteractionPreview,
  SurfaceInteractionTarget,
} from "../../konva/types";

type SupportedChartJsType = "bar" | "line" | "pie" | "doughnut";

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PieController,
  PointElement,
  Title,
  Tooltip,
);

export function ChartDomElement({
  activeSurfaceInteraction,
  items,
  scale,
  surfaceId,
}: {
  activeSurfaceInteraction?: SurfaceInteractionTarget;
  items: ResolvedLayoutItem[];
  scale: number;
  surfaceId?: string;
}) {
  return (
    <DomElementLayer>
      {items.map((item) =>
        item.element.type === "chart" ? (
          <ChartCanvas
            key={item.path}
            element={item.element}
            path={item.sourcePath}
            preview={previewForItem(item, activeSurfaceInteraction)}
            scale={scale}
            surfaceId={surfaceId}
          />
        ) : null,
      )}
    </DomElementLayer>
  );
}

type ChartRenderConfig = ChartConfiguration<
  SupportedChartJsType,
  number[],
  string
>;

type ChartCanvasProps = {
  element: ChartEl;
  path: string;
  preview?: SurfaceInteractionPreview;
  scale: number;
  surfaceId?: string;
};

const ChartCanvas = memo(function ChartCanvas({
  element,
  path,
  preview,
  scale,
  surfaceId,
}: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<SupportedChartJsType> | null>(null);
  const chartTypeRef = useRef<SupportedChartJsType | null>(null);
  const labels = useMemo(
    () => resolvedChartCategories(element).map(markdownText),
    [element],
  );
  const resolvedDatasets = useMemo(
    () =>
      resolvedChartDatasets(element).map((dataset) => ({
        ...dataset,
        name: markdownText(dataset.name),
      })),
    [element],
  );
  const title = useMemo(() => markdownText(element.title), [element.title]);
  const chartConfig = useMemo(
    () => buildChartConfig(element, labels, resolvedDatasets, title),
    [element, labels, resolvedDatasets, title],
  );

  useEffect(
    () => () => {
      chartRef.current?.destroy();
      chartRef.current = null;
      chartTypeRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const currentChart = chartRef.current;
    if (!currentChart || chartTypeRef.current !== chartConfig.type) {
      currentChart?.destroy();
      chartRef.current = new Chart(canvas, chartConfig);
      chartTypeRef.current = chartConfig.type;
      return;
    }

    currentChart.data.labels = chartConfig.data.labels;
    currentChart.data.datasets = chartConfig.data.datasets;
    currentChart.options = chartConfig.options ?? {};
    currentChart.update("none");
  }, [chartConfig]);

  const style = preview
    ? {
        ...elementBoxStyle(element, scale),
        height: preview.height * scale,
        left: preview.x * scale,
        top: preview.y * scale,
        transform: preview.rotation
          ? `rotate(${preview.rotation}deg)`
          : undefined,
        transformOrigin: "top left",
        width: preview.width * scale,
      }
    : elementBoxStyle(element, scale);

  return (
    <div
      data-slide-chart-path={path}
      data-slide-surface-id={surfaceId}
      style={{
        ...style,
        overflow: "hidden",
        padding:
          element.chart_type === "pie" || element.chart_type === "donut"
            ? 0
            : 4 * (scale / PX_PER_IN),
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", height: "100%", width: "100%" }}
      />
    </div>
  );
}, areChartCanvasPropsEqual);
ChartCanvas.displayName = "ChartCanvas";

function buildChartConfig(
  element: ChartEl,
  labels: string[],
  resolvedDatasets: Array<{
    color: string;
    name: string;
    values: number[];
  }>,
  title: string,
): ChartRenderConfig {
    const isArea = element.chart_type === "area";
    const isPie = element.chart_type === "pie";
    const isDonut = element.chart_type === "donut";
    const isCircular = isPie || isDonut;
    const showDataLabels = element.data_labels ?? element.data_labels ?? false;
    const chartType: SupportedChartJsType =
      element.chart_type === "donut"
        ? "doughnut"
        : isPie
          ? "pie"
          : element.chart_type === "line" || isArea
            ? "line"
            : "bar";
    const pieDataset = resolvedDatasets[0] ?? {
      name: title || "Series",
      values: [],
      color: element.color ?? "D4A24C",
    };
    const pieColors = labels.map((_, index) =>
      withHash(chartPointColor(element, index)),
    );
    const datasets = (
      isCircular
        ? [
            {
              label: pieDataset.name,
              data: pieDataset.values,
              backgroundColor: pieColors,
              borderColor: "#ffffff",
              borderWidth: 0,
              hoverOffset: 0,
            },
          ]
        : resolvedDatasets.map((dataset, index) => {
            const color = withHash(dataset.color);
            return {
              label: dataset.name,
              data: dataset.values,
              backgroundColor: isArea
                ? `${color}33`
                : resolvedDatasets.length === 1
                  ? dataset.values.map((_, valueIndex) =>
                      withHash(chartPointColor(element, valueIndex)),
                    )
                  : color,
              borderColor: color,
              borderRadius: element.chart_type === "bar" ? 4 : 0,
              borderWidth: element.chart_type === "line" || isArea ? 2 : 1,
              fill: isArea ? index === 0 ? "origin" : false : false,
              pointBackgroundColor: color,
              pointBorderColor: "#ffffff",
              pointRadius: element.chart_type === "line" || isArea ? 3 : 0,
              tension: element.chart_type === "line" || isArea ? 0.28 : 0,
            };
          })
    ) as ChartDataset<SupportedChartJsType, number[]>[];

    return {
      type: chartType,
      data: {
        labels,
        datasets,
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        responsive: true,
        plugins: {
          legend: {
            display: isCircular ? labels.length > 1 : resolvedDatasets.length > 1,
            position: "right",
            labels: {
              boxWidth: 8,
              color: withHash(element.data_labels_color ?? "6A7894"),
              font: { family: "Arial, Helvetica, sans-serif", size: 10 },
            },
          },
          title: {
            display: Boolean(title),
            align: "start",
            color: withHash(element.data_labels_color ?? "6A7894"),
            font: {
              family: "Arial, Helvetica, sans-serif",
              size: 12,
              weight: "bold",
            },
            padding: { bottom: 8 },
            text: title,
          },
          tooltip: { enabled: false },
          "slide-editor-chart-value-labels": {
            enabled: showDataLabels && !isCircular,
            color: withHash(element.data_labels_color ?? "6A7894"),
          },
          "slide-editor-chart-donut-center-label": {
            enabled: isDonut,
            color: withHash(element.data_labels_color ?? "172033"),
            value: centerDonutValue(pieDataset.values),
          },
        } as NonNullable<ChartRenderConfig["options"]>["plugins"],
        layout: {
          padding: isCircular ? 12 : 4,
        },
        scales: isCircular
          ? undefined
          : {
              x: {
                display: element.x_axis ?? true,
                border: { color: withHash(element.axis_color ?? "9AA7BD") },
                grid: { display: false },
                title: {
                  display: Boolean(element.x_axis_title),
                  text: element.x_axis_title ?? "",
                  color: withHash(element.data_labels_color ?? "6A7894"),
                },
                ticks: {
                  color: withHash(element.data_labels_color ?? "6A7894"),
                  font: { family: "Arial, Helvetica, sans-serif", size: 10 },
                  maxRotation: 0,
                },
              },
              y: {
                display: element.y_axis ?? true,
                beginAtZero: true,
                border: { color: withHash(element.axis_color ?? "9AA7BD") },
                grid: {
                  display: element.grid ?? true,
                  color: `${withHash(element.axis_color ?? "9AA7BD")}55`,
                  tickBorderDash: [3, 3],
                },
                title: {
                  display: Boolean(element.y_axis_title),
                  text: element.y_axis_title ?? "",
                  color: withHash(element.data_labels_color ?? "6A7894"),
                },
                ticks: {
                  color: withHash(element.data_labels_color ?? "6A7894"),
                  font: { family: "Arial, Helvetica, sans-serif", size: 10 },
                },
              },
            },
      },
      plugins: CHART_PLUGINS,
    } satisfies ChartRenderConfig;
}

function previewForItem(
  item: ResolvedLayoutItem,
  target?: SurfaceInteractionTarget,
) {
  if (!target?.preview) return undefined;
  return target.path === item.sourcePath || target.path === item.path
    ? target.preview
    : undefined;
}

function areChartCanvasPropsEqual(
  previous: ChartCanvasProps,
  next: ChartCanvasProps,
) {
  return (
    previous.element === next.element &&
    previous.path === next.path &&
    previous.scale === next.scale &&
    previous.surfaceId === next.surfaceId &&
    previewEquals(previous.preview, next.preview)
  );
}

function previewEquals(
  previous?: SurfaceInteractionPreview,
  next?: SurfaceInteractionPreview,
) {
  if (previous === next) return true;
  if (!previous || !next) return false;
  return (
    previous.x === next.x &&
    previous.y === next.y &&
    previous.width === next.width &&
    previous.height === next.height &&
    previous.rotation === next.rotation
  );
}

function markdownText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? renderMarkdownTextContent([{ text }]) : "";
}

function centerDonutValue(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (values.length === 1) return formatChartNumber(values[0] ?? 0);
  return formatChartNumber(total);
}

function formatChartNumber(value: number) {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

type ValueLabelsPluginOptions = {
  color?: string;
  enabled?: boolean;
};

const valueLabelsPlugin: Plugin<SupportedChartJsType> = {
  id: "slide-editor-chart-value-labels",
  afterDatasetsDraw(chart) {
    const options = pluginOptions<ValueLabelsPluginOptions>(
      chart,
      "slide-editor-chart-value-labels",
    );
    if (!options.enabled) return;

    const { ctx } = chart;
    ctx.save();
    ctx.fillStyle = options.color ?? "#6A7894";
    ctx.font = "600 10px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;

      meta.data.forEach((point, pointIndex) => {
        const value = Array.isArray(dataset.data)
          ? Number(dataset.data[pointIndex])
          : Number.NaN;
        if (!Number.isFinite(value)) return;

        const position = point.tooltipPosition(true);
        if (position.x == null || position.y == null) return;
        ctx.fillText(String(value), position.x, position.y - 6);
      });
    });

    ctx.restore();
  },
};

type DonutCenterLabelPluginOptions = {
  color?: string;
  enabled?: boolean;
  value?: string;
};

const donutCenterLabelPlugin: Plugin<SupportedChartJsType> = {
  id: "slide-editor-chart-donut-center-label",
  afterDatasetsDraw(chart) {
    const options = pluginOptions<DonutCenterLabelPluginOptions>(
      chart,
      "slide-editor-chart-donut-center-label",
    );
    if (!options.enabled || !options.value) return;

    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    const x = (chartArea.left + chartArea.right) / 2;
    const y = (chartArea.top + chartArea.bottom) / 2;

    ctx.save();
    ctx.fillStyle = options.color ?? "#172033";
    ctx.font = "700 22px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(options.value, x, y);
    ctx.restore();
  },
};

const CHART_PLUGINS: Plugin<SupportedChartJsType>[] = [
  valueLabelsPlugin,
  donutCenterLabelPlugin,
];

function pluginOptions<T extends Record<string, unknown>>(
  chart: Chart<SupportedChartJsType>,
  id: string,
) {
  return ((chart.options.plugins as Record<string, unknown> | undefined)?.[id] ??
    {}) as T;
}
