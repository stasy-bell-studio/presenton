"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { notify } from "@/components/ui/sonner";
import {
  CustomTemplateLayout,
  useCustomTemplateDetails,
} from "@/app/hooks/useCustomTemplates";
import { setupImageUrlConverter } from "@/utils/image-url-converter";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";
import {
  extractTemplateV2Layouts,
  normalizeTemplateV2Fonts,
  type TemplateV2ImportResponse,
  type TemplateV2Layout,
} from "@/components/slide-editor/importing/template-v2-import";
import Header from "../../(dashboard)/dashboard/components/Header";
import SlideScale from "../../components/PresentationRender";
import { useFontLoader as loadFontAssets } from "../../hooks/useFontLoad";
import TemplateService from "../../services/api/template";
import "../../utils/prism-languages";

type TemplateDetail = TemplateV2ImportResponse & {
  is_default?: boolean;
  layout_count?: number;
};

function hashKey(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function getRenderableLayouts(template: TemplateDetail | null): TemplateV2Layout[] {
  if (!template) return [];
  const layouts = extractTemplateV2Layouts(template.layouts);
  if (layouts.length > 0) return layouts;
  return extractTemplateV2Layouts(template.raw_layouts);
}

function useTemplateDetails(templateId: string) {
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(templateId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) {
      setTemplate(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const loadTemplate = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await TemplateService.getTemplateDetails(templateId);
        if (!cancelled) {
          setTemplate(data as TemplateDetail);
        }
      } catch (loadError) {
        console.error("Failed to load template", loadError);
        if (!cancelled) {
          setTemplate(null);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load template",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadTemplate();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const layouts = useMemo(() => getRenderableLayouts(template), [template]);

  return { template, layouts, loading, error };
}

function TemplatePreviewLoadingState() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
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
        <h2 className="mb-4 text-2xl font-bold text-red-600">
          Error loading template
        </h2>
        <p className="mb-4 text-gray-600">{error}</p>
        <Button onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
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
        <h2 className="mb-4 text-2xl font-bold text-gray-900">
          Template not found
        </h2>
        <Button onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Templates
        </Button>
      </div>
    </div>
  );
}

function TemplatePreviewHeader({
  canDelete,
  isCustomTemplate,
  isDefaultTemplate,
  layoutCount,
  onDelete,
  pathname,
  templateDescription,
  templateName,
}: {
  canDelete: boolean;
  isCustomTemplate: boolean;
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
        <div className="mx-auto mb-4 flex max-w-[1440px] items-center justify-between">
          {canDelete && (
            <div className="ml-auto mr-0 flex items-center justify-end gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  trackEvent(
                    MixpanelEvent.TemplatePreview_Delete_Templates_Button_Clicked,
                    { pathname },
                  );
                  trackEvent(MixpanelEvent.TemplatePreview_Delete_Templates_API_Call);
                  onDelete();
                }}
                className="flex items-center gap-2 border-red-200 text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete Template
              </Button>
            </div>
          )}
        </div>

        <div className="text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <h1 className="text-[64px] font-bold text-gray-900">
              {templateName}
            </h1>
            {isDefaultTemplate && (
              <span className="rounded bg-purple-100 px-2 py-0.5 text-sm text-purple-700">
                Built-in
              </span>
            )}
            {isCustomTemplate && (
              <span className="rounded bg-purple-100 px-2 py-0.5 text-sm text-purple-700">
                Custom
              </span>
            )}
          </div>
          <p className="text-xl text-gray-600">
            {layoutCount} layout{layoutCount !== 1 ? "s" : ""}
            {templateDescription ? ` • ${templateDescription}` : ""}
          </p>
        </div>
      </div>
    </header>
  );
}

function TemplateLayoutPreview({
  layout,
  templateId,
  index,
  fonts,
}: {
  layout: TemplateV2Layout;
  templateId: string;
  index: number;
  fonts?: Record<string, string>;
}) {
  const layoutId =
    typeof layout.id === "string" && layout.id.trim()
      ? layout.id.trim()
      : `slide-${hashKey(JSON.stringify(layout))}`;

  const slide = {
    id: `${templateId}-${layoutId}`,
    ui: layout,
    layout: layoutId,
    layout_group: "template-v2",
    index,
  };

  return (
    <div className="main-slide relative flex w-full items-center justify-center">
      <div className="group relative w-full font-syne">
        <div className="relative w-full overflow-x-auto">
          <div className="mx-auto w-fit">
            <SlideScale
              slide={slide}
              fonts={fonts}
              isEditMode={false}
              isClickable={false}
              fixedSize
              renderIndex={index}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateLayoutList({
  layouts,
  templateId,
  fonts,
}: {
  layouts: TemplateV2Layout[];
  templateId: string;
  fonts?: Record<string, string>;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1330px] flex-col gap-10 px-6 pb-12">
      {layouts.map((layout, index) => {
        const layoutKey =
          (typeof layout.id === "string" && layout.id) ||
          (typeof layout.description === "string" && layout.description) ||
          hashKey(JSON.stringify(layout));

        return (
          <Card
            key={`${templateId}-${layoutKey}`}
            id={typeof layout.id === "string" ? layout.id : `slide-${index + 1}`}
            className="overflow-hidden shadow-md"
          >
            <div className="border-b bg-white px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {typeof layout.id === "string"
                      ? layout.id
                      : `Slide ${index + 1}`}
                  </h3>
                  {typeof layout.description === "string" && layout.description && (
                    <p className="mt-1 max-w-2xl text-sm text-gray-500">
                      {layout.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-end justify-end">
                <span className="rounded px-3 py-1 font-mono text-sm text-gray-600">
                  {templateId}:{typeof layout.id === "string" ? layout.id : index + 1}
                </span>
              </div>
            </div>

            <div className="w-full bg-white">
              <TemplateLayoutPreview
                layout={layout}
                templateId={templateId}
                index={index}
                fonts={fonts}
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function CustomTemplateLayoutList({
  layouts,
  templateParams,
}: {
  layouts: CustomTemplateLayout[];
  templateParams: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1330px] flex-col gap-10 px-6 pb-12">
      {layouts.map((layout) => {
        const LayoutComponent = layout.component;

        return (
          <Card
            key={`${templateParams}-${layout.layoutId}`}
            id={layout.layoutId}
            className="overflow-hidden shadow-md"
          >
            <div className="border-b bg-white px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {layout.rawLayoutName}
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm text-gray-500">
                    {layout.layoutDescription}
                  </p>
                </div>
              </div>
              <div className="flex items-end justify-end">
                <span className="rounded px-3 py-1 font-mono text-sm text-gray-600">
                  {templateParams}:{layout.layoutId}
                </span>
              </div>
            </div>

            <div className="flex justify-center overflow-x-auto bg-white p-6">
              <div
                className="shrink-0"
                style={{ width: "1280px", height: "720px" }}
              >
                <LayoutComponent data={layout.sampleData} />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

const GroupLayoutPreview = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const templateParams = searchParams.get("slug") || "";
  const customTemplateId = templateParams.startsWith("custom-")
    ? templateParams.slice("custom-".length)
    : "";
  const isCustom = Boolean(customTemplateId);
  const templateId = isCustom
    ? ""
    : searchParams.get("templateV2Id") || searchParams.get("id") || "";

  const {
    template,
    layouts,
    loading: templateLoading,
    error: templateError,
  } = useTemplateDetails(templateId);

  const {
    template: customTemplate,
    loading: customLoading,
    error: customError,
  } = useCustomTemplateDetails({
    id: customTemplateId,
    name: "",
    description: "",
  });

  const templateFonts = useMemo(() => {
    if (!template) return undefined;
    return normalizeTemplateV2Fonts(template);
  }, [template]);

  useEffect(() => {
    const existingScript = document.querySelector(
      'script[src*="tailwindcss.com"]',
    );
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://cdn.tailwindcss.com";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    if (!templateFonts) return;
    loadFontAssets(templateFonts);
  }, [templateFonts]);

  useEffect(() => {
    const observer = setupImageUrlConverter();
    return () => observer?.disconnect();
  }, []);

  const handleBack = useCallback(() => {
    router.push("/templates");
  }, [router]);

  const handleDeleteTemplate = useCallback(async () => {
    const idToDelete = isCustom ? customTemplateId : templateId;
    if (!idToDelete) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this template? This action cannot be undone.",
    );
    if (!confirmed) return;

    const success = isCustom
      ? await TemplateService.deleteCustomTemplate(customTemplateId)
      : await TemplateService.deleteTemplate(templateId);

    if (success.success) {
      notify.success("Template deleted", "The template was deleted successfully.");
      router.push("/templates");
    } else {
      notify.error(
        "Could not delete template",
        "Something went wrong while deleting the template.",
      );
    }
  }, [customTemplateId, isCustom, router, templateId]);

  if (!isCustom && !templateId) {
    return <TemplatePreviewNotFoundState onBack={handleBack} />;
  }

  if (isCustom ? customLoading : templateLoading) {
    return <TemplatePreviewLoadingState />;
  }

  const error = isCustom ? customError : templateError;
  if (error) {
    return <TemplatePreviewErrorState error={error} onBack={handleBack} />;
  }

  if (isCustom ? !customTemplate : !template) {
    return <TemplatePreviewNotFoundState onBack={handleBack} />;
  }

  const customTemplateName =
    (typeof customTemplate?.template?.name === "string" &&
      customTemplate.template.name) ||
    customTemplate?.name ||
    "Custom Template";
  const customTemplateDescription =
    (typeof customTemplate?.template?.description === "string" &&
      customTemplate.template.description) ||
    customTemplate?.description ||
    "";
  const templateName = isCustom
    ? customTemplateName
    : (typeof template?.name === "string" && template.name) || "Template";
  const templateDescription = isCustom
    ? customTemplateDescription
    : (typeof template?.description === "string" && template.description) || "";
  const layoutCount = isCustom ? customTemplate?.layouts.length || 0 : layouts.length;
  const canDelete = isCustom || !template?.is_default;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <TemplatePreviewHeader
        canDelete={canDelete}
        isCustomTemplate={isCustom}
        isDefaultTemplate={!isCustom && Boolean(template?.is_default)}
        layoutCount={layoutCount}
        onDelete={handleDeleteTemplate}
        pathname={pathname}
        templateDescription={templateDescription}
        templateName={templateName}
      />

      <div className="mx-auto mb-4 h-full">
        {isCustom ? (
          customTemplate && customTemplate.layouts.length > 0 ? (
            <CustomTemplateLayoutList
              layouts={customTemplate.layouts}
              templateParams={templateParams}
            />
          ) : (
            <div className="flex items-center justify-center py-24 text-gray-600">
              This template has no layouts yet.
            </div>
          )
        ) : layouts.length === 0 ? (
          <div className="flex items-center justify-center py-24 text-gray-600">
            This template has no layouts yet.
          </div>
        ) : (
          <TemplateLayoutList
            layouts={layouts}
            templateId={templateId}
            fonts={templateFonts}
          />
        )}
      </div>
    </div>
  );
};

export default GroupLayoutPreview;
