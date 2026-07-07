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
import { Loader2 } from "lucide-react";
import { Layer, Rect, Stage } from "react-konva";
import { notify } from "@/components/ui/sonner";
import type { TemplateV2Layout } from "@/components/slide-editor/importing/template-v2-import";
import {
  templateFontOptionsFromMap,
} from "@/components/slide-editor/text/google-fonts";
import {
  canUngroupTemplateV2Component,
  ungroupTemplateV2ComponentInUi,
} from "@/components/slide-editor/model/template-v2-ungroup";
import { textRunsContent } from "@/components/slide-editor/text/text-runs";

import {
  normalizeRawTextMarkdownElement,
  rawTextContent,
  rawTextListRunsForEditor,
  rawTextRunsForEditor,
  rawTextStyle,
  setRawTextListRunsContent,
  setRawTextRunsContent,
} from "@/components/slide-editor/text/template-v2-text";
import type {
  ChartElement,
  SlideElement,
  TextRun,
} from "@/components/slide-editor/types";
import {
  useTableCellSelection,
  useTemplateV2InlineEditing,
  type TableSlideElement,
} from "@/components/slide-editor/state/state";
import { ElementToolbar } from "@/components/slide-editor/toolbar/ElementToolbar";
import { TableInlineEditor } from "@/components/slide-editor/tables/TableInlineEditor";
import { TemplateV2InlineEditor } from "@/components/slide-editor/text/TemplateV2InlineEditor";


import { updateSlideUi } from "@/store/slices/presentationGeneration";
import { resolveBackendAssetSource } from "@/utils/api";
import { ImagesApi } from "@/app/(presentation-generator)/services/api/images";
import IconsEditor from "@/components/slide-editor/images/IconsEditor";
import {
  createTemplateV2ClipboardPayload,
  pasteTemplateV2ClipboardPayload,
  type TemplateV2ClipboardPayload,
} from "@/components/slide-editor/clipboard/clipboard";
import { useTemplateV2Clipboard } from "@/components/slide-editor/clipboard/useClipboard";
import {
  isTemplateV2FlowLayoutElement,
  isTemplateV2LayoutElement,
} from "@/components/slide-editor/layout/LayoutToolbar";
import { TemplateV2SelectionToolbar } from "@/components/slide-editor/selection/SelectionToolbar";
import {
  getTemplateV2SelectionToolbarAnchorBox,
  getTemplateV2SelectionToolbarBounds,
  getTemplateV2SelectionToolbarPosition,
  hasTemplateV2SelectionToolbar,
} from "@/components/slide-editor/selection/toolbarPosition";
import { getTemplateV2SelectionToolbarTarget } from "@/components/slide-editor/selection/toolbarTarget";
import { updateComponentLayoutElement } from "@/components/slide-editor/layout/layoutResize";
import {
  reorderComponentLayer,
  type ComponentLayerAction,
} from "@/components/slide-editor/selection/layering";
import { TemplateV2SelectionTransformers } from "@/components/slide-editor/selection/SelectionTransformers";
import { useFontLoadState } from "@/components/slide-editor/surface/fontLoading";
import {
  MemoizedRawComponentNode,
  MemoizedRawElementNode,
} from "@/components/slide-editor/surface/nodes";
import {
  MAX_HISTORY_ENTRIES,
  ROOT_ELEMENTS_COMPONENT_INDEX,
  SCROLL_DISMISS_THRESHOLD_PX,
  STAGE_BOX,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  absoluteBoxForSelection,
  absoluteInlineEditBox,
  appendInsertedContent,
  asRecord,
  backgroundColor,
  childArrayInfo,
  childrenBounds,
  cloneJson,
  componentBox,
  componentForClipboardSelection,
  componentIndexesForSelection,
  deleteSelectionFromUi,
  editorChartToRawChart,
  elementBox,
  elementSize,
  elementWithInlineDraft,
  elementWithNormalizedLayoutChildren,
  eventTargetsThisSlide,
  getElementAtSelection,
  isBoxVisualType,
  isEditableTarget,
  isManualPositioned,
  isRecord,
  isRawIconElement,
  keyForSelection,
  keysForSelection,
  layoutChildren,
  normalizeMarkdownTextInUi,
  componentKey,
  mergeEditorToolbarElement,
  rawChartToEditorChart,
  rawElementForEditorToolbar,
  rawElementKey,
  rawIconQuery,
  readArray,
  readPoint,
  readString,
  renderedLocalBoxForElementSelection,
  rootElementsComponent,
  selectionFromKey,
  selectionWithComponentToggle,
  setComponentPositionsInUi,
  surfaceSelectionTarget,
  positionFromNodeInParent,
  unclampedPositionFromNodeInParent,
  updateComponentInUi,
  updateElementInUi,
  type ComponentSelection,
  type ElementSelection,
  type MultiComponentDragState,
  type Point,
  type RawComponent,
  type RawElement,
  type RawUi,
  type SelectOptions,
  type Selection,
  type UnknownRecord,
} from "@/components/slide-editor/model/model";
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
} from "@/components/slide-editor/events/events";

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
} from "@/components/slide-editor/events/events";

export type TemplateV2ChartElement = ChartElement;

type TemplateV2KonvaSlideProps = {
  layout: TemplateV2Layout;
  isEditMode: boolean;
  slideId?: string | number | null;
  slideIndex: number;
  renderIndex?: number;
  fonts?: unknown;
};

function TemplateV2KonvaSlideComponent({
  layout,
  isEditMode,
  slideId = null,
  slideIndex,
  renderIndex,
  fonts,
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
  const templateFonts = useMemo(() => templateFontOptionsFromMap(fonts), [
    fonts,
  ]);
  const fontLoadState = useFontLoadState(uiDraft, templateFonts);
  const currentUiRef = useRef<RawUi>(uiDraft);
  const [selection, setSelection] = useState<Selection>(null);
  const selectionRef = useRef<Selection>(selection);
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
  const [, setHistoryAvailability] = useState({
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
  const selectedComponentIndexesRef = useRef<number[]>(selectedComponentIndexes);
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
  const layoutToolbarTarget = useMemo(
    () =>
      getTemplateV2SelectionToolbarTarget({
        selection,
        selectedBox,
        selectedComponent,
        selectedElement,
        absoluteBoxForSelection: (targetSelection) =>
          absoluteBoxForSelection(uiDraft, targetSelection),
      }),
    [selectedBox, selectedComponent, selectedElement, selection, uiDraft],
  );
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
          : inlineEdit &&
            inlineEdit.kind === "text-list" &&
            inlineEdit.runs &&
            selection?.kind === "element" &&
            keyForSelection(inlineEdit.selection) === keyForSelection(selection)
            ? setRawTextListRunsContent(selectedElement, inlineEdit.runs)
            : selectedElement;
      return rawElementForEditorToolbar(inlineTextElement, selectedBox);
    },
    [inlineEdit, selectedBox, selectedElement, selection],
  );
  const canUngroupSelectedComponent = useMemo(
    () =>
      selection?.kind === "component" &&
      selectedComponent != null &&
      canUngroupTemplateV2Component(selectedComponent),
    [selectedComponent, selection],
  );
  const canUngroupLayoutTargetComponent = useMemo(() => {
    const componentIndex = layoutToolbarTarget?.selection.componentIndex;
    if (
      componentIndex == null ||
      componentIndex < 0 ||
      !layoutToolbarTarget ||
      !isTemplateV2FlowLayoutElement(layoutToolbarTarget.element)
    ) {
      return false;
    }
    const component = asRecord(readArray(uiDraft.components)[componentIndex]);
    return canUngroupTemplateV2Component(component);
  }, [layoutToolbarTarget, uiDraft.components]);
  const [, setToolbarViewportVersion] = useState(0);
  const hasDismissibleEditorUi = Boolean(
    selection ||
    inlineEdit ||
    iconEditorSelection ||
    selectedTableCell ||
    editingTableCell,
  );
  const floatingToolbarAnchorBox = getTemplateV2SelectionToolbarAnchorBox({
    layoutTarget: layoutToolbarTarget,
    selectedBox,
    selection,
  });
  const hasFloatingToolbar = hasTemplateV2SelectionToolbar({
    anchorBox: floatingToolbarAnchorBox,
    isEditMode,
    layoutTarget: layoutToolbarTarget,
    selection,
  });
  const selectionToolbarPosition = getTemplateV2SelectionToolbarPosition({
    anchorBox: floatingToolbarAnchorBox,
    layoutTarget: layoutToolbarTarget,
    root: rootElement,
  });
  const selectionToolbarBounds =
    getTemplateV2SelectionToolbarBounds(rootElement);
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
  const contentLayerKey = isEditMode
    ? `template-v2-edit-layer:${fontLoadState.revision}`
    : `fonts:${fontLoadState.revision}`;

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    selectedComponentIndexesRef.current = selectedComponentIndexes;
  }, [selectedComponentIndexes]);

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
    if (!hasFloatingToolbar || typeof window === "undefined") return;
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
  }, [hasFloatingToolbar]);

  const isSurfaceActive = useCallback(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.dataset.templateV2KonvaActiveSurface === surfaceId,
    [surfaceId],
  );

  const activateSurface = useCallback((nextSelection?: Selection) => {
    if (
      !isEditMode ||
      typeof document === "undefined" ||
      typeof window === "undefined"
    ) {
      return;
    }
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
            selection: surfaceSelectionTarget(
              currentUiRef.current,
              nextSelection === undefined ? selectionRef.current : nextSelection,
              surfaceSlideIndex,
            ),
          },
        },
      ),
    );
  }, [isEditMode, slideId, surfaceId, surfaceSlideIndex]);

  useEffect(() => {
    if (!isEditMode || !isSurfaceActive() || typeof window === "undefined") {
      return;
    }
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
  }, [
    isEditMode,
    isSurfaceActive,
    selectedSurfaceTarget,
    slideId,
    surfaceSlideIndex,
  ]);

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
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-inline-edit-ignore='true']")) return;

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
      clearTableCellSelection();
      const resolvedSelection = selectionWithComponentToggle(
        selectionRef.current,
        nextSelection,
        options,
      );
      selectionRef.current = resolvedSelection;
      setSelection(resolvedSelection);
      activateSurface(resolvedSelection);
    },
    [activateSurface, clearTableCellSelection],
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
      const selectedIndexes = selectedComponentIndexesRef.current;
      if (
        selectedIndexes.length < 2 ||
        !selectedIndexes.includes(componentIndex)
      ) {
        multiComponentDragRef.current = null;
        return;
      }

      const sourceComponents = readArray(currentUiRef.current.components);
      const nodes = selectedIndexes.flatMap((selectedIndex) => {
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
    [],
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
          position: unclampedPositionFromNodeInParent(
            node,
            STAGE_BOX,
            componentBox(current),
          ),
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

  const closeChartEditor = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent<TemplateV2ChartEditorDetail>(
        TEMPLATE_V2_CHART_EDITOR_EVENT,
        {
          detail: {
            open: false,
            slideId,
            slideIndex: surfaceSlideIndex,
          },
        },
      ),
    );
  }, [slideId, surfaceSlideIndex]);

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    commitUi(deleteSelectionFromUi(currentUiRef.current, selection));
    setSelection(null);
    clearTableCellSelection();
    clearInlineEdit();
    setIconEditorSelection(null);
    closeChartEditor();
  }, [
    clearInlineEdit,
    clearTableCellSelection,
    closeChartEditor,
    commitUi,
    selection,
  ]);

  const createClipboardPayload = useCallback((): TemplateV2ClipboardPayload | null => {
    const clipboardComponent = componentForClipboardSelection(
      currentUiRef.current,
      selection,
    );
    return clipboardComponent
      ? createTemplateV2ClipboardPayload(
        clipboardComponent.components.map((item) => ({
          data: item.component,
          absoluteBox: item.box,
        })),
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

  const duplicateSelection = useCallback(() => {
    const payload = createClipboardPayload();
    if (!payload) return;
    pasteClipboardPayload(payload, 16);
  }, [createClipboardPayload, pasteClipboardPayload]);

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
        const runs = rawTextListRunsForEditor(element);
        startInlineEdit({
          kind: "text-list",
          selection: elementSelection,
          draft: textRunsContent(runs),
          runs,
          frame,
          style: rawTextStyle(element),
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
          current.kind === "text" || current.kind === "text-list"
            ? runsOverride ?? current.runs
            : current.runs;
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
    },
    [updateInlineRuns],
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
        if (active.kind === "text-list") {
          const runs = rawTextListRunsForEditor(next);
          return {
            ...active,
            draft: textRunsContent(runs),
            runs,
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
      if (
        layoutToolbarTarget.selection.componentIndex ===
        ROOT_ELEMENTS_COMPONENT_INDEX
      ) {
        const updatedRoot = updateComponentLayoutElement(
          rootElementsComponent(currentUiRef.current),
          layoutToolbarTarget.selection.elementPath,
          changes,
          layoutToolbarTarget.box,
          {
            childrenBounds,
            elementBox,
            elementSize,
            isManualPositioned,
            normalizeLayoutChildren: elementWithNormalizedLayoutChildren,
          },
        );
        commitUi({
          ...currentUiRef.current,
          elements: readArray(updatedRoot.elements),
        });
        return;
      }
      updateComponent(layoutToolbarTarget.selection.componentIndex, (component) =>
        updateComponentLayoutElement(
          component,
          layoutToolbarTarget.selection.elementPath,
          changes,
          layoutToolbarTarget.box,
          {
            childrenBounds,
            elementBox,
            elementSize,
            isManualPositioned,
            normalizeLayoutChildren: elementWithNormalizedLayoutChildren,
          },
        ),
      );
    },
    [commitUi, layoutToolbarTarget, updateComponent],
  );

  const ungroupComponentAtIndex = useCallback((componentIndex: number) => {
    if (componentIndex < 0) return;
    const component = asRecord(
      readArray(currentUiRef.current.components)[componentIndex],
    );
    if (!canUngroupTemplateV2Component(component)) return;
    const result = ungroupTemplateV2ComponentInUi(
      currentUiRef.current,
      componentIndex,
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
    clearInlineEdit,
    clearTableCellSelection,
    commitUi,
  ]);

  const ungroupSelectedComponent = useCallback(() => {
    if (selection?.kind !== "component") return;
    ungroupComponentAtIndex(selection.componentIndex);
  }, [selection, ungroupComponentAtIndex]);

  const ungroupLayoutTargetComponent = useCallback(() => {
    const componentIndex = layoutToolbarTarget?.selection.componentIndex;
    if (componentIndex == null || componentIndex < 0) return;
    ungroupComponentAtIndex(componentIndex);
  }, [layoutToolbarTarget, ungroupComponentAtIndex]);

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
      if (
        target?.closest(
          "[data-template-v2-floating-toolbar='true'], [data-inline-edit-ignore='true']",
        )
      ) {
        if (isSurfaceActive()) {
          activateSurface();
        }
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
    isSurfaceActive,
  ]);

  useEffect(() => {
    if (!isEditMode || typeof document === "undefined") return;

    const handleUndoRedoShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        !isSurfaceActive() ||
        isEditableTarget(event.target) ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const wantsUndo = key === "z" && !event.shiftKey;
      const wantsRedo = key === "y" || (key === "z" && event.shiftKey);
      if (!wantsUndo && !wantsRedo) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (wantsUndo) {
        undo();
        return;
      }
      redo();
    };

    document.addEventListener("keydown", handleUndoRedoShortcut, true);
    return () =>
      document.removeEventListener("keydown", handleUndoRedoShortcut, true);
  }, [isEditMode, isSurfaceActive, redo, undo]);

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
          key={contentLayerKey}
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
      <TemplateV2SelectionToolbar
        anchorBox={floatingToolbarAnchorBox}
        canUngroupComponent={canUngroupSelectedComponent}
        canUngroupLayoutTarget={canUngroupLayoutTargetComponent}
        componentCount={components.length}
        isEditMode={isEditMode}
        layoutTarget={layoutToolbarTarget}
        position={selectionToolbarPosition}
        selection={selection}
        selectionKey={keyForSelection(selection)}
        toolbarBounds={selectionToolbarBounds}
        onDeleteSelection={deleteSelection}
        onDuplicateSelection={duplicateSelection}
        onLayoutChange={applyLayoutElementChange}
        onLayerAction={reorderSelectedComponentLayer}
        onUngroupComponent={ungroupSelectedComponent}
        onUngroupLayoutTarget={ungroupLayoutTargetComponent}
      />
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
          anchorBox={selectedBox}
          path={keyForSelection(selection)}
          scale={1}
          selectedTableCell={selectedTableCell}
          templateFonts={templateFonts}
          textSelectionRange={
            inlineEdit &&
              (inlineEdit.kind === "text" || inlineEdit.kind === "text-list") &&
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
          scale={1}
          selectedCell={editingTableCell}
          templateFonts={templateFonts}
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
