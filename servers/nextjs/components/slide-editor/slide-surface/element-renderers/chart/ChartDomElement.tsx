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
import type { ChartDataset, Plugin } from "chart.js";
import { useEffect, useMemo, useRef } from "react";
import type { ChartElement as ChartEl } from "../../../lib/slide-schema";
import type { ResolvedLayoutItem } from "../../../lib/layout-resolver";
import { isRootPath } from "../../../lib/element-path";
import { PX_PER_IN, withHash } from "../../../editorUtils";
import {
  chartPointColor,
  resolvedChartCategories,
  resolvedChartDatasets,
} from "../../../lib/chart-data";
import { renderMarkdownTextContent } from "../../../lib/markdown-text";
import { DomElementLayer, elementBoxStyle } from "../shared";
import type { SurfaceInteractionTarget } from "../../konva/types";

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
}: {
  activeSurfaceInteraction?: SurfaceInteractionTarget;
  items: ResolvedLayoutItem[];
  scale: number;
}) {
  return (
    <DomElementLayer>
      {items.map((item) =>
        item.element.type === "chart" ? (
          <ChartCanvas
            key={item.path}
            element={item.element}
            overlay={overlayForItem(item, activeSurfaceInteraction)}
            scale={scale}
          />
        ) : null,
      )}
    </DomElementLayer>
  );
}

function ChartCanvas({
  element,
  overlay,
  scale,
}: {
  element: ChartEl;
  overlay?: {
    frame?: {
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
    };
    offset?: { x: number; y: number };
  };
  scale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    Chart.getChart(canvas)?.destroy();

    const isArea = element.chartType === "area";
    const isPie = element.chartType === "pie";
    const isDonut = element.chartType === "donut";
    const isCircular = isPie || isDonut;
    const showDataLabels = element.showValues ?? element.dataLabels ?? false;
    const chartType: SupportedChartJsType =
      element.chartType === "donut"
        ? "doughnut"
        : isPie
          ? "pie"
          : element.chartType === "line" || isArea
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
              borderRadius: element.chartType === "bar" ? 4 : 0,
              borderWidth: element.chartType === "line" || isArea ? 2 : 1,
              fill: isArea ? index === 0 ? "origin" : false : false,
              pointBackgroundColor: color,
              pointBorderColor: "#ffffff",
              pointRadius: element.chartType === "line" || isArea ? 3 : 0,
              tension: element.chartType === "line" || isArea ? 0.28 : 0,
            };
          })
    ) as ChartDataset<SupportedChartJsType, number[]>[];

    const extraPlugins: Plugin<SupportedChartJsType>[] = [];
    if (showDataLabels && !isCircular) {
      extraPlugins.push(valueLabelsPlugin(withHash(element.labelColor ?? "6A7894")));
    }
    if (isDonut) {
      extraPlugins.push(
        donutCenterLabelPlugin(
          centerDonutValue(pieDataset.values),
          withHash(element.labelColor ?? "172033"),
        ),
      );
    }

    const chart = new Chart(canvas, {
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
              color: withHash(element.labelColor ?? "6A7894"),
              font: { family: "Arial, Helvetica, sans-serif", size: 10 },
            },
          },
          title: {
            display: Boolean(title),
            align: "start",
            color: withHash(element.labelColor ?? "6A7894"),
            font: {
              family: "Arial, Helvetica, sans-serif",
              size: 12,
              weight: "bold",
            },
            padding: { bottom: 8 },
            text: title,
          },
          tooltip: { enabled: false },
        },
        layout: {
          padding: isCircular ? 12 : 4,
        },
        scales: isCircular
          ? undefined
          : {
              x: {
                display: element.xAxis ?? true,
                border: { color: withHash(element.axisColor ?? "9AA7BD") },
                grid: { display: false },
                title: {
                  display: Boolean(element.xAxisTitle),
                  text: element.xAxisTitle ?? "",
                  color: withHash(element.labelColor ?? "6A7894"),
                },
                ticks: {
                  color: withHash(element.labelColor ?? "6A7894"),
                  font: { family: "Arial, Helvetica, sans-serif", size: 10 },
                  maxRotation: 0,
                },
              },
              y: {
                display: element.yAxis ?? true,
                beginAtZero: true,
                border: { color: withHash(element.axisColor ?? "9AA7BD") },
                grid: {
                  display: element.grid ?? true,
                  color: `${withHash(element.axisColor ?? "9AA7BD")}55`,
                  tickBorderDash: [3, 3],
                },
                title: {
                  display: Boolean(element.yAxisTitle),
                  text: element.yAxisTitle ?? "",
                  color: withHash(element.labelColor ?? "6A7894"),
                },
                ticks: {
                  color: withHash(element.labelColor ?? "6A7894"),
                  font: { family: "Arial, Helvetica, sans-serif", size: 10 },
                },
              },
            },
      },
      plugins: extraPlugins,
    });

    return () => chart.destroy();
  }, [element, labels, resolvedDatasets, title]);

  const style = elementBoxStyle(element, scale);
  if (overlay?.frame) {
    style.left = overlay.frame.x;
    style.top = overlay.frame.y;
    style.width = overlay.frame.width;
    style.height = overlay.frame.height;
    style.transform = overlay.frame.rotation
      ? `rotate(${overlay.frame.rotation}deg)`
      : undefined;
  } else if (overlay?.offset) {
    style.left = Number(style.left ?? 0) + overlay.offset.x;
    style.top = Number(style.top ?? 0) + overlay.offset.y;
  }

  return (
    <div
      style={{
        ...style,
        overflow: "hidden",
        padding:
          element.chartType === "pie" || element.chartType === "donut"
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
}

function overlayForItem(
  item: ResolvedLayoutItem,
  interaction?: SurfaceInteractionTarget,
) {
  if (!interaction?.overlayOffset && !interaction?.overlayFrame) {
    return undefined;
  }
  if (!isRootPath(interaction.path)) {
    return item.sourcePath === interaction.path
      ? {
          frame: interaction.overlayFrame,
          offset: interaction.overlayOffset,
        }
      : undefined;
  }
  return interaction.rootIndexes.includes(item.rootIndex)
    ? {
        frame: interaction.overlayFrame,
        offset: interaction.overlayOffset,
      }
    : undefined;
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

function valueLabelsPlugin(color: string): Plugin<SupportedChartJsType> {
  return {
    id: "slide-editor-chart-value-labels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.fillStyle = color;
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
}

function donutCenterLabelPlugin(
  value: string,
  color: string,
): Plugin<SupportedChartJsType> {
  return {
    id: "slide-editor-chart-donut-center-label",
    afterDatasetsDraw(chart) {
      if (!value) return;

      const { ctx, chartArea } = chart;
      if (!chartArea) return;

      const x = (chartArea.left + chartArea.right) / 2;
      const y = (chartArea.top + chartArea.bottom) / 2;

      ctx.save();
      ctx.fillStyle = color;
      ctx.font = "700 22px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(value, x, y);
      ctx.restore();
    },
  };
}
