"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Provider, useAtomValue, useSetAtom } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import { Loader2 } from "lucide-react";
import {
  adaptTemplateV2LayoutToSlide,
  applyGeneratedSlideContentToLayout,
  type TemplateV2Layout,
} from "@/components/slide-editor/lib/template-v2-import";
import {
  DeckSchema,
  SLIDE_H,
  SLIDE_W,
  SlideSchema,
  type Deck,
  type Slide as KonvaSlideData,
} from "@/components/slide-editor/lib/slide-schema";
import { SlideSurface } from "@/components/slide-editor/slide-surface";
import { WorkspaceInlineEditors } from "@/components/slide-editor/workspace/WorkspaceInlineEditors";
import { WorkspaceToolbars } from "@/components/slide-editor/workspace/WorkspaceToolbars";
import {
  canRedoAtom,
  canUndoAtom,
  deckAtom,
  redoAtom,
  undoAtom,
} from "@/components/slide-editor/state";
import { updateSlide } from "@/store/slices/presentationGeneration";

export const TEMPLATE_V2_KONVA_SLIDE_CONTENT_KEY =
  "__template_v2_konva_slide__";

const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 720;
const STAGE_SCALE = STAGE_WIDTH / SLIDE_W;

type TemplateV2KonvaSlideProps = {
  layout: TemplateV2Layout;
  slide: any;
  isEditMode: boolean;
};

export function TemplateV2KonvaSlide({
  layout,
  slide,
  isEditMode,
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
      />
    </Provider>
  );
}

function TemplateV2KonvaSlideBody({
  initialSlide,
  isEditMode,
  presentationSlide,
}: {
  initialSlide: KonvaSlideData;
  isEditMode: boolean;
  presentationSlide: any;
}) {
  const dispatch = useDispatch();
  const surfaceId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
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
  const lastSyncedSlideRef = useRef(JSON.stringify(activeSlide));
  const isSurfaceActive = () =>
    typeof document !== "undefined" &&
    document.documentElement.dataset.templateV2KonvaActiveSurface === surfaceId;

  const activateSurface = () => {
    document.documentElement.dataset.templateV2KonvaActiveSurface = surfaceId;
  };

  const clearSurface = () => {
    if (
      document.documentElement.dataset.templateV2KonvaActiveSurface === surfaceId
    ) {
      delete document.documentElement.dataset.templateV2KonvaActiveSurface;
    }
  };

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
  }, [isEditMode, surfaceId]);

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full overflow-hidden bg-white"
      style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}
      onPointerDownCapture={isEditMode ? activateSurface : undefined}
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
    </div>
  );
}

function buildKonvaSlide(
  layout: TemplateV2Layout,
  slide: any,
): KonvaSlideData | null {
  const storedSlide = readStoredKonvaSlide(slide.content);
  if (storedSlide) return storedSlide;

  try {
    const renderedLayout = applyGeneratedSlideContentToLayout(
      layout,
      slide.content && typeof slide.content === "object" ? slide.content : {},
    );

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
  return parsed.success ? parsed.data : null;
}
