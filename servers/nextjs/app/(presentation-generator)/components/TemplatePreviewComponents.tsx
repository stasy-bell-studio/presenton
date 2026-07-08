"use client";
/* eslint-disable @next/next/no-img-element */
import React, { memo, useMemo } from "react";
import { Loader2 } from "lucide-react";



const LOADING_PREVIEW_KEYS = ["loading-preview-a", "loading-preview-b"];

function hashKey(value: string) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
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

export const ScaledSlidePreview = memo(function ScaledSlidePreview({
    children,
    index,
    isOutline = false,
}: {
    children: React.ReactNode;
    index: number;
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



