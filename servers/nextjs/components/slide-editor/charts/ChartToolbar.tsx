import { useState } from "react";
import { BarChart3, Palette } from "lucide-react";
import type { ChartSlideElement } from "@/components/slide-editor/state/state";
import {
  appendChartColorTarget,
  resolvedChartColorTargets,
  updateChartColorTarget,
} from "@/components/slide-editor/charts/chart-data";
import { ChartColorPaletteCard } from "@/components/slide-editor/charts/ChartColorPalette";
import {
  FloatingToolbar,
  FloatingToolbarPanel,
  type FloatingToolbarBox,
} from "@/components/slide-editor/toolbar/FloatingToolbar";
import { inlineStyles } from "@/components/slide-editor/toolbar/inlineStyles";

const DEFAULT_CHART_TOOLBAR_SIZE = { width: 2.5, height: 2.5 };

export function ChartToolbar({
  anchorBox,
  element,
  index,
  scale,
  onChange,
}: {
  anchorBox?: FloatingToolbarBox | null;
  element: ChartSlideElement;
  index: number;
  scale: number;
  onChange: (index: number, element: ChartSlideElement) => void;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeColorIndex, setActiveColorIndex] = useState(0);
  const colorTargets = resolvedChartColorTargets(element);
  const activeTarget =
    colorTargets.find((target) => target.index === activeColorIndex) ??
    colorTargets[0];

  return (
    <FloatingToolbar
      anchorBox={
        anchorBox ?? {
          x: (element.position?.x ?? 0) * scale,
          y: (element.position?.y ?? 0) * scale,
          width: (element.size?.width ?? DEFAULT_CHART_TOOLBAR_SIZE.width) * scale,
          height:
            (element.size?.height ?? DEFAULT_CHART_TOOLBAR_SIZE.height) * scale,
        }
      }
      fallbackWidth={220}
      inlineEditIgnore
      style={inlineStyles.toolbar}
    >
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
          <option value="horizontal_bar">Horizontal Bar</option>
          <option value="stacked_bar">Stacked Bar</option>
          <option value="horizontal_stacked_bar">Horizontal Stack Bar</option>
          <option value="line">Line Chart</option>
          <option value="area">Area Chart</option>
          <option value="pie">Pie Chart</option>
          <option value="donut">Donut Chart</option>
          <option value="scatter">Scatter Chart</option>
          <option value="bubble">Bubble Chart</option>
          <option value="radar">Radar Chart</option>
          <option value="polar_area">Polar Area</option>
        </select>
      </div>

      <div style={{ position: "relative" }}>
        <button
          type="button"
          aria-expanded={paletteOpen}
          aria-label="Chart colors"
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
          <FloatingToolbarPanel>
            <ChartColorPaletteCard
              colors={colorTargets.map((target) => target.color)}
              onAddColor={() => {
                const nextIndex = Math.min(11, colorTargets.length);
                setActiveColorIndex(nextIndex);
                onChange(index, appendChartColorTarget(element));
              }}
              onChange={(color) =>
                onChange(
                  index,
                  updateChartColorTarget(element, activeTarget.index, color),
                )
              }
              onClose={() => setPaletteOpen(false)}
              onSelectIndex={setActiveColorIndex}
              selectedIndex={activeTarget.index}
            />
          </FloatingToolbarPanel>
        ) : null}
      </div>
    </FloatingToolbar>
  );
}
