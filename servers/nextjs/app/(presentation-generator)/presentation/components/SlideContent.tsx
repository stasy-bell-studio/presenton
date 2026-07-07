import React, { useEffect } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import SlideScale from "../../components/PresentationRender";
import SlideActionBar from "./SlideActionBar";

interface SlideContentProps {
  slide: any;
  index: number;
  presentationId: string;
  onSlideAdded?: (
    index: number,
    options?: {
      promptOverlaySlideId?: string;
      promptOverlayKind?: "blank" | "layout";
    },
  ) => void;
  isChatEditing?: boolean;
  showBlankPromptOverlay?: boolean;
  onBlankPromptOverlayDismiss?: () => void;
  showTemplatePromptOverlay?: boolean;
  onTemplatePromptOverlayDismiss?: () => void;
}

const SlideContent = ({
  slide,
  index,
  presentationId,
  onSlideAdded,
  isChatEditing = false,
  showBlankPromptOverlay = false,
  onBlankPromptOverlayDismiss,
  showTemplatePromptOverlay = false,
  onTemplatePromptOverlayDismiss,
}: SlideContentProps) => {
  const slideLayout = typeof slide?.layout === "string" ? slide.layout : "";
  const { presentationData, isStreaming } = useSelector(
    (state: RootState) => state.presentationGeneration
  );

  const slideLayoutGroup =
    typeof slide?.layout_group === "string" ? slide.layout_group : "";
  const slideLayoutTemplateId =
    typeof slide?.layout === "string" ? slide.layout.split(":")[0] : "";
  const slideTemplateId = slideLayoutGroup.startsWith("template-v2")
    ? slideLayoutGroup
    : slideLayoutGroup || slideLayoutTemplateId;
  const isTemplateV2Slide = slideTemplateId.startsWith("template-v2");
  const slideIndex = typeof slide?.index === "number" ? slide.index : index;

  useEffect(() => {
    if (slideLayout.includes("custom")) {
      const existingScript = document.querySelector(
        'script[src*="tailwindcss.com"]'
      );
      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://cdn.tailwindcss.com";
        script.async = true;
        document.head.appendChild(script);
      }
    }
  }, [slideLayout, isStreaming]);

  return (
    <div
      id={`slide-${slideIndex}`}
      data-slide-index={index}
      className="main-slide relative flex h-full min-h-full w-full snap-start snap-always items-center justify-center px-2 py-4 max-md:py-3"
    >
      {isStreaming && (
        <Loader2 className="absolute right-2 top-2 z-30 h-8 w-8 animate-spin text-blue-800" />
      )}
      <div
        data-layout={slide?.layout}
        data-group={slide?.layout_group}
        className={`group flex h-full min-h-0 w-full flex-col font-syne ${
          isTemplateV2Slide ? "relative" : ""
        }`}
      >
        {isChatEditing && (
          <div
            className="pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2 overflow-hidden rounded-[50px] p-[1.5px] font-syne"
            aria-live="polite"
          >
            <span className="relative z-20 flex items-center overflow-hidden rounded-[50px] bg-white px-3 py-2 text-sm font-medium text-[#666666]">
              <span
                aria-hidden="true"
                className="generating-slides-background absolute"
              />
              <span className="relative z-10 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#9034EA]" />
                Updating slides...
              </span>
            </span>
          </div>
        )}
        <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
          <SlideScale
            slide={slide}
            theme={presentationData?.theme || null}
            fonts={presentationData?.fonts}
            renderIndex={index}
            fitToContainer
            showBlankPromptOverlay={showBlankPromptOverlay}
            onBlankPromptOverlayDismiss={onBlankPromptOverlayDismiss}
            showTemplatePromptOverlay={showTemplatePromptOverlay}
            onTemplatePromptOverlayDismiss={onTemplatePromptOverlayDismiss}
          />
        </div>
        <div className="mt-4 hidden w-full shrink-0 md:block">
          <SlideActionBar
            slide={slide}
            selectedSlide={slideIndex}
            presentationId={presentationId}
            onSlideSelected={onSlideAdded ?? (() => undefined)}
            revealOnGroupHover
          />
        </div>
      </div>
    </div>
  );
};

export default SlideContent;
