import { useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Layer, Stage } from "react-konva";
import {
  BarChart3,
  ChevronDown,
  Download,
  Expand,
  GripVertical,
  MoreVertical,
  Plus,
  Settings,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { DeferredColorInput } from "../inline/DeferredColorInput";
import {
  DEFAULT_CHART_COLORS,
  chartColorTargetMode,
  chartDataFromSeries,
  chartDataFromSeriesWithColors,
  chartDataToCsv,
  resolvedChartColorTargets,
  resolvedChartCategories,
  updateChartColorTarget,
} from "../lib/chart-data";
import {
  SLIDE_H,
  SLIDE_W,
  type ChartElement,
  type ChartSeries,
  type ChartType,
} from "../lib/slide-schema";
import { ChartElement as KonvaChartElement } from "../slide-surface/konva/ChartElement";
import type { ElementEvents } from "../slide-surface/konva/types";
import { ChartColorPaletteCard } from "../inline/ChartColorPalette";

const CHART_TYPES: Array<{ label: string; value: ChartType }> = [
  { label: "Bar Chart", value: "bar" },
  { label: "Line Chart", value: "line" },
  { label: "Area Chart", value: "area" },
  { label: "Pie Chart", value: "pie" },
  { label: "Donut Chart", value: "donut" },
];
const DATA_MODAL_CHART_PREVIEW_WIDTH = 274;
const DATA_MODAL_CHART_PREVIEW_HEIGHT =
  (DATA_MODAL_CHART_PREVIEW_WIDTH / SLIDE_W) * SLIDE_H;
const DATA_MODAL_CHART_PREVIEW_SCALE = DATA_MODAL_CHART_PREVIEW_WIDTH / SLIDE_W;
const NOOP_CHART_PREVIEW_EVENTS = {
  draggable: false,
  onClick: () => false,
  onTap: () => false,
  onDragStart: () => undefined,
  onDragMove: () => undefined,
  onDragEnd: () => undefined,
  onTransformStart: () => undefined,
  onTransformEnd: () => undefined,
} satisfies ElementEvents;

export function ChartEditorContent({
  chart,
  chartPath,
  onChange,
  onClose,
}: {
  chart: ChartElement;
  chartPath?: string | null;
  onChange: (chart: ChartElement) => void;
  onClose?: () => void;
}) {
  const [tab, setTab] = useState<"data" | "customize">("data");
  const [dataModalOpen, setDataModalOpen] = useState(false);

  return (
    <>
      <div
        data-inline-edit-ignore="true"
        className="h-full overflow-y-auto px-5 pb-8 pt-8 font-syne hide-scrollbar"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-8 flex items-center justify-between gap-4">
          <h3 className="text-[15px] font-semibold leading-5 text-[#101323]">
            Charts
          </h3>
          {onClose ? (
            <button
              type="button"
              aria-label="Close chart editor"
              className="grid h-8 w-8 place-items-center rounded-full text-[#191919] transition hover:bg-[#F5F5F7]"
              onClick={onClose}
            >
              <X size={17} strokeWidth={2} />
            </button>
          ) : null}
        </div>

        <label className="mb-3 block text-[13px] font-medium text-[#191919]">
          Charts
        </label>
        <ChartTypeSelect
          value={chart.chart_type}
          onChange={(chartType) =>
            onChange({ ...chart, chart_type: chartType })
          }
        />

        <div className="mt-8 border-t border-[#ECECF1]">
          <div className="grid grid-cols-2">
            <button
              type="button"
              className={`h-12 border-b-2 text-[13px] font-medium transition ${tab === "data"
                ? "border-[#7C51F8] text-[#191919]"
                : "border-transparent text-[#191919]"
                }`}
              onClick={() => setTab("data")}
            >
              Data
            </button>
            <button
              type="button"
              className={`h-12 border-b-2 text-[13px] font-medium transition ${tab === "customize"
                ? "border-[#7C51F8] text-[#191919]"
                : "border-transparent text-[#191919]"
                }`}
              onClick={() => setTab("customize")}
            >
              Customize
            </button>
          </div>

          {tab === "data" ? (
            <ChartDataPanel
              chart={chart}
              onChange={onChange}
              onOpenDataModal={() => setDataModalOpen(true)}
            />
          ) : (
            <ChartCustomizePanel chart={chart} onChange={onChange} />
          )}
        </div>
      </div>

      {dataModalOpen ? (
        <ChartDataModal
          chart={chart}
          chartPath={chartPath ?? "chart"}
          onChange={onChange}
          onClose={() => setDataModalOpen(false)}
        />
      ) : null}
    </>
  );
}

function ChartTypeSelect({
  value,
  onChange,
}: {
  value: ChartType;
  onChange: (value: ChartType) => void;
}) {
  return (
    <div className="relative">
      <BarChart3 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#191919]" />
      <select
        aria-label="Chart type"
        className="h-12 w-full appearance-none rounded-xl border border-[#E6E6EA] bg-white pl-11 pr-10 text-[13px] font-medium text-[#191919] outline-none transition focus:border-[#7C51F8]"
        value={value}
        onChange={(event) => onChange(event.target.value as ChartType)}
      >
        {CHART_TYPES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#191919]" />
    </div>
  );
}

function ChartDataPanel({
  chart,
  onChange,
  onOpenDataModal,
}: {
  chart: ChartElement;
  onChange: (chart: ChartElement) => void;
  onOpenDataModal: () => void;
}) {
  const categories = safeCategoriesForChart(chart);
  const series = normalizedSeries(chart, categories.length);

  return (
    <div className="space-y-5 pt-5">
      <MiniDataTable categories={categories} series={series} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Open data table"
          className="grid h-10 w-12 place-items-center rounded-full border border-[#ECECF1] bg-white text-[#191919] transition hover:bg-[#F7F7FA]"
          onClick={onOpenDataModal}
        >
          <Expand size={16} strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label="Clear chart data"
          className="grid h-10 w-12 place-items-center rounded-full border border-[#ECECF1] bg-white text-[#191919] transition hover:bg-[#F7F7FA]"
          onClick={() => onChange(clearChartData(chart))}
        >
          <Trash2 size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

function MiniDataTable({
  categories,
  series,
}: {
  categories: string[];
  series: ChartSeries[];
}) {
  const visibleSeries = series.slice(0, 2);
  return (
    <div className="overflow-hidden rounded-xl bg-[#F7F7FA]">
      <div className="max-h-[210px] overflow-auto">
        <table className="min-w-full border-collapse text-[12px] text-[#191919]">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 min-w-[110px] border-b border-r border-[#E6E6EA] bg-[#F3F4F7] px-3 py-3 text-left font-medium" />
              {visibleSeries.map((item) => (
                <th
                  key={item.name}
                  className="min-w-[120px] border-b border-r border-[#E6E6EA] bg-[#F3F4F7] px-3 py-3 text-left font-medium"
                >
                  {item.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.slice(0, 5).map((category, rowIndex) => (
              <tr key={`${category}-${rowIndex}`}>
                <td className="sticky left-0 border-b border-r border-[#E6E6EA] bg-[#F7F7FA] px-3 py-3 font-medium">
                  {category}
                </td>
                {visibleSeries.map((item, seriesIndex) => (
                  <td
                    key={`${item.name}-${seriesIndex}`}
                    className="border-b border-r border-[#E6E6EA] bg-white px-3 py-3"
                  >
                    {item.values[rowIndex] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartCustomizePanel({
  chart,
  onChange,
}: {
  chart: ChartElement;
  onChange: (chart: ChartElement) => void;
}) {
  const hasCartesianAxes =
    chart.chart_type !== "pie" && chart.chart_type !== "donut";

  return (
    <div className="space-y-3 pt-5">
      <PanelSection icon={<Type size={18} />} label="Text">
        <label className="block text-[12px] font-medium text-[#686873]">
          Title
        </label>
        <input
          className="mt-2 h-10 w-full rounded-lg border border-[#E6E6EA] px-3 text-[12px] outline-none focus:border-[#7C51F8]"
          value={chart.title ?? ""}
          onChange={(event) =>
            onChange({ ...chart, title: event.target.value || null })
          }
        />
        <ToggleRow
          checked={chart.data_labels ?? chart.data_labels ?? false}
          label="Show values"
          onChange={(checked) => onChange({ ...chart, data_labels: checked })}
        />
        <ColorRow
          label="Label color"
          value={chart.data_labels_color ?? "6A7894"}
          onChange={(labelColor) =>
            onChange({ ...chart, data_labels_color: labelColor })
          }
        />
      </PanelSection>

      {hasCartesianAxes ? (
        <>
          <PanelSection icon={<BarChart3 size={18} />} label="X Axis">
            <ToggleRow
              checked={chart.x_axis ?? true}
              label="Show X axis"
              onChange={(xAxis) => onChange({ ...chart, x_axis: xAxis })}
            />
            <label className="block text-[12px] font-medium text-[#686873]">
              Axis title
            </label>
            <input
              className="mt-2 h-10 w-full rounded-lg border border-[#E6E6EA] px-3 text-[12px] outline-none focus:border-[#7C51F8]"
              value={chart.x_axis_title ?? ""}
              onChange={(event) =>
                onChange({ ...chart, x_axis_title: event.target.value || null })
              }
            />
          </PanelSection>

          <PanelSection icon={<BarChart3 size={18} />} label="Y Axis">
            <ToggleRow
              checked={chart.y_axis ?? true}
              label="Show Y axis"
              onChange={(yAxis) => onChange({ ...chart, y_axis: yAxis })}
            />
            <label className="block text-[12px] font-medium text-[#686873]">
              Axis title
            </label>
            <input
              className="mt-2 h-10 w-full rounded-lg border border-[#E6E6EA] px-3 text-[12px] outline-none focus:border-[#7C51F8]"
              value={chart.y_axis_title ?? ""}
              onChange={(event) =>
                onChange({ ...chart, y_axis_title: event.target.value || null })
              }
            />
          </PanelSection>
        </>
      ) : null}

      <PanelSection icon={<Settings size={18} />} label="Settings">
        <ToggleRow
          checked={chart.grid ?? true}
          label="Grid lines"
          onChange={(grid) => onChange({ ...chart, grid })}
        />
        <ChartSeriesColorControls chart={chart} onChange={onChange} />
        <ColorRow
          label="Axis color"
          value={chart.axis_color ?? "9AA7BD"}
          onChange={(axisColor) =>
            onChange({ ...chart, axis_color: axisColor })
          }
        />
        <label className="block text-[12px] font-medium text-[#686873]">
          Opacity
        </label>
        <input
          className="mt-2 w-full accent-[#7C51F8]"
          max={1}
          min={0}
          step={0.05}
          type="range"
          value={chart.opacity ?? 1}
          onChange={(event) =>
            onChange({ ...chart, opacity: Number(event.target.value) })
          }
        />
      </PanelSection>
    </div>
  );
}

function ChartSeriesColorControls({
  chart,
  onChange,
}: {
  chart: ChartElement;
  onChange: (chart: ChartElement) => void;
}) {
  const [paletteAnchor, setPaletteAnchor] = useState<{
    index: number;
    rect: DOMRect;
  } | null>(null);
  const swatchRefs = useRef(new Map<number, HTMLButtonElement>());
  const targets = resolvedChartColorTargets(chart);
  const label =
    targets.length > 1
      ? chartColorTargetMode(chart) === "point"
        ? "Slice colors"
        : "Series colors"
      : "Chart color";
  const openTarget = paletteAnchor
    ? targets.find((target) => target.index === paletteAnchor.index)
    : null;

  return (
    <div className="space-y-2">
      <p className="text-[12px] font-medium text-[#686873]">{label}</p>
      <div className="space-y-2">
        {targets.map((target) => (
          <div
            key={`${target.mode}-${target.index}`}
            className="relative flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-[12px] font-medium text-[#191919]"
          >
            <span className="min-w-0 truncate">{target.label}</span>
            <button
              type="button"
              aria-label={`Change ${target.label} color`}
              className="h-8 w-8 shrink-0 rounded-full border border-[#E6E6EA] shadow-sm"
              ref={(node) => {
                if (node) {
                  swatchRefs.current.set(target.index, node);
                } else {
                  swatchRefs.current.delete(target.index);
                }
              }}
              style={{ backgroundColor: `#${target.color}` }}
              onClick={() =>
                setPaletteAnchor((current) => {
                  if (current?.index === target.index) return null;
                  const anchor = swatchRefs.current.get(target.index);
                  return anchor
                    ? { index: target.index, rect: anchor.getBoundingClientRect() }
                    : null;
                })
              }
            />
          </div>
        ))}
      </div>
      {openTarget && paletteAnchor && typeof document !== "undefined"
        ? createPortal(
            <ChartColorPaletteCard
              value={openTarget.color}
              onChange={(color) =>
                onChange(updateChartColorTarget(chart, openTarget.index, color))
              }
              onClose={() => setPaletteAnchor(null)}
              style={chartPalettePortalStyle(paletteAnchor.rect)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function chartPalettePortalStyle(anchorRect: DOMRect) {
  const width = 286;
  const estimatedHeight = 286;
  const margin = 12;
  const gap = 8;
  const viewportWidth =
    typeof window === "undefined" ? anchorRect.right + width : window.innerWidth;
  const viewportHeight =
    typeof window === "undefined"
      ? anchorRect.bottom + estimatedHeight + margin
      : window.innerHeight;
  const spaceBelow = viewportHeight - anchorRect.bottom - margin;
  const spaceAbove = anchorRect.top - margin;
  const shouldOpenAbove =
    spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
  const preferredTop = shouldOpenAbove
    ? anchorRect.top - estimatedHeight - gap
    : anchorRect.bottom + gap;
  const top = Math.max(
    margin,
    Math.min(preferredTop, viewportHeight - estimatedHeight - margin),
  );

  return {
    position: "fixed" as const,
    left: Math.max(12, Math.min(anchorRect.right - width, viewportWidth - width - 12)),
    top,
    maxHeight: Math.max(180, viewportHeight - top - margin),
    overflowY: "auto" as const,
    zIndex: 1000,
  };
}

function PanelSection({
  children,
  icon,
  label,
}: {
  children: ReactNode;
  icon: ReactNode;
  label: string;
}) {
  return (
    <details className="group rounded-xl bg-[#FAFAFB]" open={label === "Text"}>
      <summary className="flex h-14 cursor-pointer list-none items-center justify-between px-4 text-[13px] font-medium text-[#191919]">
        <span className="flex items-center gap-3">
          {icon}
          {label}
        </span>
        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-[#ECECF1] px-4 py-4">
        {children}
      </div>
    </details>
  );
}

function ToggleRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[12px] font-medium text-[#191919]">
      {label}
      <input
        checked={checked}
        className="h-4 w-4 accent-[#7C51F8]"
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[12px] font-medium text-[#191919]">
      {label}
      <DeferredColorInput
        className="h-9 w-12 rounded-lg border border-[#E6E6EA] bg-white p-1"
        value={value}
        onCommit={onChange}
      />
    </label>
  );
}

function ChartDataModal({
  chart,
  chartPath,
  onChange,
  onClose,
}: {
  chart: ChartElement;
  chartPath: string;
  onChange: (chart: ChartElement) => void;
  onClose: () => void;
}) {
  const categories = safeCategoriesForChart(chart);
  const series = normalizedSeries(chart, categories.length);
  const [expanded, setExpanded] = useState(false);
  const previewChart = useMemo(() => chartPreviewElement(chart), [chart]);

  const updateData = (
    nextCategories: string[],
    nextSeries: ChartSeries[],
    nextSeriesColors = chart.series_colors ?? [],
  ) => {
    const normalizedCategories = nextCategories.slice(0, 24);
    const normalized = nextSeries
      .map((item) => ({
        name: item.name,
        values: normalizeValues(item.values, normalizedCategories.length),
      }))
      .slice(0, 12);
    const colorMode = chartColorTargetMode({
      ...chart,
      categories: normalizedCategories,
      series: normalized,
    });
    const colorCount =
      colorMode === "point"
        ? Math.min(
          12,
          Math.max(1, normalizedCategories.length, normalized[0]?.values.length ?? 0),
        )
        : 1;
    const seriesColors = Array.from({ length: colorCount }, (_, index) =>
      nextSeriesColors[index] ??
      chart.series_colors?.[index] ??
      (index === 0 ? chart.color : null) ??
      DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length],
    );

    onChange({
      ...chart,
      categories: normalizedCategories,
      color: seriesColors[0] ?? chart.color,
      series: normalized,
      series_colors: seriesColors,
      data: chartDataFromSeriesWithColors(
        normalizedCategories,
        normalized,
        seriesColors,
        colorMode === "point",
      ),
    });
  };

  return (
    <div
      data-inline-edit-ignore="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-6 font-syne"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        className="flex max-w-full flex-col overflow-hidden rounded-3xl bg-white shadow-[0_24px_80px_rgba(16,24,40,0.24)]"
        style={{
          height: expanded ? "calc(100dvh - 48px)" : 650,
          maxHeight: "calc(100dvh - 48px)",
          width: expanded ? "calc(100% - 48px)" : 1180,
        }}
      >
        <header className="flex h-[104px] shrink-0 items-center justify-between border-b border-[#ECECF1] px-7">
          <div>
            <h2 className="text-xl font-semibold text-[#191919]">
              Edit Data Table
            </h2>
            <p className="mt-2 text-sm text-[#777780]">Edit chart data</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="grid h-11 w-16 place-items-center rounded-full border border-[#ECECF1] bg-white text-[#191919]"
              title="Download data"
              onClick={() => downloadChartData(chart)}
            >
              <Download size={17} />
            </button>
            <button
              type="button"
              className="grid h-11 w-16 place-items-center rounded-full border border-[#ECECF1] bg-white text-[#191919]"
              title="Fit table"
              onClick={() => setExpanded((current) => !current)}
            >
              <Expand size={17} />
            </button>
            <button
              type="button"
              className="grid h-11 w-16 place-items-center rounded-full border border-[#ECECF1] bg-white text-[#191919]"
              title="Clear data"
              onClick={() => onChange(clearChartData(chart))}
            >
              <Trash2 size={17} />
            </button>
            <button
              type="button"
              className="grid h-11 w-11 place-items-center rounded-full text-[#191919] hover:bg-[#F7F7FA]"
              aria-label="Close data editor"
              onClick={onClose}
            >
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="min-h-0 w-[330px] shrink-0 overflow-y-auto overscroll-contain border-r border-[#ECECF1] px-7 py-7">
            <label className="mb-3 block text-base font-medium text-[#191919]">
              Charts
            </label>
            <ChartTypeSelect
              value={chart.chart_type}
              onChange={(chartType) =>
                onChange({ ...chart, chart_type: chartType })
              }
            />
            <div
              className="relative mt-7 flex h-[210px] items-center justify-center overflow-hidden rounded-xl border border-[#ECECF1] bg-[#F8F8FA]"
              style={{
                backgroundImage: "url('/card_bg.svg')",
                backgroundPosition: "center",
                backgroundSize: "100% 100%",
              }}
            >
              <div
                className="pointer-events-none relative overflow-hidden"
                style={{
                  height: DATA_MODAL_CHART_PREVIEW_HEIGHT,
                  width: DATA_MODAL_CHART_PREVIEW_WIDTH,
                }}
              >
                <Stage
                  height={DATA_MODAL_CHART_PREVIEW_HEIGHT}
                  width={DATA_MODAL_CHART_PREVIEW_WIDTH}
                >
                  <Layer listening={false}>
                    <KonvaChartElement
                      element={previewChart}
                      events={NOOP_CHART_PREVIEW_EVENTS}
                      index={0}
                      scale={DATA_MODAL_CHART_PREVIEW_SCALE}
                      selected={false}
                      setRef={() => undefined}
                      transparentBackground
                    />
                  </Layer>
                </Stage>
              </div>
            </div>
            <ChartCustomizePanel chart={chart} onChange={onChange} />
          </aside>

          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-10 py-12">
            <EditableDataTable
              categories={categories}
              chartPath={chartPath}
              colorMode={chartColorTargetMode(chart)}
              series={series}
              seriesColors={chart.series_colors ?? []}
              onClear={() => onChange(clearChartData(chart))}
              onUpdate={updateData}
            />
          </main>
        </div>
      </div>
    </div>
  );
}

function EditableDataTable({
  categories,
  chartPath,
  colorMode,
  onClear,
  onUpdate,
  series,
  seriesColors,
}: {
  categories: string[];
  chartPath: string;
  colorMode: "point" | "series";
  onClear: () => void;
  onUpdate: (
    categories: string[],
    series: ChartSeries[],
    seriesColors?: string[],
  ) => void;
  series: ChartSeries[];
  seriesColors: string[];
}) {
  const safeCategories = categories.length > 0 ? categories : ["Item 1"];
  const safeSeries =
    series.length > 0
      ? series
      : [
        {
          name: "Series 1",
          values: normalizeValues([], safeCategories.length),
        },
      ];
  const usesPointColors = colorMode === "point";
  const [activeSeriesIndex, setActiveSeriesIndex] = useState(0);
  const selectedSeriesIndex = Math.min(activeSeriesIndex, safeSeries.length - 1);
  const selectedSeries = safeSeries[selectedSeriesIndex];

  const updateCategory = (rowIndex: number, value: string) => {
    onUpdate(
      safeCategories.map((category, index) =>
        index === rowIndex ? value : category,
      ),
      safeSeries,
      seriesColors,
    );
  };
  const updateSeriesName = (seriesIndex: number, name: string) => {
    onUpdate(
      safeCategories,
      safeSeries.map((item, index) =>
        index === seriesIndex ? { ...item, name } : item,
      ),
      seriesColors,
    );
  };
  const updateValue = (
    seriesIndex: number,
    rowIndex: number,
    value: string,
  ) => {
    const numeric = Number(value);
    onUpdate(
      safeCategories,
      safeSeries.map((item, index) =>
        index === seriesIndex
          ? {
            ...item,
            values: item.values.map((current, valueIndex) =>
              valueIndex === rowIndex && Number.isFinite(numeric)
                ? numeric
                : current,
            ),
          }
          : item,
      ),
      seriesColors,
    );
  };
  const addRow = () => {
    const nextCategories = [
      ...safeCategories,
      `Item ${safeCategories.length + 1}`,
    ];
    onUpdate(
      nextCategories,
      safeSeries.map((item) => ({
        ...item,
        values: [...item.values, 0],
      })),
      usesPointColors
        ? [
          ...seriesColors,
          DEFAULT_CHART_COLORS[safeCategories.length % DEFAULT_CHART_COLORS.length],
        ]
        : seriesColors,
    );
  };
  const deleteRow = (rowIndex: number) => {
    if (safeCategories.length <= 1) return;

    onUpdate(
      safeCategories.filter((_, index) => index !== rowIndex),
      safeSeries.map((item) => ({
        ...item,
        values: item.values.filter((_, index) => index !== rowIndex),
      })),
      usesPointColors
        ? seriesColors.filter((_, index) => index !== rowIndex)
        : seriesColors,
    );
  };
  const addSeries = () => {
    onUpdate(
      safeCategories,
      [
        ...safeSeries,
        {
          name: `Series ${safeSeries.length + 1}`,
          values: normalizeValues([], safeCategories.length),
        },
      ],
      usesPointColors
        ? seriesColors
        : seriesColors,
    );
  };
  const deleteSeries = (seriesIndex: number) => {
    if (safeSeries.length <= 1) return;
    onUpdate(
      safeCategories,
      safeSeries.filter((_, index) => index !== seriesIndex),
      usesPointColors
        ? seriesColors
        : seriesColors,
    );
    setActiveSeriesIndex((current) =>
      Math.max(0, Math.min(current, safeSeries.length - 2)),
    );
  };

  return (
    <div className="relative w-full pt-12 pr-7 pb-6 pl-7">
      {selectedSeries ? (
        <div className="absolute left-1/2 top-0 z-20 flex h-12 min-w-[290px] -translate-x-1/2 items-center overflow-hidden rounded-[20px] border border-[#ECECF1] bg-white px-4 text-[#191919] shadow-[0_4px_18px_rgba(16,24,40,0.10)]">
          <input
            className="h-full min-w-0 flex-1 bg-transparent text-center text-[17px] font-medium outline-none"
            value={selectedSeries.name}
            onChange={(event) =>
              updateSeriesName(selectedSeriesIndex, event.target.value)
            }
          />
          <button
            type="button"
            aria-label="Delete selected series"
            className="ml-3 grid h-9 w-9 place-items-center rounded-lg bg-[#F7F7FA] text-[#191919]"
            onClick={() => deleteSeries(selectedSeriesIndex)}
          >
            <Trash2 size={18} strokeWidth={2.3} />
          </button>
          <button
            type="button"
            aria-label="More series actions"
            className="ml-2 grid h-9 w-7 place-items-center rounded-lg text-[#191919]"
          >
            <MoreVertical size={19} strokeWidth={2.6} />
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className="absolute right-0 top-2 text-[17px] font-medium text-[#7C51F8]"
        onClick={onClear}
      >
        Clear Data
      </button>

      <div className="relative rounded-b-[18px] bg-[#F3F4F6] pr-7 pb-6">
        <div className="max-h-[390px] overflow-auto">
          <table className="min-w-full border-collapse text-[16px] text-[#191919]">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-10 w-0 border-b border-[#E8E8EC] bg-[#F6F7F8]" />
                <th className="sticky left-0 top-0 z-10 min-w-[220px] border-b border-r border-[#E8E8EC] bg-[#F6F7F8]" />
                {safeSeries.map((item, seriesIndex) => (
                  <th
                    key={`${chartPath}-series-${seriesIndex}`}
                    className="min-w-[220px] border-b border-r border-[#E8E8EC] bg-[#F6F7F8] px-4 py-3 text-center text-[18px] font-medium"
                  >
                    <button
                      type="button"
                      className="w-full truncate text-center outline-none"
                      onClick={() => setActiveSeriesIndex(seriesIndex)}
                    >
                      {item.name}
                    </button>
                  </th>
                ))}
                <th className="sticky right-0 top-0 w-16 border-b border-[#E8E8EC] bg-[#F3F4F6]" />
              </tr>
            </thead>
            <tbody>
              {safeCategories.map((category, rowIndex) => (
                <tr key={`${chartPath}-row-${rowIndex}`}>
                  <td className="sticky left-0 relative w-0 border-b border-[#E8E8EC] bg-[#F6F7F8] text-center text-[#A9AAB4]">
                    <span className="absolute -left-6 top-1/2 flex -translate-y-1/2 items-center justify-center">
                      <GripVertical size={18} strokeWidth={2.3} />
                    </span>
                  </td>
                  <td className="sticky left-0 min-w-[220px] border-b border-r border-[#E8E8EC] bg-[#F7F8FA] px-4 py-3">
                    <input
                      className="h-10 w-full rounded-lg border border-transparent bg-transparent px-0 text-[18px] font-medium outline-none focus:border-[#7C51F8] focus:bg-white focus:px-3"
                      value={category}
                      onChange={(event) =>
                        updateCategory(rowIndex, event.target.value)
                      }
                    />
                  </td>
                  {safeSeries.map((item, seriesIndex) => (
                    <td
                      key={`${chartPath}-cell-${rowIndex}-${seriesIndex}`}
                      className="border-b border-r border-[#E8E8EC] bg-white px-4 py-3"
                    >
                      <input
                        className="h-10 w-full rounded-lg border border-transparent bg-transparent px-0 text-[18px] outline-none focus:border-[#7C51F8] focus:bg-[#FAFAFF] focus:px-3"
                        type="number"
                        value={item.values[rowIndex] ?? 0}
                        onChange={(event) =>
                          updateValue(seriesIndex, rowIndex, event.target.value)
                        }
                      />
                    </td>
                  ))}
                  <td className="sticky right-0 border-b border-[#E8E8EC] bg-[#F3F4F6] px-2">
                    <button
                      type="button"
                      aria-label={`Delete ${category || `row ${rowIndex + 1}`}`}
                      className="grid h-8 w-8 place-items-center rounded-lg text-[#8E8E98] transition hover:bg-white hover:text-[#191919] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#8E8E98]"
                      disabled={safeCategories.length <= 1}
                      onClick={() => deleteRow(rowIndex)}
                    >
                      <Trash2 size={15} strokeWidth={2.2} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="absolute bottom-0 right-0 top-0 w-7 rounded-r-[18px] bg-[#EDEEF0]" />
        <div className="absolute bottom-0 left-0 right-7 h-6 rounded-b-[18px] bg-[#EDEEF0]" />
        <button
          type="button"
          className="absolute right-0 top-1/2 z-10 grid h-10 w-7 -translate-y-1/2 place-items-center text-[#191919]"
          onClick={addSeries}
        >
          <Plus size={18} strokeWidth={2.4} />
        </button>
        <button
          type="button"
          className="absolute bottom-0 left-1/2 z-10 grid h-6 w-10 -translate-x-1/2 place-items-center text-[#191919]"
          onClick={addRow}
        >
          <Plus size={18} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

function safeCategoriesForChart(element: ChartElement) {
  const categories = resolvedChartCategories(element);
  return categories.length > 0 ? categories : ["Item 1"];
}

function normalizedSeries(element: ChartElement, categoryLength: number) {
  const length = Math.max(1, categoryLength);
  if (element.series?.length) {
    return element.series.map((series) => ({
      ...series,
      values: normalizeValues(series.values, length),
    }));
  }
  return [
    {
      name: element.title ?? "Series 1",
      values: normalizeValues([], length),
    },
  ];
}

function normalizeValues(values: number[], length: number) {
  const normalized = values.slice(0, length);
  while (normalized.length < length) normalized.push(0);
  return normalized;
}

function clearChartData(chart: ChartElement): ChartElement {
  const categories = ["Item 1"];
  const series = [{ name: "Series 1", values: [0] }];
  const color = chart.color ?? DEFAULT_CHART_COLORS[0];
  return {
    ...chart,
    categories,
    series,
    series_colors: [color],
    data: chartDataFromSeries(categories, series, color),
  };
}

function chartPreviewElement(chart: ChartElement): ChartElement {
  return {
    ...chart,
    opacity: 1,
    position: { x: 0.35, y: 0.35 },
    rotation: 0,
    size: { width: SLIDE_W - 0.7, height: SLIDE_H - 0.7 },
  };
}

function downloadChartData(element: ChartElement) {
  if (typeof document === "undefined") return;
  const blob = new Blob([chartDataToCsv(element)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${(element.title || "chart").toLowerCase().replace(/\W+/g, "-") || "chart"
    }.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
