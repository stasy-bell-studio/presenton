import { useState, type CSSProperties } from "react";
import { BarChart3, Download, Palette, Pencil } from "lucide-react";
import type { ChartSlideElement } from "../state";
import {
  chartDataToCsv,
  resolvedChartColorTargets,
  updateChartColorTarget,
} from "../lib/chart-data";
import { ChartColorPaletteCard } from "./ChartColorPalette";
import { InlineToolbar } from "./InlineToolbar";
import { inlineStyles } from "./inlineStyles";

const DEFAULT_CHART_TOOLBAR_SIZE = { width: 2.5, height: 2.5 };

export function ChartToolbar({
  element,
  index,
  scale,
  onChange,
  onEdit,
}: {
  element: ChartSlideElement;
  index: number;
  scale: number;
  onChange: (index: number, element: ChartSlideElement) => void;
  onEdit?: (index: number) => void;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeColorIndex, setActiveColorIndex] = useState(0);
  const colorTargets = resolvedChartColorTargets(element);
  const activeTarget =
    colorTargets.find((target) => target.index === activeColorIndex) ??
    colorTargets[0];
  const isDefaultPresentonChart =
    typeof element.source === "string" &&
    element.source.startsWith("presenton-default-");

  return (
    <InlineToolbar element={element} scale={scale}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          paddingRight: 8,
          borderRight: "1px solid #E6E6EA",
        }}
      >
        <BarChart3 size={16} strokeWidth={2} />
        <select
          aria-label="Chart type"
          title="Chart type"
          value={element.chart_type}
          onChange={(event) =>
            onChange(index, {
              ...element,
              chart_type: event.target.value as ChartSlideElement["chart_type"],
              size: isDefaultPresentonChart
                ? { ...DEFAULT_CHART_TOOLBAR_SIZE }
                : element.size,
            })
          }
          style={{
            ...inlineStyles.select,
            minWidth: 126,
            border: "none",
            paddingLeft: 0,
          }}
        >
          <option value="bar">Bar Chart</option>
          <option value="line">Line Chart</option>
          <option value="area">Area Chart</option>
          <option value="pie">Pie Chart</option>
          <option value="donut">Donut Chart</option>
        </select>
      </div>

      <button
        type="button"
        title="Edit chart"
        onClick={() => onEdit?.(index)}
        style={inlineStyles.iconButton}
      >
        <Pencil size={16} strokeWidth={2} />
      </button>

      <div style={{ position: "relative" }}>
        <button
          type="button"
          title="Chart colors"
          onClick={() => setPaletteOpen((current) => !current)}
          style={{
            ...inlineStyles.iconButton,
            ...(paletteOpen ? inlineStyles.iconButtonActive : {}),
          }}
        >
          <Palette size={16} strokeWidth={2} />
        </button>
        {paletteOpen && activeTarget ? (
          <ChartColorPaletteCard
            value={activeTarget.color}
            header={
              colorTargets.length > 1 ? (
                <div style={toolbarPaletteStyles.targetList}>
                  {colorTargets.map((target) => (
                    <button
                      key={`${target.mode}-${target.index}`}
                      type="button"
                      title={target.label}
                      style={{
                        ...toolbarPaletteStyles.targetButton,
                        ...(target.index === activeTarget.index
                          ? toolbarPaletteStyles.targetButtonActive
                          : {}),
                      }}
                      onClick={() => setActiveColorIndex(target.index)}
                    >
                      <span
                        style={{
                          ...toolbarPaletteStyles.targetDot,
                          background: `#${target.color}`,
                        }}
                      />
                      <span style={toolbarPaletteStyles.targetLabel}>
                        {target.label}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null
            }
            onChange={(color) =>
              onChange(index, updateChartColorTarget(element, activeTarget.index, color))
            }
            onClose={() => setPaletteOpen(false)}
            style={toolbarPaletteStyles.paletteCard}
          />
        ) : null}
      </div>

      <button
        type="button"
        title="Download chart data"
        onClick={() => downloadChartData(element)}
        style={inlineStyles.iconButton}
      >
        <Download size={16} strokeWidth={2} />
      </button>
    </InlineToolbar>
  );
}

const toolbarPaletteStyles = {
  paletteCard: {
    left: 0,
    position: "absolute",
    top: 36,
    zIndex: 30,
  },
  targetButton: {
    alignItems: "center",
    background: "#FFFFFF",
    border: "1px solid #E6E6EA",
    borderRadius: 999,
    color: "#191919",
    cursor: "pointer",
    display: "inline-flex",
    flex: "0 0 auto",
    fontSize: 11,
    fontWeight: 700,
    gap: 6,
    height: 28,
    maxWidth: 132,
    padding: "0 9px",
  },
  targetButtonActive: {
    background: "#F4F3FF",
    borderColor: "#7C51F8",
    color: "#7C51F8",
  },
  targetDot: {
    border: "1px solid #E6E6EA",
    borderRadius: 999,
    flex: "0 0 auto",
    height: 12,
    width: 12,
  },
  targetLabel: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  targetList: {
    display: "flex",
    gap: 6,
    maxWidth: 212,
    overflowX: "auto",
  },
} satisfies Record<string, CSSProperties>;

function downloadChartData(element: ChartSlideElement) {
  const blob = new Blob([chartDataToCsv(element)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${(element.title || "chart").toLowerCase().replace(/\W+/g, "-") || "chart"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
