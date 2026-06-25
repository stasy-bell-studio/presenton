"use client";

import React, { useMemo, useRef } from "react";
import EditableLayoutWrapper from "../components/EditableLayoutWrapper";
import SlideErrorBoundary from "../components/SlideErrorBoundary";
import TiptapTextReplacer from "../components/TiptapTextReplacer";
import { validate as uuidValidate } from 'uuid';
import { getLayoutByLayoutId } from "@/app/presentation-templates";
import { useCustomTemplateDetails } from "@/app/hooks/useCustomTemplates";
import { updateSlideContent } from "@/store/slices/presentationGeneration";
import { useDispatch } from "react-redux";
import { Loader2 } from "lucide-react";
import {
    type TemplateV2Layout,
} from "@/components/slide-editor/lib/template-v2-import";
import { TemplateV2KonvaSlide } from "./TemplateV2KonvaSlide";
import { BLANK_TEMPLATE_V2_LAYOUT, isBlankPresentationSlide } from "../_shared/blank-slide";




export const V1ContentRender = ({
    slide,
    isEditMode,
    theme,
    renderIndex,
}: {
    slide: any,
    isEditMode: boolean,
    theme?: any,
    renderIndex?: number,
    enableEditMode?: boolean,
    presentationLayout?: unknown,
}) => {
    const dispatch = useDispatch();
    const containerRef = useRef<HTMLDivElement | null>(null);

    const layoutGroup = typeof slide.layout_group === "string" ? slide.layout_group : "";
    const slideLayout = typeof slide.layout === "string" ? slide.layout : "";
    const isBlankSlide = isBlankPresentationSlide(slide);
    const isTemplateV2Slide = layoutGroup.startsWith("template-v2");

    const customTemplateId = layoutGroup.startsWith("custom-") ? layoutGroup.split("custom-")[1] : layoutGroup;
    const isCustomTemplate = !isTemplateV2Slide && (uuidValidate(customTemplateId) || layoutGroup.startsWith("custom-"));

    // Always call the hook (React hooks rule), but with empty id when not a custom template
    const { template: customTemplate, loading: customLoading } = useCustomTemplateDetails({
        id: isCustomTemplate ? customTemplateId : "",
        name: isCustomTemplate ? layoutGroup : "",
        description: ""
    });

    const templateV2Layout = useMemo(() => {
        if (!isTemplateV2Slide) return null;

        const slideUi = slide.ui;
        return slideUi &&
            typeof slideUi === "object" &&
            !Array.isArray(slideUi) &&
            Array.isArray(slideUi.components)
            ? slideUi as TemplateV2Layout
            : null;
    }, [isTemplateV2Slide, slide.ui]);

    // Memoize layout resolution to prevent unnecessary recalculations
    const Layout = useMemo(() => {
        if (isTemplateV2Slide) {
            return null;
        }
        if (isCustomTemplate) {
            if (customTemplate) {
                const layoutId = slideLayout.startsWith("custom-") ? slideLayout.split(":")[1] : slideLayout;


                const compiledLayout = customTemplate.layouts.find(
                    (layout) => layout.layoutId === layoutId
                );


                return compiledLayout?.component ?? null;
            }
            return null;
        } else {
            const template = getLayoutByLayoutId(slideLayout, layoutGroup);
            return template?.component ?? null;
        }
    }, [isTemplateV2Slide, isCustomTemplate, customTemplate, slideLayout, layoutGroup]);

    if (isBlankSlide && isTemplateV2Slide) {
        return (
            <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
                <TemplateV2KonvaSlide
                    layout={BLANK_TEMPLATE_V2_LAYOUT}
                    slide={slide}
                    isEditMode={isEditMode}
                    renderIndex={renderIndex}
                />
            </SlideErrorBoundary>
        );
    }

    if (isBlankSlide) {
        return <div className="h-full w-full bg-white" />;
    }

    if (isTemplateV2Slide) {
        if (!templateV2Layout) {
            return (
                <div className="flex h-full aspect-video flex-col items-center justify-center rounded-lg bg-gray-100">
                    <Loader2 className="mb-2 h-4 w-4 animate-spin" />
                    <p className="text-center text-sm text-gray-600">Loading slide layout...</p>
                </div>
            );
        }

        return (
            <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
                <TemplateV2KonvaSlide
                    layout={templateV2Layout}
                    slide={slide}
                    isEditMode={isEditMode}
                    renderIndex={renderIndex}
                />
            </SlideErrorBoundary>
        );
    }

    // Show loading state for custom templates
    if (isCustomTemplate && customLoading) {
        return (
            <div className="flex flex-col items-center justify-center aspect-video h-full bg-gray-100 rounded-lg">
                <Loader2 className="w-4 h-4 animate-spin" />
            </div>
        );
    }


    if (!Layout) {
        if (Object.keys(slide.content).length === 0) {
            return (
                <div className="flex flex-col items-center cursor-pointer justify-center aspect-video h-full bg-gray-100 rounded-lg">
                    <p className="text-gray-600 text-center text-base">Blank Slide</p>
                    <p className="text-gray-600 text-center text-sm">This slide is empty. Please add content to it using the edit button.</p>
                </div>
            )
        }
        return (
            <div className="flex flex-col items-center justify-center aspect-video h-full bg-gray-100 rounded-lg">
                <p className="text-gray-600 text-center text-base">
                    Layout &quot;{slideLayout}&quot; not found in &quot;
                    {layoutGroup}&quot; Template
                </p>
            </div>
        );
    }
    const LayoutComp = Layout as React.ComponentType<{ data: any }>;

    if (isEditMode) {
        return (
            <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
                <div ref={containerRef} className={` `}>

                    <EditableLayoutWrapper
                        slideIndex={slide.index}
                        slideData={slide.content}
                        properties={slide.properties}
                    >
                        <TiptapTextReplacer
                            key={slide.id}
                            slideData={slide.content}
                            slideIndex={slide.index}
                            onContentChange={(
                                content: string,
                                dataPath: string,
                                slideIndex?: number
                            ) => {
                                if (dataPath && slideIndex !== undefined) {
                                    dispatch(
                                        updateSlideContent({
                                            slideIndex: slideIndex,
                                            dataPath: dataPath,
                                            content: content,
                                        })
                                    );
                                }
                            }}
                        >
                            <LayoutComp data={{
                                ...slide.content,
                                _logo_url__: theme ? theme.logo_url : null,
                                __companyName__: (theme && theme.company_name) ? theme.company_name : null,
                            }} />
                        </TiptapTextReplacer>
                    </EditableLayoutWrapper>



                </div>
            </SlideErrorBoundary>

        );
    }
    return (
        <SlideErrorBoundary label={`Slide ${slide.index + 1}`}>
            <div ref={containerRef}>
                <TiptapTextReplacer
                    key={slide.id}
                    slideData={slide.content}
                    slideIndex={slide.index}
                    readOnly
                >
                    <LayoutComp data={{
                        ...slide.content,
                        _logo_url__: theme ? theme.logo_url : null,
                        __companyName__: (theme && theme.company_name) ? theme.company_name : null,
                    }} />
                </TiptapTextReplacer>
            </div>
        </SlideErrorBoundary>
    );
};
