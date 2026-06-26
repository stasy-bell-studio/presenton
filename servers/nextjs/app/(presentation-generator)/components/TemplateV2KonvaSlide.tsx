"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useDispatch } from "react-redux";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Provider, useAtomValue, useSetAtom } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import { Loader2 } from "lucide-react";
import { notify } from "@/components/ui/sonner";
import {
  adaptTemplateV2LayoutToSlide,
  normalizeTemplateV2Slide,
  serializeTemplateV2ContentFromSlide,
  serializeTemplateV2LayoutFromSlide,
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
import {
  getElementAtPath,
  rootIndexFromPath,
  rootPath,
  type ElementPath,
} from "@/components/slide-editor/lib/element-path";
import { resolveSlideLayout } from "@/components/slide-editor/lib/layout-resolver";
import { SlideSurface } from "@/components/slide-editor/slide-surface";
import { WorkspaceInlineEditors } from "@/components/slide-editor/workspace/WorkspaceInlineEditors";
import { WorkspaceToolbars } from "@/components/slide-editor/workspace/WorkspaceToolbars";
import {
  canRedoAtom,
  canUndoAtom,
  deckAtom,
  editingChartIndexAtom,
  editingChartPathAtom,
  editingTextIndexAtom,
  editingTextPathAtom,
  insertElementsAtom,
  redoAtom,
  selectElementAtom,
  undoAtom,
  updateElementAtPathAtom,
} from "@/components/slide-editor/state";
import { updateSlide } from "@/store/slices/presentationGeneration";
import { resolveBackendAssetSource } from "@/utils/api";
import { ImagesApi } from "../services/api/images";

export const TEMPLATE_V2_KONVA_SLIDE_CONTENT_KEY =
  "__template_v2_konva_slide__";
export const TEMPLATE_V2_INSERT_ELEMENTS_EVENT =
  "presenton:template-v2-insert-elements";
export const TEMPLATE_V2_SURFACE_SELECTED_EVENT =
  "presenton:template-v2-surface-selected";
export const TEMPLATE_V2_CHART_EDITOR_EVENT =
  "presenton:template-v2-chart-editor";
export const TEMPLATE_V2_CHART_UPDATE_EVENT =
  "presenton:template-v2-chart-update";
const TEMPLATE_V2_EDITOR_HOTKEY_OPTIONS = {
  conflictBehavior: "allow" as const,
};

export type TemplateV2InsertElementsDetail = {
  elements: SlideElement[];
  label?: string;
  slideId?: string | number | null;
  slideIndex?: number | null;
  handled?: boolean;
};

export type TemplateV2SurfaceSelectedDetail = {
  slideId?: string | number | null;
  slideIndex?: number | null;
};

export type TemplateV2ChartElement = Extract<SlideElement, { type: "chart" }>;

export type TemplateV2ChartEditorDetail = {
  chart?: TemplateV2ChartElement | null;
  open?: boolean;
  path?: ElementPath | null;
  rootIndex?: number | null;
  slideId?: string | number | null;
  slideIndex?: number | null;
};

export type TemplateV2ChartUpdateDetail = {
  action?: "update" | "close";
  chart?: TemplateV2ChartElement | null;
  handled?: boolean;
  path?: ElementPath | null;
  slideId?: string | number | null;
  slideIndex?: number | null;
};

const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 720;
const STAGE_SCALE = STAGE_WIDTH / SLIDE_W;
const INLINE_EDIT_DOUBLE_CLICK_MS = 450;

type TextInlineEditHit = {
  rootIndex: number;
  path: ElementPath;
};

type ImageEditHit = {
  rootIndex: number;
  path: ElementPath;
};

type ChartEditHit = {
  rootIndex: number;
  path: ElementPath;
};

type TemplateV2KonvaSlideProps = {
  layout: TemplateV2Layout;
  slide: any;
  isEditMode: boolean;
  renderIndex?: number;
};

export function TemplateV2KonvaSlide({
  layout,
  slide,
  isEditMode,
  renderIndex,
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
        layout={layout}
        presentationSlide={slide}
        isEditMode={isEditMode}
        renderIndex={renderIndex}
      />
    </Provider>
  );
}

function TemplateV2KonvaSlideBody({
  initialSlide,
  isEditMode,
  layout,
  presentationSlide,
  renderIndex,
}: {
  initialSlide: KonvaSlideData;
  isEditMode: boolean;
  layout: TemplateV2Layout;
  presentationSlide: any;
  renderIndex?: number;
}) {
  const surfaceId = useId();
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
  const activeSlide = deck.slides[0];
  const {
    handleImageUploadChange,
    handleRootClickCapture,
    handleRootDoubleClickCapture,
    handleRootPointerDownCapture,
    imageUploadInputRef,
    isSurfaceActive,
    isUploadingImage,
    openChartEditor,
    openImageUpload,
    rootRef,
  } = useTemplateV2KonvaSlideController({
    activeSlide,
    isEditMode,
    layout,
    presentationSlide,
    renderIndex,
    surfaceId,
  });

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full overflow-hidden bg-white"
      style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}
      onDoubleClickCapture={
        isEditMode ? handleRootDoubleClickCapture : undefined
      }
      onClickCapture={isEditMode ? handleRootClickCapture : undefined}
      onPointerDownCapture={
        isEditMode ? handleRootPointerDownCapture : undefined
      }
    >
      {isEditMode ? (
        <TemplateV2EditorHotkeys
          canRedo={canRedo}
          canUndo={canUndo}
          isSurfaceActive={isSurfaceActive}
          onRedo={redo}
          onUndo={undo}
        />
      ) : null}
      {isEditMode ? (
        <input
          ref={imageUploadInputRef}
          accept="image/*"
          className="hidden"
          type="file"
          onChange={handleImageUploadChange}
        />
      ) : null}
      {isEditMode ? (
        <>
          <WorkspaceToolbars
            scale={STAGE_SCALE}
            onEditChart={(index, path) =>
              openChartEditor({ rootIndex: index, path: path ?? rootPath(index) })
            }
            onEditImage={openImageUpload}
          />
          <WorkspaceInlineEditors scale={STAGE_SCALE} />
        </>
      ) : null}
      <SlideSurface
        height={STAGE_HEIGHT}
        interactive={isEditMode}
        onEditImage={openImageUpload}
        slide={activeSlide}
        width={STAGE_WIDTH}
      />
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

function useTemplateV2KonvaSlideController({
  activeSlide,
  isEditMode,
  layout,
  presentationSlide,
  renderIndex,
  surfaceId,
}: {
  activeSlide: KonvaSlideData;
  isEditMode: boolean;
  layout: TemplateV2Layout;
  presentationSlide: any;
  renderIndex?: number;
  surfaceId: string;
}) {
  const dispatch = useDispatch();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImageUploadPathRef = useRef<ElementPath | null>(null);
  const lastImagePointerRef = useRef<{ path: ElementPath; ts: number } | null>(
    null,
  );
  const lastChartPointerRef = useRef<{ path: ElementPath; ts: number } | null>(
    null,
  );
  const suppressImageDoubleClickRef = useRef(false);
  const lastTextPointerRef = useRef<{ path: ElementPath; ts: number } | null>(
    null,
  );
  const lastSyncedSlideRef = useRef<string | null>(null);
  if (lastSyncedSlideRef.current === null) {
    lastSyncedSlideRef.current = JSON.stringify(activeSlide);
  }
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const insertElements = useSetAtom(insertElementsAtom);
  const selectElement = useSetAtom(selectElementAtom);
  const updateElementAtPath = useSetAtom(updateElementAtPathAtom);
  const setEditingTextIndex = useSetAtom(editingTextIndexAtom);
  const setEditingTextPath = useSetAtom(editingTextPathAtom);
  const setEditingChartIndex = useSetAtom(editingChartIndexAtom);
  const setEditingChartPath = useSetAtom(editingChartPathAtom);
  const isSurfaceActive = useCallback(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.dataset.templateV2KonvaActiveSurface === surfaceId,
    [surfaceId],
  );
  const surfaceSlideIndex = useMemo(() => {
    const index =
      typeof renderIndex === "number"
        ? renderIndex
        : Number(presentationSlide.index);
    return Number.isFinite(index) ? index : null;
  }, [presentationSlide.index, renderIndex]);

  const activateSurface = useCallback(() => {
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
            slideId: presentationSlide.id ?? null,
            slideIndex: surfaceSlideIndex,
          },
        },
      ),
    );
  }, [presentationSlide.id, surfaceId, surfaceSlideIndex]);

  const clearSurface = useCallback(() => {
    if (
      document.documentElement.dataset.templateV2KonvaActiveSurface === surfaceId
    ) {
      delete document.documentElement.dataset.templateV2KonvaActiveSurface;
      delete document.documentElement.dataset.templateV2KonvaActiveSlideIndex;
    }
  }, [surfaceId]);

  useEffect(() => {
    if (!isEditMode) return;

    const serialized = JSON.stringify(activeSlide);
    if (serialized === lastSyncedSlideRef.current) return;
    lastSyncedSlideRef.current = serialized;
    const nextContent = serializeTemplateV2ContentFromSlide(
      activeSlide,
      presentationSlide.content,
      TEMPLATE_V2_KONVA_SLIDE_CONTENT_KEY,
    );
    const nextUi = serializeTemplateV2LayoutFromSlide(layout, activeSlide);

    dispatch(
      updateSlide({
        index: presentationSlide.index,
        slide: {
          ...presentationSlide,
          content: nextContent,
          ui: nextUi,
        },
      }),
    );
  }, [activeSlide, dispatch, isEditMode, layout, presentationSlide]);

  useEffect(() => {
    if (!isEditMode) return;

    const handleInsertElements = (event: Event) => {
      const detail = (event as CustomEvent<TemplateV2InsertElementsDetail>)
        .detail;
      if (!detail?.elements?.length) return;

      const slideId = presentationSlide.id ? String(presentationSlide.id) : null;
      const eventSlideId =
        detail.slideId !== undefined && detail.slideId !== null
          ? String(detail.slideId)
          : null;
      const hasTarget =
        Boolean(eventSlideId) || typeof detail.slideIndex === "number";

      if (eventSlideId && slideId && eventSlideId !== slideId) return;
      if (
        !eventSlideId &&
        typeof detail.slideIndex === "number" &&
        (surfaceSlideIndex == null || detail.slideIndex !== surfaceSlideIndex)
      ) {
        return;
      }
      if (!hasTarget && !isSurfaceActive()) return;

      activateSurface();
      insertElements(detail.elements);
      detail.handled = true;
    };

    window.addEventListener(
      TEMPLATE_V2_INSERT_ELEMENTS_EVENT,
      handleInsertElements,
    );
    return () => {
      window.removeEventListener(
        TEMPLATE_V2_INSERT_ELEMENTS_EVENT,
        handleInsertElements,
      );
    };
  }, [
    activateSurface,
    insertElements,
    isEditMode,
    isSurfaceActive,
    presentationSlide.id,
    surfaceSlideIndex,
  ]);

  useEffect(() => {
    if (!isEditMode) return;

    const targetsThisSlide = (detail: TemplateV2ChartUpdateDetail) => {
      const slideId = presentationSlide.id ? String(presentationSlide.id) : null;
      const eventSlideId =
        detail.slideId !== undefined && detail.slideId !== null
          ? String(detail.slideId)
          : null;

      if (eventSlideId && slideId && eventSlideId !== slideId) return false;
      if (
        !eventSlideId &&
        typeof detail.slideIndex === "number" &&
        (surfaceSlideIndex == null || detail.slideIndex !== surfaceSlideIndex)
      ) {
        return false;
      }

      const hasTarget =
        Boolean(eventSlideId) || typeof detail.slideIndex === "number";
      return hasTarget || isSurfaceActive();
    };

    const handleChartUpdate = (event: Event) => {
      const detail = (event as CustomEvent<TemplateV2ChartUpdateDetail>).detail;
      if (!detail || !targetsThisSlide(detail)) return;

      if (detail.action === "close") {
        setEditingChartIndex(null);
        setEditingChartPath(null);
        detail.handled = true;
        return;
      }

      if (!detail.chart || !detail.path) return;
      const current = getElementAtPath(activeSlide, detail.path);
      if (current?.type !== "chart") return;

      const rootIndex = rootIndexFromPath(detail.path);
      activateSurface();
      updateElementAtPath({ path: detail.path, element: detail.chart });
      if (rootIndex >= 0) {
        selectElement({ index: rootIndex, path: detail.path });
        setEditingChartIndex(rootIndex);
      }
      setEditingChartPath(detail.path);
      detail.handled = true;
    };

    window.addEventListener(TEMPLATE_V2_CHART_UPDATE_EVENT, handleChartUpdate);
    return () => {
      window.removeEventListener(
        TEMPLATE_V2_CHART_UPDATE_EVENT,
        handleChartUpdate,
      );
    };
  }, [
    activateSurface,
    activeSlide,
    isEditMode,
    isSurfaceActive,
    presentationSlide.id,
    selectElement,
    setEditingChartIndex,
    setEditingChartPath,
    surfaceSlideIndex,
    updateElementAtPath,
  ]);

  const openImageUpload = useCallback(
    (index: number, path?: ElementPath) => {
      const targetPath = path ?? rootPath(index);
      const element = getElementAtPath(activeSlide, targetPath);
      if (element?.type !== "image") {
        notify.warning("Image unavailable", "Select an image before uploading.");
        return;
      }

      activateSurface();
      pendingImageUploadPathRef.current = targetPath;
      if (imageUploadInputRef.current) {
        imageUploadInputRef.current.value = "";
        imageUploadInputRef.current.click();
      }
    },
    [activateSurface, activeSlide],
  );

  const handleImageUploadChange = useCallback(
    async (event: ReactChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        notify.warning("Invalid file", "Please upload an image file.");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        notify.warning("File too large", "Image files must be smaller than 5MB.");
        return;
      }

      const targetPath = pendingImageUploadPathRef.current;
      if (!targetPath) return;

      const element = getElementAtPath(activeSlide, targetPath);
      if (element?.type !== "image") {
        notify.warning("Image unavailable", "The selected image no longer exists.");
        pendingImageUploadPathRef.current = null;
        return;
      }

      try {
        setIsUploadingImage(true);
        const uploaded = await ImagesApi.uploadImage(file);
        const imageUrl = resolveBackendAssetSource(uploaded);
        if (!imageUrl) {
          throw new Error("Upload did not return an image URL.");
        }

        updateElementAtPath({
          path: targetPath,
          element: {
            ...element,
            data: imageUrl,
            name: element.name ?? file.name,
          },
        });
        notify.success("Image updated", "The selected image was replaced.");
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to upload image. Please try again.";
        notify.error("Upload failed", message);
      } finally {
        setIsUploadingImage(false);
        pendingImageUploadPathRef.current = null;
      }
    },
    [activeSlide, updateElementAtPath],
  );

  const closeChartEditorPanel = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent<TemplateV2ChartEditorDetail>(
        TEMPLATE_V2_CHART_EDITOR_EVENT,
        {
          detail: {
            open: false,
            slideId: presentationSlide.id ?? null,
            slideIndex: surfaceSlideIndex,
          },
        },
      ),
    );
  }, [presentationSlide.id, surfaceSlideIndex]);

  const openTextInlineEditor = useCallback(
    (hit: TextInlineEditHit) => {
      activateSurface();
      selectElement({ index: hit.rootIndex, path: hit.path });
      setEditingChartIndex(null);
      setEditingChartPath(null);
      closeChartEditorPanel();
      setEditingTextIndex(hit.rootIndex);
      setEditingTextPath(hit.path);
    },
    [
      activateSurface,
      closeChartEditorPanel,
      selectElement,
      setEditingChartIndex,
      setEditingChartPath,
      setEditingTextIndex,
      setEditingTextPath,
    ],
  );

  const openChartEditor = useCallback(
    (hit: ChartEditHit) => {
      const element = getElementAtPath(activeSlide, hit.path);
      if (element?.type !== "chart") {
        notify.warning("Chart unavailable", "Select a chart before editing.");
        return;
      }

      activateSurface();
      selectElement({ index: hit.rootIndex, path: hit.path });
      setEditingTextIndex(null);
      setEditingTextPath(null);
      setEditingChartIndex(hit.rootIndex);
      setEditingChartPath(hit.path);
      window.dispatchEvent(
        new CustomEvent<TemplateV2ChartEditorDetail>(
          TEMPLATE_V2_CHART_EDITOR_EVENT,
          {
            detail: {
              chart: element,
              open: true,
              path: hit.path,
              rootIndex: hit.rootIndex,
              slideId: presentationSlide.id ?? null,
              slideIndex: surfaceSlideIndex,
            },
          },
        ),
      );
    },
    [
      activateSurface,
      activeSlide,
      presentationSlide.id,
      selectElement,
      setEditingChartIndex,
      setEditingChartPath,
      setEditingTextIndex,
      setEditingTextPath,
      surfaceSlideIndex,
    ],
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

  const findImageAtClientPoint = useCallback(
    (clientX: number, clientY: number): ImageEditHit | null => {
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
          if (item.element.type !== "image") return false;
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

  const findChartAtClientPoint = useCallback(
    (clientX: number, clientY: number): ChartEditHit | null => {
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
          if (item.element.type !== "chart") return false;
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
      if (hit) {
        lastImagePointerRef.current = null;
        lastChartPointerRef.current = null;
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
        return;
      }

      const chartHit = findChartAtClientPoint(event.clientX, event.clientY);
      if (chartHit) {
        lastImagePointerRef.current = null;
        const now = Date.now();
        const last = lastChartPointerRef.current;
        const isRepeatedClick =
          last?.path === chartHit.path &&
          now - last.ts <= INLINE_EDIT_DOUBLE_CLICK_MS;
        lastChartPointerRef.current = { path: chartHit.path, ts: now };
        lastTextPointerRef.current = null;

        if (!isRepeatedClick) return;

        event.preventDefault();
        event.stopPropagation();
        lastChartPointerRef.current = null;
        openChartEditor(chartHit);
        return;
      }

      const imageHit = findImageAtClientPoint(event.clientX, event.clientY);
      if (!imageHit) {
        lastImagePointerRef.current = null;
        lastChartPointerRef.current = null;
        lastTextPointerRef.current = null;
        return;
      }

      const now = Date.now();
      const last = lastImagePointerRef.current;
      const isRepeatedClick =
        last?.path === imageHit.path &&
        now - last.ts <= INLINE_EDIT_DOUBLE_CLICK_MS;
      lastImagePointerRef.current = { path: imageHit.path, ts: now };
      lastChartPointerRef.current = null;
      lastTextPointerRef.current = null;

      if (!isRepeatedClick) return;

      event.preventDefault();
      event.stopPropagation();
      lastImagePointerRef.current = null;
      suppressImageDoubleClickRef.current = true;
      openImageUpload(imageHit.rootIndex, imageHit.path);
    },
    [
      activateSurface,
      findChartAtClientPoint,
      findImageAtClientPoint,
      findTextAtClientPoint,
      openChartEditor,
      openImageUpload,
      openTextInlineEditor,
    ],
  );

  const handleRootDoubleClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (isInlineEditIgnoredTarget(event.target)) return;

      const hit = findTextAtClientPoint(event.clientX, event.clientY);
      if (hit) {
        event.preventDefault();
        event.stopPropagation();
        lastImagePointerRef.current = null;
        lastChartPointerRef.current = null;
        lastTextPointerRef.current = null;
        openTextInlineEditor(hit);
        return;
      }

      const chartHit = findChartAtClientPoint(event.clientX, event.clientY);
      if (chartHit) {
        event.preventDefault();
        event.stopPropagation();
        lastImagePointerRef.current = null;
        lastChartPointerRef.current = null;
        lastTextPointerRef.current = null;
        openChartEditor(chartHit);
        return;
      }

      const imageHit = findImageAtClientPoint(event.clientX, event.clientY);
      if (!imageHit) return;

      event.preventDefault();
      event.stopPropagation();
      if (suppressImageDoubleClickRef.current) {
        suppressImageDoubleClickRef.current = false;
        return;
      }

      lastImagePointerRef.current = null;
      lastTextPointerRef.current = null;
      openImageUpload(imageHit.rootIndex, imageHit.path);
    },
    [
      findImageAtClientPoint,
      findTextAtClientPoint,
      findChartAtClientPoint,
      openChartEditor,
      openImageUpload,
      openTextInlineEditor,
    ],
  );

  const handleRootClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (isInlineEditIgnoredTarget(event.target)) return;

      const hit =
        findTextAtClientPoint(event.clientX, event.clientY) ??
        findChartAtClientPoint(event.clientX, event.clientY) ??
        findImageAtClientPoint(event.clientX, event.clientY);
      if (!hit) return;

      event.preventDefault();
      event.stopPropagation();
      activateSurface();
      selectElement({ index: hit.rootIndex, path: hit.path });
    },
    [
      activateSurface,
      findChartAtClientPoint,
      findImageAtClientPoint,
      findTextAtClientPoint,
      selectElement,
    ],
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

  return {
    handleImageUploadChange,
    handleRootClickCapture,
    handleRootDoubleClickCapture,
    handleRootPointerDownCapture,
    imageUploadInputRef,
    isSurfaceActive,
    isUploadingImage,
    openChartEditor,
    openImageUpload,
    rootRef,
  };
}

function TemplateV2EditorHotkeys({
  canRedo,
  canUndo,
  isSurfaceActive,
  onRedo,
  onUndo,
}: {
  canRedo: boolean;
  canUndo: boolean;
  isSurfaceActive: () => boolean;
  onRedo: () => void;
  onUndo: () => void;
}) {
  useHotkey(
    "Mod+Z",
    (event) => {
      if (!isSurfaceActive() || !canUndo) return;
      event.preventDefault();
      event.stopPropagation();
      onUndo();
    },
    TEMPLATE_V2_EDITOR_HOTKEY_OPTIONS,
  );

  useHotkey(
    "Mod+Shift+Z",
    (event) => {
      if (!isSurfaceActive() || !canRedo) return;
      event.preventDefault();
      event.stopPropagation();
      onRedo();
    },
    TEMPLATE_V2_EDITOR_HOTKEY_OPTIONS,
  );

  useHotkey(
    "Mod+Y",
    (event) => {
      if (!isSurfaceActive() || !canRedo) return;
      event.preventDefault();
      event.stopPropagation();
      onRedo();
    },
    TEMPLATE_V2_EDITOR_HOTKEY_OPTIONS,
  );

  return null;
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
  const storedSlide = readStoredKonvaSlide(slide.content);
  if (storedSlide) {
    return storedSlide;
  }

  try {
    return adaptTemplateV2LayoutToSlide(
      readSlideUiLayout(slide) ?? layout,
      slide.index ?? 0,
    );
  } catch (error) {
    console.error("Could not adapt template v2 slide for Konva:", error);
    return null;
  }
}

function readSlideUiLayout(slide: any): TemplateV2Layout | null {
  const ui = slide?.ui;
  return ui && typeof ui === "object" && !Array.isArray(ui)
    ? (ui as TemplateV2Layout)
    : null;
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
