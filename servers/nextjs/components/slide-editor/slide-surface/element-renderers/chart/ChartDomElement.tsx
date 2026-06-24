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
import { PX_PER_IN, withHash } from "../../../editorUtils";
import {
  chartPointColor,
  resolvedChartCategories,
  resolvedChartDatasets,
} from "../../../lib/chart-data";
import { DomElementLayer, elementBoxStyle } from "../shared";

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
  items,
  scale,
}: {
  items: ResolvedLayoutItem[];
  scale: number;
}) {
  return (
    <DomElementLayer>
      {items.map((item) =>
        item.element.type === "chart" ? (
          <ChartCanvas key={item.path} element={item.element} scale={scale} />
        ) : null,
      )}
    </DomElementLayer>
  );
}

function ChartCanvas({ element, scale }: { element: ChartEl; scale: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const labels = useMemo(() => resolvedChartCategories(element), [element]);
  const resolvedDatasets = useMemo(
    () => resolvedChartDatasets(element),
    [element],
  );

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
      name: element.title ?? "Series",
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
            display: !isCircular && resolvedDatasets.length > 1,
            position: "right",
            labels: {
              boxWidth: 8,
              color: withHash(element.labelColor ?? "6A7894"),
              font: { family: "Arial, Helvetica, sans-serif", size: 10 },
            },
          },
          title: {
            display: Boolean(element.title),
            align: "start",
            color: withHash(element.labelColor ?? "6A7894"),
            font: {
              family: "Arial, Helvetica, sans-serif",
              size: 12,
              weight: "bold",
            },
            padding: { bottom: 8 },
            text: element.title ?? "",
          },
          tooltip: { enabled: false },
        },
        layout: {
          padding: isCircular ? 0 : 4,
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
      plugins: showDataLabels
        ? [valueLabelsPlugin(withHash(element.labelColor ?? "6A7894"))]
        : [],
    });

    return () => chart.destroy();
  }, [element, labels, resolvedDatasets]);

  return (
    <div
      style={{
        ...elementBoxStyle(element, scale),
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
