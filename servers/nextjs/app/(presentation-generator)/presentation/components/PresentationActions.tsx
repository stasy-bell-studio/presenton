"use client";

import React, { useState } from "react";
import {
  AlignCenter,
  AreaChart,
  BarChart3,
  Blocks,
  Circle,
  Columns2,
  FileText,
  Grid3X3,
  GripVertical,
  Image,
  Layers,
  LineChart,
  List,
  Minus,
  PanelTop,
  PieChart,
  Quote,
  RectangleHorizontal,
  Rows3,
  Send,
  Shapes,
  Sparkles,
  Table2,
  Type,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { notify } from "@/components/ui/sonner";
import type {
  ChartType,
  SlideElement,
} from "@/components/slide-editor/lib/slide-schema";
import Chat from "./Chat";
import {
  TEMPLATE_V2_INSERT_ELEMENTS_EVENT,
  type TemplateV2InsertElementsDetail,
} from "../../components/TemplateV2KonvaSlide";

type PresentationActionsProps = React.ComponentProps<typeof Chat>;

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

const primaryActions: ActionItem[] = [
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "blocks", label: "Blocks", icon: Blocks },
];

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
  { label: "Simple Table", icon: Table2 },
  { label: "Data Grid", icon: Grid3X3 },
];

const tableComponentItems = [
  { label: "Data Table", icon: Table2 },
  { label: "Comparison", icon: Columns2 },
  { label: "KPI Cards", icon: FileText },
  { label: "Pricing", icon: BarChart3 },
];

const imageItems = [
  { label: "Image", icon: Image },
  { label: "Image + Text", icon: Columns2 },
  { label: "Image Grid", icon: Grid3X3 },
];

const imageComponentItems = [
  { label: "Teams", icon: Users },
  { label: "Feature Grid", icon: Columns2 },
];

const elementItems = [
  { label: "Rectangle", icon: RectangleHorizontal },
  { label: "Ellipse", icon: Circle },
  { label: "Line", icon: Minus },
];

const elementComponentItems = [
  { label: "Single Column", icon: PanelTop },
  { label: "Two Column", icon: Columns2 },
  { label: "Grid", icon: Grid3X3 },
  { label: "Stack", icon: Layers },
];

const contentCards = [
  {
    title: "Key Findings",
    type: "Paragraph",
    body: (
      <p>
        Our platform reached{" "}
        <span className="font-semibold text-[#7F22FE]">$4.2M ARR</span> this
        quarter, representing 23% year-over-year growth across all customer
        segments globally.
      </p>
    ),
  },
  {
    title: "Q3 Highlights",
    type: "Bullet List",
    body: (
      <ul className="space-y-1.5">
        {[
          "Revenue grew 23% year-over-year",
          "Reached 12,840 active customers",
          "NPS improved to 74 (+6 pts)",
          "Churn reduced to 2.1%",
        ].map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#7F22FE]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    ),
  },
];

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
    lineHeight,
  },
});

const makeBulletListElement = (): SlideElement => ({
  type: "text-list",
  position: { x: 0.95, y: 1.2 },
  size: { width: 5.4, height: 1.5 },
  marker: "bullet",
  items: [
    { type: "text", text: "First point" },
    { type: "text", text: "Second point" },
    { type: "text", text: "Third point" },
  ],
  font: {
    family: "Arial",
    size: 18,
    color: "101323",
    lineHeight: 1.3,
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
  const isCircular = chartType === "pie" || chartType === "donut";
  const label =
    chartType === "bar"
      ? "Bar chart"
      : chartType === "line"
        ? "Line chart"
        : chartType === "area"
          ? "Area chart"
          : chartType === "pie"
            ? "Pie chart"
            : "Donut chart";

  return {
    type: "chart",
    position: { x: 1.05, y: 1.05 },
    size: { width: isCircular ? 4.4 : 5.2, height: 2.6 },
    chartType,
    title: label,
    color: "7F22FE",
    axisColor: "D0D5DD",
    labelColor: "475467",
    showValues: chartType !== "area",
    data: [
      { label: "Q1", value: 38, color: "7F22FE" },
      { label: "Q2", value: 54, color: "155DFC" },
      { label: "Q3", value: 47, color: "F59E0B" },
      { label: "Q4", value: 68, color: "12B76A" },
    ],
  };
};

const createChartInsertElements = (kind?: string): SlideElement[] => {
  const chartType = chartTypeFromPaletteId(kind);
  return chartType ? [makeChartElement(chartType)] : [];
};

const NavButton = ({
  item,
  active,
  inPrimaryGroup = false,
  onClick,
}: {
  item: ActionItem;
  active: boolean;
  inPrimaryGroup?: boolean;
  onClick: () => void;
}) => {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex  w-full flex-col items-center justify-center gap-1 text-[12px] leading-none transition-colors",
        active ? "text-[#101323]" : "text-[#111827] "
      )}
      aria-pressed={active}
    >
      <span
        className={cn(
          "flex  items-center justify-center border border-transparent text-black p-1.5 rounded-[10px] transition-all",
          active && "bg-white   border-[#EDEEEF]",
          active && "text-[#101323]"
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

const BlocksPanel = () => {
  const [blockPrompt, setBlockPrompt] = useState("");

  return (
    <div className="h-full overflow-y-auto px-5 pb-8 pt-8 hide-scrollbar">
      <h3 className="mb-3 text-[15px] font-semibold leading-5 text-[#101323]">
        Blocks
      </h3>

      <div className="mb-7 flex h-[52px] items-center rounded-[10px] border border-[#EDEEF0] bg-white pl-3 pr-2 shadow-[0_10px_26px_rgba(17,24,39,0.08)]">
        <input
          value={blockPrompt}
          onChange={(event) => setBlockPrompt(event.target.value)}
          placeholder="Describe your components"
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
        <button
          type="button"
          className="relative w-full rounded-[8px] border border-[#E5E7EB] bg-[#F9FAFB] p-4 text-left"
        >
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#111827] shadow-[0_4px_12px_rgba(16,24,40,0.16)]">
            <GripVertical
              className="h-3.5 w-3.5"
              strokeWidth={1.8}
              aria-hidden
            />
          </span>
          <h4 className="text-[17px] font-semibold leading-5 text-[#101323]">
            Company Overview
          </h4>
          <p className="mt-2 text-[10px] leading-4 text-[#667085]">
            Q3 2024 - Strategic Briefing
          </p>
          <div className="mt-3 h-[3px] w-8 rounded-full bg-[#7F22FE]" />
        </button>
        <p className="-mt-1 pl-2 text-[11px] leading-4 text-[#171725]">
          Title Block
        </p>

        {contentCards.map((card) => (
          <React.Fragment key={card.title}>
            <button
              type="button"
              className="w-full rounded-[8px] border border-[#E5E7EB] bg-[#F9FAFB] p-4 text-left"
            >
              <h4 className="mb-2 text-[12px] font-semibold leading-4 text-[#101323]">
                {card.title}
              </h4>
              <div className="text-[10px] font-normal leading-[15px] text-[#344054]">
                {card.body}
              </div>
            </button>
            <p className="-mt-1 pl-2 text-[11px] leading-4 text-[#171725]">
              {card.type}
            </p>
          </React.Fragment>
        ))}

        <button
          type="button"
          className="w-full rounded-[8px] border border-[#E5E7EB] bg-[#FAF9FF] p-4 text-left"
        >
          <div className="border-l-[4px] border-[#7F22FE] pl-3">
            <p className="text-[11px] font-semibold leading-[17px] text-[#101323]">
              &quot;The best investment we made was in our customer success team
              - it paid back 10x.&quot;
            </p>
            <p className="mt-2 text-[9px] leading-3 text-[#98A2B3]">
              - Sarah Kim, CEO - Presenton
            </p>
          </div>
        </button>
      </div>
    </div>
  );
};

const PresentationActions = (props: PresentationActionsProps) => {
  const [activeAction, setActiveAction] = useState<ActionId>("ai");

  const insertEditorElements = (elements: SlideElement[], label: string) => {
    if (typeof window === "undefined") return;
    if (typeof props.currentSlide !== "number") {
      notify.warning("Select a slide", "Choose a slide before adding content.");
      return;
    }
    if (elements.length === 0) return;

    const detail: TemplateV2InsertElementsDetail = {
      elements,
      label,
      slideIndex: props.currentSlide,
    };

    window.dispatchEvent(
      new CustomEvent(TEMPLATE_V2_INSERT_ELEMENTS_EVENT, { detail })
    );

    if (!detail.handled) {
      notify.warning(
        "Insert unavailable",
        "Content can be added only when a USE_SLIDE_EDITOR_IMPORT slide is selected."
      );
    }
  };

  const handleTextItemSelect = (item: PaletteItem) => {
    insertEditorElements(createTextInsertElements(item.id), item.label);
  };

  const handleChartItemSelect = (item: PaletteItem) => {
    insertEditorElements(createChartInsertElements(item.id), item.label);
  };

  return (
    <div className="flex h-full w-full overflow-hidden  bg-white px-2 py-1.5">
      <aside className="flex h-full w-[70px] shrink-0 flex-col items-center border-r border-[#F4F4F5]  py-5">
        <div
          className="flex w-full space-y-10 flex-col items-center rounded-[10px]  py-7"
          style={{
            background: "rgba(244, 243, 255, 0.60)",
          }}
        >
          <button className="" onClick={() => setActiveAction("ai")}>
            <p
              className={`p-1.5 flex items-center justify-center rounded-[10px] border border-transparent ${
                activeAction === "ai" ? "border-[#EDEEEF] bg-white" : ""
              }`}
              style={{
                boxShadow:
                  activeAction === "ai"
                    ? "0 6.6px 13.2px 0 rgba(124, 81, 248, 0.14)"
                    : "",
              }}
            >
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
            </p>
            <p className="text-[#7A5AF8] text-xs mt-1">AI</p>
          </button>
          <button className="mt-10" onClick={() => setActiveAction("blocks")}>
            <p
              className={`p-1.5 flex justify-center items-center rounded-[10px] border border-transparent ${
                activeAction === "blocks" ? "border-[#EDEEEF] bg-white" : ""
              }`}
              style={{
                boxShadow:
                  activeAction === "blocks"
                    ? "0 6.6px 13.2px 0 rgba(124, 81, 248, 0.14)"
                    : "",
              }}
            >
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
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path
                  d="M2.3335 1.16602H8.16683"
                  stroke="#7A5AF8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path
                  d="M11.0835 10.5H2.91683C2.59466 10.5 2.3335 10.7612 2.3335 11.0833V12.25C2.3335 12.5722 2.59466 12.8333 2.91683 12.8333H11.0835C11.4057 12.8333 11.6668 12.5722 11.6668 12.25V11.0833C11.6668 10.7612 11.4057 10.5 11.0835 10.5Z"
                  stroke="#7A5AF8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path
                  d="M11.0835 3.5H2.91683C2.59466 3.5 2.3335 3.76117 2.3335 4.08333V5.25C2.3335 5.57217 2.59466 5.83333 2.91683 5.83333H11.0835C11.4057 5.83333 11.6668 5.57217 11.6668 5.25V4.08333C11.6668 3.76117 11.4057 3.5 11.0835 3.5Z"
                  stroke="#7A5AF8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </p>
            <p className="text-[#7A5AF8] text-xs mt-1">Blocks</p>
          </button>
        </div>

        <div className="my-6 px-1 h-px w-[30px] bg-[#EDEEEF]" />

        <nav className="flex w-full space-y-10 flex-1 flex-col items-center gap-3">
          {insertActions.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={activeAction === item.id}
              onClick={() => setActiveAction(item.id)}
            />
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 bg-white">
        <div
          className={cn("h-full", activeAction === "ai" ? "block" : "hidden")}
        >
          <Chat {...props} />
        </div>

        {activeAction === "blocks" && <BlocksPanel />}
        {activeAction === "texts" && (
          <InsertPanel
            title="Texts"
            groups={[{ label: "Add", items: textItems }]}
            onItemSelect={handleTextItemSelect}
          />
        )}
        {activeAction === "charts" && (
          <InsertPanel
            title="Charts"
            groups={[{ label: "Chart Type", items: chartTypeItems }]}
            onItemSelect={handleChartItemSelect}
          />
        )}
        {activeAction === "tables" && (
          <InsertPanel
            title="Tables"
            groups={[
              { label: "Table Type", items: tableTypeItems },
              { label: "Components", items: tableComponentItems },
            ]}
          />
        )}
        {activeAction === "images" && (
          <InsertPanel
            title="Images"
            groups={[
              { label: "Add", items: imageItems },
              { label: "Components", items: imageComponentItems },
            ]}
          />
        )}
        {activeAction === "elements" && (
          <InsertPanel
            title="Elements"
            groups={[
              { label: "Add", items: elementItems },
              { label: "Components", items: elementComponentItems },
            ]}
          />
        )}
      </div>
    </div>
  );
};

export default PresentationActions;
