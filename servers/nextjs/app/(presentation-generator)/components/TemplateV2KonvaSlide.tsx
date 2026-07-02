"use client";

import {
  useCallback,
  useEffect,
  useId,
  memo,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
} from "react";
import type Konva from "konva";
import { useDispatch } from "react-redux";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Loader2 } from "lucide-react";
import {
  Arc,
  Circle,
  Ellipse,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
} from "react-konva";
import { notify } from "@/components/ui/sonner";
import type { TemplateV2Layout } from "@/components/slide-editor/lib/template-v2-import";
import { disintegrateTemplateV2ComponentInUi } from "@/components/slide-editor/lib/template-v2-disintegration";
import { effectiveLineHeight } from "@/components/slide-editor/lib/text-line-height";
import { textRunsContent } from "@/components/slide-editor/lib/text-runs";
import type {
  TemplateV2InlineEditKind,
  TemplateV2TextEditStyle,
} from "@/components/slide-editor/lib/template-v2-text-editing";
import { measureWrappedRenderTextHeight } from "@/components/slide-editor/lib/template-v2-text-editing";
import {
  applyTextStyle,
  displayText,
  editorFontRecordToRaw,
  fontScaleFromResize,
  fontFromRecord,
  layoutRenderTextRuns,
  layoutRichText,
  lineRenderHeight,
  lineStartX,
  measureNoWrapTextHeight,
  measureNoWrapTextWidth,
  normalizeRawTextMarkdownElement,
  rawFont,
  rawFontRecordForEditor,
  rawFontToSource,
  rawRenderTextRuns,
  rawSvgContent,
  rawTableCellText,
  rawTextContent,
  rawTextListContent,
  rawTextListItemText,
  rawTextRunsForEditor,
  rawTextStyle,
  scaleRawTextMetrics,
  setRawSvgContent,
  setRawTextContent,
  setRawTextListContent,
  setRawTextRunsContent,
  textRunsHaveMixedStyle,
  textVisualLocalBox,
  verticalTextStartY,
} from "@/components/slide-editor/lib/template-v2-text";
import {
  SLIDE_H,
  SLIDE_W,
  type ChartElement,
  type ChartSeries,
  type SlideElement,
  type TextRun,
} from "@/components/slide-editor/lib/slide-schema";
import {
  useTableCellSelection,
  useTemplateV2InlineEditing,
  type TableCellSelection,
  type TableSlideElement,
} from "@/components/slide-editor/state";
import {
  TableInlineEditor,
  TemplateV2InlineEditor,
} from "@/components/slide-editor/inline";
import { ElementToolbar } from "@/components/slide-editor/workspace/ElementToolbar";
import {
  loadKonvaImage,
  svgToDataUri,
} from "@/components/slide-editor/slide-surface/konva/exportAssets";
import {
  TemplateV2ChartElement as RawChartElement,
  rawChartType,
} from "@/components/slide-editor/slide-surface/konva/TemplateV2ChartElement";
import { TemplateV2TableElement as RawTableElement } from "@/components/slide-editor/slide-surface/konva/TemplateV2TableElement";
import { buildSvgUpdateUrl } from "@/lib/svg-color";
import { updateSlideUi } from "@/store/slices/presentationGeneration";
import { resolveBackendAssetSource } from "@/utils/api";
import { ImagesApi } from "../services/api/images";
import IconsEditor from "./IconsEditor";
import {
  createTemplateV2ClipboardPayload,
  pasteTemplateV2ClipboardPayload,
  type TemplateV2ClipboardPayload,
} from "./template-v2-clipboard/clipboard";
import { TemplateV2ComponentToolbar } from "./template-v2-component-toolbar/TemplateV2ComponentToolbar";
import { useTemplateV2Clipboard } from "./template-v2-clipboard/useTemplateV2Clipboard";
import {
  isTemplateV2LayoutElement,
  TemplateV2LayoutToolbar,
} from "./template-v2-layout-toolbar/TemplateV2LayoutToolbar";
import { findFirstComponentLayoutElement } from "./template-v2-layout-toolbar/layoutToolbarTarget";
import { layoutWrappedFlexChildren } from "./template-v2-layout/wrappedFlexLayout";
import {
  reorderComponentLayer,
  type ComponentLayerAction,
} from "./template-v2-layering/componentLayering";
import { TemplateV2SelectionTransformers } from "./template-v2-selection/TemplateV2SelectionTransformers";
import {
  TEMPLATE_V2_ACTIVATE_SURFACE_EVENT,
  TEMPLATE_V2_CHART_EDITOR_EVENT,
  TEMPLATE_V2_CHART_UPDATE_EVENT,
  TEMPLATE_V2_INSERT_ELEMENTS_EVENT,
  TEMPLATE_V2_SURFACE_SELECTED_EVENT,
  type TemplateV2ActivateSurfaceDetail,
  type TemplateV2ChartEditorDetail,
  type TemplateV2ChartUpdateDetail,
  type TemplateV2InsertElementsDetail,
  type TemplateV2SurfaceSelectedDetail,
} from "./templateV2Events";

export {
  TEMPLATE_V2_ACTIVATE_SURFACE_EVENT,
  TEMPLATE_V2_CHART_EDITOR_EVENT,
  TEMPLATE_V2_CHART_UPDATE_EVENT,
  TEMPLATE_V2_INSERT_ELEMENTS_EVENT,
  TEMPLATE_V2_SURFACE_SELECTED_EVENT,
  type TemplateV2ActivateSurfaceDetail,
  type TemplateV2ChartEditorDetail,
  type TemplateV2ChartUpdateDetail,
  type TemplateV2InsertElementsDetail,
  type TemplateV2SurfaceSelectedDetail,
} from "./templateV2Events";

export type TemplateV2ChartElement = ChartElement;

const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 720;
const ROOT_ELEMENTS_COMPONENT_INDEX = -1;
const STAGE_BOX: Box = {
  x: 0,
  y: 0,
  width: STAGE_WIDTH,
  height: STAGE_HEIGHT,
};
const EDITOR_SCALE = STAGE_WIDTH / SLIDE_W;
const EDITOR_SCALE_Y = STAGE_HEIGHT / SLIDE_H;
const TEXT_AVERAGE_CHAR_EM = 0.5;
const DECORATIVE_LINE_LENGTH = 80;
const DECORATIVE_LINE_THICKNESS = 4;
const MAX_HISTORY_ENTRIES = 50;
const COMPONENT_TOOLBAR_WIDTH = 270;
const LAYOUT_TOOLBAR_WIDTH = 700;
const TOOLBAR_HEIGHT = 40;
const TOOLBAR_GAP = 8;
const TOOLBAR_MARGIN = 8;
const SCROLL_DISMISS_THRESHOLD_PX = 300;

type UnknownRecord = Record<string, any>;
type RawUi = TemplateV2Layout & UnknownRecord;
type RawComponent = UnknownRecord;
type RawElement = UnknownRecord;
type Size = { width: number; height: number };
type Point = { x: number; y: number };
type Box = Point & Size;
type InsertedElementConversion = {
  scaleX: number;
  scaleY: number;
  usesEditorUnits: boolean;
  scaleTemplateText: boolean;
};
type ChildArrayInfo = {
  key: "children" | "elements" | "child" | "item";
  items: unknown[];
};
type LaidOutChild = {
  child: RawElement;
  index: number;
  box: Box | null;
  layoutManaged: boolean;
};

type ComponentSelection = {
  kind: "component";
  componentIndex: number;
};

type MultiComponentSelection = {
  kind: "multi-component";
  componentIndexes: number[];
};

type ElementSelection = {
  kind: "element";
  componentIndex: number;
  elementPath: number[];
};

type Selection = ComponentSelection | MultiComponentSelection | ElementSelection | null;
type SelectOptions = {
  additive?: boolean;
};
type MultiComponentDragState = {
  draggedComponentIndex: number;
  draggedNodeStart: Point;
  nodes: Array<{
    componentIndex: number;
    node: Konva.Node;
    nodeStart: Point;
    modelStart: Point;
  }>;
};

type TemplateV2KonvaSlideProps = {
  layout: TemplateV2Layout;
  isEditMode: boolean;
  slideId?: string | number | null;
  slideIndex: number;
  renderIndex?: number;
};

function TemplateV2KonvaSlideComponent({
  layout,
  isEditMode,
  slideId = null,
  slideIndex,
  renderIndex,
}: TemplateV2KonvaSlideProps) {
  const dispatch = useDispatch();
  const surfaceId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, Konva.Node>());
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImageUploadRef = useRef<ElementSelection | null>(null);
  const undoStackRef = useRef<RawUi[]>([]);
  const redoStackRef = useRef<RawUi[]>([]);
  const multiComponentDragRef = useRef<MultiComponentDragState | null>(null);
  const [uiDraft, setUiDraft] = useState<RawUi>(() =>
    normalizeMarkdownTextInUi(cloneJson(layout as RawUi)),
  );
  const fontLoadState = useFontLoadState(uiDraft);
  const currentUiRef = useRef<RawUi>(uiDraft);
  const [selection, setSelection] = useState<Selection>(null);
  const {
    inlineEdit,
    clearInlineEdit,
    startInlineEdit,
    updateInlineDraft,
    updateInlineEdit,
    updateInlineRuns,
    updateInlineTextSelectionRange,
  } = useTemplateV2InlineEditing<ElementSelection>({
    keyForSelection,
  });
  const [iconEditorSelection, setIconEditorSelection] =
    useState<ElementSelection | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [{ canUndo, canRedo }, setHistoryAvailability] = useState({
    canUndo: false,
    canRedo: false,
  });
  const {
    clearTableCellEditing,
    clearTableCellSelection,
    editingTableCell,
    editTableCellSelection,
    selectedTableCell,
    selectTableCellSelection,
    visibleSelectedTableCell,
  } = useTableCellSelection<Selection, ElementSelection>({
    keyForSelection,
    selection,
  });
  const setRootNode = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setRootElement(node);
  }, []);

  const components = useMemo(
    () => readArray(uiDraft.components).filter(isRecord) as RawComponent[],
    [uiDraft.components],
  );
  const rootElements = useMemo(
    () => readArray(uiDraft.elements).filter(isRecord) as RawElement[],
    [uiDraft.elements],
  );
  const setSelectionNodeRef = useCallback(
    (key: string, node: Konva.Node | null) => {
      if (node) nodeRefs.current.set(key, node);
      else nodeRefs.current.delete(key);
    },
    [],
  );
  const selectedComponentIndexes = useMemo(
    () => componentIndexesForSelection(selection),
    [selection],
  );
  const selectedComponentIndexSet = useMemo(
    () => new Set(selectedComponentIndexes),
    [selectedComponentIndexes],
  );
  const selectedKeys = useMemo(() => keysForSelection(selection), [selection]);
  const selectedKey = selectedKeys.length === 1 ? selectedKeys[0] : null;
  const selectedParentComponentKey =
    selection?.kind === "element" &&
    selection.componentIndex !== ROOT_ELEMENTS_COMPONENT_INDEX
      ? keyForSelection({
          kind: "component",
          componentIndex: selection.componentIndex,
        })
      : null;
  const editingKey = inlineEdit ? keyForSelection(inlineEdit.selection) : null;
  const selectedElement =
    selection?.kind === "element"
      ? getElementAtSelection(uiDraft, selection)
      : null;
  const selectedComponent =
    selection?.kind === "component"
      ? asRecord(readArray(uiDraft.components)[selection.componentIndex])
      : null;
  const selectedBox = selection
    ? absoluteBoxForSelection(uiDraft, selection)
    : null;
  const layoutToolbarTarget = useMemo(() => {
    if (selection?.kind !== "component" || !selectedComponent) return null;
    const layoutRoot = findFirstComponentLayoutElement(
      readArray(selectedComponent.elements),
    );
    if (!layoutRoot) return null;
    const elementSelection: ElementSelection = {
      kind: "element",
      componentIndex: selection.componentIndex,
      elementPath: layoutRoot.elementPath,
    };
    const box = absoluteBoxForSelection(uiDraft, elementSelection);
    return box
      ? { selection: elementSelection, element: layoutRoot.element, box }
      : null;
  }, [selection, selectedComponent, uiDraft]);
  const toolbarElement = useMemo(
    () => {
      if (!selectedElement || !selectedBox) return null;
      const inlineTextElement =
        inlineEdit &&
        inlineEdit.kind === "text" &&
        inlineEdit.runs &&
        selection?.kind === "element" &&
        keyForSelection(inlineEdit.selection) === keyForSelection(selection)
          ? setRawTextRunsContent(selectedElement, inlineEdit.runs)
          : selectedElement;
      return rawElementForEditorToolbar(inlineTextElement, selectedBox);
    },
    [inlineEdit, selectedBox, selectedElement, selection],
  );
  const componentToolbarElement = useMemo(
    () =>
      selectedComponent
        ? rawComponentForEditorToolbar(selectedComponent)
        : null,
    [selectedComponent],
  );
  const canUngroupSelectedComponent = useMemo(
    () =>
      selection?.kind === "component" &&
      selectedComponent != null &&
      componentChildCount(selectedComponent) > 1,
    [selectedComponent, selection],
  );
  const [, setToolbarViewportVersion] = useState(0);
  const hasDismissibleEditorUi = Boolean(
    selection ||
      inlineEdit ||
      iconEditorSelection ||
      selectedTableCell ||
      editingTableCell,
  );
  const hasFloatingToolbars = Boolean(
    isEditMode &&
      selection?.kind === "component" &&
      (selectedBox || layoutToolbarTarget),
  );
  const componentToolbarPosition = selectedBox
    ? stackedViewportToolbarPosition({
        root: rootElement,
        anchorBox: selectedBox,
        index: 0,
        total: layoutToolbarTarget ? 2 : 1,
        toolbarWidth: COMPONENT_TOOLBAR_WIDTH,
      })
    : null;
  const layoutToolbarPosition = layoutToolbarTarget
    ? stackedViewportToolbarPosition({
        root: rootElement,
        anchorBox: selectedBox ?? layoutToolbarTarget.box,
        index: selectedBox ? 1 : 0,
        total: selectedBox ? 2 : 1,
        toolbarWidth: LAYOUT_TOOLBAR_WIDTH,
      })
    : null;
  const inlineEditBox = inlineEdit
    ? absoluteInlineEditBox(uiDraft, inlineEdit.selection, inlineEdit.frame)
    : null;
  const iconEditorElement = iconEditorSelection
    ? getElementAtSelection(uiDraft, iconEditorSelection)
    : null;
  const surfaceSlideIndex = useMemo(() => {
    const index = typeof renderIndex === "number" ? renderIndex : slideIndex;
    return Number.isFinite(index) ? index : null;
  }, [renderIndex, slideIndex]);
  const selectedSurfaceTarget = useMemo(
    () => surfaceSelectionTarget(uiDraft, selection, surfaceSlideIndex),
    [selection, surfaceSlideIndex, uiDraft],
  );
  useEffect(() => {
    if (layout === currentUiRef.current) return;
    const next = normalizeMarkdownTextInUi(cloneJson(layout as RawUi));
    currentUiRef.current = next;
    setUiDraft(next);
    setSelection(null);
    clearTableCellSelection();
    clearInlineEdit();
    setIconEditorSelection(null);
    undoStackRef.current = [];
    redoStackRef.current = [];
    setHistoryAvailability({ canUndo: false, canRedo: false });
  }, [clearInlineEdit, clearTableCellSelection, layout]);

  useEffect(() => {
    if (!hasFloatingToolbars || typeof window === "undefined") return;
    let frame = 0;
    const refreshToolbarPosition = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setToolbarViewportVersion((version) => version + 1);
      });
    };
    window.addEventListener("resize", refreshToolbarPosition);
    refreshToolbarPosition();
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", refreshToolbarPosition);
    };
  }, [hasFloatingToolbars]);

  const isSurfaceActive = useCallback(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.dataset.templateV2KonvaActiveSurface === surfaceId,
    [surfaceId],
  );

  const activateSurface = useCallback((nextSelection?: Selection) => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    document.documentElement.dataset.templateV2KonvaActiveSurface = surfaceId;
    if (surfaceSlideIndex != null) {
      document.documentElement.dataset.templateV2KonvaActiveSlideIndex =
        String(surfaceSlideIndex);
    }
    window.dispatchEvent(
      new CustomEvent<TemplateV2SurfaceSelectedDetail>(
        TEMPLATE_V2_SURFACE_SELECTED_EVENT,
        {
          detail: {
            slideId,
            slideIndex: surfaceSlideIndex,
            selection:
              nextSelection === undefined
                ? selectedSurfaceTarget
                : surfaceSelectionTarget(
                    currentUiRef.current,
                    nextSelection,
                    surfaceSlideIndex,
                  ),
          },
        },
      ),
    );
  }, [selectedSurfaceTarget, slideId, surfaceId, surfaceSlideIndex]);

  useEffect(() => {
    if (!isSurfaceActive() || typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent<TemplateV2SurfaceSelectedDetail>(
        TEMPLATE_V2_SURFACE_SELECTED_EVENT,
        {
          detail: {
            slideId,
            slideIndex: surfaceSlideIndex,
            selection: selectedSurfaceTarget,
          },
        },
      ),
    );
  }, [isSurfaceActive, selectedSurfaceTarget, slideId, surfaceSlideIndex]);

  useEffect(() => {
    if (!isEditMode || typeof window === "undefined") return;

    const handleActivateSurface = (event: Event) => {
      const detail = (event as CustomEvent<TemplateV2ActivateSurfaceDetail>)
        .detail;
      if (
        !detail ||
        !eventTargetsThisSlide(detail, slideId, surfaceSlideIndex, () => false)
      ) {
        return;
      }
      activateSurface();
    };

    window.addEventListener(
      TEMPLATE_V2_ACTIVATE_SURFACE_EVENT,
      handleActivateSurface,
    );
    return () =>
      window.removeEventListener(
        TEMPLATE_V2_ACTIVATE_SURFACE_EVENT,
        handleActivateSurface,
      );
  }, [activateSurface, isEditMode, slideId, surfaceSlideIndex]);

  const clearSurface = useCallback(() => {
    if (typeof document === "undefined") return;
    if (
      document.documentElement.dataset.templateV2KonvaActiveSurface === surfaceId
    ) {
      delete document.documentElement.dataset.templateV2KonvaActiveSurface;
      delete document.documentElement.dataset.templateV2KonvaActiveSlideIndex;
    }
  }, [surfaceId]);

  const clearEditorUiState = useCallback(
    (options?: { clearActiveSurface?: boolean }) => {
      multiComponentDragRef.current = null;
      setSelection(null);
      clearTableCellSelection();
      clearTableCellEditing();
      clearInlineEdit();
      setIconEditorSelection(null);
      if (options?.clearActiveSurface) {
        clearSurface();
      }
    },
    [
      clearInlineEdit,
      clearSurface,
      clearTableCellEditing,
      clearTableCellSelection,
    ],
  );

  useEffect(() => {
    if (
      !isEditMode ||
      !hasDismissibleEditorUi ||
      typeof document === "undefined" ||
      typeof window === "undefined"
    ) {
      return;
    }

    let cleared = false;
    let accumulatedScrollDistance = 0;
    const lastScrollPositionByTarget = new Map<EventTarget, Point>([
      [
        document,
        {
          x: window.scrollX,
          y: window.scrollY,
        },
      ],
    ]);
    const scrollStateForTarget = (target: EventTarget | null) => {
      if (
        target instanceof Element &&
        target !== document.documentElement &&
        target !== document.body
      ) {
        return {
          key: target,
          position: {
            x: target.scrollLeft,
            y: target.scrollTop,
          },
        };
      }

      return {
        key: document,
        position: {
          x: window.scrollX,
          y: window.scrollY,
        },
      };
    };
    const handleScroll = (event: Event) => {
      if (cleared) return;
      const { key, position } = scrollStateForTarget(event.target);
      const previousPosition = lastScrollPositionByTarget.get(key);
      lastScrollPositionByTarget.set(key, position);
      if (!previousPosition) return;

      accumulatedScrollDistance +=
        Math.abs(position.x - previousPosition.x) +
        Math.abs(position.y - previousPosition.y);
      if (accumulatedScrollDistance < SCROLL_DISMISS_THRESHOLD_PX) return;

      cleared = true;
      clearEditorUiState({ clearActiveSurface: true });
    };

    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [clearEditorUiState, hasDismissibleEditorUi, isEditMode]);

  const commitUi = useCallback(
    (nextUi: RawUi, pushHistory = true) => {
      if (nextUi === currentUiRef.current) return;
      if (pushHistory) {
        undoStackRef.current.push(currentUiRef.current);
        if (undoStackRef.current.length > MAX_HISTORY_ENTRIES) {
          undoStackRef.current.shift();
        }
        redoStackRef.current = [];
      }
      currentUiRef.current = nextUi;
      setUiDraft(nextUi);
      dispatch(
        updateSlideUi({
          index: surfaceSlideIndex ?? slideIndex,
          ui: nextUi as Record<string, unknown>,
        }),
      );
      setHistoryAvailability({
        canUndo: undoStackRef.current.length > 0,
        canRedo: redoStackRef.current.length > 0,
      });
    },
    [dispatch, slideIndex, surfaceSlideIndex],
  );

  const undo = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(currentUiRef.current);
    commitUi(previous, false);
  }, [commitUi]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(currentUiRef.current);
    commitUi(next, false);
  }, [commitUi]);

  const select = useCallback(
    (nextSelection: Selection, options?: SelectOptions) => {
      const resolvedSelection = selectionWithComponentToggle(
        selection,
        nextSelection,
        options,
      );
      activateSurface(resolvedSelection);
      setSelection(resolvedSelection);
      clearTableCellSelection();
    },
    [activateSurface, clearTableCellSelection, selection],
  );

  const selectTableCell = useCallback(
    (
      elementSelection: ElementSelection,
      rowIndex: number,
      colIndex: number,
    ) => {
      activateSurface(elementSelection);
      setSelection(elementSelection);
      clearInlineEdit();
      setIconEditorSelection(null);
      selectTableCellSelection(elementSelection, rowIndex, colIndex);
    },
    [activateSurface, clearInlineEdit, selectTableCellSelection],
  );

  const editTableCell = useCallback(
    (
      elementSelection: ElementSelection,
      rowIndex: number,
      colIndex: number,
    ) => {
      activateSurface(elementSelection);
      setSelection(elementSelection);
      clearInlineEdit();
      setIconEditorSelection(null);
      editTableCellSelection(elementSelection, rowIndex, colIndex);
    },
    [activateSurface, clearInlineEdit, editTableCellSelection],
  );

  const updateComponent = useCallback(
    (
      componentIndex: number,
      updater: (component: RawComponent) => RawComponent,
      pushHistory = true,
    ) => {
      commitUi(updateComponentInUi(currentUiRef.current, componentIndex, updater), pushHistory);
    },
    [commitUi],
  );

  const handleComponentDragStart = useCallback(
    (componentIndex: number, node: Konva.Node) => {
      if (
        selectedComponentIndexes.length < 2 ||
        !selectedComponentIndexes.includes(componentIndex)
      ) {
        multiComponentDragRef.current = null;
        return;
      }

      const sourceComponents = readArray(currentUiRef.current.components);
      const nodes = selectedComponentIndexes.flatMap((selectedIndex) => {
        const selectedNode = nodeRefs.current.get(
          keyForSelection({ kind: "component", componentIndex: selectedIndex }),
        );
        if (!selectedNode) return [];
        const nodePosition = selectedNode.position();
        const component = asRecord(sourceComponents[selectedIndex]);
        const modelPosition = component
          ? readPoint(component.position)
          : nodePosition;
        return [
          {
            componentIndex: selectedIndex,
            node: selectedNode,
            nodeStart: { x: nodePosition.x, y: nodePosition.y },
            modelStart: { x: modelPosition.x, y: modelPosition.y },
          },
        ];
      });
      const draggedNodeStart = node.position();
      multiComponentDragRef.current = {
        draggedComponentIndex: componentIndex,
        draggedNodeStart: { x: draggedNodeStart.x, y: draggedNodeStart.y },
        nodes,
      };
    },
    [selectedComponentIndexes],
  );

  const handleComponentDragMove = useCallback(
    (componentIndex: number, node: Konva.Node) => {
      const dragState = multiComponentDragRef.current;
      if (!dragState || dragState.draggedComponentIndex !== componentIndex) {
        return;
      }
      const position = node.position();
      const delta = {
        x: position.x - dragState.draggedNodeStart.x,
        y: position.y - dragState.draggedNodeStart.y,
      };
      dragState.nodes.forEach(({ node, nodeStart }) => {
        node.position({
          x: nodeStart.x + delta.x,
          y: nodeStart.y + delta.y,
        });
      });
      node.getLayer()?.batchDraw();
    },
    [],
  );

  const handleComponentDragEnd = useCallback(
    (componentIndex: number, node: Konva.Node) => {
      const dragState = multiComponentDragRef.current;
      if (!dragState || dragState.draggedComponentIndex !== componentIndex) {
        updateComponent(componentIndex, (current) => ({
          ...current,
          position: node.position(),
        }));
        return;
      }

      multiComponentDragRef.current = null;
      const position = node.position();
      const delta = {
        x: position.x - dragState.draggedNodeStart.x,
        y: position.y - dragState.draggedNodeStart.y,
      };
      if (Math.abs(delta.x) < 0.01 && Math.abs(delta.y) < 0.01) {
        return;
      }
      commitUi(
        setComponentPositionsInUi(
          currentUiRef.current,
          dragState.nodes.map(({ componentIndex, modelStart }) => ({
            componentIndex,
            position: {
              x: modelStart.x + delta.x,
              y: modelStart.y + delta.y,
            },
          })),
        ),
      );
    },
    [commitUi, updateComponent],
  );

  const updateElement = useCallback(
    (
      elementSelection: ElementSelection,
      updater: (element: RawElement) => RawElement,
      pushHistory = true,
    ) => {
      commitUi(updateElementInUi(currentUiRef.current, elementSelection, updater), pushHistory);
    },
    [commitUi],
  );

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    commitUi(deleteSelectionFromUi(currentUiRef.current, selection));
    setSelection(null);
    clearTableCellSelection();
    clearInlineEdit();
    setIconEditorSelection(null);
  }, [clearInlineEdit, clearTableCellSelection, commitUi, selection]);

  const createClipboardPayload = useCallback((): TemplateV2ClipboardPayload | null => {
    const clipboardComponent = componentForClipboardSelection(
      currentUiRef.current,
      selection,
    );
    return clipboardComponent
      ? createTemplateV2ClipboardPayload(
          clipboardComponent.component,
          clipboardComponent.box,
        )
      : null;
  }, [selection]);

  const pasteClipboardPayload = useCallback(
    (payload: TemplateV2ClipboardPayload, offset: number) => {
      const result = pasteTemplateV2ClipboardPayload({
        sourceUi: currentUiRef.current,
        payload,
        offset,
      });
      if (!result) return;
      commitUi(result.ui);
      setSelection(result.selection);
      clearTableCellSelection();
      clearInlineEdit();
      setIconEditorSelection(null);
      activateSurface(result.selection);
    },
    [activateSurface, clearInlineEdit, clearTableCellSelection, commitUi],
  );

  useTemplateV2Clipboard({
    enabled: isEditMode,
    isSurfaceActive,
    isEditableTarget,
    onCopy: createClipboardPayload,
    onPaste: pasteClipboardPayload,
  });

  const openInlineEditor = useCallback(
    (elementSelection: ElementSelection) => {
      const element = getElementAtSelection(currentUiRef.current, elementSelection);
      if (!element) return;
      clearTableCellEditing();
      const type = readString(element.type);
      const frame = renderedLocalBoxForElementSelection(
        currentUiRef.current,
        elementSelection,
      );
      if (type === "text") {
        const normalized = normalizeRawTextMarkdownElement(element);
        if (normalized.changed) {
          updateElement(elementSelection, () => normalized.element, false);
        }
        startInlineEdit({
          kind: "text",
          selection: elementSelection,
          draft: textRunsContent(normalized.runs),
          runs: normalized.runs,
          frame,
          style: rawTextStyle(normalized.element),
        });
      } else if (type === "text-list") {
        startInlineEdit({
          kind: "text-list",
          selection: elementSelection,
          draft: rawTextListContent(element),
          frame,
          style: rawTextStyle(element),
        });
      } else if (type === "svg") {
        startInlineEdit({
          kind: "svg",
          selection: elementSelection,
          draft: rawSvgContent(element),
          frame,
        });
      }
    },
    [clearTableCellEditing, startInlineEdit, updateElement],
  );

  const closeInlineEditor = useCallback(
    (commit = true, runsOverride?: TextRun[]) => {
      const current = inlineEdit;
      if (!current) return;
      if (commit) {
        const runs =
          current.kind === "text" ? runsOverride ?? current.runs : current.runs;
        updateElement(current.selection, (element) =>
          elementWithInlineDraft(
            element,
            current.kind,
            runsOverride ? textRunsContent(runsOverride) : current.draft,
            current.style,
            current.frame,
            runs,
          ),
        );
      }
      setSelection(current.selection);
      clearInlineEdit();
    },
    [clearInlineEdit, inlineEdit, updateElement],
  );

  const commitInlineTextRuns = useCallback(
    (elementSelection: ElementSelection, runs: TextRun[]) => {
      updateInlineRuns(elementSelection, runs);
      updateElement(
        elementSelection,
        (element) =>
          elementWithInlineDraft(
            element,
            "text",
            textRunsContent(runs),
            undefined,
            inlineEdit?.frame,
            runs,
          ),
        false,
      );
    },
    [inlineEdit?.frame, updateElement, updateInlineRuns],
  );

  const applyToolbarElementChange = useCallback(
    (editorElement: SlideElement) => {
      if (selection?.kind !== "element") return;
      const current = getElementAtSelection(currentUiRef.current, selection);
      const box = absoluteBoxForSelection(currentUiRef.current, selection);
      if (!current || !box) return;
      const next = mergeEditorToolbarElement(current, editorElement, box);
      updateElement(selection, () => next);
      updateInlineEdit(selection, (active) => {
        if (
          !active?.style ||
          keyForSelection(active.selection) !== keyForSelection(selection)
        ) {
          return active;
        }
        if (active.kind === "text") {
          return {
            ...active,
            draft: rawTextContent(next),
            runs: rawTextRunsForEditor(next),
            style: rawTextStyle(next),
          };
        }
        return { ...active, style: rawTextStyle(next) };
      });
    },
    [selection, updateElement, updateInlineEdit],
  );

  const applyLayoutElementChange = useCallback(
    (changes: Record<string, unknown>) => {
      if (!layoutToolbarTarget) return;
      updateElement(layoutToolbarTarget.selection, (current) =>
        elementWithNormalizedLayoutChildren(
          {
            ...current,
            ...changes,
          },
          layoutToolbarTarget.box,
        ),
      );
    },
    [layoutToolbarTarget, updateElement],
  );

  const applyComponentToolbarChange = useCallback(
    (editorElement: SlideElement) => {
      if (selection?.kind !== "component") return;
      updateComponent(selection.componentIndex, (component) =>
        mergeEditorToolbarComponent(component, editorElement),
      );
    },
    [selection, updateComponent],
  );

  const ungroupSelectedComponent = useCallback(() => {
    if (selection?.kind !== "component" || !canUngroupSelectedComponent) return;
    const result = disintegrateTemplateV2ComponentInUi(
      currentUiRef.current,
      selection.componentIndex,
      {
        childArrayInfo,
        componentBox,
        elementBox,
        isBoxVisualType,
        layoutChildren,
      },
    );
    if (!result) return;
    commitUi(result.ui as RawUi);
    setSelection(result.selection);
    clearInlineEdit();
    clearTableCellSelection();
    setIconEditorSelection(null);
  }, [
    canUngroupSelectedComponent,
    clearInlineEdit,
    clearTableCellSelection,
    commitUi,
    selection,
  ]);

  const reorderSelectedComponentLayer = useCallback(
    (action: ComponentLayerAction) => {
      if (selection?.kind !== "component") return;
      const result = reorderComponentLayer(
        readArray(currentUiRef.current.components),
        selection.componentIndex,
        action,
      );
      if (!result) return;
      const nextSelection: ComponentSelection = {
        kind: "component",
        componentIndex: result.componentIndex,
      };
      commitUi({
        ...currentUiRef.current,
        components: result.components,
      });
      setSelection(nextSelection);
      clearTableCellSelection();
      clearInlineEdit();
      setIconEditorSelection(null);
      activateSurface(nextSelection);
    },
    [
      activateSurface,
      clearInlineEdit,
      clearTableCellSelection,
      commitUi,
      selection,
    ],
  );

  const openImageUpload = useCallback(
    (elementSelection: ElementSelection) => {
      const element = getElementAtSelection(currentUiRef.current, elementSelection);
      if (readString(element?.type) !== "image") return;
      activateSurface(elementSelection);
      pendingImageUploadRef.current = elementSelection;
      if (imageUploadInputRef.current) {
        imageUploadInputRef.current.value = "";
        imageUploadInputRef.current.click();
      }
    },
    [activateSurface],
  );

  const openIconEditor = useCallback(
    (elementSelection: ElementSelection) => {
      const element = getElementAtSelection(
        currentUiRef.current,
        elementSelection,
      );
      if (!element || !isRawIconElement(element)) {
        return;
      }
      activateSurface(elementSelection);
      setSelection(elementSelection);
      clearInlineEdit();
      setIconEditorSelection(elementSelection);
    },
    [activateSurface, clearInlineEdit],
  );

  const handleIconChange = useCallback(
    (newIconUrl: string, query?: string) => {
      if (!iconEditorSelection || !newIconUrl) return;
      updateElement(iconEditorSelection, (element) => ({
        ...element,
        data: newIconUrl,
        ...(query ? { icon_query: query } : {}),
      }));
    },
    [iconEditorSelection, updateElement],
  );

  const openChartEditor = useCallback(
    (elementSelection: ElementSelection) => {
      const element = getElementAtSelection(currentUiRef.current, elementSelection);
      if (!element || readString(element.type) !== "chart") return;
      activateSurface(elementSelection);
      setSelection(elementSelection);
      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent<TemplateV2ChartEditorDetail>(
          TEMPLATE_V2_CHART_EDITOR_EVENT,
          {
            detail: {
              chart: rawChartToEditorChart(element),
              open: true,
              path: keyForSelection(elementSelection),
              rootIndex: elementSelection.componentIndex,
              slideId,
              slideIndex: surfaceSlideIndex,
            },
          },
        ),
      );
    },
    [activateSurface, slideId, surfaceSlideIndex],
  );

  const handleImageUploadChange = useCallback(
    async (event: ReactChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      const target = pendingImageUploadRef.current;
      if (!file || !target) return;

      if (!file.type.startsWith("image/")) {
        notify.warning("Invalid file", "Please upload an image file.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        notify.warning("File too large", "Image files must be smaller than 5MB.");
        return;
      }

      try {
        setIsUploadingImage(true);
        const uploaded = await ImagesApi.uploadImage(file);
        const imageUrl = resolveBackendAssetSource(uploaded);
        if (!imageUrl) throw new Error("Upload did not return an image URL.");
        updateElement(target, (element) => ({
          ...element,
          data: imageUrl,
          name: element.name ?? file.name,
        }));
        notify.success("Image updated", "The selected image was replaced.");
      } catch (error) {
        notify.error(
          "Upload failed",
          error instanceof Error
            ? error.message
            : "Failed to upload image. Please try again.",
        );
      } finally {
        pendingImageUploadRef.current = null;
        setIsUploadingImage(false);
      }
    },
    [updateElement],
  );

  const handleElementDoubleClick = useCallback(
    (elementSelection: ElementSelection) => {
      const element = getElementAtSelection(currentUiRef.current, elementSelection);
      const type = readString(element?.type);
      if (type === "image") {
        if (element && isRawIconElement(element)) {
          openIconEditor(elementSelection);
        }
        return;
      }
      if (type === "chart") {
        openChartEditor(elementSelection);
        return;
      }
      openInlineEditor(elementSelection);
    },
    [openChartEditor, openIconEditor, openInlineEditor],
  );

  useEffect(() => {
    if (!isEditMode || typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        (event.key !== "Delete" && event.key !== "Backspace") ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      if (!selection) return;
      event.preventDefault();
      deleteSelection();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteSelection, isEditMode, selection]);

  useEffect(() => {
    if (!isEditMode || typeof window === "undefined") return;

    const handleInsertElements = (event: Event) => {
      const detail = (event as CustomEvent<TemplateV2InsertElementsDetail>).detail;
      const elements = detail?.elements ?? [];
      const insertedComponents = detail?.components ?? [];
      if (elements.length === 0 && insertedComponents.length === 0) return;
      if (!eventTargetsThisSlide(detail, slideId, surfaceSlideIndex, isSurfaceActive)) {
        return;
      }

      const nextIndex = readArray(currentUiRef.current.components).length;
      const nextUi = appendInsertedContent(
        currentUiRef.current,
        elements as unknown as UnknownRecord[],
        insertedComponents as unknown as UnknownRecord[],
        detail.label,
      );
      commitUi(nextUi);
      setSelection({
        kind: "component",
        componentIndex: Math.max(0, nextIndex),
      });
      detail.handled = true;
    };

    window.addEventListener(TEMPLATE_V2_INSERT_ELEMENTS_EVENT, handleInsertElements);
    return () =>
      window.removeEventListener(
        TEMPLATE_V2_INSERT_ELEMENTS_EVENT,
        handleInsertElements,
      );
  }, [commitUi, isEditMode, isSurfaceActive, slideId, surfaceSlideIndex]);

  useEffect(() => {
    if (!isEditMode || typeof window === "undefined") return;

    const handleChartUpdate = (event: Event) => {
      const detail = (event as CustomEvent<TemplateV2ChartUpdateDetail>).detail;
      if (!detail || !eventTargetsThisSlide(detail, slideId, surfaceSlideIndex, isSurfaceActive)) {
        return;
      }

      if (detail.action === "close") {
        detail.handled = true;
        return;
      }

      if (!detail.chart || !detail.path) return;
      const parsedSelection = selectionFromKey(detail.path);
      if (!parsedSelection || parsedSelection.kind !== "element") return;
      const currentChart = getElementAtSelection(currentUiRef.current, parsedSelection);
      if (readString(currentChart?.type) !== "chart") return;
      updateElement(parsedSelection, (element) =>
        editorChartToRawChart(element, (detail.chart ?? {}) as UnknownRecord),
      );
      detail.handled = true;
    };

    window.addEventListener(TEMPLATE_V2_CHART_UPDATE_EVENT, handleChartUpdate);
    return () =>
      window.removeEventListener(TEMPLATE_V2_CHART_UPDATE_EVENT, handleChartUpdate);
  }, [isEditMode, isSurfaceActive, slideId, surfaceSlideIndex, updateElement]);

  useEffect(() => {
    if (!isEditMode || typeof document === "undefined") return;
    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      const targetNode = event.target instanceof Node ? event.target : null;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-template-v2-floating-toolbar='true']")) {
        activateSurface();
        return;
      }
      if (targetNode && root?.contains(targetNode)) {
        activateSurface();
        return;
      }

      clearEditorUiState({ clearActiveSurface: true });
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      clearSurface();
    };
  }, [
    activateSurface,
    clearEditorUiState,
    clearSurface,
    isEditMode,
  ]);

  useHotkey(
    "Mod+Z",
    (event) => {
      if (!isSurfaceActive() || !canUndo) return;
      event.preventDefault();
      event.stopPropagation();
      undo();
    },
    { conflictBehavior: "allow" },
  );
  useHotkey(
    "Mod+Shift+Z",
    (event) => {
      if (!isSurfaceActive() || !canRedo) return;
      event.preventDefault();
      event.stopPropagation();
      redo();
    },
    { conflictBehavior: "allow" },
  );
  useHotkey(
    "Mod+Y",
    (event) => {
      if (!isSurfaceActive() || !canRedo) return;
      event.preventDefault();
      event.stopPropagation();
      redo();
    },
    { conflictBehavior: "allow" },
  );

  if (!uiDraft) {
    return (
      <div className="flex h-full aspect-video flex-col items-center justify-center rounded-lg bg-gray-100">
        <Loader2 className="mb-2 h-4 w-4 animate-spin" />
        <p className="text-center text-sm text-gray-600">Loading slide layout...</p>
      </div>
    );
  }

  return (
    <div
      ref={setRootNode}
      data-template-v2-konva-surface={surfaceId}
      className="relative h-full w-full overflow-hidden bg-white"
      style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}
      onPointerDown={() => activateSurface()}
    >
      {isEditMode ? (
        <input
          ref={imageUploadInputRef}
          accept="image/*"
          className="hidden"
          type="file"
          onChange={handleImageUploadChange}
        />
      ) : null}
      <Stage
        width={STAGE_WIDTH}
        height={STAGE_HEIGHT}
        onMouseDown={(event) => {
          if (event.target === event.target.getStage()) {
            activateSurface(null);
            clearEditorUiState();
            return;
          }
          activateSurface();
        }}
        onTouchStart={(event) => {
          if (event.target === event.target.getStage()) {
            activateSurface(null);
            clearEditorUiState();
            return;
          }
          activateSurface();
        }}
      >
        <Layer listening={false}>
          <Rect width={STAGE_WIDTH} height={STAGE_HEIGHT} fill={backgroundColor(uiDraft)} />
        </Layer>
        <Layer
          key={`fonts:${fontLoadState.revision}`}
          listening={fontLoadState.ready}
          visible={fontLoadState.ready}
        >
          {rootElements.map((element, elementIndex) => (
            <MemoizedRawElementNode
              key={`root:${rawElementKey(element, elementIndex)}`}
              element={element}
              componentIndex={ROOT_ELEMENTS_COMPONENT_INDEX}
              elementPath={[elementIndex]}
              isEditMode={isEditMode}
              editingKey={editingKey}
              selectedTableCell={visibleSelectedTableCell}
              setNodeRef={setSelectionNodeRef}
              onSelect={select}
              onTableCellSelect={selectTableCell}
              onTableCellEdit={editTableCell}
              onOpenEditor={handleElementDoubleClick}
              onElementChange={updateElement}
              parentBox={STAGE_BOX}
              layoutManaged={false}
            />
          ))}
          {components.map((component, componentIndex) => (
            <MemoizedRawComponentNode
              key={componentKey(component, componentIndex)}
              component={component}
              componentIndex={componentIndex}
              isEditMode={isEditMode}
              isMultiSelectedComponent={
                selectedComponentIndexes.length > 1 &&
                selectedComponentIndexSet.has(componentIndex)
              }
              editingKey={editingKey}
              selectedTableCell={visibleSelectedTableCell}
              setNodeRef={setSelectionNodeRef}
              onSelect={select}
              onTableCellSelect={selectTableCell}
              onTableCellEdit={editTableCell}
              onOpenElementEditor={handleElementDoubleClick}
              onComponentChange={updateComponent}
              onComponentDragStart={handleComponentDragStart}
              onComponentDragMove={handleComponentDragMove}
              onComponentDragEnd={handleComponentDragEnd}
              onElementChange={updateElement}
            />
          ))}
          {isEditMode ? (
            <TemplateV2SelectionTransformers
              nodeRefs={nodeRefs}
              parentComponentKey={inlineEdit ? null : selectedParentComponentKey}
              selectedKey={selectedKey}
              selectedKeys={selectedKeys}
              selectionKind={selection?.kind ?? null}
              suppressSelectedOutline={Boolean(selectedTableCell || inlineEdit)}
            />
          ) : null}
        </Layer>
      </Stage>
      {isEditMode &&
        selection?.kind === "component" &&
        selectedBox ? (
        <TemplateV2ComponentToolbar
          box={selectedBox}
          canUngroup={canUngroupSelectedComponent}
          componentIndex={selection.componentIndex}
          componentCount={components.length}
          position={componentToolbarPosition ?? undefined}
          slideWidth={STAGE_WIDTH}
          onLayerAction={reorderSelectedComponentLayer}
          onUngroup={ungroupSelectedComponent}
        />
      ) : null}
      {isEditMode &&
        selection?.kind === "component" &&
        componentToolbarElement ? (
        <ElementToolbar
          element={componentToolbarElement}
          index={selection.componentIndex}
          path={keyForSelection(selection)}
          scale={EDITOR_SCALE}
          selectedTableCell={selectedTableCell}
          onChange={(_index, element) =>
            applyComponentToolbarChange(element)
          }
          onEditImage={() => undefined}
        />
      ) : null}
      {isEditMode && layoutToolbarTarget ? (
        <TemplateV2LayoutToolbar
          key={keyForSelection(layoutToolbarTarget.selection)}
          box={layoutToolbarTarget.box}
          element={layoutToolbarTarget.element}
          position={layoutToolbarPosition ?? undefined}
          onUngroup={
            canUngroupSelectedComponent &&
            (readString(layoutToolbarTarget.element.type) === "flex" ||
              readString(layoutToolbarTarget.element.type) === "grid")
              ? ungroupSelectedComponent
              : undefined
          }
          onChange={applyLayoutElementChange}
        />
      ) : null}
      {isEditMode &&
        selection?.kind === "element" &&
        selectedElement &&
        selectedBox &&
        toolbarElement &&
        !isTemplateV2LayoutElement(selectedElement) &&
        !isRawIconElement(selectedElement) &&
        !(editingTableCell && readString(selectedElement.type) === "table") ? (
        <ElementToolbar
          element={toolbarElement}
          index={selection.componentIndex}
          path={keyForSelection(selection)}
          scale={EDITOR_SCALE}
          selectedTableCell={selectedTableCell}
          textSelectionRange={
            inlineEdit &&
            inlineEdit.kind === "text" &&
            keyForSelection(inlineEdit.selection) === keyForSelection(selection)
              ? inlineEdit.textSelectionRange
              : null
          }
          onChange={(_index, element) => applyToolbarElementChange(element)}
          onEditChart={() => openChartEditor(selection)}
          onEditImage={() => openImageUpload(selection)}
          onEditText={() => openInlineEditor(selection)}
        />
      ) : null}
      {isEditMode &&
        selection?.kind === "element" &&
        editingTableCell &&
        toolbarElement &&
        readString((toolbarElement as UnknownRecord).type) === "table" ? (
        <TableInlineEditor
          key={`${keyForSelection(selection)}:${editingTableCell.rowIndex}:${editingTableCell.colIndex}`}
          element={toolbarElement as TableSlideElement}
          index={selection.componentIndex}
          scale={EDITOR_SCALE}
          selectedCell={editingTableCell}
          onChange={(_index, element) => applyToolbarElementChange(element)}
          onClose={clearTableCellEditing}
        />
      ) : null}
      {inlineEdit && inlineEditBox ? (
        <TemplateV2InlineEditor
          key={keyForSelection(inlineEdit.selection)}
          draft={inlineEdit.draft}
          kind={inlineEdit.kind}
          box={inlineEditBox}
          runs={inlineEdit.runs}
          style={inlineEdit.style}
          onChange={updateInlineDraft}
          onSelectionChange={(textSelectionRange) =>
            updateInlineTextSelectionRange(
              inlineEdit.selection,
              textSelectionRange,
            )
          }
          onRunsChange={(runs) =>
            commitInlineTextRuns(inlineEdit.selection, runs)
          }
          onClose={(commit, runs) => closeInlineEditor(commit, runs)}
        />
      ) : null}
      {isEditMode &&
        iconEditorSelection &&
        iconEditorElement &&
        isRawIconElement(iconEditorElement) ? (
        <IconsEditor
          key={keyForSelection(iconEditorSelection)}
          icon_prompt={[rawIconQuery(iconEditorElement)]}
          currentIconUrl={readString(iconEditorElement.data) ?? ""}
          onClose={() => setIconEditorSelection(null)}
          onIconChange={handleIconChange}
        />
      ) : null}
      {isUploadingImage ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white/35">
          <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-medium text-[#191919] shadow-md">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading image...
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const TemplateV2KonvaSlide = memo(TemplateV2KonvaSlideComponent);
TemplateV2KonvaSlide.displayName = "TemplateV2KonvaSlide";

function useFontLoadState(ui: RawUi) {
  const fontSignature = useMemo(() => fontLoadSignatureForUi(ui), [ui]);
  const [state, setState] = useState(() => ({
    revision: 0,
    ready: areFontDescriptorsLoaded(fontSignature),
  }));

  useEffect(() => {
    if (
      typeof document === "undefined" ||
      !document.fonts ||
      !fontSignature
    ) {
      setState((current) =>
        current.ready ? current : { ...current, ready: true },
      );
      return;
    }

    let cancelled = false;
    let animationFrame: number | null = null;
    const markReady = () => {
      if (cancelled) return;
      setState((current) => ({
        revision: current.revision + 1,
        ready: true,
      }));
    };
    const scheduleReady = () => {
      if (cancelled) return;
      if (animationFrame != null) {
        window.cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        markReady();
      });
    };

    const fonts = document.fonts;
    const descriptors = fontSignature.split("\n").filter(Boolean);
    setState((current) =>
      current.ready && areFontDescriptorsLoaded(fontSignature)
        ? current
        : { ...current, ready: false },
    );

    void Promise.all(descriptors.map((descriptor) => fonts.load(descriptor)))
      .then(() => fonts.ready)
      .then(scheduleReady)
      .catch(scheduleReady);
    fonts.addEventListener?.("loadingdone", scheduleReady);
    fonts.addEventListener?.("loadingerror", scheduleReady);

    return () => {
      cancelled = true;
      if (animationFrame != null) {
        window.cancelAnimationFrame(animationFrame);
      }
      fonts.removeEventListener?.("loadingdone", scheduleReady);
      fonts.removeEventListener?.("loadingerror", scheduleReady);
    };
  }, [fontSignature]);

  return state;
}

function areFontDescriptorsLoaded(signature: string) {
  if (!signature || typeof document === "undefined" || !document.fonts) {
    return true;
  }
  return signature
    .split("\n")
    .filter(Boolean)
    .every((descriptor) => {
      try {
        return document.fonts.check(descriptor);
      } catch {
        return false;
      }
    });
}

function fontLoadSignatureForUi(ui: RawUi) {
  const descriptors = new Set<string>();
  const visitElement = (value: unknown) => {
    const element = asRecord(value);
    if (!element) return;
    collectElementFontDescriptors(element, descriptors);
    childArrayInfo(element)?.items.forEach(visitElement);
  };

  readArray(ui.elements).forEach(visitElement);
  readArray(ui.components).forEach((component) => {
    readArray(asRecord(component)?.elements).forEach(visitElement);
  });

  return Array.from(descriptors).sort().join("\n");
}

function collectElementFontDescriptors(
  element: RawElement,
  descriptors: Set<string>,
) {
  const type = readString(element.type);
  if (type !== "text" && type !== "text-list" && type !== "table") return;

  const baseFont = rawFont(element);
  addFontLoadDescriptor(baseFont, descriptors);
  collectRunFontDescriptors(element.runs, baseFont, descriptors);
  collectTextListFontDescriptors(element.items, baseFont, descriptors);
  collectTableFontDescriptors(element.columns, baseFont, descriptors);
  collectTableRowsFontDescriptors(element.rows, baseFont, descriptors);
}

function collectRunFontDescriptors(
  value: unknown,
  fallback: ReturnType<typeof rawFont>,
  descriptors: Set<string>,
) {
  if (!Array.isArray(value)) return;
  value.forEach((run) => {
    const record = asRecord(run);
    if (record?.font) {
      addFontLoadDescriptor(
        fontFromRecord(asRecord(record.font), fallback),
        descriptors,
      );
    }
  });
}

function collectTextListFontDescriptors(
  value: unknown,
  fallback: ReturnType<typeof rawFont>,
  descriptors: Set<string>,
) {
  if (!Array.isArray(value)) return;
  value.forEach((item) => {
    if (Array.isArray(item)) {
      collectRunFontDescriptors(item, fallback, descriptors);
      return;
    }
    const record = asRecord(item);
    if (!record) return;
    if (record.font) {
      addFontLoadDescriptor(
        fontFromRecord(asRecord(record.font), fallback),
        descriptors,
      );
    }
    collectRunFontDescriptors(record.runs, fallback, descriptors);
  });
}

function collectTableRowsFontDescriptors(
  value: unknown,
  fallback: ReturnType<typeof rawFont>,
  descriptors: Set<string>,
) {
  if (!Array.isArray(value)) return;
  value.forEach((row) =>
    collectTableFontDescriptors(row, fallback, descriptors),
  );
}

function collectTableFontDescriptors(
  value: unknown,
  fallback: ReturnType<typeof rawFont>,
  descriptors: Set<string>,
) {
  if (!Array.isArray(value)) return;
  value.forEach((cell) => {
    const record = asRecord(cell);
    if (!record) return;
    if (record.font) {
      addFontLoadDescriptor(
        fontFromRecord(asRecord(record.font), fallback),
        descriptors,
      );
    }
    collectRunFontDescriptors(record.runs, fallback, descriptors);

    const textRecord = asRecord(record.text);
    if (!textRecord) return;
    if (textRecord.font) {
      addFontLoadDescriptor(
        fontFromRecord(asRecord(textRecord.font), fallback),
        descriptors,
      );
    }
    collectRunFontDescriptors(textRecord.runs, fallback, descriptors);
  });
}

function addFontLoadDescriptor(
  font: ReturnType<typeof rawFont>,
  descriptors: Set<string>,
) {
  const family = font.family.trim();
  if (!family) return;
  const escapedFamily = family.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const style = font.italic ? "italic " : "";
  const weight = font.bold ? "700 " : "400 ";
  descriptors.add(`${style}${weight}16px "${escapedFamily}"`);
}

function RawComponentNode({
  component,
  componentIndex,
  isEditMode,
  isMultiSelectedComponent,
  editingKey,
  selectedTableCell,
  setNodeRef,
  onSelect,
  onTableCellSelect,
  onTableCellEdit,
  onOpenElementEditor,
  onComponentChange,
  onComponentDragStart,
  onComponentDragMove,
  onComponentDragEnd,
  onElementChange,
}: {
  component: RawComponent;
  componentIndex: number;
  isEditMode: boolean;
  isMultiSelectedComponent: boolean;
  editingKey: string | null;
  selectedTableCell: TableCellSelection | null;
  setNodeRef: (key: string, node: Konva.Node | null) => void;
  onSelect: (selection: Selection, options?: SelectOptions) => void;
  onTableCellSelect: (
    selection: ElementSelection,
    rowIndex: number,
    colIndex: number,
  ) => void;
  onTableCellEdit: (
    selection: ElementSelection,
    rowIndex: number,
    colIndex: number,
  ) => void;
  onOpenElementEditor: (selection: ElementSelection) => void;
  onComponentChange: (
    componentIndex: number,
    updater: (component: RawComponent) => RawComponent,
  ) => void;
  onComponentDragStart: (componentIndex: number, node: Konva.Node) => void;
  onComponentDragMove: (componentIndex: number, node: Konva.Node) => void;
  onComponentDragEnd: (componentIndex: number, node: Konva.Node) => void;
  onElementChange: (
    selection: ElementSelection,
    updater: (element: RawElement) => RawElement,
  ) => void;
}) {
  const groupRef = useRef<Konva.Group | null>(null);
  const box = componentBox(component);
  const selection: ComponentSelection = { kind: "component", componentIndex };
  const key = keyForSelection(selection);
  const elements = readArray(component.elements).filter(isRecord) as RawElement[];

  return (
    <Group
      ref={(node) => {
        groupRef.current = node;
        setNodeRef(key, node);
      }}
      x={box.x}
      y={box.y}
      width={box.width}
      height={box.height}
      rotation={readNumber(component.rotation) ?? 0}
      clipX={isEditMode ? undefined : 0}
      clipY={isEditMode ? undefined : 0}
      clipWidth={isEditMode ? undefined : box.width}
      clipHeight={isEditMode ? undefined : box.height}
      draggable={isEditMode}
      onMouseDown={(event) => {
        if (!isEditMode) return;
        event.cancelBubble = true;
        if (isMultiSelectedComponent && !event.evt.shiftKey) return;
        onSelect(selection, { additive: event.evt.shiftKey });
      }}
      onTouchStart={(event) => {
        if (!isEditMode) return;
        event.cancelBubble = true;
        if (isMultiSelectedComponent) return;
        onSelect(selection);
      }}
      onDragStart={(event) => {
        if (!isEditMode) return;
        event.cancelBubble = true;
        const node = groupRef.current;
        if (!node) return;
        if (!isMultiSelectedComponent && !event.evt.shiftKey) {
          onSelect(selection);
        }
        onComponentDragStart(componentIndex, node);
      }}
      onDragMove={(event) => {
        event.cancelBubble = true;
        const node = groupRef.current;
        if (!node) return;
        onComponentDragMove(componentIndex, node);
      }}
      onDragEnd={(event) => {
        if (!isEditMode) return;
        event.cancelBubble = true;
        const node = groupRef.current;
        if (!node) return;
        onComponentDragEnd(componentIndex, node);
      }}
      onTransformEnd={(event) => {
        if (!isEditMode) return;
        event.cancelBubble = true;
        const node = groupRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        const nextBox = {
          ...box,
          width: Math.max(1, box.width * scaleX),
          height: Math.max(1, box.height * scaleY),
        };
        onComponentChange(componentIndex, (current) =>
          resizeComponent(current, {
            ...node.position(),
            width: nextBox.width,
            height: nextBox.height,
            scaleX,
            scaleY,
            rotation: node.rotation(),
          }),
        );
      }}
    >
      {isEditMode ? <SelectionBoundsRect width={box.width} height={box.height} /> : null}
      {elements.map((element, elementIndex) => (
        <MemoizedRawElementNode
          key={rawElementKey(element, elementIndex)}
          element={element}
          componentIndex={componentIndex}
          elementPath={[elementIndex]}
          isEditMode={isEditMode}
          editingKey={editingKey}
          selectedTableCell={selectedTableCell}
          setNodeRef={setNodeRef}
          onSelect={onSelect}
          onTableCellSelect={onTableCellSelect}
          onTableCellEdit={onTableCellEdit}
          onOpenEditor={onOpenElementEditor}
          onElementChange={onElementChange}
          parentBox={box}
          layoutManaged={false}
        />
      ))}
    </Group>
  );
}

const MemoizedRawComponentNode = memo(
  RawComponentNode,
  (previous, next) => {
    if (
      previous.component !== next.component ||
      previous.componentIndex !== next.componentIndex ||
      previous.isEditMode !== next.isEditMode ||
      previous.isMultiSelectedComponent !== next.isMultiSelectedComponent ||
      previous.setNodeRef !== next.setNodeRef ||
      previous.onSelect !== next.onSelect ||
      previous.onTableCellSelect !== next.onTableCellSelect ||
      previous.onTableCellEdit !== next.onTableCellEdit ||
      previous.onOpenElementEditor !== next.onOpenElementEditor ||
      previous.onComponentChange !== next.onComponentChange ||
      previous.onComponentDragStart !== next.onComponentDragStart ||
      previous.onComponentDragMove !== next.onComponentDragMove ||
      previous.onComponentDragEnd !== next.onComponentDragEnd ||
      previous.onElementChange !== next.onElementChange ||
      previous.selectedTableCell !== next.selectedTableCell
    ) {
      return false;
    }
    return !(
      previous.editingKey !== next.editingKey &&
      (selectionTouchesComponent(
        previous.editingKey,
        previous.componentIndex,
      ) ||
        selectionTouchesComponent(next.editingKey, next.componentIndex))
    );
  },
);

function RawElementNode({
  element,
  componentIndex,
  elementPath,
  isEditMode,
  editingKey,
  selectedTableCell,
  setNodeRef,
  onSelect,
  onTableCellSelect,
  onTableCellEdit,
  onOpenEditor,
  onElementChange,
  parentBox,
  renderBox,
  layoutManaged = false,
}: {
  element: RawElement;
  componentIndex: number;
  elementPath: number[];
  isEditMode: boolean;
  editingKey: string | null;
  selectedTableCell: TableCellSelection | null;
  setNodeRef: (key: string, node: Konva.Node | null) => void;
  onSelect: (selection: Selection, options?: SelectOptions) => void;
  onTableCellSelect: (
    selection: ElementSelection,
    rowIndex: number,
    colIndex: number,
  ) => void;
  onTableCellEdit: (
    selection: ElementSelection,
    rowIndex: number,
    colIndex: number,
  ) => void;
  onOpenEditor: (selection: ElementSelection) => void;
  onElementChange: (
    selection: ElementSelection,
    updater: (element: RawElement) => RawElement,
  ) => void;
  parentBox: Box;
  renderBox?: Box | null;
  layoutManaged?: boolean;
}) {
  const groupRef = useRef<Konva.Group | null>(null);
  const box = renderBox ?? elementBox(element);
  const selection = useMemo<ElementSelection>(
    () => ({
      kind: "element",
      componentIndex,
      elementPath,
    }),
    [componentIndex, elementPath],
  );
  const key = keyForSelection(selection);
  const selectedCell =
    selectedTableCell?.elementPath === key ? selectedTableCell : null;
  const editing = editingKey === key;
  const childInfo = childArrayInfo(element);
  const children = childInfo?.items ?? [];
  const laidOutChildren = layoutChildren(element, children, box);
  const clipChildren = shouldClipElementChildren(element, childInfo);
  const centerOrigin = shouldUseCenterOrigin(element);
  const handleTableCellSelect = useCallback(
    (rowIndex: number, colIndex: number) => {
      onTableCellSelect(selection, rowIndex, colIndex);
    },
    [onTableCellSelect, selection],
  );
  const handleTableCellEdit = useCallback(
    (rowIndex: number, colIndex: number) => {
      onTableCellEdit(selection, rowIndex, colIndex);
    },
    [onTableCellEdit, selection],
  );

  return (
    <Group
      ref={(node) => {
        groupRef.current = node;
        setNodeRef(key, node);
      }}
      x={centerOrigin ? box.x + box.width / 2 : box.x}
      y={centerOrigin ? box.y + box.height / 2 : box.y}
      width={box.width}
      height={box.height}
      offsetX={centerOrigin ? box.width / 2 : 0}
      offsetY={centerOrigin ? box.height / 2 : 0}
      clipX={clipChildren ? 0 : undefined}
      clipY={clipChildren ? 0 : undefined}
      clipWidth={clipChildren ? box.width : undefined}
      clipHeight={clipChildren ? box.height : undefined}
      rotation={readNumber(element.rotation) ?? 0}
      opacity={readNumber(element.opacity) ?? 1}
      onMouseDown={(event) => {
        if (!isEditMode) return;
        event.cancelBubble = false;
      }}
      onTouchStart={(event) => {
        if (!isEditMode) return;
        event.cancelBubble = false;
      }}
      onClick={(event) => {
        if (!isEditMode) return;
        if (componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX) {
          event.cancelBubble = true;
          onSelect(selection);
        }
      }}
      onTap={(event) => {
        if (!isEditMode) return;
        if (componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX) {
          event.cancelBubble = true;
          onSelect(selection);
        }
      }}
      onDblClick={(event) => {
        if (!isEditMode) return;
        event.cancelBubble = true;
        onSelect(selection);
        onOpenEditor(selection);
      }}
      onDblTap={(event) => {
        if (!isEditMode) return;
        event.cancelBubble = true;
        onSelect(selection);
        onOpenEditor(selection);
      }}
      onTransformEnd={(event) => {
        if (!isEditMode) return;
        event.cancelBubble = true;
        const node = groupRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        const nextSize = {
          width: Math.max(1, box.width * scaleX),
          height: Math.max(1, box.height * scaleY),
        };
        node.scaleX(1);
        node.scaleY(1);
        const fontScale = fontScaleFromResize(scaleX, scaleY);
        onElementChange(selection, (current) => ({
          ...scaleRawElementTextMetrics(current, fontScale),
          position: positionFromNodeInParent(
            node,
            parentBox,
            { ...box, ...nextSize },
          ),
          size: nextSize,
          rotation: node.rotation(),
          ...(layoutManaged || isManualPositioned(current)
            ? { __presenton_manual_position: true }
            : {}),
        }));
      }}
    >
      {editing ? <SelectionBoundsRect width={box.width} height={box.height} /> : null}
      {editing ? null : (
        <MemoizedRawElementVisual
          element={element}
          width={box.width}
          height={box.height}
          interactive={isEditMode}
          selectedTableCell={selectedCell}
          onTableCellSelect={handleTableCellSelect}
          onTableCellEdit={handleTableCellEdit}
        />
      )}
      {laidOutChildren.map(({ child, index, box: childBox, layoutManaged }) => (
        <MemoizedRawElementNode
          key={rawElementKey(child, index)}
          element={child}
          componentIndex={componentIndex}
          elementPath={[...elementPath, index]}
          isEditMode={isEditMode}
          editingKey={editingKey}
          selectedTableCell={selectedTableCell}
          setNodeRef={setNodeRef}
          onSelect={onSelect}
          onTableCellSelect={onTableCellSelect}
          onTableCellEdit={onTableCellEdit}
          onOpenEditor={onOpenEditor}
          onElementChange={onElementChange}
          parentBox={{
            x: parentBox.x + box.x,
            y: parentBox.y + box.y,
            width: box.width,
            height: box.height,
          }}
          renderBox={childBox}
          layoutManaged={layoutManaged}
        />
      ))}
    </Group>
  );
}

const MemoizedRawElementNode = memo(RawElementNode, (previous, next) => {
  if (
    previous.element !== next.element ||
    previous.componentIndex !== next.componentIndex ||
    previous.isEditMode !== next.isEditMode ||
    previous.layoutManaged !== next.layoutManaged ||
    previous.selectedTableCell !== next.selectedTableCell ||
    previous.setNodeRef !== next.setNodeRef ||
    previous.onSelect !== next.onSelect ||
    previous.onTableCellSelect !== next.onTableCellSelect ||
    previous.onTableCellEdit !== next.onTableCellEdit ||
    previous.onOpenEditor !== next.onOpenEditor ||
    previous.onElementChange !== next.onElementChange ||
    !numberPathEqual(previous.elementPath, next.elementPath) ||
    !boxEqual(previous.parentBox, next.parentBox) ||
    !nullableBoxEqual(previous.renderBox, next.renderBox)
  ) {
    return false;
  }
  return !(
    previous.editingKey !== next.editingKey &&
    (selectionTouchesElement(
      previous.editingKey,
      previous.componentIndex,
      previous.elementPath,
    ) ||
      selectionTouchesElement(
        next.editingKey,
        next.componentIndex,
        next.elementPath,
      ))
  );
});

function SelectionBoundsRect({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  return (
    <Rect
      width={width}
      height={height}
      fill="rgba(0,0,0,0)"
      listening={false}
      perfectDrawEnabled={false}
      shadowForStrokeEnabled={false}
    />
  );
}

function RawElementVisual({
  element,
  width,
  height,
  interactive,
  selectedTableCell,
  onTableCellSelect,
  onTableCellEdit,
}: {
  element: RawElement;
  width: number;
  height: number;
  interactive: boolean;
  selectedTableCell: TableCellSelection | null;
  onTableCellSelect: (rowIndex: number, colIndex: number) => void;
  onTableCellEdit: (rowIndex: number, colIndex: number) => void;
}) {
  const type = readString(element.type);
  if (isBoxVisualType(type)) {
    const fill = colorWithOpacity(
      fillColor(element.fill),
      fillOpacity(element.fill),
    );
    const stroke = colorWithOpacity(
      strokeColor(element.stroke),
      strokeOpacity(element.stroke),
    );
    if (!fill && !(stroke && strokeWidth(element.stroke) > 0)) return null;
    return (
      <Rect
        width={width}
        height={height}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth(element.stroke)}
        cornerRadius={borderRadius(element)}
        {...shadowProps(element)}
        listening={interactive}
      />
    );
  }
  if (type === "ellipse") {
    return (
      <Ellipse
        x={width / 2}
        y={height / 2}
        radiusX={width / 2}
        radiusY={height / 2}
        fill={
          colorWithOpacity(fillColor(element.fill), fillOpacity(element.fill)) ??
          "transparent"
        }
        stroke={colorWithOpacity(
          strokeColor(element.stroke),
          strokeOpacity(element.stroke),
        )}
        strokeWidth={strokeWidth(element.stroke)}
        {...shadowProps(element)}
        listening={interactive}
      />
    );
  }
  if (type === "line") {
    const stroke = colorWithOpacity(
      strokeColor(element.stroke),
      strokeOpacity(element.stroke),
    );
    const lineWidth = strokeWidth(element.stroke);
    if (!stroke || lineWidth <= 0) return null;
    return (
      <Line
        points={linePoints(width, height, lineWidth)}
        stroke={stroke}
        strokeWidth={lineWidth}
        hitStrokeWidth={Math.max(20, lineWidth)}
        {...shadowProps(element)}
        listening={interactive}
      />
    );
  }
  if (type === "text") {
    return (
      <RawRichTextElement
        element={element}
        width={width}
        height={height}
        interactive={interactive}
      />
    );
  }
  if (type === "text-list") {
    return (
      <RawRichTextElement
        element={element}
        width={width}
        height={height}
        text={rawTextListContent(element)}
        interactive={interactive}
      />
    );
  }
  if (type === "image") {
    return <RawImageElement element={element} width={width} height={height} interactive={interactive} />;
  }
  if (type === "svg") {
    return <RawSvgElement element={element} width={width} height={height} interactive={interactive} />;
  }
  if (type === "table") {
    return (
      <RawTableElement
        element={element}
        width={width}
        height={height}
        interactive={interactive}
        selectedCell={selectedTableCell}
        onCellSelect={onTableCellSelect}
        onCellEdit={onTableCellEdit}
      />
    );
  }
  if (type === "chart") {
    return <RawChartElement element={element} width={width} height={height} interactive={interactive} />;
  }
  if (type === "infographic") {
    return <RawInfographicElement element={element} width={width} height={height} interactive={interactive} />;
  }
  return null;
}

const MemoizedRawElementVisual = memo(
  RawElementVisual,
  (previous, next) =>
    previous.element === next.element &&
    previous.width === next.width &&
    previous.height === next.height &&
    previous.interactive === next.interactive &&
    previous.selectedTableCell === next.selectedTableCell &&
    previous.onTableCellSelect === next.onTableCellSelect &&
    previous.onTableCellEdit === next.onTableCellEdit,
);

function RawRichTextElement({
  element,
  width,
  height,
  text,
  interactive,
}: {
  element: RawElement;
  width: number;
  height: number;
  text?: string;
  interactive: boolean;
}) {
  const font = rawFont(element);
  const content = text ?? rawTextContent(element);
  const displayContent = displayText(content);
  const renderRuns = text == null ? rawRenderTextRuns(element) : [];
  const renderRunsDifferFromElement =
    renderRuns.length > 0 &&
    textRunsHaveMixedStyle([{ text: "", font }, ...renderRuns]);
  const align = readString(element.alignment?.horizontal) ?? "left";
  const verticalAlign = readString(element.alignment?.vertical) ?? "top";
  const textLineHeight = effectiveLineHeight({
    text: displayContent,
    width,
    fontSize: font.size,
    lineHeight: font.lineHeight,
    fallback: 1.15,
    wrap: font.wrap,
  });

  if (renderRunsDifferFromElement) {
    const lines = layoutRenderTextRuns(renderRuns, width, font.wrap);
    const lineMetrics = lines.map((line) => ({
      height: lineRenderHeight(line, textLineHeight),
      width: line.reduce((sum, segment) => sum + segment.width, 0),
    }));
    const totalHeight = lineMetrics.reduce(
      (sum, metric) => sum + metric.height,
      0,
    );
    const startY =
      verticalAlign === "middle"
        ? Math.max(0, (height - totalHeight) / 2)
        : verticalAlign === "bottom"
          ? Math.max(0, height - totalHeight)
          : 0;
    let y = startY;

    return (
      <Group listening={interactive}>
        {lines.map((line, lineIndex) => {
          const lineMetric = lineMetrics[lineIndex] ?? {
            height: font.size * textLineHeight,
            width: 0,
          };
          const startX = lineStartX(
            align,
            width,
            lineMetric.width,
            font.wrap === "none",
          );
          let x = startX;
          const lineY = y;
          y += lineMetric.height;
          return line.map((segment, segmentIndex) => {
            const segmentX = x;
            x += segment.width;
            return (
              <Text
                key={`${lineIndex}:${segmentIndex}`}
                x={segmentX}
                y={lineY}
                width={segment.width}
                height={lineMetric.height}
                text={segment.text}
                fill={withHash(segment.font.color)}
                fontFamily={`${segment.font.family}, Helvetica, sans-serif`}
                fontSize={segment.font.size}
                fontStyle={`${segment.font.bold ? "bold" : "normal"} ${
                  segment.font.italic ? "italic" : ""
                }`}
                textDecoration={segment.font.underline ? "underline" : ""}
                verticalAlign="middle"
                lineHeight={segment.font.lineHeight ?? textLineHeight}
                letterSpacing={segment.font.letterSpacing}
                wrap="none"
                {...shadowProps(element)}
                listening={interactive}
              />
            );
          });
        })}
      </Group>
    );
  }

  // Multi-run (partially styled) text elements are laid out per-run so each
  // segment keeps its own font. Everything else — text-list (explicit joined
  // string) and single-run text — uses the original single-node path, so
  // existing content renders byte-for-byte as before.
  const runs = typeof text === "string" ? null : rawRenderTextRuns(element);
  if (runs && runs.length > 1) {
    const { tokens } = layoutRichText(
      runs,
      width,
      font,
      align,
      verticalAlign,
      height,
      font.wrap,
    );
    return (
      <Group listening={interactive} {...shadowProps(element)}>
        {tokens.map((tok, index) => (
          <Text
            key={index}
            x={tok.x}
            y={tok.y}
            text={tok.text}
            fill={withHash(tok.font.color)}
            fontFamily={`${tok.font.family}, Helvetica, sans-serif`}
            fontSize={tok.font.size}
            fontStyle={`${tok.font.bold ? "bold" : "normal"} ${tok.font.italic ? "italic" : ""}`}
            textDecoration={tok.font.underline ? "underline" : ""}
            lineHeight={tok.font.lineHeight}
            letterSpacing={tok.font.letterSpacing}
            wrap="none"
            listening={interactive}
          />
        ))}
      </Group>
    );
  }

  const noWrap = font.wrap === "none";
  const textNodeWidth = noWrap
    ? Math.max(width, measureNoWrapTextWidth(displayContent, font))
    : width;
  const textNodeRuns =
    renderRuns.length > 0 ? renderRuns : [{ text: displayContent, font }];
  const wrappedTextHeight = measureWrappedRenderTextHeight(
    textNodeRuns,
    width,
    font.wrap,
    textLineHeight,
  );
  const textNodeHeight = noWrap
    ? Math.max(
        height,
        measureNoWrapTextHeight(displayContent, font, textLineHeight),
      )
    : Math.max(height, wrappedTextHeight);

  return (
    <Text
      x={noWrap ? lineStartX(align, width, textNodeWidth, true) : 0}
      y={verticalTextStartY(verticalAlign, height, textNodeHeight, true)}
      width={textNodeWidth}
      height={textNodeHeight}
      text={displayContent}
      fill={withHash(font.color)}
      fontFamily={`${font.family}, Helvetica, sans-serif`}
      fontSize={font.size}
      fontStyle={`${font.bold ? "bold" : "normal"} ${font.italic ? "italic" : ""}`}
      textDecoration={font.underline ? "underline" : ""}
      align={align}
      verticalAlign={verticalAlign}
      lineHeight={textLineHeight}
      letterSpacing={font.letterSpacing}
      wrap={font.wrap === "none" ? "none" : "word"}
      {...shadowProps(element)}
      listening={interactive}
    />
  );
}

function RawImageElement({
  element,
  width,
  height,
  interactive,
}: {
  element: RawElement;
  width: number;
  height: number;
  interactive: boolean;
}) {
  const src = readString(element.data);
  const color = readString(element.color);
  const isIcon = isRawIconElement(element);
  const renderSrc = useMemo(() => {
    if (!src || !color || !isIcon || typeof window === "undefined") return src;
    const baseUrl = window.location.href;
    if (!isStaticSvgIconSource(src, baseUrl)) return src;
    return buildSvgUpdateUrl(src, baseUrl, { color }) ?? src;
  }, [color, isIcon, src]);
  const [loaded, setLoaded] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!renderSrc) {
      setLoaded(null);
      return;
    }
    let cancelled = false;
    void loadKonvaImage(renderSrc).then((image) => {
      if (!cancelled) setLoaded(image);
    });
    return () => {
      cancelled = true;
    };
  }, [renderSrc]);

  if (!loaded) {
    return (
      <Rect
        width={width}
        height={height}
        fill="#EEF1F5"
        stroke="#CBD2D9"
        strokeWidth={1}
        listening={interactive}
      />
    );
  }

  const fit = readString(element.fit) ?? "contain";
  const focusX = clamp(readNumber(element.focus_x) ?? 50, 0, 100) / 100;
  const focusY = clamp(readNumber(element.focus_y) ?? 50, 0, 100) / 100;
  const flipH = readBoolean(element.flip_h) === true;
  const flipV = readBoolean(element.flip_v) === true;
  const cornerRadii = imageCornerRadii(element, width, height);
  const naturalRatio = loaded.width / loaded.height || 1;
  const boxRatio = width / height || 1;
  let drawW = width;
  let drawH = height;
  let offsetX = 0;
  let offsetY = 0;

  if (fit === "cover") {
    if (naturalRatio > boxRatio) {
      drawW = height * naturalRatio;
      offsetX = -(drawW - width) * focusX;
    } else {
      drawH = width / naturalRatio;
      offsetY = -(drawH - height) * focusY;
    }
  } else if (fit === "contain") {
    if (naturalRatio > boxRatio) {
      drawH = width / naturalRatio;
      offsetY = (height - drawH) * focusY;
    } else {
      drawW = height * naturalRatio;
      offsetX = (width - drawW) * focusX;
    }
  }

  return (
    <Group
      clipFunc={(context) =>
        drawRoundedImageClip(context, width, height, cornerRadii)
      }
      listening={interactive}
    >
      <KonvaImage
        image={loaded}
        x={offsetX + (flipH ? drawW : 0)}
        y={offsetY + (flipV ? drawH : 0)}
        width={drawW}
        height={drawH}
        scaleX={flipH ? -1 : 1}
        scaleY={flipV ? -1 : 1}
        listening={interactive}
      />
    </Group>
  );
}

function imageCornerRadii(
  element: RawElement,
  width: number,
  height: number,
): [number, number, number, number] {
  const rawRadius = borderRadius(element);
  const values = Array.isArray(rawRadius)
    ? rawRadius
    : [rawRadius, rawRadius, rawRadius, rawRadius];
  const maxRadius = Math.max(0, Math.min(width, height) / 2);
  return [
    clamp(values[0] ?? 0, 0, maxRadius),
    clamp(values[1] ?? 0, 0, maxRadius),
    clamp(values[2] ?? 0, 0, maxRadius),
    clamp(values[3] ?? 0, 0, maxRadius),
  ];
}

function drawRoundedImageClip(
  context: Konva.Context,
  width: number,
  height: number,
  [topLeft, topRight, bottomRight, bottomLeft]: [
    number,
    number,
    number,
    number,
  ],
) {
  context.beginPath();
  context.moveTo(topLeft, 0);
  context.lineTo(width - topRight, 0);
  context.quadraticCurveTo(width, 0, width, topRight);
  context.lineTo(width, height - bottomRight);
  context.quadraticCurveTo(width, height, width - bottomRight, height);
  context.lineTo(bottomLeft, height);
  context.quadraticCurveTo(0, height, 0, height - bottomLeft);
  context.lineTo(0, topLeft);
  context.quadraticCurveTo(0, 0, topLeft, 0);
  context.closePath();
}

function RawSvgElement({
  element,
  width,
  height,
  interactive,
}: {
  element: RawElement;
  width: number;
  height: number;
  interactive: boolean;
}) {
  const svg = readString(element.svg);
  const data = readString(element.data);
  return (
    <RawImageElement
      element={{
        ...element,
        data: svg ? svgToDataUri(svg) : data,
        fit: element.fit ?? "contain",
      }}
      width={width}
      height={height}
      interactive={interactive}
    />
  );
}

function RawInfographicElement({
  element,
  width,
  height,
  interactive,
}: {
  element: RawElement;
  width: number;
  height: number;
  interactive: boolean;
}) {
  const infographicType =
    readString(element.infographic_type) ??
    readString(element.infographicType) ??
    "gauge";
  const progress = valueProgress(element);
  const baseColor =
    withHash(readString(element.base_color) ?? readString(element.baseColor)) ??
    "#E5E7EB";
  const highlightColor =
    withHash(
      readString(element.highlight_color) ?? readString(element.highlightColor),
    ) ?? "#2563EB";

  if (infographicType === "progress_bar") {
    const radius = Math.min(height / 2, 8);
    return (
      <Group listening={interactive} {...shadowProps(element)}>
        <Rect width={width} height={height} cornerRadius={radius} fill={baseColor} />
        <Rect
          width={width * progress}
          height={height}
          cornerRadius={radius}
          fill={highlightColor}
        />
      </Group>
    );
  }

  const valueAngle = 180 * progress;
  const thickness = Math.max(6, Math.min(width, height) * 0.18);
  const outerRadius = Math.max(1, Math.min(width * 0.43, height * 0.86));
  const innerRadius = Math.max(1, outerRadius - thickness);
  const middleRadius = (outerRadius + innerRadius) / 2;
  const capRadius = thickness / 2;
  const centerX = width / 2;
  const centerY = Math.min(height - capRadius, height * 0.86);
  const start = pointOnCircle(centerX, centerY, middleRadius, 180);
  const end = pointOnCircle(centerX, centerY, middleRadius, 180 + valueAngle);
  return (
    <Group listening={interactive} {...shadowProps(element)}>
      <Arc
        x={centerX}
        y={centerY}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        angle={180}
        rotation={180}
        fill={baseColor}
      />
      <Circle x={start.x} y={start.y} radius={capRadius} fill={baseColor} />
      <Circle
        x={pointOnCircle(centerX, centerY, middleRadius, 360).x}
        y={pointOnCircle(centerX, centerY, middleRadius, 360).y}
        radius={capRadius}
        fill={baseColor}
      />
      {valueAngle > 0 ? (
        <>
          <Arc
            x={centerX}
            y={centerY}
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            angle={valueAngle}
            rotation={180}
            fill={highlightColor}
          />
          <Circle x={start.x} y={start.y} radius={capRadius} fill={highlightColor} />
          <Circle x={end.x} y={end.y} radius={capRadius} fill={highlightColor} />
        </>
      ) : null}
      <Text
        x={0}
        y={height * 0.5}
        width={width}
        height={height * 0.3}
        text={String(Math.round(readNumber(element.value) ?? 0))}
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize={Math.max(10, Math.min(width, height) * 0.22)}
        fontStyle="bold"
        align="center"
        verticalAlign="middle"
        fill="#172033"
      />
    </Group>
  );
}

function updateComponentInUi(
  sourceUi: RawUi,
  componentIndex: number,
  updater: (component: RawComponent) => RawComponent,
) {
  const components = [...readArray(sourceUi.components)];
  const current = asRecord(components[componentIndex]);
  if (!current) return sourceUi;
  const updated = updater(current);
  if (updated === current) return sourceUi;
  components[componentIndex] = updated;
  return { ...sourceUi, components };
}

function setComponentPositionsInUi(
  sourceUi: RawUi,
  positions: Array<{ componentIndex: number; position: Point }>,
) {
  const positionByIndex = new Map<number, Point>();
  positions.forEach(({ componentIndex, position }) => {
    if (!Number.isInteger(componentIndex) || componentIndex < 0) return;
    positionByIndex.set(componentIndex, {
      x: position.x,
      y: position.y,
    });
  });
  if (positionByIndex.size === 0) return sourceUi;

  let changed = false;
  const components = readArray(sourceUi.components).map((component, index) => {
    const record = asRecord(component);
    const nextPosition = positionByIndex.get(index);
    if (!record || !nextPosition) return component;
    const currentPosition = readPoint(record.position);
    if (
      Math.abs(currentPosition.x - nextPosition.x) < 0.01 &&
      Math.abs(currentPosition.y - nextPosition.y) < 0.01
    ) {
      return component;
    }
    changed = true;
    return {
      ...record,
      position: {
        x: nextPosition.x,
        y: nextPosition.y,
      },
    };
  });

  return changed ? { ...sourceUi, components } : sourceUi;
}

function updateElementInUi(
  sourceUi: RawUi,
  selection: ElementSelection,
  updater: (element: RawElement) => RawElement,
) {
  if (selection.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX) {
    const currentElements = readArray(sourceUi.elements);
    const elements = updateElementArray(
      currentElements,
      selection.elementPath,
      updater,
    );
    return elements === currentElements ? sourceUi : { ...sourceUi, elements };
  }

  const components = [...readArray(sourceUi.components)];
  const component = asRecord(components[selection.componentIndex]);
  if (!component) return sourceUi;
  const currentElements = readArray(component.elements);
  const elements = updateElementArray(
    currentElements,
    selection.elementPath,
    updater,
  );
  if (elements === currentElements) return sourceUi;
  components[selection.componentIndex] = normalizeSingleChartWrapperComponent(
    { ...component, elements },
    selection,
  );
  return { ...sourceUi, components };
}

function normalizeSingleChartWrapperComponent(
  component: RawComponent,
  selection: ElementSelection,
): RawComponent {
  if (selection.elementPath.length !== 1) return component;
  const elements = readArray(component.elements);
  if (elements.length !== 1) return component;
  const child = asRecord(elements[0]);
  if (!child || readString(child.type) !== "chart") return component;
  if ((readNumber(component.rotation) ?? 0) !== 0) return component;

  const childBox = elementBox(child);
  const componentPosition = readPoint(component.position);
  return {
    ...component,
    position: {
      x: componentPosition.x + childBox.x,
      y: componentPosition.y + childBox.y,
    },
    size: {
      width: childBox.width,
      height: childBox.height,
    },
    elements: [
      {
        ...child,
        position: { x: 0, y: 0 },
        size: {
          width: childBox.width,
          height: childBox.height,
        },
      },
    ],
  };
}

function updateElementArray(
  elements: unknown[],
  path: number[],
  updater: (element: RawElement) => RawElement,
): unknown[] {
  if (path.length === 0) return elements;
  const [index, ...rest] = path;
  const current = asRecord(elements[index]);
  if (!current) return elements;
  if (rest.length === 0) {
    const updated = updater(current);
    if (updated === current) return elements;
    const next = [...elements];
    next[index] = updated;
    return next;
  }
  const childInfo = childArrayInfo(current);
  if (!childInfo) return elements;
  const updatedChildren = updateElementArray(childInfo.items, rest, updater);
  if (updatedChildren === childInfo.items) return elements;
  const next = [...elements];
  next[index] = withUpdatedChildItems(current, childInfo, updatedChildren, rest[0]);
  return next;
}

function deleteSelectionFromUi(sourceUi: RawUi, selection: Selection) {
  if (!selection) return sourceUi;

  const components = [...readArray(sourceUi.components)];
  if (selection.kind === "multi-component") {
    const indexes = Array.from(new Set(selection.componentIndexes))
      .filter((index) => Number.isInteger(index) && index >= 0)
      .sort((a, b) => b - a);
    indexes.forEach((componentIndex) => {
      if (componentIndex < components.length) {
        components.splice(componentIndex, 1);
      }
    });
    return { ...sourceUi, components };
  }
  if (selection?.kind === "component") {
    components.splice(selection.componentIndex, 1);
    return { ...sourceUi, components };
  }
  if (selection?.kind === "element") {
    if (selection.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX) {
      const currentElements = readArray(sourceUi.elements);
      const elements = deleteLayoutChildFromArray(
        currentElements,
        selection.elementPath,
      );
      return elements === currentElements ? sourceUi : { ...sourceUi, elements };
    }

    const component = asRecord(components[selection.componentIndex]);
    if (!component) return sourceUi;
    const currentElements = readArray(component.elements);
    const elements = deleteLayoutChildFromArray(
      currentElements,
      selection.elementPath,
    );
    if (elements !== currentElements) {
      components[selection.componentIndex] = { ...component, elements };
      return { ...sourceUi, components };
    }

    components.splice(selection.componentIndex, 1);
    return { ...sourceUi, components };
  }
  return sourceUi;
}

function deleteLayoutChildFromArray(elements: unknown[], path: number[]) {
  const [index, ...rest] = path;
  if (!Number.isInteger(index) || index < 0 || index >= elements.length) {
    return elements;
  }
  const current = asRecord(elements[index]);
  const childInfo = current ? childArrayInfo(current) : null;
  if (!current || !childInfo) return elements;
  if (rest.length >= 1 && isFlowLayoutElement(current)) {
    if (childInfo.key === "item") {
      const count = Math.max(
        0,
        readNumber(current.count) ?? childInfo.items.length,
      );
      const minCount = Math.max(0, readNumber(current.min_count) ?? 0);
      if (count <= minCount) return elements;
      const next = [...elements];
      next[index] = {
        ...current,
        count: Math.max(0, count - 1),
      };
      return next;
    }
    if (childInfo.key === "children") {
      const minChildren = Math.max(0, readNumber(current.min_children) ?? 0);
      if (childInfo.items.length <= minChildren) return elements;
      const updatedChildren = [...childInfo.items];
      updatedChildren.splice(rest[0], 1);
      const next = [...elements];
      next[index] = withUpdatedChildItems(
        current,
        childInfo,
        updatedChildren,
        rest[0],
      );
      return next;
    }
  }
  const updatedChildren = deleteLayoutChildFromArray(childInfo.items, rest);
  if (updatedChildren === childInfo.items) return elements;
  const next = [...elements];
  next[index] = withUpdatedChildItems(current, childInfo, updatedChildren, rest[0]);
  return next;
}

function isFlowLayoutElement(element: RawElement) {
  const type = readString(element.type);
  return (
    type === "flex" ||
    type === "grid" ||
    type === "list-view" ||
    type === "grid-view"
  );
}

function resizeComponent(
  component: RawComponent,
  next: Box & { scaleX: number; scaleY: number; rotation?: number },
) {
  const fontScale = fontScaleFromResize(next.scaleX, next.scaleY);
  return {
    ...component,
    position: { x: next.x, y: next.y },
    size: { width: next.width, height: next.height },
    rotation: next.rotation ?? readNumber(component.rotation) ?? 0,
    elements: scaleRawElements(
      readArray(component.elements),
      next.scaleX,
      next.scaleY,
      fontScale,
    ),
  };
}

function scaleRawElements(
  elements: unknown[],
  scaleX: number,
  scaleY: number,
  fontScale: number,
): unknown[] {
  return elements.map((value) => {
    const element = asRecord(value);
    if (!element) return value;
    const box = elementBox(element);
    const childInfo = childArrayInfo(element);
    const scaledChildren = childInfo
      ? scaleRawElements(childInfo.items, scaleX, scaleY, fontScale)
      : null;
    const scaledElement = scaleRawElementTextMetrics(element, fontScale);
    return {
      ...scaledElement,
      position: { x: box.x * scaleX, y: box.y * scaleY },
      size: { width: box.width * scaleX, height: box.height * scaleY },
      ...(childInfo && scaledChildren
        ? withUpdatedChildItems({}, childInfo, scaledChildren, 0)
        : {}),
    };
  });
}

function scaleRawElementTextMetrics(element: RawElement, fontScale: number) {
  if (!Number.isFinite(fontScale) || Math.abs(fontScale - 1) < 0.001) {
    return element;
  }
  const type = readString(element.type);
  if (type !== "text" && type !== "text-list" && type !== "table") {
    return element;
  }
  return scaleRawTextMetrics(element, fontScale);
}

function positionFromNodeInParent(
  node: Konva.Node,
  parentBox: Box,
  renderedBox: Box,
): Point {
  const absolute = node.absolutePosition();
  const offsetX = node.offsetX() ? renderedBox.width / 2 : 0;
  const offsetY = node.offsetY() ? renderedBox.height / 2 : 0;
  return clampRelativePosition(
    {
      x: absolute.x - parentBox.x - offsetX,
      y: absolute.y - parentBox.y - offsetY,
    },
    renderedBox,
    parentBox,
  );
}

function clampRelativePosition(pos: Point, box: Box, parentSize: Size): Point {
  return {
    x: clamp(pos.x, 0, Math.max(0, parentSize.width - box.width)),
    y: clamp(pos.y, 0, Math.max(0, parentSize.height - box.height)),
  };
}

function layoutChildren(
  parent: RawElement,
  children: unknown[],
  parentBox: Box,
): LaidOutChild[] {
  const rawChildren = children.filter(isRecord) as RawElement[];
  const type = readString(parent.type);
  if (type === "container") {
    return layoutContainerChildren(parent, rawChildren, parentBox);
  }
  if (type === "grid" || type === "grid-view") {
    return layoutGridChildren(parent, rawChildren, parentBox);
  }
  if (type === "flex" || type === "list-view") {
    return layoutFlexChildren(parent, rawChildren, parentBox);
  }
  return rawChildren.map((child, index) => ({
    child,
    index,
    box: null as Box | null,
    layoutManaged: false,
  }));
}

function elementWithNormalizedLayoutChildren(
  element: RawElement,
  parentBox: Box,
): RawElement {
  const childInfo = childArrayInfo(element);
  if (!childInfo || childInfo.items.length === 0) {
    return element;
  }

  const laidOutChildren = layoutChildren(element, childInfo.items, parentBox);
  const nextChildren = childInfo.items.map((child, index) => {
    const record = asRecord(child);
    const laidOut = laidOutChildren.find((item) => item.index === index);
    if (!record || !laidOut?.box || !laidOut.layoutManaged) {
      return child;
    }
    return {
      ...record,
      position: {
        x: laidOut.box.x,
        y: laidOut.box.y,
      },
      size: {
        width: laidOut.box.width,
        height: laidOut.box.height,
      },
    };
  });

  return withUpdatedChildItems(element, childInfo, nextChildren);
}

function shouldUseCenterOrigin(element: RawElement) {
  const type = readString(element.type);
  return type === "image" || type === "svg";
}

function layoutContainerChildren(
  parent: RawElement,
  children: RawElement[],
  parentBox: Box,
): LaidOutChild[] {
  if (children.length === 0) return [];
  const padding = readPadding(parent.padding);
  const content = {
    x: padding.left,
    y: padding.top,
    width: Math.max(1, parentBox.width - padding.left - padding.right),
    height: Math.max(1, parentBox.height - padding.top - padding.bottom),
  };
  const alignment = asRecord(parent.alignment) ?? {};

  return children.map((child, index) => {
    if (isManualPositioned(child)) {
      return { child, index, box: elementBox(child), layoutManaged: false };
    }

    const point = readPoint(child.position);
    const childType = readString(child.type);
    const explicitSize = readOptionalSize(child.size);
    const inferredSize =
      childType === "group" && explicitSize == null
        ? { width: content.width, height: content.height }
        : elementSize(child, content);
    const width = explicitSize?.width ?? inferredSize.width;
    const height = explicitSize?.height ?? inferredSize.height;

    if (childType === "group") {
      return {
        child,
        index,
        box: {
          x: content.x + point.x,
          y: content.y + point.y,
          width,
          height,
        },
        layoutManaged: true,
      };
    }

    const horizontal = readString(alignment.horizontal) ?? "left";
    const vertical = readString(alignment.vertical) ?? "top";
    return {
      child,
      index,
      box: {
        x:
          horizontal === "center"
            ? content.x + alignmentOffset("center", content.width, width)
            : horizontal === "right"
              ? content.x + alignmentOffset("right", content.width, width)
              : content.x + point.x,
        y:
          vertical === "middle"
            ? content.y + alignmentOffset("center", content.height, height)
            : vertical === "bottom"
              ? content.y + alignmentOffset("bottom", content.height, height)
              : content.y + point.y,
        width,
        height,
      },
      layoutManaged: true,
    };
  });
}

function layoutFlexChildren(
  parent: RawElement,
  children: RawElement[],
  parentBox: Box,
) {
  if (children.length === 0) return [];
  const padding = readPadding(parent.padding);
  const direction = readString(parent.direction) === "column" ? "column" : "row";
  const isColumn = direction === "column";
  const mainGap =
    (isColumn
      ? readNumber(parent.row_gap) ?? readNumber(parent.rowGap)
      : readNumber(parent.column_gap) ?? readNumber(parent.columnGap)) ??
    readNumber(parent.gap) ??
    0;
  const align =
    readString(parent.align_items) ?? readString(parent.alignItems) ?? "stretch";
  const justify =
    readString(parent.justify_content) ??
    readString(parent.justifyContent) ??
    "flex-start";
  const availableW = Math.max(1, parentBox.width - padding.left - padding.right);
  const availableH = Math.max(1, parentBox.height - padding.top - padding.bottom);
  const availableMain = isColumn ? availableH : availableW;
  const availableCross = isColumn ? availableW : availableH;
  if (parent.wrap === true) {
    const crossGap =
      (isColumn
        ? readNumber(parent.column_gap) ?? readNumber(parent.columnGap)
        : readNumber(parent.row_gap) ?? readNumber(parent.rowGap)) ??
      readNumber(parent.gap) ??
      0;
    return layoutWrappedFlexChildren({
      align,
      alignSelf: (child) =>
        readString(child.layout?.align_self) ??
        readString(child.layout?.alignSelf),
      alignmentOffset,
      availableCross,
      availableMain,
      childCrossSize,
      children,
      clampLayoutSize,
      crossGap,
      direction,
      elementBox,
      flexBasis,
      isManualPositioned,
      justify,
      layoutNumber,
      mainGap,
      padding,
    });
  }
  const bases = children.map((child) =>
    isManualPositioned(child)
      ? isColumn
        ? elementBox(child).height
        : elementBox(child).width
      : flexBasis(child, direction, availableCross),
  );
  const gapTotal = mainGap * Math.max(0, children.length - 1);
  const freeBeforeFlex =
    Math.max(1, availableMain - gapTotal) -
    bases.reduce((sum, size) => sum + Math.max(0, size), 0);
  let mainSizes = bases.map((basis) => Math.max(0, basis));
  const grows = children.map((child, index) =>
    isManualPositioned(child)
      ? 0
      : layoutNumber(child, "grow") ?? (bases[index] > 0 ? 0 : 1),
  );
  const growTotal = grows.reduce((sum, grow) => sum + grow, 0);

  if (freeBeforeFlex > 0 && growTotal > 0) {
    mainSizes = mainSizes.map(
      (size, index) => size + (freeBeforeFlex * grows[index]) / growTotal,
    );
  } else if (freeBeforeFlex > 0 && justify === "stretch") {
    const flexibleCount = Math.max(
      1,
      children.filter((child) => !isManualPositioned(child)).length,
    );
    mainSizes = mainSizes.map((size, index) =>
      isManualPositioned(children[index])
        ? size
        : size + freeBeforeFlex / flexibleCount,
    );
  } else if (freeBeforeFlex < 0) {
    const shrinks = children.map((child) =>
      isManualPositioned(child) ? 0 : layoutNumber(child, "shrink") ?? 1,
    );
    const scaledShrinks = shrinks.map((shrink, index) => shrink * mainSizes[index]);
    const shrinkTotal = scaledShrinks.reduce((sum, shrink) => sum + shrink, 0);
    if (shrinkTotal > 0) {
      mainSizes = mainSizes.map((size, index) =>
        Math.max(1, size + (freeBeforeFlex * scaledShrinks[index]) / shrinkTotal),
      );
    }
  }

  const usedMain =
    mainSizes.reduce((sum, size) => sum + size, 0) +
    mainGap * Math.max(0, children.length - 1);
  let cursor = alignmentOffset(justify, availableMain, usedMain);

  return children.map((child, index) => {
    const raw = elementBox(child);
    if (isManualPositioned(child)) {
      cursor += (isColumn ? raw.height : raw.width) + mainGap;
      return { child, index, box: raw, layoutManaged: false };
    }
    const main = clampLayoutSize(mainSizes[index], child, isColumn ? "height" : "width");
    const cross = childCrossSize(child, direction, availableCross, align);
    const alignSelf =
      readString(child.layout?.align_self) ?? readString(child.layout?.alignSelf);
    const crossOffset = alignmentOffset(alignSelf ?? align, availableCross, cross);
    const box = isColumn
      ? {
        x: padding.left + crossOffset,
        y: padding.top + cursor,
        width: cross,
        height: main,
      }
      : {
        x: padding.left + cursor,
        y: padding.top + crossOffset,
        width: main,
        height: cross,
      };
    cursor += main + mainGap;
    return { child, index, box, layoutManaged: true };
  });
}

function layoutGridChildren(
  parent: RawElement,
  children: RawElement[],
  parentBox: Box,
) {
  const padding = readPadding(parent.padding);
  const gap = readNumber(parent.gap) ?? 0;
  const columnGap =
    readNumber(parent.column_gap) ?? readNumber(parent.columnGap) ?? gap;
  const rowGap = readNumber(parent.row_gap) ?? readNumber(parent.rowGap) ?? gap;
  const explicitColumns = readArray(parent.columns);
  const explicitRows = readArray(parent.rows);
  const columnCount =
    readNumber(parent.columns) ??
    (explicitColumns.length > 0
      ? explicitColumns.length
      : Math.ceil(Math.sqrt(children.length)));
  const safeColumns = Math.max(1, Math.floor(columnCount));
  const declaredRows =
    readNumber(parent.rows) ??
    (explicitRows.length > 0 ? explicitRows.length : null);
  const placements = placeGridChildren(children, safeColumns, declaredRows);
  const rowCount = Math.max(
    declaredRows ?? 1,
    ...placements.map((placement) => placement.row + placement.rowSpan),
  );
  const availableW = Math.max(1, parentBox.width - padding.left - padding.right);
  const availableH = Math.max(1, parentBox.height - padding.top - padding.bottom);
  const cellW = Math.max(1, (availableW - columnGap * (safeColumns - 1)) / safeColumns);
  const cellH = Math.max(1, (availableH - rowGap * Math.max(0, rowCount - 1)) / rowCount);

  return children.map((child, index) => {
    const raw = elementBox(child);
    if (isManualPositioned(child)) {
      return { child, index, box: raw, layoutManaged: false };
    }
    const placement = placements[index];
    const area = {
      x: padding.left + placement.col * (cellW + columnGap),
      y: padding.top + placement.row * (cellH + rowGap),
      width: cellW * placement.columnSpan + columnGap * (placement.columnSpan - 1),
      height: cellH * placement.rowSpan + rowGap * (placement.rowSpan - 1),
    };
    const justify =
      readString(child.layout?.align_self) ??
      readString(child.layout?.alignSelf) ??
      readString(parent.justify_items) ??
      readString(parent.justifyItems) ??
      "stretch";
    const align =
      readString(child.layout?.align_self) ??
      readString(child.layout?.alignSelf) ??
      readString(parent.align_items) ??
      readString(parent.alignItems) ??
      "stretch";
    const width =
      justify === "stretch"
        ? area.width
        : clampLayoutSize(raw.width, child, "width", area.width);
    const height =
      align === "stretch"
        ? area.height
        : clampLayoutSize(raw.height, child, "height", area.height);
    return {
      child,
      index,
      box: {
        x: area.x + alignmentOffset(justify, area.width, width),
        y: area.y + alignmentOffset(align, area.height, height),
        width,
        height,
      },
      layoutManaged: true,
    };
  });
}

function flexBasis(
  child: RawElement,
  direction: "row" | "column",
  crossSize: number,
) {
  const dimension = direction === "row" ? "width" : "height";
  const explicit = layoutNumber(child, "basis") ?? readOptionalSize(child.size)?.[dimension];
  if (explicit != null && explicit > 0) {
    return clampLayoutSize(explicit, child, dimension);
  }

  if (isFramelessDecorativeShape(child)) {
    return DECORATIVE_LINE_THICKNESS;
  }
  if (readString(child.type) === "text") {
    return clampLayoutSize(
      intrinsicTextMainSize(child, direction, crossSize),
      child,
      dimension,
    );
  }

  const inferred = elementSize(child);
  const size = direction === "row" ? inferred.width : inferred.height;
  return size > 1 ? clampLayoutSize(size, child, dimension) : 0;
}

function childCrossSize(
  child: RawElement,
  direction: "row" | "column",
  crossSize: number,
  alignItems: string,
) {
  const dimension = direction === "row" ? "height" : "width";
  const alignSelf =
    readString(child.layout?.align_self) ?? readString(child.layout?.alignSelf);
  if (isFramelessDecorativeShape(child)) {
    return clampLayoutSize(
      Math.min(crossSize, DECORATIVE_LINE_LENGTH),
      child,
      dimension,
    );
  }
  if (alignItems === "stretch" && alignSelf == null) {
    return crossSize;
  }
  const explicit = readOptionalSize(child.size)?.[dimension];
  const inferred = elementSize(child, {
    width: direction === "row" ? 1 : crossSize,
    height: direction === "row" ? crossSize : 1,
  })[dimension];
  return clampLayoutSize(explicit ?? inferred ?? crossSize, child, dimension, crossSize);
}

function intrinsicTextMainSize(
  child: RawElement,
  direction: "row" | "column",
  crossSize: number,
) {
  const font = rawFont(child);
  const text = displayText(rawTextContent(child));
  if (direction === "row") {
    return Math.max(1, estimateTextWidth(text, font));
  }

  const explicitWidth = readOptionalSize(child.size)?.width;
  const width = Math.max(1, explicitWidth ?? crossSize);
  return Math.max(1, estimateTextHeight(text, font, width));
}

function placeGridChildren(
  children: RawElement[],
  columns: number,
  declaredRows: number | null,
) {
  const occupied = new Set<string>();
  const placements: Array<{
    col: number;
    row: number;
    columnSpan: number;
    rowSpan: number;
  }> = [];
  let rowLimit = Math.max(1, declaredRows ?? Math.ceil(children.length / columns));

  children.forEach((child) => {
    const columnSpan = Math.min(
      columns,
      Math.max(1, Math.floor(layoutNumber(child, "columnSpan", "column_span") ?? 1)),
    );
    const rowSpan = Math.max(
      1,
      Math.floor(layoutNumber(child, "rowSpan", "row_span") ?? 1),
    );
    let placedRow = 0;
    let placedCol = 0;

    while (true) {
      let placed = false;
      for (let row = 0; row < rowLimit && !placed; row += 1) {
        for (let col = 0; col <= columns - columnSpan; col += 1) {
          if (gridAreaOpen(occupied, row, col, rowSpan, columnSpan)) {
            placed = true;
            placedRow = row;
            placedCol = col;
            break;
          }
        }
      }
      if (placed) break;
      rowLimit += 1;
    }

    markGridArea(occupied, placedRow, placedCol, rowSpan, columnSpan);
    placements.push({
      col: placedCol,
      row: placedRow,
      columnSpan,
      rowSpan,
    });
  });

  return placements;
}

function gridAreaOpen(
  occupied: Set<string>,
  row: number,
  col: number,
  rowSpan: number,
  columnSpan: number,
) {
  for (let r = row; r < row + rowSpan; r += 1) {
    for (let c = col; c < col + columnSpan; c += 1) {
      if (occupied.has(`${r}:${c}`)) return false;
    }
  }
  return true;
}

function markGridArea(
  occupied: Set<string>,
  row: number,
  col: number,
  rowSpan: number,
  columnSpan: number,
) {
  for (let r = row; r < row + rowSpan; r += 1) {
    for (let c = col; c < col + columnSpan; c += 1) {
      occupied.add(`${r}:${c}`);
    }
  }
}

function isFramelessDecorativeShape(child: RawElement) {
  if (readOptionalSize(child.size) || asRecord(child.position)) return false;
  const type = readString(child.type);
  return type === "rectangle" || type === "ellipse" || type === "line";
}

function clampLayoutSize(
  size: number,
  child: RawElement,
  dimension: "width" | "height",
  fallback = 1,
) {
  const value = Number.isFinite(size) && size > 0 ? size : fallback;
  const min =
    dimension === "width"
      ? layoutNumber(child, "minWidth", "min_width")
      : layoutNumber(child, "minHeight", "min_height");
  const max =
    dimension === "width"
      ? layoutNumber(child, "maxWidth", "max_width")
      : layoutNumber(child, "maxHeight", "max_height");
  return Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? 1, value));
}

function layoutNumber(child: RawElement, ...keys: string[]) {
  const layout = asRecord(child.layout);
  for (const key of keys) {
    const value = readNumber(layout?.[key]);
    if (value != null) return value;
  }
  return null;
}

function estimateTextWidth(text: string, font: ReturnType<typeof rawFont>) {
  const longestLine = text
    .split(/\r?\n/)
    .reduce((longest, line) => Math.max(longest, line.length), 0);
  const weight = font.bold ? 0.56 : TEXT_AVERAGE_CHAR_EM;
  return Math.max(font.size, longestLine * font.size * weight);
}

function estimateTextHeight(
  text: string,
  font: ReturnType<typeof rawFont>,
  width: number,
) {
  const lineHeight = font.size * font.lineHeight;
  if (font.wrap === "none") {
    return Math.max(lineHeight, text.split(/\r?\n/).length * lineHeight);
  }
  const averageCharWidth = Math.max(1, font.size * TEXT_AVERAGE_CHAR_EM);
  const charsPerLine = Math.max(1, Math.floor(width / averageCharWidth));
  const lines = text.split(/\r?\n/).reduce((count, line) => {
    return count + Math.max(1, Math.ceil(line.length / charsPerLine));
  }, 0);
  return Math.max(lineHeight, lines * lineHeight);
}

function getElementAtSelection(ui: RawUi, selection: ElementSelection) {
  if (selection.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX) {
    return getElementFromArray(readArray(ui.elements), selection.elementPath);
  }

  const component = asRecord(readArray(ui.components)[selection.componentIndex]);
  if (!component) return null;
  return getElementFromArray(readArray(component.elements), selection.elementPath);
}

function getElementFromArray(elements: unknown[], path: number[]): RawElement | null {
  const [index, ...rest] = path;
  const current = asRecord(elements[index]);
  if (!current) return null;
  if (rest.length === 0) return current;
  const childInfo = childArrayInfo(current);
  return childInfo ? getElementFromArray(childInfo.items, rest) : null;
}

function absoluteBoxForSelection(ui: RawUi, selection: Selection): Box | null {
  if (!selection) return null;
  if (selection.kind === "multi-component") {
    const components = readArray(ui.components);
    const boxes = selection.componentIndexes.flatMap((componentIndex) => {
      const component = asRecord(components[componentIndex]);
      return component ? [componentBox(component)] : [];
    });
    return boxes.length > 0 ? boxContainingBoxes(boxes) : null;
  }
  if (
    selection.kind === "element" &&
    selection.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX
  ) {
    return absoluteElementBox(rootElementsComponent(ui), selection.elementPath);
  }

  const component = asRecord(readArray(ui.components)[selection.componentIndex]);
  if (!component) return null;
  const componentOrigin = readPoint(component.position);
  if (selection.kind === "component") return componentBox(component);
  const elementBoxValue = absoluteElementBox(component, selection.elementPath);
  if (!elementBoxValue) return null;
  return {
    x: componentOrigin.x + elementBoxValue.x,
    y: componentOrigin.y + elementBoxValue.y,
    width: elementBoxValue.width,
    height: elementBoxValue.height,
  };
}

function boxContainingBoxes(boxes: Box[]): Box {
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function absoluteInlineEditBox(
  ui: RawUi,
  selection: ElementSelection,
  frame?: Box | null,
): Box | null {
  const element = getElementAtSelection(ui, selection);
  const localFrame =
    frame ?? renderedLocalBoxForElementSelection(ui, selection);
  if (!element || !localFrame) return absoluteBoxForSelection(ui, selection);

  const visualFrame =
    readString(element.type) === "text"
      ? textVisualLocalBox(element, localFrame)
      : localFrame;
  return (
    absoluteBoxForElementLocalFrame(ui, selection, visualFrame) ??
    absoluteBoxForSelection(ui, selection)
  );
}

function absoluteBoxForElementLocalFrame(
  ui: RawUi,
  selection: ElementSelection,
  frame: Box,
): Box | null {
  if (selection.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX) {
    return absoluteElementLocalFrame(
      rootElementsComponent(ui),
      selection.elementPath,
      frame,
    );
  }

  const component = asRecord(readArray(ui.components)[selection.componentIndex]);
  if (!component) return null;
  const componentOrigin = readPoint(component.position);
  const elementFrame = absoluteElementLocalFrame(
    component,
    selection.elementPath,
    frame,
  );
  if (!elementFrame) return null;
  return {
    x: componentOrigin.x + elementFrame.x,
    y: componentOrigin.y + elementFrame.y,
    width: elementFrame.width,
    height: elementFrame.height,
  };
}

function absoluteElementLocalFrame(
  component: RawComponent,
  path: number[],
  frame: Box,
) {
  let items = readArray(component.elements).filter(isRecord) as RawElement[];
  let parentElement: RawElement | null = null;
  let parentRenderBox: Box = {
    x: 0,
    y: 0,
    ...readSize(component.size, { width: STAGE_WIDTH, height: STAGE_HEIGHT }),
  };
  let x = 0;
  let y = 0;
  for (const index of path.slice(0, -1)) {
    const element = asRecord(items[index]);
    if (!element) return null;
    const laidOut =
      parentElement != null
        ? layoutChildren(parentElement, items, parentRenderBox).find(
          (item) => item.index === index,
        )
        : null;
    const box = laidOut?.box ?? elementBox(element);
    x += box.x;
    y += box.y;
    const childInfo = childArrayInfo(element);
    parentElement = element;
    parentRenderBox = { x: 0, y: 0, width: box.width, height: box.height };
    items = (childInfo?.items ?? []).filter(isRecord) as RawElement[];
  }
  return {
    x: x + frame.x,
    y: y + frame.y,
    width: frame.width,
    height: frame.height,
  };
}

function renderedLocalBoxForElementSelection(
  ui: RawUi,
  selection: ElementSelection,
): Box | null {
  if (selection.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX) {
    return localElementBox(rootElementsComponent(ui), selection.elementPath);
  }

  const component = asRecord(readArray(ui.components)[selection.componentIndex]);
  if (!component) return null;
  return localElementBox(component, selection.elementPath);
}

function rootElementsComponent(ui: RawUi): RawComponent {
  return {
    position: { x: 0, y: 0 },
    size: { width: STAGE_WIDTH, height: STAGE_HEIGHT },
    elements: readArray(ui.elements),
  };
}

function absoluteElementBox(component: RawComponent, path: number[]) {
  const local = localElementBox(component, path);
  if (!local) return null;
  let items = readArray(component.elements).filter(isRecord) as RawElement[];
  let parentElement: RawElement | null = null;
  let parentRenderBox: Box = {
    x: 0,
    y: 0,
    ...readSize(component.size, { width: STAGE_WIDTH, height: STAGE_HEIGHT }),
  };
  let x = 0;
  let y = 0;
  for (const index of path.slice(0, -1)) {
    const element = asRecord(items[index]);
    if (!element) return null;
    const laidOut =
      parentElement != null
        ? layoutChildren(parentElement, items, parentRenderBox).find(
          (item) => item.index === index,
        )
        : null;
    const box = laidOut?.box ?? elementBox(element);
    x += box.x;
    y += box.y;
    const childInfo = childArrayInfo(element);
    parentElement = element;
    parentRenderBox = { x: 0, y: 0, width: box.width, height: box.height };
    items = (childInfo?.items ?? []).filter(isRecord) as RawElement[];
  }
  return {
    x: x + local.x,
    y: y + local.y,
    width: local.width,
    height: local.height,
  };
}

function localElementBox(component: RawComponent, path: number[]) {
  let items = readArray(component.elements).filter(isRecord) as RawElement[];
  let parentElement: RawElement | null = null;
  let parentRenderBox: Box = {
    x: 0,
    y: 0,
    ...readSize(component.size, { width: STAGE_WIDTH, height: STAGE_HEIGHT }),
  };
  for (let depth = 0; depth < path.length; depth += 1) {
    const index = path[depth];
    const element = asRecord(items[index]);
    if (!element) return null;
    const laidOut =
      parentElement != null
        ? layoutChildren(parentElement, items, parentRenderBox).find(
          (item) => item.index === index,
        )
        : null;
    const box = laidOut?.box ?? elementBox(element);
    if (depth === path.length - 1) return box;
    const childInfo = childArrayInfo(element);
    parentElement = element;
    parentRenderBox = { x: 0, y: 0, width: box.width, height: box.height };
    items = (childInfo?.items ?? []).filter(isRecord) as RawElement[];
  }
  return null;
}

function appendInsertedContent(
  sourceUi: RawUi,
  elements: UnknownRecord[],
  insertedComponents: UnknownRecord[],
  label?: string,
) {
  const components = [...readArray(sourceUi.components)];
  const start = components.length;
  elements.forEach((element, offset) => {
    components.push(insertedElementToComponent(element, label, start + offset));
  });
  insertedComponents.forEach((component, offset) => {
    components.push(
      insertedComponentToRaw(
        component,
        label,
        start + elements.length + offset,
      ),
    );
  });
  return { ...sourceUi, components };
}

function insertedComponentToRaw(
  component: UnknownRecord,
  label: string | undefined,
  index: number,
): RawComponent {
  const conversion = sourceElementConversion(component);
  const box = sourceElementBox(component, conversion);
  const elements = readArray(component.elements)
    .filter(isRecord)
    .map((element) => rawElementFromInsertedElement(element, conversion));
  return {
    ...component,
    id: `${normalizeId(
      readString(component.id) ?? label ?? "inserted-component",
    )}_${index + 1}`,
    description:
      readString(component.description) ?? label ?? "Inserted component",
    position: { x: box.x, y: box.y },
    size: { width: box.width, height: box.height },
    elements,
  };
}

function insertedElementToComponent(
  element: UnknownRecord,
  label: string | undefined,
  index: number,
) {
  const conversion = sourceElementConversion(element);
  const box = sourceElementBox(element, conversion);
  return {
    id: `${normalizeId(label ?? readString(element.type) ?? "inserted")}_${index + 1}`,
    description: label ?? "Inserted element",
    position: { x: box.x, y: box.y },
    size: { width: box.width, height: box.height },
    elements: [
      {
        ...rawElementFromInsertedElement(element, conversion),
        position: { x: 0, y: 0 },
        size: { width: box.width, height: box.height },
      },
    ],
  };
}

function rawElementFromInsertedElement(
  element: UnknownRecord,
  conversion: InsertedElementConversion,
): RawElement {
  const type = readString(element.type) ?? "rectangle";
  const rawElement = scaleInsertedElementGeometry(element, conversion);
  const normalizedElement = {
    ...rawElement,
    font: rawFontToSource(rawElement.font),
    border_radius: scaleInsertedBorderRadius(
      rawElement.border_radius ?? rawElement.borderRadius,
      conversion,
    ),
    line_height: rawElement.line_height ?? rawElement.lineHeight,
  };
  const textScaledElement = scaleInsertedTextCollections(
    normalizedElement,
    conversion.scaleTemplateText,
  );

  if (type === "chart") {
    return editorChartToRawChart(textScaledElement, textScaledElement);
  }

  return textScaledElement;
}

function sourceElementConversion(element: UnknownRecord): InsertedElementConversion {
  const size = sourceElementSize(element);
  const usesEditorUnits = size.width <= 20 && size.height <= 12;
  return {
    usesEditorUnits,
    scaleX: usesEditorUnits ? EDITOR_SCALE : 1,
    scaleY: usesEditorUnits ? EDITOR_SCALE_Y : 1,
    scaleTemplateText: usesEditorUnits && hasTemplateV2Metadata(element),
  };
}

function sourceElementBox(
  element: UnknownRecord,
  conversion = sourceElementConversion(element),
): Box {
  const position = readPoint(element.position);
  const size = sourceElementSize(element);
  return {
    x: position.x * conversion.scaleX,
    y: position.y * conversion.scaleY,
    width: Math.max(1, size.width * conversion.scaleX),
    height: Math.max(1, size.height * conversion.scaleY),
  };
}

function sourceElementSize(element: UnknownRecord): Size {
  const size = asRecord(element.size);
  return {
    width: Math.max(0.01, readNumber(size?.width) ?? 1),
    height: Math.max(0.01, readNumber(size?.height) ?? 1),
  };
}

function scaleInsertedElementGeometry(
  element: UnknownRecord,
  conversion: InsertedElementConversion,
): RawElement {
  const convertedChildren = convertInsertedChildArrays(element, conversion);
  if (!conversion.usesEditorUnits) {
    return convertedChildren;
  }

  return stripUndefined({
    ...convertedChildren,
    position: scaleInsertedPoint(convertedChildren.position, conversion),
    size: scaleInsertedSize(convertedChildren.size, conversion),
    padding: scaleInsertedSpacing(convertedChildren.padding, conversion),
    gap: scaleInsertedDistance(convertedChildren.gap, conversion.scaleX),
    column_gap: scaleInsertedDistance(
      convertedChildren.column_gap,
      conversion.scaleX,
    ),
    row_gap: scaleInsertedDistance(convertedChildren.row_gap, conversion.scaleY),
    layout: scaleInsertedLayout(convertedChildren.layout, conversion),
  });
}

function convertInsertedChildArrays(
  element: UnknownRecord,
  conversion: InsertedElementConversion,
): RawElement {
  const scaleChildText =
    conversion.scaleTemplateText || hasTemplateV2Metadata(element);
  const childConversion = {
    ...conversion,
    scaleTemplateText: scaleChildText,
  };
  const next: RawElement = { ...element };

  if (Array.isArray(element.children)) {
    next.children = element.children.map((child) =>
      isRecord(child) ? rawElementFromInsertedElement(child, childConversion) : child,
    );
  }
  if (Array.isArray(element.elements)) {
    next.elements = element.elements.map((child) =>
      isRecord(child) ? rawElementFromInsertedElement(child, childConversion) : child,
    );
  }
  if (isRecord(element.child)) {
    next.child = rawElementFromInsertedElement(element.child, childConversion);
  }
  if (isRecord(element.item)) {
    next.item = rawElementFromInsertedElement(element.item, childConversion);
  }

  return next;
}

function scaleInsertedPoint(
  value: unknown,
  conversion: InsertedElementConversion,
) {
  const point = asRecord(value);
  if (!point) return value;
  return {
    ...point,
    x: scaleInsertedDistance(point.x, conversion.scaleX),
    y: scaleInsertedDistance(point.y, conversion.scaleY),
  };
}

function scaleInsertedSize(
  value: unknown,
  conversion: InsertedElementConversion,
) {
  const size = asRecord(value);
  if (!size) return value;
  return {
    ...size,
    width: scaleInsertedDistance(size.width, conversion.scaleX),
    height: scaleInsertedDistance(size.height, conversion.scaleY),
  };
}

function scaleInsertedSpacing(
  value: unknown,
  conversion: InsertedElementConversion,
) {
  const spacing = asRecord(value);
  if (!spacing) return value;
  return stripUndefined({
    ...spacing,
    top: scaleInsertedDistance(spacing.top, conversion.scaleY),
    right: scaleInsertedDistance(spacing.right, conversion.scaleX),
    bottom: scaleInsertedDistance(spacing.bottom, conversion.scaleY),
    left: scaleInsertedDistance(spacing.left, conversion.scaleX),
    x: scaleInsertedDistance(spacing.x, conversion.scaleX),
    y: scaleInsertedDistance(spacing.y, conversion.scaleY),
    horizontal: scaleInsertedDistance(spacing.horizontal, conversion.scaleX),
    vertical: scaleInsertedDistance(spacing.vertical, conversion.scaleY),
  });
}

function scaleInsertedLayout(
  value: unknown,
  conversion: InsertedElementConversion,
) {
  const layout = asRecord(value);
  if (!layout) return value;
  return stripUndefined({
    ...layout,
    basis: scaleInsertedDistance(layout.basis, conversion.scaleX),
    min_width: scaleInsertedDistance(layout.min_width, conversion.scaleX),
    max_width: scaleInsertedDistance(layout.max_width, conversion.scaleX),
    min_height: scaleInsertedDistance(layout.min_height, conversion.scaleY),
    max_height: scaleInsertedDistance(layout.max_height, conversion.scaleY),
  });
}

function scaleInsertedBorderRadius(
  value: unknown,
  conversion: InsertedElementConversion,
) {
  if (!conversion.usesEditorUnits) return value;
  if (typeof value === "number") return value * conversion.scaleX;
  const radius = asRecord(value);
  if (!radius) return value;
  return stripUndefined({
    ...radius,
    radius: scaleInsertedDistance(radius.radius, conversion.scaleX),
    tl: scaleInsertedDistance(radius.tl, conversion.scaleX),
    tr: scaleInsertedDistance(radius.tr, conversion.scaleX),
    bl: scaleInsertedDistance(radius.bl, conversion.scaleX),
    br: scaleInsertedDistance(radius.br, conversion.scaleX),
    topLeft: scaleInsertedDistance(radius.topLeft, conversion.scaleX),
    topRight: scaleInsertedDistance(radius.topRight, conversion.scaleX),
    bottomLeft: scaleInsertedDistance(radius.bottomLeft, conversion.scaleX),
    bottomRight: scaleInsertedDistance(radius.bottomRight, conversion.scaleX),
  });
}

function scaleInsertedDistance(value: unknown, scale: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? value * scale
    : value;
}

function hasTemplateV2Metadata(element: UnknownRecord) {
  return Boolean(
    element.component_id ||
    element.component_instance_id ||
    element.component_slot ||
    element.component_description ||
    (Array.isArray(element.design_variables) &&
      element.design_variables.length > 0),
  );
}

function scaleInsertedTextCollections(
  element: RawElement,
  scaleTemplateText: boolean,
): RawElement {
  if (!scaleTemplateText) return element;
  return stripUndefined({
    ...element,
    runs: scaleInsertedTextRuns(element.runs),
    items: scaleInsertedTextListItems(element.items),
    columns: scaleInsertedTableCells(element.columns),
    rows: scaleInsertedTableRows(element.rows),
  });
}

function scaleInsertedTextRuns(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.map((run) => {
    if (!isRecord(run)) return run;
    return {
      ...run,
      font: rawFontToSource(run.font),
    };
  });
}

function scaleInsertedTextListItems(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.map((item) =>
    Array.isArray(item)
      ? scaleInsertedTextRuns(item)
      : item,
  );
}

function scaleInsertedTableRows(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.map((row) =>
    Array.isArray(row)
      ? scaleInsertedTableCells(row)
      : row,
  );
}

function scaleInsertedTableCells(value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.map((cell) => {
    if (!isRecord(cell)) return cell;
    return {
      ...cell,
      font: rawFontToSource(cell.font),
      runs: scaleInsertedTextRuns(cell.runs),
    };
  });
}

function eventTargetsThisSlide(
  detail: {
    slideId?: string | number | null;
    slideIndex?: number | null;
  },
  slideId: string | number | null | undefined,
  slideIndex: number | null,
  isSurfaceActive: () => boolean,
) {
  const currentSlideId = slideId != null ? String(slideId) : null;
  const eventSlideId =
    detail.slideId !== undefined && detail.slideId !== null
      ? String(detail.slideId)
      : null;
  if (eventSlideId && currentSlideId && eventSlideId !== currentSlideId) {
    return false;
  }
  if (
    !eventSlideId &&
    typeof detail.slideIndex === "number" &&
    (slideIndex == null || detail.slideIndex !== slideIndex)
  ) {
    return false;
  }
  const hasTarget = Boolean(eventSlideId) || typeof detail.slideIndex === "number";
  return hasTarget || isSurfaceActive();
}

function keyForSelection(selection: Selection) {
  if (!selection) return "";
  if (selection.kind === "component") return `component:${selection.componentIndex}`;
  if (selection.kind === "multi-component") {
    return `multi-component:${selection.componentIndexes.join(".")}`;
  }
  return `element:${selection.componentIndex}:${selection.elementPath.join(".")}`;
}

function keysForSelection(selection: Selection) {
  if (!selection) return [];
  if (selection.kind === "multi-component") {
    return selection.componentIndexes.map((componentIndex) =>
      keyForSelection({ kind: "component", componentIndex }),
    );
  }
  return [keyForSelection(selection)];
}

function selectionWithComponentToggle(
  currentSelection: Selection,
  nextSelection: Selection,
  options?: SelectOptions,
): Selection {
  if (!options?.additive || nextSelection?.kind !== "component") {
    return nextSelection;
  }

  const componentIndex = nextSelection.componentIndex;
  const currentIndexes = componentIndexesForSelection(currentSelection);
  const nextIndexes = currentIndexes.includes(componentIndex)
    ? currentIndexes.filter((index) => index !== componentIndex)
    : [...currentIndexes, componentIndex];

  return selectionForComponentIndexes(nextIndexes);
}

function componentIndexesForSelection(selection: Selection) {
  if (!selection) return [];
  if (selection.kind === "component") return [selection.componentIndex];
  if (selection.kind === "multi-component") return selection.componentIndexes;
  return [];
}

function selectionForComponentIndexes(indexes: number[]): Selection {
  const uniqueIndexes = Array.from(
    new Set(indexes.filter((index) => Number.isInteger(index) && index >= 0)),
  );
  if (uniqueIndexes.length === 0) return null;
  if (uniqueIndexes.length === 1) {
    return { kind: "component", componentIndex: uniqueIndexes[0] };
  }
  return { kind: "multi-component", componentIndexes: uniqueIndexes };
}

function componentForClipboardSelection(
  ui: RawUi,
  selection: Selection,
): { component: RawComponent; box: Box } | null {
  if (!selection) return null;
  if (selection.kind === "multi-component") return null;

  if (selection.kind === "component") {
    const component = asRecord(readArray(ui.components)[selection.componentIndex]);
    return component
      ? { component, box: componentBox(component) }
      : null;
  }

  if (selection.componentIndex >= 0) {
    const component = asRecord(readArray(ui.components)[selection.componentIndex]);
    return component
      ? { component, box: componentBox(component) }
      : null;
  }

  const element = getElementAtSelection(ui, selection);
  const box = absoluteBoxForSelection(ui, selection);
  return element && box
    ? { component: rootElementClipboardComponent(element, box), box }
    : null;
}

function rootElementClipboardComponent(element: RawElement, box: Box): RawComponent {
  const type = readString(element.type) ?? "element";
  const label =
    readString(element.name) || readString(element.id) || `Copied ${type}`;
  return {
    id: `${normalizeId(label)}_component`,
    description: label,
    position: { x: box.x, y: box.y },
    size: { width: box.width, height: box.height },
    elements: [
      {
        ...element,
        position: { x: 0, y: 0 },
        size: { width: box.width, height: box.height },
      },
    ],
  };
}

function surfaceSelectionTarget(
  ui: RawUi,
  selection: Selection,
  slideIndex: number | null,
): TemplateV2SurfaceSelectedDetail["selection"] {
  if (!selection) return null;
  if (selection.kind === "multi-component") return null;
  if (selection.kind === "component") {
    const component = asRecord(readArray(ui.components)[selection.componentIndex]);
    const componentLabel = componentDisplayLabel(component, selection.componentIndex);
    return {
      kind: "component",
      slideIndex,
      componentIndex: selection.componentIndex,
      componentId: readString(component?.id) || undefined,
      componentLabel,
      targetLabel: componentLabel,
    };
  }

  const element = getElementAtSelection(ui, selection);
  const component = asRecord(readArray(ui.components)[selection.componentIndex]);
  const componentLabel =
    selection.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX
      ? ""
      : componentDisplayLabel(component, selection.componentIndex);
  const elementType = readString(element?.type) || "Element";
  const elementName = readString(element?.name);
  const targetLabel =
    elementName ||
    (componentLabel ? `${elementType} in ${componentLabel}` : elementType);
  return {
    kind: "element",
    slideIndex,
    componentIndex:
      selection.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX
        ? undefined
        : selection.componentIndex,
    componentId: readString(component?.id) || undefined,
    componentLabel: componentLabel || undefined,
    elementPath: elementPathForSelection(ui, selection) || undefined,
    elementType,
    elementName: elementName || undefined,
    targetLabel,
  };
}

function componentDisplayLabel(component: UnknownRecord | null, index: number) {
  return (
    readString(component?.description) ||
    readString(component?.name) ||
    readString(component?.id) ||
    `Component ${index + 1}`
  );
}

function componentChildCount(component: UnknownRecord) {
  return readArray(component.elements).filter(isRecord).length;
}

function elementPathForSelection(ui: RawUi, selection: ElementSelection) {
  const parts: string[] =
    selection.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX
      ? []
      : [`components[${selection.componentIndex}]`];
  let items =
    selection.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX
      ? readArray(ui.elements)
      : readArray(asRecord(readArray(ui.components)[selection.componentIndex])?.elements);
  let current: RawElement | null = null;

  for (let depth = 0; depth < selection.elementPath.length; depth += 1) {
    const index = selection.elementPath[depth] ?? -1;
    if (!Number.isFinite(index) || index < 0 || index >= items.length) return "";
    if (depth === 0) {
      parts.push(`elements[${index}]`);
    } else if (current) {
      const childInfo = childArrayInfo(current);
      if (!childInfo || childInfo.key === "item") return "";
      parts.push(childInfo.key === "child" ? "child" : `${childInfo.key}[${index}]`);
    }
    current = asRecord(items[index]) as RawElement | null;
    items = current ? childArrayInfo(current)?.items ?? [] : [];
  }

  return parts.join(".");
}

function selectionFromKey(key: string): Selection {
  if (key.startsWith("component:")) {
    const componentIndex = Number(key.split(":")[1]);
    return Number.isFinite(componentIndex)
      ? { kind: "component", componentIndex }
      : null;
  }
  if (key.startsWith("multi-component:")) {
    const componentIndexes = key
      .split(":")[1]
      ?.split(".")
      .map(Number)
      .filter((value) => Number.isInteger(value) && value >= 0) ?? [];
    return selectionForComponentIndexes(componentIndexes);
  }
  const [, component, path] = key.split(":");
  const componentIndex = Number(component);
  const elementPath = path
    ?.split(".")
    .map(Number)
    .filter((value) => Number.isFinite(value));
  if (!Number.isFinite(componentIndex) || !elementPath?.length) return null;
  return { kind: "element", componentIndex, elementPath };
}

function selectionTouchesComponent(
  key: string | null,
  componentIndex: number,
) {
  return (
    key === `component:${componentIndex}` ||
    key?.startsWith(`element:${componentIndex}:`) === true
  );
}

function selectionTouchesElement(
  key: string | null,
  componentIndex: number,
  elementPath: number[],
) {
  if (!key) return false;
  const ownKey = `element:${componentIndex}:${elementPath.join(".")}`;
  return key === ownKey || key.startsWith(`${ownKey}.`);
}

function numberPathEqual(previous: number[], next: number[]) {
  return (
    previous.length === next.length &&
    previous.every((value, index) => value === next[index])
  );
}

function boxEqual(previous: Box, next: Box) {
  return (
    previous.x === next.x &&
    previous.y === next.y &&
    previous.width === next.width &&
    previous.height === next.height
  );
}

function nullableBoxEqual(
  previous: Box | null | undefined,
  next: Box | null | undefined,
) {
  if (previous == null || next == null) return previous == null && next == null;
  return boxEqual(previous, next);
}

function stackedToolbarPosition({
  anchorBox,
  bounds,
  index,
  total,
  toolbarWidth,
}: {
  anchorBox: Box;
  bounds?: Size;
  index: number;
  total: number;
  toolbarWidth: number;
}) {
  const boundary = bounds ?? { width: STAGE_WIDTH, height: STAGE_HEIGHT };
  const stackHeight = total * TOOLBAR_HEIGHT + (total - 1) * TOOLBAR_GAP;
  const canFitAbove = anchorBox.y >= stackHeight + TOOLBAR_MARGIN;
  const startTop = canFitAbove
    ? anchorBox.y - stackHeight - TOOLBAR_GAP
    : Math.min(
        boundary.height - stackHeight - TOOLBAR_MARGIN,
        anchorBox.y + anchorBox.height + TOOLBAR_GAP,
      );
  return {
    left: Math.max(
      TOOLBAR_MARGIN,
      Math.min(anchorBox.x, boundary.width - toolbarWidth - TOOLBAR_MARGIN),
    ),
    top: Math.max(
      TOOLBAR_MARGIN,
      startTop + index * (TOOLBAR_HEIGHT + TOOLBAR_GAP),
    ),
  };
}

function stackedViewportToolbarPosition({
  anchorBox,
  index,
  root,
  total,
  toolbarWidth,
}: {
  anchorBox: Box;
  index: number;
  root: HTMLElement | null;
  total: number;
  toolbarWidth: number;
}) {
  if (typeof window === "undefined" || !root) {
    return stackedToolbarPosition({
      anchorBox,
      index,
      total,
      toolbarWidth,
    });
  }

  const rect = root.getBoundingClientRect();
  const scaleX = rect.width > 0 ? rect.width / STAGE_WIDTH : 1;
  const scaleY = rect.height > 0 ? rect.height / STAGE_HEIGHT : 1;
  return stackedToolbarPosition({
    anchorBox: {
      x: rect.left + anchorBox.x * scaleX,
      y: rect.top + anchorBox.y * scaleY,
      width: anchorBox.width * scaleX,
      height: anchorBox.height * scaleY,
    },
    bounds: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    index,
    total,
    toolbarWidth,
  });
}

function componentKey(component: RawComponent, index: number) {
  return `${readString(component.id) ?? "component"}:${index}`;
}

function rawElementKey(element: RawElement, index: number) {
  return `${readString(element.id) ?? readString(element.name) ?? readString(element.type) ?? "element"}:${index}`;
}

function componentBox(component: RawComponent): Box {
  return {
    ...readPoint(component.position),
    ...readSize(component.size, { width: STAGE_WIDTH, height: STAGE_HEIGHT }),
  };
}

function elementBox(element: RawElement): Box {
  return {
    ...readPoint(element.position),
    ...elementSize(element),
  };
}

function isManualPositioned(element: RawElement) {
  return element.__presenton_manual_position === true;
}

function elementSize(element: RawElement, fallback?: Size): Size {
  const explicit = readOptionalSize(element.size);
  if (explicit) return explicit;

  const type = readString(element.type);
  if (type === "group") {
    return childrenBounds(childArrayInfo(element)?.items ?? []);
  }
  if (type === "container") {
    const padding = readPadding(element.padding);
    const child = asRecord(element.child);
    const childSize = child ? elementSize(child, fallback) : fallback;
    if (childSize) {
      return {
        width: Math.max(1, childSize.width + padding.left + padding.right),
        height: Math.max(1, childSize.height + padding.top + padding.bottom),
      };
    }
  }
  if (type === "text") {
    const font = rawFont(element);
    const text = displayText(rawTextContent(element));
    const width = fallback?.width ?? estimateTextWidth(text, font);
    return {
      width: Math.max(1, width),
      height: Math.max(1, estimateTextHeight(text, font, width)),
    };
  }
  if (type === "text-list") {
    const font = rawFont(element);
    const text = displayText(rawTextListContent(element));
    const width = fallback?.width ?? estimateTextWidth(text, font);
    return {
      width: Math.max(1, width),
      height: Math.max(1, estimateTextHeight(text, font, width)),
    };
  }
  if (type === "line") {
    return {
      width: fallback?.width ?? DECORATIVE_LINE_LENGTH,
      height: fallback?.height ?? DECORATIVE_LINE_THICKNESS,
    };
  }
  if (type === "rectangle" || type === "ellipse") {
    return {
      width: fallback?.width ?? DECORATIVE_LINE_LENGTH,
      height: fallback?.height ?? DECORATIVE_LINE_LENGTH,
    };
  }
  if (type === "flex" || type === "grid" || type === "list-view" || type === "grid-view") {
    return fallback ?? childrenBounds(childArrayInfo(element)?.items ?? []);
  }
  return fallback ?? { width: 1, height: 1 };
}

function childrenBounds(children: unknown[]): Size {
  const records = children.filter(isRecord) as RawElement[];
  if (records.length === 0) return { width: 1, height: 1 };

  return records.reduce<Size>(
    (bounds, child) => {
      const box = elementBox(child);
      return {
        width: Math.max(bounds.width, box.x + box.width),
        height: Math.max(bounds.height, box.y + box.height),
      };
    },
    { width: 1, height: 1 },
  );
}

function childArrayInfo(element: RawElement): ChildArrayInfo | null {
  if (Array.isArray(element.children)) return { key: "children", items: element.children };
  if (Array.isArray(element.elements)) return { key: "elements", items: element.elements };
  if (isRecord(element.child)) return { key: "child", items: [element.child] };
  if (isRecord(element.item)) {
    const count = Math.max(0, Math.floor(readNumber(element.count) ?? 1));
    return {
      key: "item",
      items: Array.from({ length: count }, () => element.item),
    };
  }
  return null;
}

function withUpdatedChildItems(
  element: RawElement,
  childInfo: ChildArrayInfo,
  updatedChildren: unknown[],
  selectedChildIndex = 0,
) {
  if (childInfo.key === "child") {
    return { ...element, child: updatedChildren[0] ?? null };
  }
  if (childInfo.key === "item") {
    const selected = Math.max(0, selectedChildIndex);
    return {
      ...element,
      item:
        updatedChildren[selected] ??
        updatedChildren[0] ??
        element.item ??
        null,
    };
  }
  return { ...element, [childInfo.key]: updatedChildren };
}

function shouldClipElementChildren(
  element: RawElement,
  childInfo: ChildArrayInfo | null,
) {
  if (!childInfo) return false;
  const type = readString(element.type);
  return (
    type === "container" ||
    type === "flex" ||
    type === "grid" ||
    type === "list-view" ||
    type === "grid-view"
  );
}

function isBoxVisualType(type: string | null) {
  return (
    type === "rectangle" ||
    type === "container" ||
    type === "flex" ||
    type === "grid" ||
    type === "group" ||
    type === "list-view" ||
    type === "grid-view"
  );
}

function elementWithInlineDraft(
  element: RawElement,
  kind: TemplateV2InlineEditKind,
  draft: string,
  style?: TemplateV2TextEditStyle,
  frame?: Box | null,
  runs?: TextRun[],
) {
  if (kind === "text") {
    const next =
      runs != null
        ? setRawTextRunsContent(element, runs)
        : draft === rawTextContent(element)
        ? element
        : setRawTextContent(element, draft, style);
    return preserveInlineEditFrame(next, frame);
  }
  if (kind === "text-list") {
    const next = setRawTextListContent(element, draft);
    return preserveInlineEditFrame(style ? applyTextStyle(next, style) : next, frame);
  }
  if (kind === "svg") {
    return preserveInlineEditFrame(setRawSvgContent(element, draft), frame);
  }
  return element;
}

function preserveInlineEditFrame(element: RawElement, frame?: Box | null) {
  if (!frame) return element;
  return {
    ...element,
    position: {
      ...(asRecord(element.position) ?? {}),
      x: frame.x,
      y: frame.y,
    },
    size: {
      ...(asRecord(element.size) ?? {}),
      width: frame.width,
      height: frame.height,
    },
    __presenton_manual_position: true,
  };
}

function normalizeMarkdownTextInUi(ui: RawUi): RawUi {
  let changed = false;
  const nextUi: RawUi = { ...ui };
  const elements = readArray(ui.elements);
  const normalizedElements = normalizeMarkdownTextElementArray(elements);
  if (normalizedElements !== elements) {
    nextUi.elements = normalizedElements;
    changed = true;
  }

  const components = readArray(ui.components);
  let componentsChanged = false;
  const normalizedComponents = components.map((component) => {
    const record = asRecord(component);
    if (!record) return component;
    const componentElements = readArray(record.elements);
    const normalizedComponentElements =
      normalizeMarkdownTextElementArray(componentElements);
    if (normalizedComponentElements === componentElements) return component;
    componentsChanged = true;
    return {
      ...record,
      elements: normalizedComponentElements,
    };
  });

  if (componentsChanged) {
    nextUi.components = normalizedComponents;
    changed = true;
  }

  return changed ? nextUi : ui;
}

function normalizeMarkdownTextElementArray(elements: unknown[]): unknown[] {
  let changed = false;
  const normalized = elements.map((element) => {
    const next = normalizeMarkdownTextElementTree(element);
    if (next !== element) changed = true;
    return next;
  });
  return changed ? normalized : elements;
}

function normalizeMarkdownTextElementTree(value: unknown): unknown {
  const element = asRecord(value);
  if (!element) return value;

  let next = element;
  if (readString(element.type) === "text") {
    const normalized = normalizeRawTextMarkdownElement(element);
    next = normalized.element;
  }

  const childInfo = childArrayInfo(next);
  if (!childInfo) return next;

  const normalizedChildren = normalizeMarkdownTextElementArray(childInfo.items);
  return normalizedChildren === childInfo.items
    ? next
    : withUpdatedChildItems(next, childInfo, normalizedChildren);
}

function rawComponentForEditorToolbar(
  component: RawComponent,
): SlideElement {
  const box = componentBox(component);
  return {
    ...component,
    type: "group",
    position: { x: box.x / EDITOR_SCALE, y: box.y / EDITOR_SCALE },
    size: {
      width: box.width / EDITOR_SCALE,
      height: box.height / EDITOR_SCALE,
    },
    children: readArray(component.elements)
      .filter(isRecord)
      .map((element) => rawElementTreeForEditor(element)),
  } as unknown as SlideElement;
}

function rawElementTreeForEditor(element: RawElement): SlideElement {
  const box = elementBox(element);
  const projected =
    rawElementForEditorToolbar(element, box) ??
    ({
      ...element,
      position: { x: box.x / EDITOR_SCALE, y: box.y / EDITOR_SCALE },
      size: {
        width: box.width / EDITOR_SCALE,
        height: box.height / EDITOR_SCALE,
      },
    } as unknown as SlideElement);
  const next = { ...(projected as unknown as UnknownRecord) };

  if (Array.isArray(element.children)) {
    next.children = element.children
      .filter(isRecord)
      .map((child) => rawElementTreeForEditor(child));
  } else if (Array.isArray(element.elements)) {
    next.children = element.elements
      .filter(isRecord)
      .map((child) => rawElementTreeForEditor(child));
    delete next.elements;
  } else if (isRecord(element.child)) {
    next.child = rawElementTreeForEditor(element.child);
  } else if (isRecord(element.item)) {
    next.item = rawElementTreeForEditor(element.item);
  }

  return next as unknown as SlideElement;
}

function mergeEditorToolbarComponent(
  current: RawComponent,
  editorElement: SlideElement,
): RawComponent {
  const editor = editorElement as unknown as UnknownRecord;
  const editorPosition = asRecord(editor.position);
  const editorSize = asRecord(editor.size);
  const currentElements = readArray(current.elements);
  const editorChildren = readArray(editor.children);
  return {
    ...current,
    position: {
      x: (readNumber(editorPosition?.x) ?? componentBox(current).x / EDITOR_SCALE) *
        EDITOR_SCALE,
      y: (readNumber(editorPosition?.y) ?? componentBox(current).y / EDITOR_SCALE) *
        EDITOR_SCALE,
    },
    size: {
      width:
        (readNumber(editorSize?.width) ??
          componentBox(current).width / EDITOR_SCALE) * EDITOR_SCALE,
      height:
        (readNumber(editorSize?.height) ??
          componentBox(current).height / EDITOR_SCALE) * EDITOR_SCALE,
    },
    design_variables: editor.design_variables ?? current.design_variables,
    elements: currentElements.map((value, index) => {
      const raw = asRecord(value);
      const edited = asRecord(editorChildren[index]);
      return raw && edited
        ? mergeEditorElementTree(raw, edited as unknown as SlideElement)
        : value;
    }),
  };
}

function mergeEditorElementTree(
  current: RawElement,
  editorElement: SlideElement,
): RawElement {
  const merged = mergeEditorToolbarElement(
    current,
    editorElement,
    elementBox(current),
  );
  const editor = editorElement as unknown as UnknownRecord;

  if (Array.isArray(current.children)) {
    const editorChildren = readArray(editor.children);
    merged.children = current.children.map((value, index) => {
      const raw = asRecord(value);
      const edited = asRecord(editorChildren[index]);
      return raw && edited
        ? mergeEditorElementTree(raw, edited as unknown as SlideElement)
        : value;
    });
  } else if (Array.isArray(current.elements)) {
    const editorChildren = readArray(editor.children);
    merged.elements = current.elements.map((value, index) => {
      const raw = asRecord(value);
      const edited = asRecord(editorChildren[index]);
      return raw && edited
        ? mergeEditorElementTree(raw, edited as unknown as SlideElement)
        : value;
    });
    delete merged.children;
  } else if (isRecord(current.child) && isRecord(editor.child)) {
    merged.child = mergeEditorElementTree(
      current.child,
      editor.child as unknown as SlideElement,
    );
  } else if (isRecord(current.item) && isRecord(editor.item)) {
    merged.item = mergeEditorElementTree(
      current.item,
      editor.item as unknown as SlideElement,
    );
  }

  return merged;
}

function rawElementForEditorToolbar(
  element: RawElement,
  absoluteBox: Box,
): SlideElement | null {
  const type = readString(element.type);
  if (!type) return null;

  const projected: UnknownRecord = {
    ...element,
    type,
    position: {
      x: absoluteBox.x / EDITOR_SCALE,
      y: absoluteBox.y / EDITOR_SCALE,
    },
    size: {
      width: absoluteBox.width / EDITOR_SCALE,
      height: absoluteBox.height / EDITOR_SCALE,
    },
    font: rawFontRecordForEditor(element.font),
    stroke: rawStrokeForEditor(element.stroke),
    border_radius: rawBorderRadiusForEditor(
      element.border_radius ?? element.borderRadius,
    ),
  };

  if (type === "text") {
    projected.runs = rawTextRunsForEditor(element).map((run) => ({
      text: run.text,
      font: rawFontRecordForEditor(run.font),
    }));
  } else if (type === "text-list") {
    projected.items = readArray(element.items).map((item) => {
      if (Array.isArray(item)) {
        return item.map((value) => {
          const run = asRecord(value) ?? {};
          return { ...run, font: rawFontRecordForEditor(run.font) };
        });
      }
      return [{ text: rawTextListItemText(item) }];
    });
  } else if (type === "table") {
    projected.columns = readArray(element.columns).map(rawTableCellForEditor);
    projected.rows = readArray(element.rows).map((row) =>
      readArray(row).map(rawTableCellForEditor),
    );
  } else if (type === "chart") {
    Object.assign(projected, rawChartToEditorChart(element));
    projected.position = {
      x: absoluteBox.x / EDITOR_SCALE,
      y: absoluteBox.y / EDITOR_SCALE,
    };
    projected.size = {
      width: absoluteBox.width / EDITOR_SCALE,
      height: absoluteBox.height / EDITOR_SCALE,
    };
  }

  return projected as unknown as SlideElement;
}

function mergeEditorToolbarElement(
  current: RawElement,
  editorElement: SlideElement,
  renderedBox: Box,
): RawElement {
  const editor = editorElement as unknown as UnknownRecord;
  const currentPosition = readPoint(current.position);
  const editorPosition = asRecord(editor.position);
  const editorSize = asRecord(editor.size);
  const editorX = readNumber(editorPosition?.x);
  const editorY = readNumber(editorPosition?.y);
  const editorWidth = readNumber(editorSize?.width);
  const editorHeight = readNumber(editorSize?.height);
  const nextPosition = {
    x:
      currentPosition.x +
      ((editorX ?? renderedBox.x / EDITOR_SCALE) * EDITOR_SCALE -
        renderedBox.x),
    y:
      currentPosition.y +
      ((editorY ?? renderedBox.y / EDITOR_SCALE) * EDITOR_SCALE -
        renderedBox.y),
  };
  const nextSize = {
    width: Math.max(
      1,
      (editorWidth ?? renderedBox.width / EDITOR_SCALE) * EDITOR_SCALE,
    ),
    height: Math.max(
      1,
      (editorHeight ?? renderedBox.height / EDITOR_SCALE) * EDITOR_SCALE,
    ),
  };
  const merged: RawElement = {
    ...current,
    ...editor,
    position: nextPosition,
    size: nextSize,
    font: editorFontRecordToRaw(editor.font, current.font),
    stroke: editorStrokeToRaw(editor.stroke, current.stroke),
    border_radius: editorBorderRadiusToRaw(
      editor.border_radius ?? editor.borderRadius,
      current.border_radius ?? current.borderRadius,
    ),
  };

  if (Array.isArray(editor.runs)) {
    const currentRuns = readArray(current.runs);
    merged.runs = editor.runs.map((value, index) => {
      const run = asRecord(value) ?? {};
      const currentRun = asRecord(currentRuns[index]) ?? {};
      return {
        ...currentRun,
        ...run,
        font: editorFontRecordToRaw(run.font, currentRun.font),
      };
    });
  }
  if (readString(current.type) === "table") {
    merged.columns = readArray(editor.columns).map((cell, index) =>
      editorTableCellToRaw(cell, readArray(current.columns)[index]),
    );
    merged.rows = readArray(editor.rows).map((row, rowIndex) =>
      readArray(row).map((cell, colIndex) =>
        editorTableCellToRaw(
          cell,
          readArray(readArray(current.rows)[rowIndex])[colIndex],
        ),
      ),
    );
  }
  if (
    Math.abs(nextPosition.x - currentPosition.x) > 0.01 ||
    Math.abs(nextPosition.y - currentPosition.y) > 0.01 ||
    Math.abs(nextSize.width - elementSize(current).width) > 0.01 ||
    Math.abs(nextSize.height - elementSize(current).height) > 0.01
  ) {
    merged.__presenton_manual_position = true;
  }
  return merged;
}

function rawStrokeForEditor(value: unknown) {
  const stroke = asRecord(value);
  if (!stroke) return value;
  return { ...stroke };
}

function editorStrokeToRaw(value: unknown, fallback: unknown) {
  const stroke = asRecord(value);
  if (!stroke) return fallback;
  return {
    ...(asRecord(fallback) ?? {}),
    ...stroke,
  };
}

function rawBorderRadiusForEditor(value: unknown) {
  const radius = asRecord(value);
  const uniform = readNumber(value);
  if (!radius && uniform == null) return value;
  const raw = radius ?? { tl: uniform, tr: uniform, bl: uniform, br: uniform };
  return {
    tl: (readNumber(raw.tl) ?? 0) / EDITOR_SCALE,
    tr: (readNumber(raw.tr) ?? 0) / EDITOR_SCALE,
    bl: (readNumber(raw.bl) ?? 0) / EDITOR_SCALE,
    br: (readNumber(raw.br) ?? 0) / EDITOR_SCALE,
  };
}

function editorBorderRadiusToRaw(value: unknown, fallback: unknown) {
  const radius = asRecord(value);
  if (!radius) return fallback;
  return {
    tl: (readNumber(radius.tl) ?? 0) * EDITOR_SCALE,
    tr: (readNumber(radius.tr) ?? 0) * EDITOR_SCALE,
    bl: (readNumber(radius.bl) ?? 0) * EDITOR_SCALE,
    br: (readNumber(radius.br) ?? 0) * EDITOR_SCALE,
  };
}

function rawTableCellForEditor(value: unknown) {
  const cell = asRecord(value) ?? {};
  const rawRuns = readArray(cell.runs);
  const runs =
    rawRuns.length > 0
      ? rawRuns.map((value) => {
        const run = asRecord(value) ?? {};
        return { ...run, font: rawFontRecordForEditor(run.font) };
      })
      : [{ text: rawTableCellText(cell) }];
  return {
    ...cell,
    color: cell.color ?? cell.fill,
    font: rawFontRecordForEditor(cell.font),
    runs,
  };
}

function editorTableCellToRaw(value: unknown, fallback: unknown) {
  const cell = asRecord(value) ?? {};
  const current = asRecord(fallback) ?? {};
  const currentRuns = readArray(current.runs);
  return {
    ...current,
    ...cell,
    color: cell.color ?? current.color ?? current.fill,
    font: editorFontRecordToRaw(cell.font, current.font),
    runs: readArray(cell.runs).map((value, index) => {
      const run = asRecord(value) ?? {};
      const currentRun = asRecord(currentRuns[index]) ?? {};
      return {
        ...currentRun,
        ...run,
        font: editorFontRecordToRaw(run.font, currentRun.font),
      };
    }),
  };
}

function rawChartToEditorChart(element: RawElement): ChartElement {
  const categories = readArray(element.categories).map(String);
  const series = readArray(element.series)
    .map((value, index): ChartSeries | null => {
      const record = asRecord(value);
      if (!record) return null;
      const values = readArray(record.values ?? record.data).map(
        (item) => readNumber(item) ?? 0,
      );
      return {
        name: readString(record.name) ?? `Series ${index + 1}`,
        values,
      };
    })
    .filter((value): value is ChartSeries => value != null);
  const normalizedSeries =
    series.length > 0 ? series : [{ name: "Series 1", values: [0] }];
  const normalizedCategories =
    categories.length > 0
      ? categories
      : normalizedSeries[0].values.map((_, index) => `Item ${index + 1}`);
  const colors = readArray(
    element.series_colors ?? element.seriesColors,
  ).map(String);
  const chartType = rawChartType(element.chart_type ?? element.chartType);
  const usesUnifiedColor =
    chartType === "bar" || chartType === "line" || chartType === "area";
  const chartColors = usesUnifiedColor
    ? [colors[0] ?? readString(element.color) ?? "7C51F8"]
    : colors;
  const firstSeries = normalizedSeries[0];
  const data = normalizedCategories.slice(0, 8).map((label, index) => ({
    label,
    value: firstSeries.values[index] ?? 0,
    color: usesUnifiedColor
      ? chartColors[0]
      : chartColors[index] ?? chartColors[0],
  }));

  return {
    ...element,
    type: "chart",
    chart_type: chartType,
    data: data.length > 0 ? data : [{ label: "Item 1", value: 0 }],
    categories: normalizedCategories,
    series: normalizedSeries,
    series_colors: chartColors,
    axis_color: element.axis_color ?? element.axisColor,
    data_labels_color: element.data_labels_color ?? element.labelColor,
    x_axis: element.x_axis ?? element.xAxis,
    y_axis: element.y_axis ?? element.yAxis,
    x_axis_title: element.x_axis_title ?? element.xAxisTitle,
    y_axis_title: element.y_axis_title ?? element.yAxisTitle,
    data_labels: element.data_labels ?? element.dataLabels,
  };
}

function editorChartToRawChart(source: RawElement, chart: UnknownRecord) {
  return {
    ...source,
    ...chart,
    type: "chart",
    chart_type: chart.chartType ?? chart.chart_type ?? source.chart_type,
    series_colors: chart.seriesColors ?? chart.series_colors ?? source.series_colors,
    axis_color: chart.axisColor ?? chart.axis_color ?? source.axis_color,
    data_labels_color:
      chart.labelColor ?? chart.data_labels_color ?? source.data_labels_color,
    x_axis: chart.xAxis ?? chart.x_axis ?? source.x_axis,
    y_axis: chart.yAxis ?? chart.y_axis ?? source.y_axis,
    x_axis_title: chart.xAxisTitle ?? chart.x_axis_title ?? source.x_axis_title,
    y_axis_title: chart.yAxisTitle ?? chart.y_axis_title ?? source.y_axis_title,
    data_labels: chart.dataLabels ?? chart.data_labels ?? source.data_labels,
  };
}

function linePoints(width: number, height: number, strokeWidthValue: number) {
  if (height <= Math.max(2, strokeWidthValue * 2)) {
    return [0, height / 2, width, height / 2];
  }
  if (width <= Math.max(2, strokeWidthValue * 2)) {
    return [width / 2, 0, width / 2, height];
  }
  return [0, 0, width, height];
}

function valueProgress(element: RawElement) {
  const min = readNumber(element.min_value) ?? readNumber(element.minValue) ?? 0;
  const max = readNumber(element.max_value) ?? readNumber(element.maxValue) ?? 100;
  const value = readNumber(element.value) ?? min;
  const range = max - min;
  if (!Number.isFinite(range) || range === 0) return 0;
  return clamp((value - min) / range, 0, 1);
}

function pointOnCircle(x: number, y: number, radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: x + Math.cos(radians) * radius,
    y: y + Math.sin(radians) * radius,
  };
}

function backgroundColor(ui: RawUi) {
  return withHash(readString(ui.background) ?? "#FFFFFF");
}

function fillColor(fill: unknown) {
  const value = asRecord(fill);
  return withHash(readString(value?.color));
}

function fillOpacity(fill: unknown) {
  const value = asRecord(fill);
  return readNumber(value?.opacity) ?? 1;
}

function strokeColor(stroke: unknown) {
  const value = asRecord(stroke);
  return withHash(readString(value?.color));
}

function strokeWidth(stroke: unknown) {
  const value = asRecord(stroke);
  return readNumber(value?.width) ?? 0;
}

function strokeOpacity(stroke: unknown) {
  const value = asRecord(stroke);
  return readNumber(value?.opacity) ?? 1;
}

function colorWithOpacity(color: string | undefined, opacity: number) {
  if (!color) return undefined;
  const alpha = clamp(opacity, 0, 1);
  if (alpha >= 1) return color;
  const hex = color.startsWith("#") ? color.slice(1) : color;
  if (hex.length === 3) {
    const [r, g, b] = hex.split("").map((part) => parseInt(part + part, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

function shadowProps(element: RawElement) {
  const shadow = asRecord(element.shadow);
  if (!shadow) return {};
  const color = withHash(readString(shadow.color) ?? "#000000");
  const opacity = readNumber(shadow.opacity) ?? 0.2;
  const blur = readNumber(shadow.blur) ?? 0;
  const offsetX = readNumber(shadow.offset_x) ?? readNumber(shadow.offsetX) ?? 0;
  const offsetY = readNumber(shadow.offset_y) ?? readNumber(shadow.offsetY) ?? 0;
  if (opacity <= 0 || (blur <= 0 && offsetX === 0 && offsetY === 0)) return {};
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowBlur: blur,
    shadowOffsetX: offsetX,
    shadowOffsetY: offsetY,
  };
}

function borderRadius(element: RawElement) {
  const value = element.border_radius ?? element.borderRadius;
  if (typeof value === "number") return value;
  const record = asRecord(value);
  const radius = readNumber(record?.radius);
  if (radius != null) return radius;
  const topLeft = readNumber(record?.tl) ?? readNumber(record?.topLeft) ?? 0;
  const topRight = readNumber(record?.tr) ?? readNumber(record?.topRight) ?? topLeft;
  const bottomRight =
    readNumber(record?.br) ?? readNumber(record?.bottomRight) ?? topRight;
  const bottomLeft =
    readNumber(record?.bl) ?? readNumber(record?.bottomLeft) ?? bottomRight;
  if (topLeft || topRight || bottomRight || bottomLeft) {
    return [topLeft, topRight, bottomRight, bottomLeft];
  }
  return 0;
}

function readPadding(value: unknown) {
  if (typeof value === "number") {
    return { top: value, right: value, bottom: value, left: value };
  }
  const record = asRecord(value);
  const x = readNumber(record?.x) ?? readNumber(record?.horizontal);
  const y = readNumber(record?.y) ?? readNumber(record?.vertical);
  return {
    top: readNumber(record?.top) ?? y ?? 0,
    right: readNumber(record?.right) ?? x ?? 0,
    bottom: readNumber(record?.bottom) ?? y ?? 0,
    left: readNumber(record?.left) ?? x ?? 0,
  };
}

function alignmentOffset(alignment: string | null, available: number, used: number) {
  const free = Math.max(0, available - used);
  if (alignment === "center") return free / 2;
  if (
    alignment === "right" ||
    alignment === "bottom" ||
    alignment === "end" ||
    alignment === "flex-end"
  ) {
    return free;
  }
  return 0;
}

function readPoint(value: unknown): Point {
  const record = asRecord(value);
  return {
    x: readNumber(record?.x) ?? 0,
    y: readNumber(record?.y) ?? 0,
  };
}

function readSize(
  value: unknown,
  fallback: Size = { width: 1, height: 1 },
): Size {
  const record = asRecord(value);
  return {
    width: Math.max(1, readNumber(record?.width) ?? fallback.width),
    height: Math.max(1, readNumber(record?.height) ?? fallback.height),
  };
}

function readOptionalSize(value: unknown): Size | null {
  const record = asRecord(value);
  const width = readNumber(record?.width);
  const height = readNumber(record?.height);
  if (width == null || height == null) return null;
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stripUndefined<T extends UnknownRecord>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(asRecord(value));
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function rawIconQuery(element: RawElement): string {
  for (const key of ["icon_query", "query", "__icon_query__"]) {
    const query = readString(element[key])?.trim();
    if (query) return query;
  }

  const name = (readString(element.name) ?? "").replace(/[_-]+/g, " ").trim();
  return name || "icon";
}

function isRawIconElement(element: RawElement): boolean {
  return (
    readString(element.type) === "image" && readBoolean(element.is_icon) === true
  );
}

function isStaticSvgIconSource(source: string, baseUrl: string): boolean {
  try {
    const pathname = new URL(source, baseUrl).pathname;
    return (
      pathname.startsWith("/static/icons/") &&
      pathname.toLowerCase().endsWith(".svg")
    );
  } catch {
    return false;
  }
}

function withHash(value: string | null | undefined) {
  if (!value) return undefined;
  return value.startsWith("#") || value.startsWith("rgb") ? value : `#${value}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeId(value: string) {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "component";
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "button,input,textarea,select,[contenteditable='true'],[role='dialog'],[data-inline-edit-ignore='true']",
    ),
  );
}
