import type {
  ChartElement,
  SlideElement,
} from "@/components/slide-editor/types";

export const TEMPLATE_V2_INSERT_ELEMENTS_EVENT =
  "presenton:template-v2-insert-elements";
export const TEMPLATE_V2_SURFACE_SELECTED_EVENT =
  "presenton:template-v2-surface-selected";
export const TEMPLATE_V2_ACTIVATE_SURFACE_EVENT =
  "presenton:template-v2-activate-surface";
export const TEMPLATE_V2_CHART_EDITOR_EVENT =
  "presenton:template-v2-chart-editor";
export const TEMPLATE_V2_CHART_UPDATE_EVENT =
  "presenton:template-v2-chart-update";

export type TemplateV2InsertComponent = {
  id?: string;
  description?: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  elements: SlideElement[];
};

export type TemplateV2InsertElementsDetail = {
  elements?: SlideElement[];
  components?: TemplateV2InsertComponent[];
  label?: string;
  slideId?: string | number | null;
  slideIndex?: number | null;
  handled?: boolean;
};

export type TemplateV2SingleSurfaceSelection = {
  kind: "component" | "element";
  slideIndex?: number | null;
  componentIndex?: number;
  componentId?: string;
  componentLabel?: string;
  elementPath?: string;
  elementType?: string;
  elementName?: string;
  targetLabel?: string;
};

export type TemplateV2MultiSurfaceSelection = {
  kind: "multi-component";
  slideIndex?: number | null;
  components: TemplateV2SingleSurfaceSelection[];
  componentIds?: string[];
  componentLabels?: string[];
  targetLabel?: string;
};

export type TemplateV2SurfaceSelectedDetail = {
  slideId?: string | number | null;
  slideIndex?: number | null;
  selection?: TemplateV2SingleSurfaceSelection | TemplateV2MultiSurfaceSelection | null;
};

export type TemplateV2ActivateSurfaceDetail = {
  slideId?: string | number | null;
  slideIndex?: number | null;
};

export type TemplateV2ChartEditorDetail = {
  chart?: ChartElement | null;
  open?: boolean;
  path?: string | null;
  rootIndex?: number | null;
  slideId?: string | number | null;
  slideIndex?: number | null;
};

export type TemplateV2ChartUpdateDetail = {
  action?: "update" | "close";
  chart?: ChartElement | null;
  handled?: boolean;
  path?: string | null;
  slideId?: string | number | null;
  slideIndex?: number | null;
};
