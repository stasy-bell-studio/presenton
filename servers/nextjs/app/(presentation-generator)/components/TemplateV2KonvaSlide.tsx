"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useDispatch } from "react-redux";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Provider, useAtomValue, useSetAtom } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import { Loader2, Plus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { notify } from "@/components/ui/sonner";
import {
  adaptTemplateV2LayoutToSlide,
  applyGeneratedSlideContentToLayout,
  normalizeTemplateV2Slide,
  type TemplateV2Layout,
} from "@/components/slide-editor/lib/template-v2-import";
import {
  DeckSchema,
  SLIDE_H,
  SLIDE_W,
  SlideSchema,
  type Deck,
  type Slide as KonvaSlideData,
  type SlideElement,
} from "@/components/slide-editor/lib/slide-schema";
import { elementBox } from "@/components/slide-editor/lib/element-model";
import { resolveSlideLayout } from "@/components/slide-editor/lib/layout-resolver";
import type { ElementPath } from "@/components/slide-editor/lib/element-path";
import { SlideSurface } from "@/components/slide-editor/slide-surface";
import { WorkspaceInlineEditors } from "@/components/slide-editor/workspace/WorkspaceInlineEditors";
import { WorkspaceToolbars } from "@/components/slide-editor/workspace/WorkspaceToolbars";
import {
  canRedoAtom,
  canUndoAtom,
  deckAtom,
  editingTextIndexAtom,
  editingTextPathAtom,
  insertElementsAtom,
  redoAtom,
  selectElementAtom,
  undoAtom,
} from "@/components/slide-editor/state";
import { updateSlide } from "@/store/slices/presentationGeneration";

export const TEMPLATE_V2_KONVA_SLIDE_CONTENT_KEY =
  "__template_v2_konva_slide__";
export const TEMPLATE_V2_COMPONENT_DRAWER_EVENT =
  "presenton:template-v2-component-drawer";

const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 720;
const STAGE_SCALE = STAGE_WIDTH / SLIDE_W;
const INLINE_EDIT_DOUBLE_CLICK_MS = 450;

type TextInlineEditHit = {
  rootIndex: number;
  path: ElementPath;
};

type TemplateV2KonvaSlideProps = {
  layout: TemplateV2Layout;
  slide: any;
  isEditMode: boolean;
  components?: unknown;
};

export function TemplateV2KonvaSlide({
  layout,
  slide,
  isEditMode,
  components,
}: TemplateV2KonvaSlideProps) {
  const initialSlide = useMemo(
    () => buildKonvaSlide(layout, slide),
    [layout, slide],
  );

  if (!initialSlide) {
    return (
      <div className="flex h-full aspect-video flex-col items-center justify-center rounded-lg bg-gray-100">
        <Loader2 className="mb-2 h-4 w-4 animate-spin" />
        <p className="text-center text-sm text-gray-600">
          Loading slide layout...
        </p>
      </div>
    );
  }

  return (
    <Provider key={slide.id ?? `${slide.layout}-${slide.index}`}>
      <TemplateV2KonvaSlideBody
        initialSlide={initialSlide}
        presentationSlide={slide}
        isEditMode={isEditMode}
        components={components}
      />
    </Provider>
  );
}

function TemplateV2KonvaSlideBody({
  initialSlide,
  isEditMode,
  presentationSlide,
  components,
}: {
  initialSlide: KonvaSlideData;
  isEditMode: boolean;
  presentationSlide: any;
  components?: unknown;
}) {
  const dispatch = useDispatch();
  const surfaceId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastTextPointerRef = useRef<{ path: ElementPath; ts: number } | null>(
    null,
  );
  const [componentDrawerOpen, setComponentDrawerOpen] = useState(false);
  const initialDeck = useMemo(
    () =>
      DeckSchema.parse({
        title: presentationSlide.title || `Slide ${presentationSlide.index + 1}`,
        description: null,
        slides: [initialSlide],
      } satisfies Deck),
    [initialSlide, presentationSlide.index, presentationSlide.title],
  );
  const [hydratedDeck] = useState(initialDeck);

  useHydrateAtoms([[deckAtom, hydratedDeck]]);

  const deck = useAtomValue(deckAtom);
  const canUndo = useAtomValue(canUndoAtom);
  const canRedo = useAtomValue(canRedoAtom);
  const undo = useSetAtom(undoAtom);
  const redo = useSetAtom(redoAtom);
  const insertElements = useSetAtom(insertElementsAtom);
  const selectElement = useSetAtom(selectElementAtom);
  const setEditingTextIndex = useSetAtom(editingTextIndexAtom);
  const setEditingTextPath = useSetAtom(editingTextPathAtom);
  const activeSlide = deck.slides[0];
  const componentItems = useMemo(
    () => extractTemplateV2ComponentItems(components),
    [components],
  );
  const lastSyncedSlideRef = useRef(JSON.stringify(activeSlide));
  const isSurfaceActive = useCallback(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.dataset.templateV2KonvaActiveSurface === surfaceId,
    [surfaceId],
  );

  const activateSurface = useCallback(() => {
    document.documentElement.dataset.templateV2KonvaActiveSurface = surfaceId;
  }, [surfaceId]);

  const clearSurface = useCallback(() => {
    if (
      document.documentElement.dataset.templateV2KonvaActiveSurface === surfaceId
    ) {
      delete document.documentElement.dataset.templateV2KonvaActiveSurface;
    }
  }, [surfaceId]);

  useHotkey("Mod+Z", (event) => {
    if (!isEditMode || !isSurfaceActive() || !canUndo) return;
    event.preventDefault();
    event.stopPropagation();
    undo();
  });

  useHotkey("Mod+Shift+Z", (event) => {
    if (!isEditMode || !isSurfaceActive() || !canRedo) return;
    event.preventDefault();
    event.stopPropagation();
    redo();
  });

  useHotkey("Mod+Y", (event) => {
    if (!isEditMode || !isSurfaceActive() || !canRedo) return;
    event.preventDefault();
    event.stopPropagation();
    redo();
  });

  useEffect(() => {
    if (!isEditMode) return;

    const serialized = JSON.stringify(activeSlide);
    if (serialized === lastSyncedSlideRef.current) return;
    lastSyncedSlideRef.current = serialized;

    dispatch(
      updateSlide({
        index: presentationSlide.index,
        slide: {
          ...presentationSlide,
          content: {
            ...(presentationSlide.content ?? {}),
            [TEMPLATE_V2_KONVA_SLIDE_CONTENT_KEY]: activeSlide,
          },
        },
      }),
    );
  }, [activeSlide, dispatch, isEditMode, presentationSlide]);

  useEffect(() => {
    if (!isEditMode) return;

    const handleOpenComponentDrawer = (event: Event) => {
      const detail = (event as CustomEvent<TemplateV2ComponentDrawerDetail>)
        .detail;
      if (!detail) return;

      const slideId = presentationSlide.id ? String(presentationSlide.id) : null;
      const eventSlideId =
        detail.slideId !== undefined && detail.slideId !== null
          ? String(detail.slideId)
          : null;
      if (eventSlideId && slideId && eventSlideId !== slideId) return;
      if (
        !eventSlideId &&
        typeof detail.slideIndex === "number" &&
        detail.slideIndex !== presentationSlide.index
      ) {
        return;
      }

      activateSurface();
      setComponentDrawerOpen(true);
    };

    window.addEventListener(
      TEMPLATE_V2_COMPONENT_DRAWER_EVENT,
      handleOpenComponentDrawer,
    );
    return () => {
      window.removeEventListener(
        TEMPLATE_V2_COMPONENT_DRAWER_EVENT,
        handleOpenComponentDrawer,
      );
    };
  }, [activateSurface, isEditMode, presentationSlide.id, presentationSlide.index]);

  const handleInsertComponent = (item: TemplateV2ComponentItem) => {
    if (item.elements.length === 0) {
      notify.warning("Component unavailable", "This component has no elements.");
      return;
    }

    activateSurface();
    insertElements(item.elements);
    setComponentDrawerOpen(false);
    notify.success("Component added", `${item.name} was added to this slide.`);
  };

  const openTextInlineEditor = useCallback(
    (hit: TextInlineEditHit) => {
      activateSurface();
      selectElement({ index: hit.rootIndex, path: hit.path });
      setEditingTextIndex(hit.rootIndex);
      setEditingTextPath(hit.path);
    },
    [activateSurface, selectElement, setEditingTextIndex, setEditingTextPath],
  );

  const findTextAtClientPoint = useCallback(
    (clientX: number, clientY: number): TextInlineEditHit | null => {
      const root = rootRef.current;
      if (!root) return null;
      const rect = root.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const x = ((clientX - rect.left) / rect.width) * SLIDE_W;
      const y = ((clientY - rect.top) / rect.height) * SLIDE_H;
      const hit = resolveSlideLayout(activeSlide)
        .slice()
        .reverse()
        .find((item) => {
          if (item.element.type !== "text") return false;
          const box = elementBox(item.element);
          return (
            x >= box.x &&
            x <= box.x + box.w &&
            y >= box.y &&
            y <= box.y + box.h
          );
        });

      return hit ? { rootIndex: hit.rootIndex, path: hit.sourcePath } : null;
    },
    [activeSlide],
  );

  const handleRootPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      activateSurface();

      if (!isPrimaryPointer(event)) return;
      if (isInlineEditIgnoredTarget(event.target)) return;

      const hit = findTextAtClientPoint(event.clientX, event.clientY);
      if (!hit) {
        lastTextPointerRef.current = null;
        return;
      }

      const now = Date.now();
      const last = lastTextPointerRef.current;
      const isRepeatedClick =
        last?.path === hit.path && now - last.ts <= INLINE_EDIT_DOUBLE_CLICK_MS;
      lastTextPointerRef.current = { path: hit.path, ts: now };

      if (!isRepeatedClick) return;

      event.preventDefault();
      event.stopPropagation();
      lastTextPointerRef.current = null;
      openTextInlineEditor(hit);
    },
    [activateSurface, findTextAtClientPoint, openTextInlineEditor],
  );

  const handleRootDoubleClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (isInlineEditIgnoredTarget(event.target)) return;

      const hit = findTextAtClientPoint(event.clientX, event.clientY);
      if (!hit) return;

      event.preventDefault();
      event.stopPropagation();
      lastTextPointerRef.current = null;
      openTextInlineEditor(hit);
    },
    [findTextAtClientPoint, openTextInlineEditor],
  );

  useEffect(() => {
    if (!isEditMode) return;

    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;

      if (root.contains(event.target as Node)) {
        activateSurface();
        return;
      }

      clearSurface();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      clearSurface();
    };
  }, [activateSurface, clearSurface, isEditMode]);

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full overflow-hidden bg-white"
      style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}
      onDoubleClickCapture={
        isEditMode ? handleRootDoubleClickCapture : undefined
      }
      onPointerDownCapture={
        isEditMode ? handleRootPointerDownCapture : undefined
      }
    >
      {isEditMode ? (
        <>
          <WorkspaceToolbars
            scale={STAGE_SCALE}
            onEditImage={() => {
              // Image upload is handled by the full editor shell. The old UX keeps
              // prompt-based image edits, so this embedded surface stays scoped.
            }}
          />
          <WorkspaceInlineEditors scale={STAGE_SCALE} />
        </>
      ) : null}
      <SlideSurface
        height={STAGE_HEIGHT}
        interactive={isEditMode}
        onEditImage={() => {}}
        slide={activeSlide}
        width={STAGE_WIDTH}
      />
      {isEditMode ? (
        <TemplateV2ComponentsDrawer
          components={componentItems}
          open={componentDrawerOpen}
          onInsert={handleInsertComponent}
          onOpenChange={setComponentDrawerOpen}
        />
      ) : null}
    </div>
  );
}

function isPrimaryPointer(event: ReactPointerEvent<HTMLDivElement>) {
  if (!event.isPrimary) return false;
  if (event.pointerType === "mouse" && event.button !== 0) return false;
  return !(event.shiftKey || event.metaKey || event.ctrlKey || event.altKey);
}

function isInlineEditIgnoredTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "button,input,textarea,select,[contenteditable='true'],[role='dialog'],[data-inline-edit-ignore='true']",
    ),
  );
}

function buildKonvaSlide(
  layout: TemplateV2Layout,
  slide: any,
): KonvaSlideData | null {
  const content =
    slide.content && typeof slide.content === "object" ? slide.content : {};
  const storedSlide = readStoredKonvaSlide(slide.content);
  if (storedSlide) {
    try {
      const renderedLayout = applyGeneratedSlideContentToLayout(layout, content);
      const designSlide = adaptTemplateV2LayoutToSlide(
        renderedLayout,
        slide.index ?? 0,
      );
      return mergeDesignVariablesIntoSlide(storedSlide, designSlide);
    } catch (error) {
      console.error("Could not hydrate template v2 design variables:", error);
      return storedSlide;
    }
  }

  try {
    const renderedLayout = applyGeneratedSlideContentToLayout(layout, content);

    return adaptTemplateV2LayoutToSlide(renderedLayout, slide.index ?? 0);
  } catch (error) {
    console.error("Could not adapt template v2 slide for Konva:", error);
    return null;
  }
}

function readStoredKonvaSlide(content: unknown): KonvaSlideData | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return null;
  }

  const candidate = (content as Record<string, unknown>)[
    TEMPLATE_V2_KONVA_SLIDE_CONTENT_KEY
  ];
  const parsed = SlideSchema.safeParse(candidate);
  return parsed.success ? normalizeTemplateV2Slide(parsed.data) : null;
}

function mergeDesignVariablesIntoSlide(
  slide: KonvaSlideData,
  designSource: KonvaSlideData,
): KonvaSlideData {
  return {
    ...slide,
    elements: slide.elements.map((element, index) =>
      mergeDesignVariablesIntoElement(element, designSource.elements[index]),
    ),
  };
}

function mergeDesignVariablesIntoElement(
  element: SlideElement,
  designSource: SlideElement | undefined,
): SlideElement {
  let next = designSource?.designVariables?.length
    ? { ...element, designVariables: designSource.designVariables }
    : element;

  if (
    "children" in next &&
    Array.isArray(next.children) &&
    designSource &&
    "children" in designSource &&
    Array.isArray(designSource.children)
  ) {
    next = {
      ...next,
      children: next.children.map((child, index) =>
        mergeDesignVariablesIntoElement(child, designSource.children[index]),
      ),
    } as SlideElement;
  }

  if (
    next.type === "container" &&
    next.child &&
    designSource?.type === "container" &&
    designSource.child
  ) {
    next = {
      ...next,
      child: mergeDesignVariablesIntoElement(next.child, designSource.child),
    };
  }

  if (
    (next.type === "list-view" || next.type === "grid-view") &&
    (designSource?.type === "list-view" || designSource?.type === "grid-view")
  ) {
    next = {
      ...next,
      item: mergeDesignVariablesIntoElement(next.item, designSource.item),
    } as SlideElement;
  }

  return next;
}

type TemplateV2ComponentDrawerDetail = {
  slideId?: string | null;
  slideIndex?: number | null;
};

type TemplateV2ComponentItem = {
  key: string;
  name: string;
  description: string;
  variantCount: number;
  previewSlide: KonvaSlideData | null;
  elements: SlideElement[];
};

function TemplateV2ComponentsDrawer({
  components,
  open,
  onInsert,
  onOpenChange,
}: {
  components: TemplateV2ComponentItem[];
  open: boolean;
  onInsert: (component: TemplateV2ComponentItem) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const componentCountLabel = `${components.length} component${
    components.length === 1 ? "" : "s"
  }`;
  const variantCount = components.reduce(
    (total, component) => total + component.variantCount,
    0,
  );
  const variantCountLabel = `${variantCount} variant${
    variantCount === 1 ? "" : "s"
  }`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="z-[1200] flex w-[360px] max-w-[92vw] flex-col gap-0 overflow-hidden bg-white p-0 font-syne sm:max-w-[360px]"
      >
        <SheetHeader className="border-b border-[#ECECF1] px-5 py-4 text-left">
          <SheetTitle className="text-base font-medium text-[#191919]">
            Components
          </SheetTitle>
          <SheetDescription className="text-xs text-[#777780]">
            {componentCountLabel} · {variantCountLabel}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {components.length === 0 ? (
            <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-[#DADAE2] px-4 text-center text-sm text-[#777780]">
              No reusable components found.
            </div>
          ) : (
            <div className="space-y-3">
              {components.map((component) => (
                <div
                  key={component.key}
                  className="overflow-hidden rounded-lg border border-[#E6E6ED] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                >
                  <div className="relative aspect-video overflow-hidden bg-[#F7F7FA]">
                    {component.previewSlide ? (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <SlideSurface
                          height={140}
                          interactive={false}
                          slide={component.previewSlide}
                          width={249}
                        />
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-[#777780]">
                        Preview unavailable
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 p-3">
                    <div className="space-y-1">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-[#191919]">
                          {component.name}
                        </p>
                        <span className="shrink-0 rounded-md border border-[#E4E4EC] bg-[#F8F8FA] px-2 py-0.5 text-[11px] font-medium leading-5 text-[#66666F]">
                          {formatVariantCount(component.variantCount)}
                        </span>
                      </div>
                      {component.description ? (
                        <p className="max-h-10 overflow-hidden text-xs leading-5 text-[#66666F]">
                          {component.description}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => onInsert(component)}
                      className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[#191919] text-sm font-medium text-white transition hover:bg-[#2A2A2A]"
                    >
                      <Plus className="h-4 w-4" />
                      Insert
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function extractTemplateV2ComponentItems(
  payload: unknown,
): TemplateV2ComponentItem[] {
  const rawComponents = extractRawTemplateV2Components(payload);
  return rawComponents
    .map((component, index) => buildTemplateV2ComponentItem(component, index))
    .filter((item): item is TemplateV2ComponentItem => Boolean(item));
}

function extractRawTemplateV2Components(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  const record = isRecord(payload) ? payload : null;
  if (Array.isArray(record?.components)) {
    return record.components.filter(isRecord);
  }

  if (Array.isArray(record?.layouts)) {
    return record.layouts
      .filter(isRecord)
      .flatMap((layout) =>
        Array.isArray(layout.components) ? layout.components.filter(isRecord) : [],
      );
  }

  return [];
}

function buildTemplateV2ComponentItem(
  component: Record<string, unknown>,
  index: number,
): TemplateV2ComponentItem | null {
  const rawElements = Array.isArray(component.elements) ? component.elements : [];
  if (rawElements.length === 0) return null;

  const name = readString(component.id) || `component_${index + 1}`;
  const description = readString(component.description) || "";
  const variantCount = countTemplateV2ComponentVariants(component);

  try {
    const previewSlide = adaptTemplateV2LayoutToSlide(
      {
        id: name,
        description,
        components: [component],
      },
      index,
    );
    return {
      key: `${name}-${index}`,
      name,
      description,
      variantCount,
      previewSlide,
      elements: previewSlide.elements,
    };
  } catch (error) {
    console.error("Could not adapt template v2 component:", error);
    return {
      key: `${name}-${index}`,
      name,
      description,
      variantCount,
      previewSlide: null,
      elements: [],
    };
  }
}

function countTemplateV2ComponentVariants(component: Record<string, unknown>) {
  const variables = Array.isArray(component.design_variables)
    ? component.design_variables
    : Array.isArray(component.designVariables)
      ? component.designVariables
      : [];

  return Math.max(
    1,
    variables
      .filter(isRecord)
      .map((variable) =>
        Array.isArray(variable.options) && variable.options.length > 0
          ? variable.options.length
          : 1,
      )
      .reduce((total, count) => total * count, 1),
  );
}

function formatVariantCount(count: number) {
  return `${count} variant${count === 1 ? "" : "s"}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
