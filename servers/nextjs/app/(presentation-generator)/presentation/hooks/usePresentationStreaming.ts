import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import {
  clearPresentationData,
  setPresentationData,
  setStreaming,
  type PresentationData,
} from "@/store/slices/presentationGeneration";
import { jsonrepair } from "jsonrepair";
import { notify } from "@/components/ui/sonner";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";
import { sanitizeAnalyticsError } from "@/utils/analytics";
import { getApiUrl, normalizeBackendAssetUrls } from "@/utils/api";
import { store } from "@/store/store";
import {
  isChatGptAuthRequiredMessage,
  requestChatGptReauth,
} from "@/utils/chatgptAuth";

const MAX_STREAM_RETRIES = 3;
const STREAM_RETRY_DELAY_MS = 1_000;

/** Chunk JSON replays each slide as first streamed; don't clobber URLs filled by `slide_assets`. */
const PLACEHOLDER_ASSET_MARKERS = [
  "/static/images/placeholder",
  "/static/icons/placeholder",
  "placeholder.jpg",
  "placeholder.svg",
];

function isPlaceholderAssetUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url.trim()) return false;
  const u = url.toLowerCase();
  return PLACEHOLDER_ASSET_MARKERS.some((m) => u.includes(m));
}

function mergeContentPreservingResolvedAssets(prev: any, incoming: any): any {
  if (incoming === undefined || incoming === null) return prev;
  if (prev === undefined || prev === null) return incoming;

  if (Array.isArray(incoming)) {
    if (!Array.isArray(prev)) return incoming;
    return incoming.map((item, i) =>
      mergeContentPreservingResolvedAssets(prev[i], item)
    );
  }

  if (typeof incoming !== "object") return incoming;
  if (typeof prev !== "object") return incoming;

  const result: Record<string, unknown> = { ...incoming };

  for (const key of Object.keys(incoming)) {
    const pv = prev[key];
    const iv = incoming[key];

    if (iv !== null && typeof iv === "object") {
      if (Array.isArray(iv) && Array.isArray(pv)) {
        result[key] = iv.map((item, idx) =>
          mergeContentPreservingResolvedAssets(pv[idx], item)
        );
      } else if (
        !Array.isArray(iv) &&
        pv !== null &&
        typeof pv === "object" &&
        !Array.isArray(pv)
      ) {
        result[key] = mergeContentPreservingResolvedAssets(pv, iv);
      }
      continue;
    }

    if (
      key === "__image_url__" &&
      typeof iv === "string" &&
      typeof pv === "string"
    ) {
      if (isPlaceholderAssetUrl(iv) && !isPlaceholderAssetUrl(pv)) {
        result[key] = pv;
      }
    }
    if (
      key === "__icon_url__" &&
      typeof iv === "string" &&
      typeof pv === "string"
    ) {
      if (isPlaceholderAssetUrl(iv) && !isPlaceholderAssetUrl(pv)) {
        result[key] = pv;
      }
    }
  }

  return result;
}

function mergeSlidesPreservingResolvedAssets(
  prevSlides: any[] | undefined,
  incomingSlides: any[]
): any[] {
  if (!prevSlides?.length) return incomingSlides;
  return incomingSlides.map((incoming, idx) => {
    const prev = prevSlides[idx];
    if (!prev) return incoming;
    return {
      ...incoming,
      content: mergeContentPreservingResolvedAssets(
        prev.content,
        incoming.content
      ),
    };
  });
}

function mergeSingleSlidePreservingResolvedAssets(
  prevSlides: any[] | undefined,
  incomingSlide: any
): any[] {
  const nextSlides = [...(prevSlides ?? [])];
  const incomingIndex =
    typeof incomingSlide?.index === "number" ? incomingSlide.index : nextSlides.length;
  const existingIndex = nextSlides.findIndex(
    (slide) => typeof slide?.index === "number" && slide.index === incomingIndex
  );
  const existingSlide =
    existingIndex >= 0 ? nextSlides[existingIndex] : nextSlides[incomingIndex];
  const mergedSlide = existingSlide
    ? {
        ...existingSlide,
        ...incomingSlide,
        content: mergeContentPreservingResolvedAssets(
          existingSlide.content,
          incomingSlide.content
        ),
      }
    : incomingSlide;

  if (existingIndex >= 0) {
    nextSlides[existingIndex] = mergedSlide;
  } else {
    nextSlides.push(mergedSlide);
  }

  return nextSlides.sort(
    (a, b) => (typeof a?.index === "number" ? a.index : 0) - (typeof b?.index === "number" ? b.index : 0)
  );
}

function mergePresentationPreservingTemplateData(
  incoming: PresentationData
): PresentationData {
  const prev = store.getState().presentationGeneration.presentationData;
  if (!prev) return incoming;

  return {
    ...prev,
    ...incoming,
    layout: incoming.layout ?? prev.layout,
    version: incoming.version ?? prev.version,
    theme: incoming.theme ?? prev.theme,
    structure: (incoming as any).structure ?? (prev as any).structure,
  } as PresentationData;
}

function parseStreamedSlideChunk(chunk: unknown): any | null {
  if (typeof chunk !== "string" || !chunk.trim()) return null;
  try {
    const parsed = JSON.parse(chunk);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof parsed.layout === "string" &&
      typeof parsed.index === "number" &&
      parsed.content &&
      typeof parsed.content === "object"
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function hasTemplateV2LayoutPayload(layout: unknown): boolean {
  if (!layout || typeof layout !== "object") return false;
  const layouts = (layout as any).layouts;
  if (Array.isArray(layouts)) return true;
  return Boolean(
    layouts &&
      typeof layouts === "object" &&
      Array.isArray((layouts as any).layouts)
  );
}

function isTemplateV2SlidePayload(slide: unknown): boolean {
  return (
    Boolean(slide) &&
    typeof slide === "object" &&
    typeof (slide as any).layout_group === "string" &&
    (slide as any).layout_group.startsWith("template-v2")
  );
}

function isTemplateV2PresentationPayload(presentation: unknown): boolean {
  if (!presentation || typeof presentation !== "object") return false;
  const record = presentation as Record<string, unknown>;
  return (
    hasTemplateV2LayoutPayload(record.layout) ||
    (Array.isArray(record.slides) && record.slides.some(isTemplateV2SlidePayload))
  );
}

export const usePresentationStreaming = (
  presentationId: string,
  stream: string | null,
  setLoading: (loading: boolean) => void,
  setError: (error: boolean) => void,
  fetchUserSlides: () => void,
  options: { preloadPresentationData?: boolean } = {}
) => {
  const dispatch = useDispatch();
  const previousSlidesLength = useRef(0);
  const preloadPresentationData = Boolean(options.preloadPresentationData);

  useEffect(() => {
    if (!stream) {
      fetchUserSlides();
      return;
    }

    let eventSource: EventSource | null = null;
    let accumulatedChunks = "";
    let retryCount = 0;
    let isClosed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const shownAssetWarnings = new Set<string>();
    let preloadAttempted = false;
    let preloadRequest: Promise<void> | null = null;
    const streamStartedAt = Date.now();
    let streamIsTemplateV2 = preloadPresentationData;

    const closeEventSource = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const clearRetryTimer = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const finalizeFailure = (
      description: string,
      options: { showToast?: boolean } = {}
    ) => {
      if (streamIsTemplateV2) {
        trackEvent(MixpanelEvent.TemplateV2_Stream_Failed, {
          presentation_id: presentationId,
          retry_count: retryCount,
          duration_ms: Date.now() - streamStartedAt,
          error_message: sanitizeAnalyticsError(description, "Stream failed"),
        });
      }
      closeEventSource();
      clearRetryTimer();
      setLoading(false);
      dispatch(setStreaming(false));
      setError(true);
      if (options.showToast !== false) {
        notify.error("Presentation streaming failed", description);
      }
    };

    const scheduleRetry = (reason: string): boolean => {
      if (retryCount >= MAX_STREAM_RETRIES || isClosed) {
        return false;
      }

      retryCount += 1;
      const retryDelay = STREAM_RETRY_DELAY_MS * retryCount;
      console.warn(
        `Presentation stream retry ${retryCount}/${MAX_STREAM_RETRIES}: ${reason}`
      );

      closeEventSource();
      clearRetryTimer();
      accumulatedChunks = "";
      previousSlidesLength.current = 0;

      retryTimer = setTimeout(() => {
        if (!isClosed) {
          openStream();
        }
      }, retryDelay);

      return true;
    };

    const preloadPreparedPresentation = async (force = false) => {
      if ((!preloadPresentationData && !force) || preloadAttempted) return;
      if (preloadRequest) return preloadRequest;

      preloadAttempted = true;
      preloadRequest = (async () => {
        try {
          const response = await fetch(
            getApiUrl(`/api/v1/ppt/presentation/${presentationId}`),
            {
              credentials: "include",
            }
          );
          if (!response.ok) {
            throw new Error("Failed to preload prepared presentation.");
          }
          const preparedPresentation = normalizeBackendAssetUrls(
            await response.json()
          );
          if (!isClosed) {
            const prev = store.getState().presentationGeneration.presentationData;
            streamIsTemplateV2 =
              streamIsTemplateV2 ||
              isTemplateV2PresentationPayload(preparedPresentation);
            dispatch(
              setPresentationData({
                ...(prev ?? {}),
                ...(preparedPresentation as PresentationData),
                slides: prev?.slides ?? (preparedPresentation as any).slides,
              } as PresentationData)
            );
          }
        } catch (error) {
          console.warn("Could not preload prepared presentation:", error);
        } finally {
          preloadRequest = null;
        }
      })();

      return preloadRequest;
    };

    const trackTemplateV2StreamCompleted = (presentation: unknown) => {
      if (!streamIsTemplateV2 && !isTemplateV2PresentationPayload(presentation)) {
        return;
      }
      streamIsTemplateV2 = true;
      const slides = isTemplateV2PresentationPayload(presentation)
        ? (presentation as Record<string, unknown>).slides
        : store.getState().presentationGeneration.presentationData?.slides;
      trackEvent(MixpanelEvent.TemplateV2_Stream_Completed, {
        presentation_id: presentationId,
        slide_count: Array.isArray(slides) ? slides.length : 0,
        retry_count: retryCount,
        duration_ms: Date.now() - streamStartedAt,
      });
    };

    const openStream = () => {
      closeEventSource();
      eventSource = new EventSource(
        getApiUrl(`/api/v1/ppt/presentation/stream/${presentationId}`)
      );

      eventSource.addEventListener("response", (event) => {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          if (!scheduleRetry("invalid SSE payload")) {
            finalizeFailure("Failed to parse stream response.");
          }
          return;
        }

        switch (data.type) {
          case "chunk":
            accumulatedChunks += data.chunk;
            const streamedSlide = parseStreamedSlideChunk(data.chunk);
            if (streamedSlide) {
              const prev = store.getState().presentationGeneration.presentationData;
              const normalizedSlide = normalizeBackendAssetUrls(streamedSlide);
              const mergedSlides = mergeSingleSlidePreservingResolvedAssets(
                prev?.slides,
                normalizedSlide
              );
              dispatch(
                setPresentationData({
                  ...(prev ?? {}),
                  slides: mergedSlides,
                } as PresentationData)
              );
              previousSlidesLength.current = mergedSlides.length;
              setLoading(false);
              if (
                isTemplateV2SlidePayload(normalizedSlide) &&
                !hasTemplateV2LayoutPayload(prev?.layout)
              ) {
                streamIsTemplateV2 = true;
                void preloadPreparedPresentation(true);
              }
            }

            try {
              const repairedJson = jsonrepair(accumulatedChunks);
              const partialData = JSON.parse(repairedJson);
              const normalizedPartialData = normalizeBackendAssetUrls(partialData);

              if (
                normalizedPartialData.slides &&
                normalizedPartialData.slides.length > 0
              ) {
                const prev =
                  store.getState().presentationGeneration.presentationData;
                const mergedSlides = mergeSlidesPreservingResolvedAssets(
                  prev?.slides,
                  normalizedPartialData.slides
                );
                dispatch(
                  setPresentationData({
                    ...(prev ?? {}),
                    ...normalizedPartialData,
                    slides: mergedSlides,
                  } as PresentationData)
                );
                previousSlidesLength.current =
                  normalizedPartialData.slides.length;
                setLoading(false);
              }
            } catch {
              // JSON isn't complete yet, continue accumulating
            }
            break;

          case "slide_assets": {
            if (
              data.slide &&
              typeof data.slide === "object"
            ) {
              const prev = store.getState().presentationGeneration.presentationData;
              const normalizedSlide = normalizeBackendAssetUrls(data.slide);
              const mergedSlides = mergeSingleSlidePreservingResolvedAssets(
                prev?.slides,
                normalizedSlide
              );
              dispatch(
                setPresentationData({
                  ...(prev ?? {}),
                  slides: mergedSlides,
                } as PresentationData)
              );
              if (
                isTemplateV2SlidePayload(normalizedSlide) &&
                !hasTemplateV2LayoutPayload(prev?.layout)
              ) {
                streamIsTemplateV2 = true;
                void preloadPreparedPresentation(true);
              }
            }
            if (Array.isArray(data.warnings)) {
              for (const warning of data.warnings) {
                const detail =
                  warning &&
                  typeof warning === "object" &&
                  typeof warning.detail === "string"
                    ? warning.detail
                    : null;
                if (!detail || shownAssetWarnings.has(detail)) {
                  continue;
                }
                shownAssetWarnings.add(detail);
                notify.warning("Some images could not be generated", detail, {
                  duration: 12_000,
                });
              }
            }
            break;
          }

          case "complete":
            try {
              dispatch(
                setPresentationData(
                  mergePresentationPreservingTemplateData(
                    normalizeBackendAssetUrls(data.presentation) as PresentationData
                  )
                )
              );
              trackTemplateV2StreamCompleted(data.presentation);
              dispatch(setStreaming(false));
              setLoading(false);
              isClosed = true;
              closeEventSource();
              clearRetryTimer();
              retryCount = 0;

              // Remove stream parameter from URL
              const newUrl = new URL(window.location.href);
              newUrl.searchParams.delete("stream");
              window.history.replaceState({}, "", newUrl.toString());
            } catch {
              if (!scheduleRetry("failed to parse complete payload")) {
                finalizeFailure("Failed to parse final presentation payload.");
              }
            }
            accumulatedChunks = "";
            break;

          case "closing":
            dispatch(
              setPresentationData(
                mergePresentationPreservingTemplateData(
                  normalizeBackendAssetUrls(data.presentation) as PresentationData
                )
              )
            );
            trackTemplateV2StreamCompleted(data.presentation);
            setLoading(false);
            dispatch(setStreaming(false));
            isClosed = true;
            closeEventSource();
            clearRetryTimer();
            retryCount = 0;

            // Remove stream parameter from URL
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete("stream");
            window.history.replaceState({}, "", newUrl.toString());
            break;
          case "error":
            if (isChatGptAuthRequiredMessage(data.detail)) {
              requestChatGptReauth({
                message: data.detail,
                source: "presentation-stream",
              });
              finalizeFailure(
                data.detail ||
                  "Your ChatGPT session expired. Please sign in again from Settings.",
                { showToast: false }
              );
              break;
            }
            if (
              !scheduleRetry(
                data.detail || "server returned stream error response"
              )
            ) {
              finalizeFailure(
                data.detail ||
                  "Failed to connect to the server. Please try again."
              );
            }
            break;
        }
      });

      eventSource.onerror = (error) => {
        console.error("EventSource failed:", error);
        if (!scheduleRetry("connection lost")) {
          finalizeFailure("Failed to connect to the server. Please try again.");
        }
      };
    };

    const startStream = async () => {
      dispatch(setStreaming(true));
      dispatch(clearPresentationData());
      trackEvent(MixpanelEvent.Presentation_Stream_API_Call);
      await preloadPreparedPresentation();
      if (!isClosed) {
        openStream();
      }
    };

    void startStream();

    return () => {
      isClosed = true;
      closeEventSource();
      clearRetryTimer();
    };
  }, [
    presentationId,
    stream,
    dispatch,
    setLoading,
    setError,
    fetchUserSlides,
    preloadPresentationData,
  ]);
};
