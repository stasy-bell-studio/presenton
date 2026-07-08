"use client";

import React, { memo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowUpRight, CheckCircle2, Loader2 } from "lucide-react";
import { resolveBackendAssetUrl } from "@/utils/api";
import { TemplateListItem } from "../services/api/template";
import {
  TemplatePreviewStage,
  LayoutsBadge,
} from "./TemplatePreviewComponents";
import { TemplateTab } from "../hooks/useTemplateSummaries";

export function TemplateThumbnailPreview({
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
}

export const TemplateListCard = memo(function TemplateListCard({
  template,
  onClick,
  isSelected = false,
  showArrow = false,
}: {
  template: TemplateListItem;
  onClick: () => void;
  isSelected?: boolean;
  showArrow?: boolean;
}) {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      onClick();
    },
    [onClick]
  );

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${showArrow ? "Open" : "Select"} ${template.name} template`}
      className={cn(
        "cursor-pointer relative transition-all duration-200 group overflow-hidden rounded-[22px] bg-white border outline-none",
        "hover:-translate-y-1 hover:border-[#7A5AF8] hover:ring-2 hover:ring-[#7A5AF8]/20 hover:shadow-[0_18px_40px_rgba(34,31,54,0.12)]",
        "focus-visible:-translate-y-1 focus-visible:border-[#7A5AF8] focus-visible:ring-2 focus-visible:ring-[#7A5AF8]/30 focus-visible:shadow-[0_18px_40px_rgba(34,31,54,0.12)]",
        isSelected
          ? " border-[#7A5AF8] ring-2 ring-[#7A5AF8]/25 shadow-[0_14px_34px_rgba(34,31,54,0.12)]"
          : " border-[#E8E9EC]"
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <div className="pointer-events-none absolute inset-0 z-30 rounded-[22px] bg-[#7A5AF8]/[0.04] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" />
      {isSelected && (
        <span className="absolute right-4 top-3.5 z-50 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#7A5AF8] text-white shadow-sm">
          <CheckCircle2 className="h-4 w-4" />
        </span>
      )}
      <TemplatePreviewStage>
        <LayoutsBadge count={template.layout_count ?? 0} />
        <TemplateThumbnailPreview
          thumbnail={template.thumbnail}
          templateName={template.name}
        />
      </TemplatePreviewStage>
      <div className="flex items-center justify-between px-6 py-5 bg-white border-t border-[#EDEEEF] relative z-40">
        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "font-bold text-gray-900 capitalize font-syne",
              showArrow ? "text-base" : "text-sm"
            )}
          >
            {template.name}
          </h3>
          {template.description && (
            <p
              className={cn(
                "text-gray-600 line-clamp-2 font-syne",
                showArrow ? "mt-1 text-sm text-gray-500" : "text-xs"
              )}
            >
              {template.description}
            </p>
          )}
        </div>
        {showArrow && (
          <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-400 transition-colors group-hover:text-purple-600" />
        )}
      </div>
    </Card>
  );
});

export function TemplateTabSwitcher({
  tab,
  onTabChange,
}: {
  tab: TemplateTab;
  onTabChange: (tab: TemplateTab) => void;
}) {
  return (
    <div className="p-1 rounded-[40px] bg-[#ffffff] w-fit border border-[#EDEEEF] flex items-center justify-center">
      <button
        type="button"
        className="px-5 py-2 text-xs font-medium text-[#3A3A3A] rounded-[70px]"
        onClick={() => onTabChange("custom")}
        style={{
          background: tab === "custom" ? "#F4F3FF" : "transparent",
          color: tab === "custom" ? "#5146E5" : "#3A3A3A",
        }}
      >
        Custom
      </button>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="mx-1"
        width="2"
        height="17"
        viewBox="0 0 2 17"
        fill="none"
        aria-hidden="true"
      >
        <path d="M1 0V16.5" stroke="#EDECEC" strokeWidth="2" />
      </svg>
      <button
        type="button"
        className="px-5 py-2 text-xs font-medium text-[#3A3A3A] rounded-[70px]"
        onClick={() => onTabChange("default")}
        style={{
          background: tab === "default" ? "#F4F3FF" : "transparent",
          color: tab === "default" ? "#5146E5" : "#3A3A3A",
        }}
      >
        Built-in
      </button>
    </div>
  );
}

export function TemplateListLoadingState({ message = "Loading templates..." }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-12 font-syne">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      <span className="ml-3 text-gray-600">{message}</span>
    </div>
  );
}

export function TemplateListEmptyState({ message = "No templates available." }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-12 font-syne text-gray-600">
      {message}
    </div>
  );
}
