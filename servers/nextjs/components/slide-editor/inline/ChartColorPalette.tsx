import type { CSSProperties, ReactNode } from "react";
import { Check, Plus } from "lucide-react";
import {
  CHART_SYSTEM_COLORS,
  CHART_THEME_COLORS,
  normalizeChartColor,
} from "../lib/chart-data";
import { DeferredColorInput } from "./DeferredColorInput";

type ChartColorPaletteCardProps = {
  className?: string;
  header?: ReactNode;
  onChange: (color: string) => void;
  onClose?: () => void;
  style?: CSSProperties;
  value: string;
};

export function ChartColorPaletteCard({
  className,
  header,
  onChange,
  onClose,
  style,
  value,
}: ChartColorPaletteCardProps) {
  const currentColor = normalizeChartColor(value);
  const commitColor = (color: string) => {
    onChange(normalizeChartColor(color));
    onClose?.();
  };

  return (
    <div
      className={className}
      data-inline-edit-ignore="true"
      style={{ ...styles.card, ...style }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {header ? <div style={styles.header}>{header}</div> : null}
      <div style={styles.heading}>Theme</div>
      <div style={styles.themeGrid}>
        {CHART_THEME_COLORS.map((color) => (
          <ColorSwatch
            key={color}
            color={color}
            selected={color === currentColor}
            onClick={() => commitColor(color)}
          />
        ))}
      </div>

      <div style={styles.divider} />

      <div style={styles.heading}>System colors</div>
      <div style={styles.systemGrid}>
        <label
          aria-label="Custom chart color"
          title="Custom color"
          style={{
            ...styles.swatch,
            ...styles.customSwatch,
          }}
        >
          <Plus size={16} strokeWidth={2} />
          <DeferredColorInput
            value={currentColor}
            onCommit={commitColor}
            style={styles.hiddenColorInput}
          />
        </label>
        {CHART_SYSTEM_COLORS.map((color) => (
          <ColorSwatch
            key={color}
            color={color}
            selected={color === currentColor}
            onClick={() => commitColor(color)}
          />
        ))}
      </div>
    </div>
  );
}

function ColorSwatch({
  color,
  selected,
  onClick,
}: {
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Set chart color #${color}`}
      style={{
        ...styles.swatch,
        background: `#${color}`,
        borderColor: color === "FFFFFF" ? "#E6E6EA" : "transparent",
        color: isLightColor(color) ? "#191919" : "#FFFFFF",
      }}
      onClick={onClick}
    >
      {selected ? <Check size={16} strokeWidth={2.5} /> : null}
    </button>
  );
}

function isLightColor(color: string) {
  const normalized = normalizeChartColor(color);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 170;
}

const styles = {
  card: {
    background: "#FFFFFF",
    border: "1px solid #E6E6EA",
    borderRadius: 10,
    boxShadow: "0 18px 44px rgba(16,19,35,0.18)",
    boxSizing: "border-box",
    color: "#191919",
    fontFamily:
      "var(--font-syne), var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: 14,
    width: 286,
  },
  customSwatch: {
    alignItems: "center",
    background:
      "conic-gradient(from 0deg, #FF3B3B, #FF7417, #FFC20A, #22C55E, #38BDF8, #5B5FF4, #EC4899, #FF3B3B)",
    color: "#191919",
    display: "grid",
    justifyItems: "center",
    overflow: "hidden",
    position: "relative",
  },
  divider: {
    background: "#ECECF1",
    height: 1,
    margin: "14px 0",
    width: "100%",
  },
  heading: {
    fontSize: 14,
    fontWeight: 600,
    lineHeight: "18px",
    marginBottom: 10,
  },
  header: {
    marginBottom: 12,
  },
  hiddenColorInput: {
    cursor: "pointer",
    height: "100%",
    inset: 0,
    opacity: 0,
    position: "absolute",
    width: "100%",
  },
  swatch: {
    alignItems: "center",
    border: "1px solid transparent",
    borderRadius: 999,
    boxSizing: "border-box",
    cursor: "pointer",
    display: "inline-grid",
    height: 28,
    justifyContent: "center",
    padding: 0,
    width: 28,
  },
  systemGrid: {
    display: "grid",
    gap: 10,
    gridTemplateColumns: "repeat(7, 28px)",
  },
  themeGrid: {
    display: "flex",
    gap: 10,
  },
} satisfies Record<string, CSSProperties>;
