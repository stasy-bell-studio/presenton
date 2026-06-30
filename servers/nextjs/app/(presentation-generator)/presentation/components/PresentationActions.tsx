"use client";

import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  AlignCenter,
  AreaChart,
  BarChart3,
  ChevronDown,
  Circle,
  Columns2,
  Grid3X3,
  GripVertical,
  Image,
  LineChart,
  List,
  Minus,
  PieChart,
  Quote,
  RectangleHorizontal,
  Rows3,
  Send,
  Shapes,
  Table2,
  Type,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { notify } from "@/components/ui/sonner";
import type {
  ChartElement,
  ChartType,
  SlideElement,
} from "@/components/slide-editor/lib/slide-schema";
import type { ElementPath } from "@/components/slide-editor/lib/element-path";
import { createDefaultElementFromRegistry } from "@/components/slide-editor/registry";
import { ChartEditorContent } from "@/components/slide-editor/workspace/ChartEditorContent";
import {
  adaptTemplateV2ComponentToElement,
  extractTemplateV2Layouts,
  extractTemplateV2MergedComponents,
  type TemplateV2Layout,
  type TemplateV2ImportResponse,
} from "@/components/slide-editor/lib/template-v2-import";
import Chat from "./Chat";
import TemplateService from "../../services/api/template";
import { TemplateV2KonvaSlide } from "../../components/TemplateV2KonvaSlide";
import {
  TEMPLATE_V2_CHART_EDITOR_EVENT,
  TEMPLATE_V2_INSERT_ELEMENTS_EVENT,
  TEMPLATE_V2_CHART_UPDATE_EVENT,
  type TemplateV2ChartEditorDetail,
  type TemplateV2ChartUpdateDetail,
  type TemplateV2InsertComponent,
  type TemplateV2InsertElementsDetail,
} from "../../components/templateV2Events";

type PresentationActionsProps = React.ComponentProps<typeof Chat> & {
  presentationData?: unknown;
};

type ActionId =
  | "ai"
  | "blocks"
  | "texts"
  | "charts"
  | "tables"
  | "images"
  | "elements";

type ActionItem = {
  id: ActionId;
  label: string;
  icon: LucideIcon;
};

type PaletteItem = {
  id?: string;
  label: string;
  icon: LucideIcon;
};

type UnknownRecord = Record<string, unknown>;

type ChartEditorState = {
  chart: ChartElement;
  path: ElementPath;
  rootIndex: number;
  slideId?: string | number | null;
  slideIndex?: number | null;
};

type TemplateBlock = {
  key: string;
  title: string;
  description: string;
  elementCount: number;
  raw: unknown;
  index: number;
};

type TemplateBlockGroup = {
  key: string;
  title: string;
  description: string;
  variants: TemplateBlock[];
};

type BlocksPanelState = {
  blocks: TemplateBlockGroup[];
  error: string | null;
  loading: boolean;
};

type BlocksPanelAction =
  | { type: "cached"; blocks: TemplateBlockGroup[] }
  | { type: "loading" }
  | { type: "loaded"; blocks: TemplateBlockGroup[] }
  | { type: "failed"; message: string };

const initialBlocksPanelState: BlocksPanelState = {
  blocks: [],
  error: null,
  loading: false,
};

function blocksPanelReducer(
  state: BlocksPanelState,
  action: BlocksPanelAction,
): BlocksPanelState {
  switch (action.type) {
    case "cached":
    case "loaded":
      return { blocks: action.blocks, error: null, loading: false };
    case "loading":
      return { ...state, error: null, loading: true };
    case "failed":
      return { blocks: [], error: action.message, loading: false };
    default:
      return state;
  }
}

type PresentationActionsUiState = {
  activeAction: ActionId;
  chartEditor: ChartEditorState | null;
};

type PresentationActionsUiAction =
  | { type: "selectAction"; activeAction: ActionId }
  | { type: "openChartEditor"; chartEditor: ChartEditorState }
  | { type: "closeChartEditor" }
  | { type: "updateChartEditor"; chart: ChartElement }
  | { type: "syncCurrentSlide"; currentSlide?: number };

const initialPresentationActionsUiState: PresentationActionsUiState = {
  activeAction: "ai",
  chartEditor: null,
};

function presentationActionsUiReducer(
  state: PresentationActionsUiState,
  action: PresentationActionsUiAction,
): PresentationActionsUiState {
  switch (action.type) {
    case "selectAction":
      return { ...state, activeAction: action.activeAction };
    case "openChartEditor":
      return { activeAction: "charts", chartEditor: action.chartEditor };
    case "closeChartEditor":
      return { ...state, chartEditor: null };
    case "updateChartEditor":
      if (!state.chartEditor) return state;
      return {
        ...state,
        chartEditor: { ...state.chartEditor, chart: action.chart },
      };
    case "syncCurrentSlide":
      if (
        !state.chartEditor ||
        typeof action.currentSlide !== "number" ||
        typeof state.chartEditor.slideIndex !== "number" ||
        action.currentSlide === state.chartEditor.slideIndex
      ) {
        return state;
      }
      return { ...state, chartEditor: null };
    default:
      return state;
  }
}

const insertActions: ActionItem[] = [
  { id: "texts", label: "Texts", icon: Type },
  { id: "charts", label: "Charts", icon: BarChart3 },
  { id: "tables", label: "Tables", icon: Rows3 },
  { id: "images", label: "Images", icon: Image },
  { id: "elements", label: "Elements", icon: Shapes },
];

const textItems = [
  { id: "title-block", label: "Title Block", icon: AlignCenter },
  { id: "subtitle", label: "Subtitle", icon: AlignCenter },
  { id: "bullet-list", label: "Bullet List", icon: List },
  { id: "quote", label: "Quote", icon: Quote },
  { id: "body-text", label: "Body Text", icon: Columns2 },
] satisfies PaletteItem[];

const chartTypeItems = [
  { id: "bar", label: "Bar Chart", icon: BarChart3 },
  { id: "line", label: "Line Chart", icon: LineChart },
  { id: "pie", label: "Pie Chart", icon: PieChart },
  { id: "area", label: "Area Chart", icon: AreaChart },
] satisfies PaletteItem[];

const tableTypeItems = [
  { id: "simple-table", label: "Simple Table", icon: Table2 },
] satisfies PaletteItem[];

const imageItems = [
  { id: "image", label: "Image", icon: Image },
  { id: "image-text", label: "Image + Text", icon: Columns2 },
  { id: "image-grid", label: "Image Grid", icon: Grid3X3 },
] satisfies PaletteItem[];

const elementItems = [
  { id: "rectangle", label: "Rectangle", icon: RectangleHorizontal },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "line", label: "Line", icon: Minus },
] satisfies PaletteItem[];

const templateBlocksCache = new Map<string, TemplateBlockGroup[]>();
const BLOCK_PREVIEW_WIDTH = 1280;
const BLOCK_PREVIEW_HEIGHT = 720;
const DEFAULT_BAR_CHART_SOURCE = "presenton-default-bar-chart";
const DEFAULT_LINE_CHART_SOURCE = "presenton-default-line-chart";
const DEFAULT_AREA_CHART_SOURCE = "presenton-default-area-chart";
const DEFAULT_PIE_CHART_SOURCE = "presenton-default-pie-chart";
const DEFAULT_CHART_INSERT_SIZE = { width: 2.5, height: 2.5 };

const makeTextElement = ({
  text,
  x,
  y,
  width,
  height,
  size,
  color = "101323",
  bold = false,
  italic = false,
  lineHeight = 1.1,
  horizontal = "left",
}: {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  lineHeight?: number;
  horizontal?: "left" | "center" | "right";
}): SlideElement => ({
  type: "text",
  position: { x, y },
  size: { width, height },
  alignment: { horizontal, vertical: "top" },
  runs: [{ text }],
  font: {
    family: "Arial",
    size,
    color,
    bold,
    italic,
    line_height: lineHeight,
  },
});

const makeBulletListElement = (): SlideElement => ({
  type: "text-list",
  position: { x: 0.95, y: 1.2 },
  size: { width: 5.4, height: 1.5 },
  marker: "bullet",
  items: [
    [{ text: "First point" }],
    [{ text: "Second point" }],
    [{ text: "Third point" }],
  ],
  font: {
    family: "Arial",
    size: 18,
    color: "101323",
    line_height: 1.3,
  },
});

const createTextInsertElements = (kind?: string): SlideElement[] => {
  switch (kind) {
    case "title-block":
      return [
        makeTextElement({
          text: "Add a title",
          x: 0.85,
          y: 0.85,
          width: 7.1,
          height: 0.72,
          size: 38,
          bold: true,
        }),
      ];
    case "subtitle":
      return [
        makeTextElement({
          text: "Add a subtitle",
          x: 0.95,
          y: 1.2,
          width: 6.2,
          height: 0.5,
          size: 24,
          color: "344054",
          lineHeight: 1.2,
        }),
      ];
    case "bullet-list":
      return [makeBulletListElement()];
    case "quote":
      return [
        makeTextElement({
          text: '"Add a memorable quote or customer insight here."',
          x: 0.95,
          y: 1.15,
          width: 6.2,
          height: 0.9,
          size: 24,
          color: "101323",
          italic: true,
          lineHeight: 1.25,
        }),
      ];
    case "body-text":
      return [
        makeTextElement({
          text: "Add body text here. Use this space for a short paragraph or supporting detail.",
          x: 0.95,
          y: 1.2,
          width: 6.1,
          height: 0.9,
          size: 18,
          color: "344054",
          lineHeight: 1.28,
        }),
      ];
    default:
      return [];
  }
};

const chartTypeFromPaletteId = (id?: string): ChartType | null => {
  if (
    id === "bar" ||
    id === "line" ||
    id === "area" ||
    id === "pie" ||
    id === "donut"
  ) {
    return id;
  }
  return null;
};

const makeChartElement = (chartType: ChartType): SlideElement => {
  if (chartType === "bar") {
    const categories = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const values = [70, 120, 45, 145, 105, 105, 45];
    const seriesColors = ["4D20C5"];

    return {
      type: "chart",
      position: { x: 0.78, y: 0.55 },
      size: { ...DEFAULT_CHART_INSERT_SIZE },
      chart_type: "bar",
      title: "Weekly Report\nJun 10-12",
      color: "4D20C5",
      axis_color: "D8D8D8",
      data_labels_color: "4B55A5",
      data_labels: true,
      grid: true,
      x_axis: true,
      y_axis: true,
      categories,
      series: [{ name: "Students Number", values }],
      series_colors: seriesColors,
      source: DEFAULT_BAR_CHART_SOURCE,
      data: categories.map((category, index) => ({
        label: category,
        value: values[index] ?? 0,
        color: seriesColors[0],
      })),
    };
  }

  if (chartType === "line") {
    const categories = ["2021", "2022", "2023", "2024", "2025", "2026"];
    const values = [15, 45, 85, 50, 15, 55];
    const seriesColors = ["4D20C5"];

    return {
      type: "chart",
      position: { x: 0.78, y: 0.55 },
      size: { ...DEFAULT_CHART_INSERT_SIZE },
      chart_type: "line",
      title: "Enrollment Over Years\n2021-2026",
      color: "4D20C5",
      axis_color: "D8D8D8",
      data_labels_color: "4D20C5",
      data_labels: false,
      grid: true,
      x_axis: true,
      y_axis: false,
      categories,
      series: [{ name: "Students Number", values }],
      series_colors: seriesColors,
      source: DEFAULT_LINE_CHART_SOURCE,
      data: categories.map((category, index) => ({
        label: category,
        value: values[index] ?? 0,
        color: seriesColors[0],
      })),
    };
  }

  if (chartType === "area") {
    const categories = ["2021", "2022", "2023", "2024", "2025", "2026"];
    const values = [25, 74, 46, 57, 62, 67];
    const seriesColors = ["4D20C5"];

    return {
      type: "chart",
      position: { x: 0.78, y: 0.55 },
      size: { ...DEFAULT_CHART_INSERT_SIZE },
      chart_type: "area",
      title: "Enrollment Over Years\n2021-2026",
      color: "7555F6",
      axis_color: "D8D8D8",
      data_labels_color: "4D20C5",
      data_labels: false,
      grid: true,
      x_axis: true,
      y_axis: false,
      categories,
      series: [{ name: "Students Number", values }],
      series_colors: seriesColors,
      source: DEFAULT_AREA_CHART_SOURCE,
      data: categories.map((category, index) => ({
        label: category,
        value: values[index] ?? 0,
        color: seriesColors[0],
      })),
    };
  }

  if (chartType === "pie") {
    const categories = ["Category A", "Category B", "Category C"];
    const values = [55, 25, 20];
    const seriesColors = ["7555F6", "AA9AF8", "E7E3FA"];

    return {
      type: "chart",
      position: { x: 0.78, y: 0.55 },
      size: { ...DEFAULT_CHART_INSERT_SIZE },
      chart_type: "pie",
      title: "Weekly Report\nJun 10-12",
      color: "7555F6",
      axis_color: "D8D8D8",
      data_labels_color: "191919",
      data_labels: true,
      categories,
      series: [{ name: "Weekly Report", values }],
      series_colors: seriesColors,
      source: DEFAULT_PIE_CHART_SOURCE,
      data: categories.map((category, index) => ({
        label: category,
        value: values[index] ?? 0,
        color: seriesColors[index] ?? seriesColors[0],
      })),
    };
  }

  const isCircular = chartType === "donut";
  const label = "Donut chart";
  const categories = ["Q1", "Q2", "Q3", "Q4"];
  const values = [38, 54, 47, 68];
  const seriesColors = ["7F22FE", "155DFC", "F59E0B", "12B76A"];

  return {
    type: "chart",
    position: { x: 1.05, y: 1.05 },
    size: { width: isCircular ? 4.4 : 5.2, height: 2.6 },
    chart_type: chartType,
    title: label,
    color: "7F22FE",
    axis_color: "D0D5DD",
    data_labels_color: "475467",
    data_labels: true,
    categories,
    series: [{ name: label, values }],
    series_colors: seriesColors,
    data: categories.map((category, index) => ({
      label: category,
      value: values[index] ?? 0,
      color: seriesColors[index],
    })),
  };
};

const createChartInsertElements = (kind?: string): SlideElement[] => {
  const chartType = chartTypeFromPaletteId(kind);
  return chartType ? [makeChartElement(chartType)] : [];
};

const createTableInsertElements = (kind?: string): SlideElement[] => {
  return kind === "simple-table"
    ? [createDefaultElementFromRegistry("table")]
    : [];
};

const imageRadius = { tl: 0.08, tr: 0.08, bl: 0.08, br: 0.08 };

const makeImageElement = ({
  x,
  y,
  width,
  height,
  name = "Image",
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
}): SlideElement => ({
  type: "image",
  position: { x, y },
  size: { width, height },
  fit: "cover",
  name,
  border_radius: imageRadius,
});

type EditorInsertContent = {
  elements?: SlideElement[];
  components?: TemplateV2InsertComponent[];
};

const createImageInsertContent = (kind?: string): EditorInsertContent => {
  switch (kind) {
    case "image":
      return {
        elements: [
          makeImageElement({
            x: 1.05,
            y: 1.0,
            width: 4.2,
            height: 2.7,
          }),
        ],
      };
    case "image-text":
      return {
        components: [
          {
            id: "image_text",
            description: "Image with heading and supporting text",
            position: { x: 0.95, y: 1.0 },
            size: { width: 7.5, height: 2.55 },
            elements: [
              makeImageElement({
                x: 0,
                y: 0,
                width: 3.9,
                height: 2.55,
              }),
              makeTextElement({
                text: "Add a heading",
                x: 4.15,
                y: 0.12,
                width: 3.3,
                height: 0.5,
                size: 24,
                bold: true,
              }),
              makeTextElement({
                text: "Add supporting text for this image.",
                x: 4.15,
                y: 0.76,
                width: 3.35,
                height: 0.85,
                size: 16,
                color: "475467",
                lineHeight: 1.3,
              }),
            ],
          },
        ],
      };
    case "image-grid":
      return {
        components: [
          {
            id: "image_grid",
            description: "Two-by-two image grid",
            position: { x: 1.0, y: 0.95 },
            size: { width: 4.9, height: 3.3 },
            elements: [
              makeImageElement({
                x: 0,
                y: 0,
                width: 2.35,
                height: 1.55,
                name: "Image 1",
              }),
              makeImageElement({
                x: 2.55,
                y: 0,
                width: 2.35,
                height: 1.55,
                name: "Image 2",
              }),
              makeImageElement({
                x: 0,
                y: 1.75,
                width: 2.35,
                height: 1.55,
                name: "Image 3",
              }),
              makeImageElement({
                x: 2.55,
                y: 1.75,
                width: 2.35,
                height: 1.55,
                name: "Image 4",
              }),
            ],
          },
        ],
      };
    default:
      return {};
  }
};

const createElementInsertElements = (kind?: string): SlideElement[] => {
  switch (kind) {
    case "rectangle":
      return [
        {
          type: "rectangle",
          position: { x: 1.05, y: 1.05 },
          size: { width: 2.6, height: 1.35 },
          fill: { color: "F4F3FF", opacity: 1 },
          stroke: { color: "7A5AF8", width: 1.5 },
          border_radius: { tl: 0.08, tr: 0.08, bl: 0.08, br: 0.08 },
        },
      ];
    case "ellipse":
      return [
        {
          type: "ellipse",
          position: { x: 1.05, y: 1.05 },
          size: { width: 2.2, height: 1.35 },
          fill: { color: "F4F3FF", opacity: 1 },
          stroke: { color: "7A5AF8", width: 1.5 },
        },
      ];
    case "line":
      return [
        {
          type: "line",
          position: { x: 1.05, y: 1.55 },
          size: { width: 2.8, height: 0.01 },
          stroke: { color: "101323", width: 2 },
        },
      ];
    default:
      return [];
  }
};

const NavButton = ({
  item,
  active,
  onClick,
}: {
  item: ActionItem;
  active: boolean;
  onClick: () => void;
}) => {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex  w-full flex-col items-center justify-center gap-1 text-[12px] leading-none transition-colors",
        active ? "text-[#101323]" : "text-[#111827] ",
      )}
      aria-pressed={active}
    >
      <span
        className={cn(
          "flex  items-center justify-center border border-transparent text-black p-1.5 rounded-[10px] transition-all",
          active && "bg-white   border-[#EDEEEF]",
          active && "text-[#101323]",
        )}
        style={{
          boxShadow: active ? "0 6.6px 13.2px 0 rgba(124, 81, 248, 0.14)" : "",
        }}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="">{item.label}</span>
    </button>
  );
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h4 className="mb-2 text-[10px] font-normal uppercase leading-[15px] tracking-[0.367px] text-[#99A1AF]">
    {children}
  </h4>
);

const PaletteCard = ({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: ActionItem["icon"];
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex h-[58px] min-w-0 flex-col items-center justify-center gap-2 rounded-[8px] border border-[#EDEEF0] bg-white px-2 text-center transition-colors hover:border-[#DCD8EA] hover:bg-[#FBFAFF]"
    title={label}
  >
    <Icon
      className="h-3.5 w-3.5 shrink-0 text-[#1F2937]"
      strokeWidth={1.8}
      aria-hidden
    />
    <span className="w-full break-words text-[11px] font-normal leading-[14px] text-[#171725]">
      {label}
    </span>
  </button>
);

const PaletteGrid = ({
  items,
  onSelect,
}: {
  items: PaletteItem[];
  onSelect?: (item: PaletteItem) => void;
}) => (
  <div className="grid grid-cols-3 gap-2">
    {items.map((item) => (
      <PaletteCard
        key={item.label}
        label={item.label}
        icon={item.icon}
        onClick={onSelect ? () => onSelect(item) : undefined}
      />
    ))}
  </div>
);

const InsertPanel = ({
  title,
  groups,
  onItemSelect,
}: {
  title: string;
  groups: Array<{
    label: string;
    items: PaletteItem[];
  }>;
  onItemSelect?: (item: PaletteItem) => void;
}) => (
  <div className="h-full overflow-y-auto px-5 pb-8 pt-8 hide-scrollbar">
    <h3 className="mb-8 text-[15px] font-semibold leading-5 text-[#101323]">
      {title}
    </h3>
    <div className="space-y-3.5">
      {groups.map((group) => (
        <section key={group.label}>
          <SectionLabel>{group.label}</SectionLabel>
          <PaletteGrid items={group.items} onSelect={onItemSelect} />
        </section>
      ))}
    </div>
  </div>
);

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readRecordString(record: UnknownRecord, key: string): string | null {
  return readString(record[key]);
}

function readRecordArray(record: UnknownRecord, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function humanizeIdentifier(value: string) {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function templateBlockFromComponent(
  component: unknown,
  index: number,
): TemplateBlock | null {
  const raw = isRecord(component) ? component : null;
  if (!raw) return null;

  const id = readRecordString(raw, "id");
  const title =
    readRecordString(raw, "name") ??
    readRecordString(raw, "title") ??
    (id ? humanizeIdentifier(id) : `Component ${index + 1}`);
  const description = readRecordString(raw, "description") ?? "";
  const elementCount = readRecordArray(raw, "elements").length;
  const keyBase = id ?? title;

  return {
    key: `${keyBase}-${index}`,
    title,
    description,
    elementCount,
    raw: component,
    index,
  };
}

function componentVariants(component: unknown): unknown[] {
  const raw = isRecord(component) ? component : null;
  if (!raw) return [];

  return readRecordArray(raw, "variants")
    .map((variant, variantIndex) => {
      if (!isRecord(variant)) return null;
      return {
        ...raw,
        ...variant,
        id:
          readRecordString(variant, "id") ??
          `${readRecordString(raw, "id") ?? "component"}_variant_${variantIndex + 1}`,
        name:
          readRecordString(variant, "name") ??
          readRecordString(variant, "title") ??
          readRecordString(raw, "name") ??
          readRecordString(raw, "title"),
        description:
          readRecordString(variant, "description") ??
          readRecordString(raw, "description"),
      };
    })
    .filter(Boolean);
}

function templateBlockGroupsFromTemplate(template: unknown): TemplateBlockGroup[] {
  const components = extractTemplateV2MergedComponents(template);
  return components
    .map((component, componentIndex) => {
      const baseBlock = templateBlockFromComponent(component, componentIndex);
      if (!baseBlock) return null;
      const variants = componentVariants(component);
      const variantSources = variants.length > 0 ? variants : [component];
      const variantBlocks = variantSources
        .map((variant, variantIndex) => {
          const block = templateBlockFromComponent(variant, componentIndex);
          return block
            ? { ...block, key: `${baseBlock.key}-variant-${variantIndex}` }
            : null;
        })
        .filter((block): block is TemplateBlock => Boolean(block));

      return variantBlocks.length > 0
        ? {
            key: baseBlock.key,
            title: baseBlock.title,
            description: baseBlock.description,
            variants: variantBlocks,
          }
        : null;
    })
    .filter((group): group is TemplateBlockGroup => Boolean(group));
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function collectCandidateTemplateIds(value: unknown, depth = 0): string[] {
  if (depth > 6) return [];

  const ids: Array<string | null | undefined> = [];
  if (Array.isArray(value)) {
    value.slice(0, 80).forEach((item) => {
      ids.push(...collectCandidateTemplateIds(item, depth + 1));
    });
    return uniqueStrings(ids);
  }

  if (!isRecord(value)) return [];

  const directKeys = [
    "templateV2Id",
    "template_v2_id",
    "templateId",
    "template_id",
  ];

  directKeys.forEach((key) => {
    ids.push(readRecordString(value, key) ?? undefined);
  });

  const template = value.template;
  if (typeof template === "string") {
    ids.push(template);
  } else if (isRecord(template)) {
    ids.push(
      readRecordString(template, "id") ??
      readRecordString(template, "templateV2Id") ??
      readRecordString(template, "template_v2_id") ??
      undefined,
    );
  }

  [
    "layout",
    "layouts",
    "slides",
    "presentation",
    "properties",
    "ui",
    "metadata",
  ].forEach((key) => {
    ids.push(...collectCandidateTemplateIds(value[key], depth + 1));
  });

  if (typeof window !== "undefined" && depth === 0) {
    const params = new URLSearchParams(window.location.search);
    ids.push(
      params.get("templateV2Id") ??
      params.get("template_v2_id") ??
      params.get("template_id") ??
      params.get("templateId") ??
      undefined,
    );
  }

  return uniqueStrings(ids);
}

function collectPresentationLayoutIds(presentationData: unknown): string[] {
  const raw = isRecord(presentationData) ? presentationData : null;
  if (!raw) return [];

  const ids: Array<string | null | undefined> = [];
  const layout = raw.layout;

  if (typeof layout === "string") {
    ids.push(layout);
  } else if (isRecord(layout)) {
    ids.push(readRecordString(layout, "id"));
    extractTemplateV2Layouts(layout).forEach((entry) => {
      ids.push(readString(entry.id));
    });
  }

  readRecordArray(raw, "slides").forEach((slide) => {
    if (!isRecord(slide)) return;
    ids.push(readRecordString(slide, "layout"));
  });

  return uniqueStrings(ids);
}

function collectTemplateDetailLayoutIds(
  template: TemplateV2ImportResponse,
): string[] {
  return uniqueStrings([
    ...extractTemplateV2Layouts(template.layouts).map((layout) =>
      readString(layout.id),
    ),
    ...extractTemplateV2Layouts(template.raw_layouts).map((layout) =>
      readString(layout.id),
    ),
  ]);
}

function templateMatchesLayoutIds(
  template: TemplateV2ImportResponse,
  layoutIds: string[],
) {
  if (layoutIds.length === 0) return false;
  const wanted = new Set(layoutIds);
  return collectTemplateDetailLayoutIds(template).some((id) => wanted.has(id));
}

async function loadTemplateBlocksForPresentation(
  presentationData: unknown,
): Promise<TemplateBlockGroup[]> {
  const embeddedBlocks = templateBlockGroupsFromTemplate(presentationData);
  if (embeddedBlocks.length > 0) return embeddedBlocks;

  const candidateIds = collectCandidateTemplateIds(presentationData);
  for (const templateId of candidateIds) {
    try {
      const template = (await TemplateService.getTemplateV2Details(
        templateId,
      )) as TemplateV2ImportResponse;
      const blocks = templateBlockGroupsFromTemplate(template);
      if (blocks.length > 0) return blocks;
    } catch {
      // Candidate ids can include legacy template slugs; ignore and try the next source.
    }
  }

  const layoutIds = collectPresentationLayoutIds(presentationData);
  if (layoutIds.length === 0) return [];

  try {
    const summaries = await TemplateService.getTemplateV2Summaries();
    for (const summary of summaries.items ?? []) {
      try {
        const template = (await TemplateService.getTemplateV2Details(
          summary.id,
        )) as TemplateV2ImportResponse;
        if (!templateMatchesLayoutIds(template, layoutIds)) continue;

        const blocks = templateBlockGroupsFromTemplate(template);
        if (blocks.length > 0) return blocks;
      } catch {
        // Keep searching; one bad template should not break the blocks panel.
      }
    }
  } catch {
    return [];
  }

  return [];
}

function templateBlocksCacheKey(
  presentationId: string,
  presentationData: unknown,
) {
  const candidateIds = collectCandidateTemplateIds(presentationData).join(",");
  const layoutIds = collectPresentationLayoutIds(presentationData).join(",");
  return `${presentationId}:${candidateIds}:${layoutIds}`;
}

function useBlockPreviewScale() {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [previewWidth, setPreviewWidth] = useState(0);

  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;

    const updateWidth = (width = node.getBoundingClientRect().width) => {
      setPreviewWidth((current) =>
        Math.abs(current - width) < 0.5 ? current : width,
      );
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      const handleResize = () => updateWidth();
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }

    const observer = new ResizeObserver((entries) => {
      updateWidth(entries[0]?.contentRect.width);
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  return {
    previewRef,
    scale: previewWidth > 0 ? previewWidth / BLOCK_PREVIEW_WIDTH : 0,
  };
}

function blockPreviewLayout(block: TemplateBlock): TemplateV2Layout {
  return {
    id: `block-preview-${block.key}`,
    components: [block.raw],
  };
}

function BlockThumbnail({ block }: { block: TemplateBlock }) {
  const { previewRef, scale } = useBlockPreviewScale();
  const layout = useMemo(() => blockPreviewLayout(block), [block]);

  return (
    <div
      ref={previewRef}
      className="relative aspect-video w-full overflow-hidden rounded-[6px] bg-white"
    >
      <div
        className={cn(
          "pointer-events-none absolute left-0 top-0 origin-top-left",
          scale > 0 ? "opacity-100" : "opacity-0",
        )}
        style={{
          width: BLOCK_PREVIEW_WIDTH,
          height: BLOCK_PREVIEW_HEIGHT,
          transform: `scale(${scale || 1})`,
        }}
      >
        <TemplateV2KonvaSlide
          layout={layout}
          isEditMode={false}
          slideId={null}
          slideIndex={block.index}
        />
      </div>
    </div>
  );
}

function BlockVariantButton({
  block,
  onInsertBlock,
}: {
  block: TemplateBlock;
  onInsertBlock: (block: TemplateBlock) => void;
}) {
  return (
    <button
      type="button"
      data-block-variant
      className="group relative w-full overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-[#F9FAFB] p-2 text-left transition hover:border-[#D6BBFB] hover:bg-[#FAF9FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A5AF8]/40"
      onClick={() => onInsertBlock(block)}
      aria-label={`Insert ${block.title}`}
    >
      <div className="relative">
        <BlockThumbnail block={block} />
        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#111827] shadow-[0_4px_12px_rgba(16,24,40,0.16)]">
          <GripVertical className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
        </span>
      </div>
    </button>
  );
}

function BlockGroupCard({
  group,
  onInsertBlock,
}: {
  group: TemplateBlockGroup;
  onInsertBlock: (block: TemplateBlock) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasExpanded, setHasExpanded] = useState(false);
  const firstVariant = group.variants[0];
  const additionalVariants = group.variants.slice(1);
  const variantCount = group.variants.length;

  const toggleExpanded = () => {
    if (!expanded) setHasExpanded(true);
    setExpanded((current) => !current);
  };

  return (
    <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-3 transition-shadow hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]">
      <h4 className="mb-4 truncate text-center text-[16px] font-medium leading-5 text-[#171717]">
        {group.title}
      </h4>

      {firstVariant ? (
        <BlockVariantButton
          block={firstVariant}
          onInsertBlock={onInsertBlock}
        />
      ) : null}

      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          expanded
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-3 pt-3">
            {hasExpanded
              ? additionalVariants.map((block) => (
                  <BlockVariantButton
                    key={block.key}
                    block={block}
                    onInsertBlock={onInsertBlock}
                  />
                ))
              : null}
          </div>
        </div>
      </div>

      {variantCount > 1 ? (
        <button
          type="button"
          className="mt-3 flex w-full items-center justify-between gap-3 border-t border-[#E5E7EB] pt-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A5AF8]/40"
          aria-expanded={expanded}
          onClick={toggleExpanded}
        >
          <span className="shrink-0 rounded-full border border-[#D6BBFB] bg-[#FAF8FF] px-3 py-1.5 text-[11px] font-medium leading-4 text-[#7F00FF]">
            {variantCount} Layouts
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-[#171717] transition-transform duration-200",
              expanded && "rotate-180",
            )}
            strokeWidth={2}
            aria-hidden
          />
        </button>
      ) : null}
    </section>
  );
}

const BlocksPanel = ({
  presentationId,
  presentationData,
  onInsertBlock,
}: {
  presentationId: string;
  presentationData?: unknown;
  onInsertBlock: (block: TemplateBlock) => void;
}) => {
  const [blockPrompt, setBlockPrompt] = useState("");
  const [{ blocks, error, loading }, dispatchBlockState] = useReducer(
    blocksPanelReducer,
    initialBlocksPanelState,
  );
  const cacheKey = useMemo(
    () => templateBlocksCacheKey(presentationId, presentationData),
    [presentationData, presentationId],
  );
  const visibleBlocks = useMemo(() => {
    const query = blockPrompt.trim().toLowerCase();
    if (!query) return blocks;
    return blocks.filter(
      (group) =>
        group.title.toLowerCase().includes(query) ||
        group.description.toLowerCase().includes(query) ||
        group.variants.some(
          (variant) =>
            variant.title.toLowerCase().includes(query) ||
            variant.description.toLowerCase().includes(query),
        ),
    );
  }, [blockPrompt, blocks]);

  useEffect(() => {
    let cancelled = false;
    const cached = templateBlocksCache.get(cacheKey);
    if (cached) {
      dispatchBlockState({ type: "cached", blocks: cached });
      return;
    }

    dispatchBlockState({ type: "loading" });
    void loadTemplateBlocksForPresentation(presentationData)
      .then((nextBlocks) => {
        if (cancelled) return;
        if (nextBlocks.length > 0) {
          templateBlocksCache.set(cacheKey, nextBlocks);
        }
        dispatchBlockState({ type: "loaded", blocks: nextBlocks });
      })
      .catch(() => {
        if (cancelled) return;
        dispatchBlockState({
          type: "failed",
          message: "Could not load template components.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, presentationData]);

  return (
    <div className="h-full overflow-y-auto px-5 pb-8 pt-8 hide-scrollbar">
      <h3 className="mb-3 text-[15px] font-semibold leading-5 text-[#101323]">
        Blocks
      </h3>

      <div className="mb-7 flex h-[52px] items-center rounded-[10px] border border-[#EDEEF0] bg-white pl-3 pr-2 shadow-[0_10px_26px_rgba(17,24,39,0.08)]">
        <input
          value={blockPrompt}
          onChange={(event) => setBlockPrompt(event.target.value)}
          placeholder="Search blocks"
          className="min-w-0 flex-1 bg-transparent text-xs text-[#101323] outline-none placeholder:text-[#9CA3AF]"
        />
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{
            background:
              "linear-gradient(270deg, #D5CAFC 2.4%, #E3D2EB 35%, #FDE4C2 100%)",
          }}
          aria-label="Create block"
        >
          <Send className="h-3.5 w-3.5 text-[#101323]" strokeWidth={1.9} />
        </button>
      </div>

      <SectionLabel>Content</SectionLabel>

      <div className="space-y-3">
        {loading && (
          <p className="rounded-[8px] border border-[#E5E7EB] bg-[#F9FAFB] p-4 text-[11px] leading-4 text-[#667085]">
            Loading template components...
          </p>
        )}
        {!loading && error && (
          <p className="rounded-[8px] border border-[#FEE4E2] bg-[#FFFBFA] p-4 text-[11px] leading-4 text-[#B42318]">
            {error}
          </p>
        )}
        {!loading && !error && visibleBlocks.length === 0 && (
          <p className="rounded-[8px] border border-dashed border-[#D0D5DD] bg-[#F9FAFB] p-4 text-[11px] leading-4 text-[#667085]">
            No template components found.
          </p>
        )}
        {!loading &&
          !error &&
          visibleBlocks.map((group) => (
            <BlockGroupCard
              key={group.key}
              group={group}
              onInsertBlock={onInsertBlock}
            />
          ))}
      </div>
    </div>
  );
};

function AiSparklesIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="19"
      height="18"
      viewBox="0 0 19 18"
      fill="none"
    >
      <path
        d="M14.9386 7.38709C12.9195 7.19256 11.3219 5.59566 11.1276 3.57829L10.7997 0.171875L10.4718 3.57829C10.2775 5.596 8.67987 7.1929 6.66079 7.38709L3.25684 7.71473L6.66079 8.04237C8.67987 8.23691 10.2775 9.8338 10.4718 11.8512L10.7997 15.2576L11.1276 11.8512C11.3219 9.83346 12.9195 8.23656 14.9386 8.04237L18.3426 7.71473L14.9386 7.38709Z"
        fill="#7A5AF8"
      />
      <path
        d="M7.08427 13.146C5.95358 13.0371 5.0589 12.1428 4.95008 11.0131L4.76648 9.10547L4.58288 11.0131C4.47406 12.143 3.57938 13.0372 2.44869 13.146L0.54248 13.3295L2.44869 13.5129C3.57938 13.6219 4.47406 14.5161 4.58288 15.6459L4.76648 17.5535L4.95008 15.6459C5.0589 14.516 5.95358 13.6217 7.08427 13.5129L8.99048 13.3295L7.08427 13.146Z"
        fill="#7A5AF8"
      />
    </svg>
  );
}

function BlocksIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
    >
      <path
        d="M2.3335 8.16602H5.8335"
        stroke="#7A5AF8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.3335 1.16602H8.16683"
        stroke="#7A5AF8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.0835 10.5H2.91683C2.59466 10.5 2.3335 10.7612 2.3335 11.0833V12.25C2.3335 12.5722 2.59466 12.8333 2.91683 12.8333H11.0835C11.4057 12.8333 11.6668 12.5722 11.6668 12.25V11.0833C11.6668 10.7612 11.4057 10.5 11.0835 10.5Z"
        stroke="#7A5AF8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.0835 3.5H2.91683C2.59466 3.5 2.3335 3.76117 2.3335 4.08333V5.25C2.3335 5.57217 2.59466 5.83333 2.91683 5.83333H11.0835C11.4057 5.83333 11.6668 5.57217 11.6668 5.25V4.08333C11.6668 3.76117 11.4057 3.5 11.0835 3.5Z"
        stroke="#7A5AF8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PrimaryActionButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="mt-10 first:mt-0" onClick={onClick}>
      <p
        className={`p-1.5 flex items-center justify-center rounded-[10px] border border-transparent ${active ? "border-[#EDEEEF] bg-white" : ""
          }`}
        style={{
          boxShadow: active ? "0 6.6px 13.2px 0 rgba(124, 81, 248, 0.14)" : "",
        }}
      >
        {icon}
      </p>
      <p className="text-[#7A5AF8] text-xs mt-1">{label}</p>
    </button>
  );
}

function ActionsSidebar({
  activeAction,
  onActionSelect,
}: {
  activeAction: ActionId;
  onActionSelect: (action: ActionId) => void;
}) {
  return (
    <aside className="flex h-full w-[70px] shrink-0 flex-col items-center border-r border-[#F4F4F5]  py-5">
      <div
        className="flex w-full space-y-10 flex-col items-center rounded-[10px]  py-7"
        style={{
          background: "rgba(244, 243, 255, 0.60)",
        }}
      >
        <PrimaryActionButton
          active={activeAction === "ai"}
          icon={<AiSparklesIcon />}
          label="AI"
          onClick={() => onActionSelect("ai")}
        />
        <PrimaryActionButton
          active={activeAction === "blocks"}
          icon={<BlocksIcon />}
          label="Blocks"
          onClick={() => onActionSelect("blocks")}
        />
      </div>

      <div className="my-6 px-1 h-px w-[30px] bg-[#EDEEEF]" />

      <nav className="flex w-full space-y-10 flex-1 flex-col items-center gap-3">
        {insertActions.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={activeAction === item.id}
            onClick={() => onActionSelect(item.id)}
          />
        ))}
      </nav>
    </aside>
  );
}

function ActionsPanel({
  activeAction,
  chartEditor,
  chatProps,
  onBlockSelect,
  onChartChange,
  onChartClose,
  onChartItemSelect,
  onElementItemSelect,
  onImageItemSelect,
  onTableItemSelect,
  onTextItemSelect,
  presentationData,
  presentationId,
}: {
  activeAction: ActionId;
  chartEditor: ChartEditorState | null;
  chatProps: Omit<PresentationActionsProps, "presentationData">;
  onBlockSelect: (block: TemplateBlock) => void;
  onChartChange: (chart: ChartElement) => void;
  onChartClose: () => void;
  onChartItemSelect: (item: PaletteItem) => void;
  onElementItemSelect: (item: PaletteItem) => void;
  onImageItemSelect: (item: PaletteItem) => void;
  onTableItemSelect: (item: PaletteItem) => void;
  onTextItemSelect: (item: PaletteItem) => void;
  presentationData?: unknown;
  presentationId: string;
}) {
  return (
    <div className="min-w-0 flex-1 bg-white">
      <div className={cn("h-full", activeAction === "ai" ? "block" : "hidden")}>
        <Chat {...chatProps} />
      </div>

      {activeAction === "blocks" && (
        <BlocksPanel
          presentationId={presentationId}
          presentationData={presentationData}
          onInsertBlock={onBlockSelect}
        />
      )}
      {activeAction === "texts" && (
        <InsertPanel
          title="Texts"
          groups={[{ label: "Add", items: textItems }]}
          onItemSelect={onTextItemSelect}
        />
      )}
      {activeAction === "charts" &&
        (chartEditor ? (
          <ChartEditorContent
            chart={chartEditor.chart}
            chartPath={chartEditor.path}
            onChange={onChartChange}
            onClose={onChartClose}
          />
        ) : (
          <InsertPanel
            title="Charts"
            groups={[{ label: "Chart Type", items: chartTypeItems }]}
            onItemSelect={onChartItemSelect}
          />
        ))}
      {activeAction === "tables" && (
        <InsertPanel
          title="Tables"
          groups={[{ label: "Table Type", items: tableTypeItems }]}
          onItemSelect={onTableItemSelect}
        />
      )}
      {activeAction === "images" && (
        <InsertPanel
          title="Images"
          groups={[{ label: "Add", items: imageItems }]}
          onItemSelect={onImageItemSelect}
        />
      )}
      {activeAction === "elements" && (
        <InsertPanel
          title="Elements"
          groups={[{ label: "Add", items: elementItems }]}
          onItemSelect={onElementItemSelect}
        />
      )}
    </div>
  );
}

const PresentationActions = (props: PresentationActionsProps) => {
  const { presentationData, ...chatProps } = props;
  const [{ activeAction, chartEditor }, dispatchUiState] = useReducer(
    presentationActionsUiReducer,
    initialPresentationActionsUiState,
  );

  useEffect(() => {
    const handleChartEditorOpen = (event: Event) => {
      const detail = (event as CustomEvent<TemplateV2ChartEditorDetail>).detail;
      if (!detail) return;

      if (detail.open === false) {
        dispatchUiState({ type: "closeChartEditor" });
        return;
      }

      if (!detail.chart || !detail.path) return;
      if (
        typeof props.currentSlide === "number" &&
        typeof detail.slideIndex === "number" &&
        props.currentSlide !== detail.slideIndex
      ) {
        return;
      }

      dispatchUiState({
        type: "openChartEditor",
        chartEditor: {
          chart: detail.chart,
          path: detail.path,
          rootIndex: detail.rootIndex ?? 0,
          slideId: detail.slideId ?? null,
          slideIndex: detail.slideIndex ?? null,
        },
      });
    };

    window.addEventListener(
      TEMPLATE_V2_CHART_EDITOR_EVENT,
      handleChartEditorOpen,
    );
    return () => {
      window.removeEventListener(
        TEMPLATE_V2_CHART_EDITOR_EVENT,
        handleChartEditorOpen,
      );
    };
  }, [props.currentSlide]);

  useEffect(() => {
    dispatchUiState({
      type: "syncCurrentSlide",
      currentSlide: props.currentSlide,
    });
  }, [props.currentSlide]);

  const updateChartEditor = (chart: ChartElement) => {
    if (!chartEditor || typeof window === "undefined") return;

    const detail: TemplateV2ChartUpdateDetail = {
      action: "update",
      chart,
      path: chartEditor.path,
      slideId: chartEditor.slideId,
      slideIndex: chartEditor.slideIndex,
    };
    window.dispatchEvent(
      new CustomEvent(TEMPLATE_V2_CHART_UPDATE_EVENT, { detail }),
    );

    if (!detail.handled) {
      notify.warning(
        "Chart unavailable",
        "Select the chart again before editing it.",
      );
      return;
    }

    dispatchUiState({ type: "updateChartEditor", chart });
  };

  const closeChartEditor = () => {
    if (chartEditor && typeof window !== "undefined") {
      const detail: TemplateV2ChartUpdateDetail = {
        action: "close",
        path: chartEditor.path,
        slideId: chartEditor.slideId,
        slideIndex: chartEditor.slideIndex,
      };
      window.dispatchEvent(
        new CustomEvent(TEMPLATE_V2_CHART_UPDATE_EVENT, { detail }),
      );
    }
    dispatchUiState({ type: "closeChartEditor" });
  };

  const insertEditorContent = (
    content: EditorInsertContent,
    label: string,
  ) => {
    if (typeof window === "undefined") return;
    if (typeof props.currentSlide !== "number") {
      notify.warning("Select a slide", "Choose a slide before adding content.");
      return;
    }
    if (
      (content.elements?.length ?? 0) === 0 &&
      (content.components?.length ?? 0) === 0
    ) {
      return;
    }

    const detail: TemplateV2InsertElementsDetail = {
      ...content,
      label,
      slideIndex: props.currentSlide,
    };

    window.dispatchEvent(
      new CustomEvent(TEMPLATE_V2_INSERT_ELEMENTS_EVENT, { detail }),
    );

    if (!detail.handled) {
      notify.warning(
        "Insert unavailable",
        "Content can be added only when a USE_SLIDE_EDITOR_IMPORT slide is selected.",
      );
      return;
    }

    window.requestAnimationFrame(() => {
      document.getElementById(`slide-${props.currentSlide}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  };

  const insertEditorElements = (elements: SlideElement[], label: string) => {
    insertEditorContent({ elements }, label);
  };

  const handleTextItemSelect = (item: PaletteItem) => {
    insertEditorElements(createTextInsertElements(item.id), item.label);
  };

  const handleChartItemSelect = (item: PaletteItem) => {
    insertEditorElements(createChartInsertElements(item.id), item.label);
  };

  const handleTableItemSelect = (item: PaletteItem) => {
    insertEditorElements(createTableInsertElements(item.id), item.label);
  };

  const handleImageItemSelect = (item: PaletteItem) => {
    insertEditorContent(createImageInsertContent(item.id), item.label);
  };

  const handleElementItemSelect = (item: PaletteItem) => {
    insertEditorElements(createElementInsertElements(item.id), item.label);
  };

  const handleBlockSelect = (block: TemplateBlock) => {
    const element = adaptTemplateV2ComponentToElement(block.raw, block.index);
    if (!element) {
      notify.warning(
        "Component unavailable",
        "This template component cannot be inserted yet.",
      );
      return;
    }

    insertEditorElements([element], block.title);
  };

  const handleActionSelect = (activeAction: ActionId) => {
    dispatchUiState({ type: "selectAction", activeAction });
  };

  return (
    <div className="flex h-full w-full overflow-hidden  bg-white px-2 py-1.5">
      <ActionsSidebar
        activeAction={activeAction}
        onActionSelect={handleActionSelect}
      />
      <ActionsPanel
        activeAction={activeAction}
        chartEditor={chartEditor}
        chatProps={chatProps}
        onBlockSelect={handleBlockSelect}
        onChartChange={updateChartEditor}
        onChartClose={closeChartEditor}
        onChartItemSelect={handleChartItemSelect}
        onElementItemSelect={handleElementItemSelect}
        onImageItemSelect={handleImageItemSelect}
        onTableItemSelect={handleTableItemSelect}
        onTextItemSelect={handleTextItemSelect}
        presentationData={presentationData}
        presentationId={props.presentationId}
      />
    </div>
  );
};

export default PresentationActions;
