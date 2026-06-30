import type { ElementPath } from "../lib/element-path";
import type { SlideElement } from "../lib/slide-schema";

export type ExportMode = "native" | "keynote" | "raster";
export type TextSlideElement = Extract<SlideElement, { type: "text" }>;
export type BulletsSlideElement = Extract<SlideElement, { type: "text-list" }>;
export type ImageSlideElement = Extract<SlideElement, { type: "image" }>;
export type LineSlideElement = Extract<SlideElement, { type: "line" }>;
export type ShapeSlideElement = Extract<
  SlideElement,
  { type: "rectangle" | "ellipse" }
>;
export type TableSlideElement = Extract<SlideElement, { type: "table" }>;
export type ChartSlideElement = Extract<SlideElement, { type: "chart" }>;
export type SvgSlideElement = Extract<SlideElement, { type: "svg" }>;
export type TableCellSelection = {
  elementIndex: number;
  elementPath?: ElementPath | null;
  rowIndex: number;
  colIndex: number;
};

export { getComponentRun, type ComponentRun } from "./componentGroups";
export { createDefaultElement } from "./createDefaultElement";
export { useTableCellSelection } from "./useTableCellSelection";
