import type { TemplateV2InsertComponent } from "@/components/slide-editor/events/events";
import { normalizeChartTypeName } from "@/components/slide-editor/charts/chart-data";
import type {
  ChartType,
  Fill,
  Font,
  SlideElement,
  TableCell,
} from "@/components/slide-editor/types";

const DEFAULT_CHART_INSERT_POSITION = { x: 128, y: 115 };
const DEFAULT_CHART_INSERT_SIZE = { width: 717, height: 410 };
const DEFAULT_IMAGE_PLACEHOLDER_SRC = "/placeholder.jpg";
const TEXT_INSERT_VERTICAL_PADDING_PX = 14;
const IMAGE_RADIUS = { tl: 10, tr: 10, bl: 10, br: 10 };

export type EditorInsertContent = {
  elements?: SlideElement[];
  components?: TemplateV2InsertComponent[];
};

function fittedTextHeight(
  lineCount: number,
  fontSize: number,
  lineHeight: number,
) {
  return Math.ceil(
    lineCount * fontSize * lineHeight + TEXT_INSERT_VERTICAL_PADDING_PX,
  );
}

function makeTextElement({
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
}): SlideElement {
  return {
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
  };
}

function makeTableCell({
  text,
  font,
  color,
  alignment = "left",
}: {
  text: string;
  font: Font;
  color?: Fill;
  alignment?: TableCell["alignment"];
}): TableCell {
  return {
    alignment,
    color,
    runs: [{ text, font }],
  };
}

function makeBulletListElement(): SlideElement {
  const baseFont = {
    size: 18,
    family: "Inter",
    color: "#111111",
    bold: false,
    italic: false,
    line_height: 1.4,
    letter_spacing: 0,
    wrap: "word" as const,
    ellipsis: false,
  };
  const items = [
    [{ text: "Clarify the goal and audience", font: { ...baseFont, bold: true } }],
    [{ text: "Show the strongest supporting point", font: { ...baseFont } }],
    [{ text: "Close with the next action", font: { ...baseFont, italic: true } }],
  ];

  return {
    type: "text-list",
    position: { x: 122, y: 128 },
    size: {
      width: 691,
      height: fittedTextHeight(
        items.length,
        baseFont.size,
        baseFont.line_height,
      ),
    },
    rotation: 0,
    font: baseFont,
    marker: "bullet",
    items,
    decorative: false,
    name: "Project task list",
    max_items: 6,
    min_items: 3,
    max_item_length: 60,
    min_item_length: 30,
  };
}

export function createTextInsertElements(kind?: string): SlideElement[] {
  switch (kind) {
    case "title-block":
      return [
        makeTextElement({
          text: "Add a clear slide title",
          x: 109,
          y: 109,
          width: 986,
          height: fittedTextHeight(1, 38, 1.1),
          size: 38,
          bold: true,
        }),
      ];
    case "subtitle":
      return [
        makeTextElement({
          text: "Add a concise supporting subtitle",
          x: 122,
          y: 154,
          width: 870,
          height: fittedTextHeight(1, 24, 1.2),
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
          x: 122,
          y: 147,
          width: 858,
          height: fittedTextHeight(2, 24, 1.25),
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
          x: 122,
          y: 154,
          width: 858,
          height: fittedTextHeight(2, 18, 1.28),
          size: 18,
          color: "344054",
          lineHeight: 1.28,
        }),
      ];
    default:
      return [];
  }
}

function chartTypeFromPaletteId(id?: string): ChartType | null {
  const normalized = normalizeChartTypeName(id);
  switch (normalized) {
    case "area":
    case "bar":
    case "bubble":
    case "donut":
    case "horizontal_bar":
    case "line":
    case "pie":
    case "polar_area":
    case "radar":
    case "scatter":
      return normalized as ChartType;
    case "stackedbar":
    case "stacked_bar":
      return "stacked_bar";
    case "horizontalstackbar":
    case "horizontalstackedbar":
    case "horizontal_stack_bar":
    case "horizontal_stacked_bar":
      return "horizontal_stacked_bar";
    default:
      return null;
  }
}

function chartData(
  categories: string[],
  values: number[],
  colors: string[],
) {
  return categories.map((category, index) => ({
    label: category,
    value: values[index] ?? 0,
    color: colors[index % colors.length] ?? colors[0],
  }));
}

function makeChartElement(chartType: ChartType): SlideElement {
  if (chartType === "bar") {
    const categories = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const values = [70, 120, 45, 145, 105, 105, 45];
    const colors = [
      "4D20C5",
      "155DFC",
      "F59E0B",
      "12B76A",
      "EF4444",
      "06B6D4",
      "8B5CF6",
    ];

    return {
      type: "chart",
      position: { ...DEFAULT_CHART_INSERT_POSITION },
      size: { ...DEFAULT_CHART_INSERT_SIZE },
      chart_type: "bar",
      title: "Weekly Report\nJun 10-12",
      color: "4D20C5",
      axis_color: "D8D8D8",
      grid_color: "D8D8D8",
      data_labels: true,
      x_axis_grid: true,
      y_axis_grid: true,
      x_axis: true,
      y_axis: true,
      categories,
      series: [{ name: "Students Number", values }],
      colors,
      data: chartData(categories, values, colors),
    };
  }

  if (chartType === "line") {
    const categories = ["2021", "2022", "2023", "2024", "2025", "2026"];
    const values = [15, 45, 85, 50, 15, 55];
    const colors = [
      "4D20C5",
      "155DFC",
      "F59E0B",
      "12B76A",
      "EF4444",
      "06B6D4",
    ];

    return {
      type: "chart",
      position: { ...DEFAULT_CHART_INSERT_POSITION },
      size: { ...DEFAULT_CHART_INSERT_SIZE },
      chart_type: "line",
      title: "Enrollment Over Years\n2021-2026",
      color: "4D20C5",
      axis_color: "D8D8D8",
      grid_color: "D8D8D8",
      data_labels: false,
      x_axis_grid: true,
      y_axis_grid: true,
      x_axis: true,
      y_axis: false,
      categories,
      series: [{ name: "Students Number", values }],
      colors,
      data: chartData(categories, values, colors),
    };
  }

  if (chartType === "area") {
    const categories = ["2021", "2022", "2023", "2024", "2025", "2026"];
    const values = [25, 74, 46, 57, 62, 67];
    const colors = [
      "4D20C5",
      "155DFC",
      "F59E0B",
      "12B76A",
      "EF4444",
      "06B6D4",
    ];

    return {
      type: "chart",
      position: { ...DEFAULT_CHART_INSERT_POSITION },
      size: { ...DEFAULT_CHART_INSERT_SIZE },
      chart_type: "area",
      title: "Enrollment Over Years\n2021-2026",
      color: "7555F6",
      axis_color: "D8D8D8",
      grid_color: "D8D8D8",
      data_labels: false,
      x_axis_grid: true,
      y_axis_grid: true,
      x_axis: true,
      y_axis: false,
      categories,
      series: [{ name: "Students Number", values }],
      colors,
      data: chartData(categories, values, colors),
    };
  }

  if (chartType === "pie") {
    const categories = ["Category A", "Category B", "Category C"];
    const values = [55, 25, 20];
    const colors = ["7555F6", "AA9AF8", "E7E3FA"];

    return {
      type: "chart",
      position: { ...DEFAULT_CHART_INSERT_POSITION },
      size: { ...DEFAULT_CHART_INSERT_SIZE },
      chart_type: "pie",
      title: "Weekly Report\nJun 10-12",
      color: "7555F6",
      axis_color: "D8D8D8",
      grid_color: "D8D8D8",
      data_labels: true,
      categories,
      series: [{ name: "Weekly Report", values }],
      colors,
      data: chartData(categories, values, colors),
    };
  }

  if (chartType === "stacked_bar" || chartType === "horizontal_stacked_bar") {
    const label = chartLabel(chartType);
    const categories = ["Q1", "Q2", "Q3", "Q4"];
    const values = [38, 54, 47, 68];
    const secondaryValues = [24, 36, 31, 42];
    const colors = ["7F22FE", "155DFC"];

    return {
      type: "chart",
      position: { ...DEFAULT_CHART_INSERT_POSITION },
      size: { width: 538, height: 410 },
      chart_type: chartType,
      title: label,
      color: "7F22FE",
      axis_color: "D0D5DD",
      grid_color: "D0D5DD",
      data_labels: true,
      legend: true,
      x_axis_grid: true,
      y_axis_grid: true,
      categories,
      series: [
        { name: "Product", values },
        { name: "Services", values: secondaryValues },
      ],
      colors,
      data: chartData(categories, values, colors),
    };
  }

  const label = chartLabel(chartType);
  const categories = ["Q1", "Q2", "Q3", "Q4"];
  const values = [38, 54, 47, 68];
  const colors = ["7F22FE", "155DFC", "F59E0B", "12B76A"];

  return {
    type: "chart",
    position: { ...DEFAULT_CHART_INSERT_POSITION },
    size: { width: 538, height: 410 },
    chart_type: chartType,
    title: label,
    color: "7F22FE",
    axis_color: "D0D5DD",
    grid_color: "D0D5DD",
    data_labels: true,
    x_axis_grid: true,
    y_axis_grid: true,
    categories,
    series: [{ name: label, values }],
    colors,
    data: chartData(categories, values, colors),
  };
}

function chartLabel(chartType: ChartType) {
  switch (chartType) {
    case "bubble":
      return "Bubble chart";
    case "horizontal_bar":
      return "Horizontal bar";
    case "donut":
      return "Donut chart";
    case "polar_area":
      return "Polar area chart";
    case "radar":
      return "Radar chart";
    case "scatter":
      return "Scatter chart";
    case "stacked_bar":
      return "Stacked bar chart";
    case "horizontal_stacked_bar":
      return "Horizontal stack bar";
    default:
      return "Chart";
  }
}

export function createChartInsertElements(kind?: string): SlideElement[] {
  const chartType = chartTypeFromPaletteId(kind);
  return chartType ? [makeChartElement(chartType)] : [];
}

function makeSimpleTableElement(): SlideElement {
  const baseFont: Font = {
    family: "Inter",
    size: 14,
    color: "#344054",
    line_height: 1.2,
    wrap: "word",
  };
  const headerFont: Font = {
    ...baseFont,
    color: "#101323",
    bold: true,
    wrap: "none",
  };
  const headerFill: Fill = { color: "#F2F4F7", opacity: 1 };
  const bodyFill: Fill = { color: "#FFFFFF", opacity: 1 };

  return {
    type: "table",
    position: { x: 122, y: 128 },
    size: { width: 819, height: 186 },
    font: baseFont,
    columns: [
      makeTableCell({ text: "Metric", font: headerFont, color: headerFill }),
      makeTableCell({ text: "Current", font: headerFont, color: headerFill }),
      makeTableCell({ text: "Target", font: headerFont, color: headerFill }),
    ],
    rows: [
      [
        makeTableCell({ text: "Activation", font: baseFont, color: bodyFill }),
        makeTableCell({ text: "68%", font: baseFont, color: bodyFill }),
        makeTableCell({ text: "75%", font: baseFont, color: bodyFill }),
      ],
      [
        makeTableCell({ text: "Retention", font: baseFont, color: bodyFill }),
        makeTableCell({ text: "42%", font: baseFont, color: bodyFill }),
        makeTableCell({ text: "50%", font: baseFont, color: bodyFill }),
      ],
    ],
    min_columns: 2,
    max_columns: 6,
    min_rows: 2,
    max_rows: 8,
  };
}

export function createTableInsertElements(kind?: string): SlideElement[] {
  return kind === "simple-table" ? [makeSimpleTableElement()] : [];
}

function makeImageElement({
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
}): SlideElement {
  return {
    type: "image",
    position: { x, y },
    size: { width, height },
    data: DEFAULT_IMAGE_PLACEHOLDER_SRC,
    fit: "cover",
    name,
    border_radius: IMAGE_RADIUS,
  };
}

export function createImageInsertContent(kind?: string): EditorInsertContent {
  switch (kind) {
    case "image":
      return {
        elements: [
          makeImageElement({
            x: 134,
            y: 128,
            width: 666,
            height: 397,
          }),
        ],
      };
    case "image-text":
      return {
        components: [
          {
            id: "image_text",
            description: "Image with heading and supporting text",
            position: { x: 122, y: 128 },
            size: { width: 986, height: 371 },
            elements: [
              makeImageElement({ x: 0, y: 0, width: 486, height: 371 }),
              makeTextElement({
                text: "Add a heading",
                x: 525,
                y: 15,
                width: 442,
                height: 74,
                size: 24,
                bold: true,
              }),
              makeTextElement({
                text: "Add supporting text that explains why this visual matters.",
                x: 525,
                y: 108,
                width: 442,
                height: 134,
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
            position: { x: 128, y: 122 },
            size: { width: 717, height: 454 },
            elements: [
              makeImageElement({
                x: 0,
                y: 0,
                width: 346,
                height: 211,
                name: "Image 1",
              }),
              makeImageElement({
                x: 371,
                y: 0,
                width: 346,
                height: 211,
                name: "Image 2",
              }),
              makeImageElement({
                x: 0,
                y: 243,
                width: 346,
                height: 211,
                name: "Image 3",
              }),
              makeImageElement({
                x: 371,
                y: 243,
                width: 346,
                height: 211,
                name: "Image 4",
              }),
            ],
          },
        ],
      };
    default:
      return {};
  }
}

export function createElementInsertElements(kind?: string): SlideElement[] {
  switch (kind) {
    case "rectangle":
      return [
        {
          type: "rectangle",
          position: { x: 134, y: 134 },
          size: { width: 384, height: 192 },
          fill: { color: "F4F3FF", opacity: 1 },
          stroke: { color: "7A5AF8", width: 1.5 },
          border_radius: { tl: 10, tr: 10, bl: 10, br: 10 },
        },
      ];
    case "ellipse":
      return [
        {
          type: "ellipse",
          position: { x: 134, y: 134 },
          size: { width: 346, height: 198 },
          fill: { color: "F4F3FF", opacity: 1 },
          stroke: { color: "7A5AF8", width: 1.5 },
        },
      ];
    case "line":
      return [
        {
          type: "line",
          position: { x: 134, y: 218 },
          size: { width: 435, height: 1 },
          stroke: { color: "101323", width: 2 },
        },
      ];
    default:
      return [];
  }
}
