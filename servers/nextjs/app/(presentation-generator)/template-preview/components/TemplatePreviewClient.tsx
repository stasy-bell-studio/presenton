"use client";
import React, { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import "../../utils/prism-languages";

import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";
import TemplateService from "../../services/api/template";
import Header from "../../(dashboard)/dashboard/components/Header";
import { notify } from "@/components/ui/sonner";
import { setupImageUrlConverter } from "@/utils/image-url-converter";
import { useFontLoader as loadFontAssets } from "../../hooks/useFontLoad";
import { useTemplateDetails } from "../../hooks/useTemplateDetails";
import { TemplateV2Layout } from "../../custom-template/types";
import { TemplateV2LayoutPreview } from "../../custom-template/components/EachSlide/TemplateV2LayoutPreview";

type GroupLayoutPreviewProps = {
  useKonvaTemplateV2Preview?: boolean;
};

function hashKey(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function TemplatePreviewLoadingState() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Loading template...</span>
      </div>
    </div>
  );
}

function TemplatePreviewErrorState({
  error,
  onBack,
}: {
  error: string | null | undefined;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="flex flex-col items-center justify-center py-24">
        <h2 className="text-2xl font-bold text-red-600 mb-4">
          Error loading template
        </h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <Button onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Templates
        </Button>
      </div>
    </div>
  );
}

function TemplatePreviewNotFoundState({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="flex flex-col items-center justify-center py-24">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Template not found
        </h2>
        <Button onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Templates
        </Button>
      </div>
    </div>
  );
}

function TemplatePreviewHeader({
  canDelete,
  isDefaultTemplate,
  layoutCount,
  onDelete,
  pathname,
  templateDescription,
  templateName,
}: {
  canDelete: boolean;
  isDefaultTemplate: boolean;
  layoutCount: number;
  onDelete: () => void;
  pathname: string;
  templateDescription: string;
  templateName: string;
}) {
  return (
    <header className="z-30">
      <div className="mx-auto px-6 pb-[30px]">
        <div className="flex items-center justify-between mb-4 max-w-[1440px] mx-auto">
          {canDelete && (
            <div className="flex items-center justify-end ml-auto mr-0 gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  trackEvent(
                    MixpanelEvent.TemplatePreview_Delete_Templates_Button_Clicked,
                    { pathname }
                  );
                  trackEvent(MixpanelEvent.TemplatePreview_Delete_Templates_API_Call);
                  onDelete();
                }}
                className="flex items-center gap-2 border-red-200 text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete Template
              </Button>
            </div>
          )}
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <h1 className="text-[64px] font-bold text-gray-900">
              {templateName}
            </h1>
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-sm">
              {isDefaultTemplate ? "Built-in" : "Custom"}
            </span>
          </div>
          <p className="text-gray-600 text-xl">
            {layoutCount} layout{layoutCount !== 1 ? "s" : ""}
            {templateDescription ? ` • ${templateDescription}` : ""}
          </p>
        </div>
      </div>
    </header>
  );
}

function TemplateLayoutList({
  layouts,
  templateId,
  useKonvaTemplateV2Preview,
  fonts,
}: {
  layouts: TemplateV2Layout[];
  templateId: string;
  useKonvaTemplateV2Preview: boolean;
  fonts?: Record<string, string>;
}) {
  return (
    <div className="flex flex-col items-center justify-center w-full gap-10 mx-auto px-6">
      {layouts.map((layout, index) => {
        const layoutKey =
          layout.id || layout.description || hashKey(JSON.stringify(layout));
        return (
          <Card
            key={`${templateId}-${layoutKey}`}
            id={layout.id || `slide-${index + 1}`}
            className="overflow-hidden shadow-md w-full max-w-[1320px]"
          >
            <div className="bg-white px-6 py-4 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {layout.id || `Slide ${index + 1}`}
                  </h3>
                  {layout.description && (
                    <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                      {layout.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-end justify-end">
                <span className="px-3 py-1 text-gray-600 rounded text-sm font-mono">
                  {templateId}:{layout.id || index + 1}
                </span>
              </div>
            </div>

            <div className="p-6 flex justify-center overflow-x-auto">
              <TemplateV2LayoutPreview
                layout={layout}
                useKonvaRenderer={useKonvaTemplateV2Preview}
                fonts={fonts}
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

const GroupLayoutPreview = ({
  useKonvaTemplateV2Preview = true,
}: GroupLayoutPreviewProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const templateId =
    searchParams.get("templateV2Id") || searchParams.get("id") || "";

  const { template, layouts, fonts, loading, error } =
    useTemplateDetails(templateId);

  useEffect(() => {
    const existingScript = document.querySelector(
      'script[src*="tailwindcss.com"]'
    );
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://cdn.tailwindcss.com";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    if (!fonts) return;
    loadFontAssets(fonts);
  }, [fonts]);

  useEffect(() => {
    const observer = setupImageUrlConverter();
    return () => observer?.disconnect();
  }, []);

  const handleDeleteTemplate = async () => {
    if (!templateId) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this template? This action cannot be undone."
    );
    if (!confirmed) return;

    const result = await TemplateService.deleteTemplate(templateId);
    if (result.success) {
      notify.success("Template deleted", "The template was deleted successfully.");
      router.push("/templates");
    } else {
      notify.error(
        "Could not delete template",
        result.message || "Something went wrong while deleting the template."
      );
    }
  };

  if (!templateId) {
    return (
      <TemplatePreviewNotFoundState onBack={() => router.push("/templates")} />
    );
  }

  if (loading) {
    return <TemplatePreviewLoadingState />;
  }

  if (error) {
    return (
      <TemplatePreviewErrorState
        error={error}
        onBack={() => router.push("/templates")}
      />
    );
  }

  if (!template) {
    return (
      <TemplatePreviewNotFoundState onBack={() => router.push("/templates")} />
    );
  }

  const canDelete = !template.is_default;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <TemplatePreviewHeader
        canDelete={canDelete}
        isDefaultTemplate={Boolean(template.is_default)}
        layoutCount={layouts.length}
        onDelete={handleDeleteTemplate}
        pathname={pathname}
        templateDescription={template.description || ""}
        templateName={template.name || "Template"}
      />

      <div className="mx-auto h-full mb-4">
        {layouts.length === 0 ? (
          <div className="flex items-center justify-center py-24 text-gray-600">
            No layouts available for this template.
          </div>
        ) : (
          <TemplateLayoutList
            layouts={layouts}
            templateId={templateId}
            useKonvaTemplateV2Preview={useKonvaTemplateV2Preview}
            fonts={fonts}
          />
        )}
      </div>
    </div>
  );
};

export default GroupLayoutPreview;
