"use client";
/* eslint-disable @next/next/no-img-element */
import React, { memo, useMemo } from "react";
import { Loader2 } from "lucide-react";
import type { CompiledLayout } from "@/app/hooks/compileLayout";
import { resolveBackendAssetUrl } from "@/utils/api";
import { TemplateV2LayoutPreview } from "../custom-template/components/EachSlide/TemplateV2LayoutPreview";
import type { TemplateV2Layout } from "../custom-template/types";

type TemplateWithData = {
    component: React.ComponentType<{ data: any }>;
    layoutId: string;
    sampleData: Record<string, unknown>;
};

const LOADING_PREVIEW_KEYS = ["loading-preview-a", "loading-preview-b"];

function hashKey(value: string) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
}

function templateV2PreviewKey(templateId: string, layout: TemplateV2Layout) {
    const explicitId =
        typeof layout.id === "string" && layout.id.trim()
            ? layout.id.trim()
            : "";
    const description =
        typeof layout.description === "string" && layout.description.trim()
            ? layout.description.trim()
            : "";
    return `${templateId}-preview-${explicitId || description || hashKey(JSON.stringify(layout))}`;
}

export function TemplatePreviewStage({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative overflow-hidden px-5 pb-5 pt-5 h-[230px]">
            <img
                src="/card_bg.svg"
                alt=""
                className="absolute top-0 left-0 w-full h-full object-cover"
            />
            {children}
        </div>
    );
}

export const LayoutsBadge = memo(function LayoutsBadge({ count }: { count: number }) {
    return (
        <span className="text-xs font-syne absolute top-3.5 left-4 z-40 inline-flex items-center rounded-full bg-[#333333] px-3 py-1 font-semibold text-white">
            Layouts-{count}
        </span>
    );
});

export const TemplateThumbnailPreview = memo(function TemplateThumbnailPreview({
    thumbnail,
    templateName,
}: {
    thumbnail?: string | null;
    templateName: string;
}) {
    const resolvedThumbnail = thumbnail ? resolveBackendAssetUrl(thumbnail) : "";

    if (!resolvedThumbnail) {
        return (
            <div className="relative z-10 flex h-full items-center justify-center rounded-xl border border-[#EDEEEF] bg-white/80">
                <div className="h-10 w-16 rounded-md border border-dashed border-[#C9CDD8] bg-[#F7F8FB]" />
            </div>
        );
    }

    return (
        <div className="relative z-10 flex h-full items-center justify-center">
            <div
                aria-label={`${templateName} thumbnail`}
                className="h-full w-full rounded-xl border border-[#EDEEEF] bg-white bg-cover bg-center shadow-sm"
                role="img"
                style={{ backgroundImage: `url(${JSON.stringify(resolvedThumbnail)})` }}
            />
        </div>
    );
});

export const ScaledSlidePreview = memo(function ScaledSlidePreview({
    children,
    isOutline = false,
}: {
    children: React.ReactNode;
    index?: number;
    isOutline?: boolean;
}) {
    const PREVIEW_SCALE = isOutline ? 0.2 : 0.24;
    const SLIDE_HEIGHT = 720 * PREVIEW_SCALE;
    const SLIDE_WIDTH = 1280;
    const SLIDE_NATIVE_HEIGHT = 720;
    return (
        <div
            className="relative"
            style={{ height: `${SLIDE_HEIGHT}px`, overflow: "hidden" }}
        >
            <div
                className={`absolute top-0 ${isOutline ? "left-0" : "left-8"} pointer-events-none`}
                style={{
                    width: SLIDE_WIDTH,
                    height: SLIDE_NATIVE_HEIGHT,
                    transformOrigin: "top left",
                    transform: `scale(${PREVIEW_SCALE})`,
                }}
            >
                {children}
            </div>
        </div>
    );
});

export const InbuiltTemplatePreview = memo(function InbuiltTemplatePreview({
    layouts,
    templateId,
    isOutline = false,
}: {
    layouts: TemplateWithData[];
    templateId: string;
    isOutline?: boolean;
}) {
    const previewLayouts = useMemo(() => layouts.slice(0, 2), [layouts]);
    return (
        <div className="relative z-10 flex flex-col gap-3 overflow-hidden">
            {previewLayouts.map((layout, index) => {
                const LayoutComponent = layout.component;
                return (
                    <ScaledSlidePreview key={`${templateId}-preview-${layout.layoutId}`} index={index} isOutline={isOutline}>
                        <LayoutComponent data={layout.sampleData} />
                    </ScaledSlidePreview>
                );
            })}
        </div>
    );
});

export const CustomTemplatePreview = memo(function CustomTemplatePreview({
    previewLayouts,
    loading,
    templateId,
    isOutline = false,
}: {
    previewLayouts: CompiledLayout[];
    loading: boolean;
    templateId: string;
    isOutline?: boolean;
}) {
    return (
        <div className="relative z-10 flex flex-col gap-3">
            {loading ? (
                LOADING_PREVIEW_KEYS.map((loadingKey) => (
                    <div
                        key={`${templateId}-${loadingKey}`}
                        className="relative w-full aspect-video flex items-center justify-center"
                    >
                        <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                    </div>
                ))
            ) : (
                previewLayouts.slice(0, 2).map((layout, index) => {
                    const LayoutComponent = layout.component;
                    return (
                        <ScaledSlidePreview key={`${templateId}-preview-${layout.layoutId}`} index={index} isOutline={isOutline}>
                            <LayoutComponent data={layout.sampleData} />
                        </ScaledSlidePreview>
                    );
                })
            )}
        </div>
    );
});

export const TemplateV2CustomTemplatePreview = memo(function TemplateV2CustomTemplatePreview({
    previewLayouts,
    loading,
    templateId,
    isOutline = false,
}: {
    previewLayouts: TemplateV2Layout[];
    loading: boolean;
    templateId: string;
    isOutline?: boolean;
}) {
    return (
        <div className="relative z-10 flex flex-col gap-3">
            {loading ? (
                LOADING_PREVIEW_KEYS.map((loadingKey) => (
                    <div
                        key={`${templateId}-${loadingKey}`}
                        className="relative w-full aspect-video flex items-center justify-center"
                    >
                        <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                    </div>
                ))
            ) : (
                previewLayouts.slice(0, 2).map((layout, index) => (
                    <ScaledSlidePreview key={templateV2PreviewKey(templateId, layout)} index={index} isOutline={isOutline}>
                        <TemplateV2LayoutPreview
                            layout={layout}
                            useKonvaRenderer={!isOutline}
                        />
                    </ScaledSlidePreview>
                ))
            )}
        </div>
    );
});
