import { useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  ChevronDown,
  Download,
  Expand,
  Plus,
  Settings,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { withHash, withoutHash } from "../editorUtils";
import {
  DEFAULT_CHART_COLORS,
  chartDataFromSeries,
  chartDataToCsv,
  resolvedChartCategories,
} from "../lib/chart-data";
import type { ElementPath } from "../lib/element-path";
import {
  SLIDE_H,
  SLIDE_W,
  type ChartElement,
  type ChartSeries,
  type ChartType,
  type Slide,
} from "../lib/slide-schema";
import { SlideSurface } from "../slide-surface";

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

export function ChartEditorContent({
  chart,
  chartPath,
  onChange,
  onClose,
}: {
  chart: ChartElement;
  chartPath?: ElementPath | null;
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
          value={chart.chartType}
          onChange={(chartType) => onChange({ ...chart, chartType })}
        />

        <div className="mt-8 border-t border-[#ECECF1]">
          <div className="grid grid-cols-2">
            <button
              type="button"
              className={`h-12 border-b-2 text-[13px] font-medium transition ${
                tab === "data"
                  ? "border-[#7C51F8] text-[#191919]"
                  : "border-transparent text-[#191919]"
              }`}
              onClick={() => setTab("data")}
            >
              Data
            </button>
            <button
              type="button"
              className={`h-12 border-b-2 text-[13px] font-medium transition ${
                tab === "customize"
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
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-[#ECECF1] bg-white px-4 text-[12px] font-semibold text-[#191919] transition hover:bg-[#F7F7FA]"
          onClick={onOpenDataModal}
        >
          <Download size={15} strokeWidth={2} />
          Edit Data
        </button>
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
          checked={chart.showValues ?? chart.dataLabels ?? false}
          label="Show values"
          onChange={(checked) =>
            onChange({ ...chart, showValues: checked, dataLabels: checked })
          }
        />
        <ColorRow
          label="Label color"
          value={chart.labelColor ?? "6A7894"}
          onChange={(labelColor) => onChange({ ...chart, labelColor })}
        />
      </PanelSection>

      <PanelSection icon={<BarChart3 size={18} />} label="X Axis">
        <ToggleRow
          checked={chart.xAxis ?? true}
          label="Show X axis"
          onChange={(xAxis) => onChange({ ...chart, xAxis })}
        />
        <label className="block text-[12px] font-medium text-[#686873]">
          Axis title
        </label>
        <input
          className="mt-2 h-10 w-full rounded-lg border border-[#E6E6EA] px-3 text-[12px] outline-none focus:border-[#7C51F8]"
          value={chart.xAxisTitle ?? ""}
          onChange={(event) =>
            onChange({ ...chart, xAxisTitle: event.target.value || null })
          }
        />
      </PanelSection>

      <PanelSection icon={<BarChart3 size={18} />} label="Y Axis">
        <ToggleRow
          checked={chart.yAxis ?? true}
          label="Show Y axis"
          onChange={(yAxis) => onChange({ ...chart, yAxis })}
        />
        <label className="block text-[12px] font-medium text-[#686873]">
          Axis title
        </label>
        <input
          className="mt-2 h-10 w-full rounded-lg border border-[#E6E6EA] px-3 text-[12px] outline-none focus:border-[#7C51F8]"
          value={chart.yAxisTitle ?? ""}
          onChange={(event) =>
            onChange({ ...chart, yAxisTitle: event.target.value || null })
          }
        />
      </PanelSection>

      <PanelSection icon={<Settings size={18} />} label="Settings">
        <ToggleRow
          checked={chart.grid ?? true}
          label="Grid lines"
          onChange={(grid) => onChange({ ...chart, grid })}
        />
        <ColorRow
          label="Series color"
          value={chart.color ?? "D4A24C"}
          onChange={(color) =>
            onChange({
              ...chart,
              color,
              seriesColors: [color, ...(chart.seriesColors ?? []).slice(1)],
              data: chartDataFromSeries(
                safeCategoriesForChart(chart),
                chart.series ?? [],
                color,
              ),
            })
          }
        />
        <ColorRow
          label="Axis color"
          value={chart.axisColor ?? "9AA7BD"}
          onChange={(axisColor) => onChange({ ...chart, axisColor })}
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
      <input
        className="h-9 w-12 rounded-lg border border-[#E6E6EA] bg-white p-1"
        type="color"
        value={withHash(value)}
        onChange={(event) => onChange(withoutHash(event.target.value))}
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
  chartPath: ElementPath;
  onChange: (chart: ChartElement) => void;
  onClose: () => void;
}) {
  const categories = safeCategoriesForChart(chart);
  const series = normalizedSeries(chart, categories.length);
  const [expanded, setExpanded] = useState(false);
  const previewSlide = useMemo(() => chartPreviewSlide(chart), [chart]);

  const updateData = (
    nextCategories: string[],
    nextSeries: ChartSeries[],
    nextSeriesColors = chart.seriesColors ?? [],
  ) => {
    const normalizedCategories = nextCategories
      .map((category, index) => category.trim() || `Item ${index + 1}`)
      .slice(0, 24);
    const normalized = nextSeries
      .map((item, index) => ({
        name: item.name.trim() || `Series ${index + 1}`,
        values: normalizeValues(item.values, normalizedCategories.length),
      }))
      .slice(0, 12);
    const seriesColors = normalized.map(
      (_, index) =>
        nextSeriesColors[index] ??
        chart.seriesColors?.[index] ??
        DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length],
    );

    onChange({
      ...chart,
      categories: normalizedCategories,
      series: normalized,
      seriesColors,
      data: chartDataFromSeries(
        normalizedCategories,
        normalized,
        seriesColors[0] ?? chart.color,
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
          height: expanded ? "calc(100% - 48px)" : 650,
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

        <div className="flex min-h-0 flex-1">
          <aside className="w-[330px] shrink-0 border-r border-[#ECECF1] px-7 py-7">
            <label className="mb-3 block text-base font-medium text-[#191919]">
              Charts
            </label>
            <ChartTypeSelect
              value={chart.chartType}
              onChange={(chartType) => onChange({ ...chart, chartType })}
            />
            <div className="relative mt-7 flex h-[210px] items-center justify-center overflow-hidden rounded-xl border border-[#ECECF1] bg-[#F8F8FA]">
              <div
                className="pointer-events-none relative overflow-hidden"
                style={{
                  height: DATA_MODAL_CHART_PREVIEW_HEIGHT,
                  width: DATA_MODAL_CHART_PREVIEW_WIDTH,
                }}
              >
                <SlideSurface
                  height={DATA_MODAL_CHART_PREVIEW_HEIGHT}
                  interactive={false}
                  slide={previewSlide}
                  width={DATA_MODAL_CHART_PREVIEW_WIDTH}
                />
              </div>
            </div>
            <div className="mt-7 space-y-3">
              <PanelSection icon={<Type size={19} />} label="Text">
                <span className="text-sm text-[#777780]">
                  {chart.title || "Untitled chart"}
                </span>
              </PanelSection>
              <PanelSection icon={<BarChart3 size={19} />} label="X Axis">
                <span className="text-sm text-[#777780]">
                  {chart.xAxis ?? true ? "Visible" : "Hidden"}
                </span>
              </PanelSection>
              <PanelSection icon={<BarChart3 size={19} />} label="Y Axis">
                <span className="text-sm text-[#777780]">
                  {chart.yAxis ?? true ? "Visible" : "Hidden"}
                </span>
              </PanelSection>
              <PanelSection icon={<Settings size={19} />} label="Settings">
                <span className="text-sm text-[#777780]">
                  {chart.grid ?? true ? "Grid enabled" : "Grid hidden"}
                </span>
              </PanelSection>
            </div>
          </aside>

          <main className="min-w-0 flex-1 px-10 py-12">
            <EditableDataTable
              categories={categories}
              chartPath={chartPath}
              series={series}
              seriesColors={chart.seriesColors ?? []}
              onUpdate={updateData}
            />
            <div className="mt-12 flex justify-center">
              <button
                type="button"
                className="h-14 rounded-full bg-gradient-to-r from-[#F9D8AE] to-[#CDBBFF] px-10 text-lg font-semibold text-[#191919] shadow-sm"
                onClick={onClose}
              >
                Add to Canvas
              </button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function EditableDataTable({
  categories,
  chartPath,
  onUpdate,
  series,
  seriesColors,
}: {
  categories: string[];
  chartPath: ElementPath;
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
  const updateValue = (seriesIndex: number, rowIndex: number, value: string) => {
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
      seriesColors,
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
      [
        ...seriesColors,
        DEFAULT_CHART_COLORS[safeSeries.length % DEFAULT_CHART_COLORS.length],
      ],
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
      seriesColors,
    );
  };
  const deleteSeries = (seriesIndex: number) => {
    if (safeSeries.length <= 1) return;
    onUpdate(
      safeCategories,
      safeSeries.filter((_, index) => index !== seriesIndex),
      seriesColors.filter((_, index) => index !== seriesIndex),
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-[#F4F4F6]">
      <div className="max-h-[360px] overflow-auto">
        <table className="min-w-full border-collapse text-base text-[#191919]">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-10 w-10 border-b border-r border-[#E3E3E8] bg-[#F4F4F6]" />
              <th className="sticky left-10 top-0 z-10 min-w-[220px] border-b border-r border-[#E3E3E8] bg-[#F4F4F6]" />
              {safeSeries.map((item, seriesIndex) => (
                <th
                  key={`${chartPath}-series-${seriesIndex}`}
                  className="min-w-[220px] border-b border-r border-[#E3E3E8] bg-[#F4F4F6] px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <input
                      className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-white px-3 text-center font-medium outline-none focus:border-[#7C51F8]"
                      value={item.name}
                      onChange={(event) =>
                        updateSeriesName(seriesIndex, event.target.value)
                      }
                    />
                    <button
                      type="button"
                      className="grid h-9 w-9 place-items-center rounded-lg bg-white text-[#191919] shadow-sm"
                      onClick={() => deleteSeries(seriesIndex)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </th>
              ))}
              <th className="sticky right-0 top-0 w-12 border-b border-[#E3E3E8] bg-[#F4F4F6]">
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-full text-[#191919] hover:bg-white"
                  onClick={addSeries}
                >
                  <Plus size={18} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {safeCategories.map((category, rowIndex) => (
              <tr key={`${chartPath}-row-${rowIndex}`}>
                <td className="sticky left-0 border-b border-r border-[#E3E3E8] bg-[#F4F4F6] text-center text-[#A1A1AA]">
                  ::
                </td>
                <td className="sticky left-10 min-w-[220px] border-b border-r border-[#E3E3E8] bg-[#F7F7FA] px-3 py-2">
                  <input
                    className="h-9 w-full rounded-lg border border-transparent bg-transparent px-2 outline-none focus:border-[#7C51F8] focus:bg-white"
                    value={category}
                    onChange={(event) =>
                      updateCategory(rowIndex, event.target.value)
                    }
                  />
                </td>
                {safeSeries.map((item, seriesIndex) => (
                  <td
                    key={`${chartPath}-cell-${rowIndex}-${seriesIndex}`}
                    className="border-b border-r border-[#E3E3E8] bg-white px-3 py-2"
                  >
                    <input
                      className="h-9 w-full rounded-lg border border-transparent bg-transparent px-2 outline-none focus:border-[#7C51F8] focus:bg-[#FAFAFF]"
                      type="number"
                      value={item.values[rowIndex] ?? 0}
                      onChange={(event) =>
                        updateValue(seriesIndex, rowIndex, event.target.value)
                      }
                    />
                  </td>
                ))}
                <td className="sticky right-0 border-b border-[#E3E3E8] bg-[#F4F4F6]">
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-full text-[#191919] hover:bg-white"
                    onClick={() => deleteRow(rowIndex)}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="flex h-9 w-full items-center justify-center border-t border-[#E3E3E8] text-[#191919] hover:bg-white"
        onClick={addRow}
      >
        <Plus size={17} />
      </button>
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
    seriesColors: [color],
    data: chartDataFromSeries(categories, series, color),
  };
}

function chartPreviewSlide(chart: ChartElement): Slide {
  return {
    background: "FFFFFF",
    title: "Chart preview",
    elements: [
      {
        ...chart,
        opacity: 1,
        position: { x: 0.35, y: 0.35 },
        rotation: 0,
        size: { width: SLIDE_W - 0.7, height: SLIDE_H - 0.7 },
      },
    ],
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
  anchor.download = `${
    (element.title || "chart").toLowerCase().replace(/\W+/g, "-") || "chart"
  }.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
