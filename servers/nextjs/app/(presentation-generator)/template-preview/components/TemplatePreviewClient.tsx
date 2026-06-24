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
import { CustomTemplateLayout, useCustomTemplateDetails, useTemplateV2Details } from "@/app/hooks/useCustomTemplates";
import { templates as templateGroups, getTemplatesByTemplateName } from "@/app/presentation-templates";
import { setupImageUrlConverter } from "@/utils/image-url-converter";
import { TemplateV2LayoutPreview } from "../../custom-template/components/EachSlide/TemplateV2LayoutPreview";

type GroupLayoutPreviewProps = {
  useKonvaTemplateV2Preview?: boolean;
};

const GroupLayoutPreview = ({
  useKonvaTemplateV2Preview = false,
}: GroupLayoutPreviewProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const templateParams = searchParams.get("slug") || "";
  const templateV2Id = searchParams.get("templateV2Id") || "";
  const isTemplateV2 = Boolean(templateV2Id);

  const isCustom = !isTemplateV2 && templateParams.startsWith("custom-");
  const customTemplateId = isCustom ? templateParams.split("custom-")[1] : null;

  const staticTemplates = !isCustom && !isTemplateV2 ? getTemplatesByTemplateName(templateParams) : [];
  const staticGroup = !isCustom && !isTemplateV2 ? templateGroups.find((g: { id: string }) => g.id === templateParams) : null;

  const {
    template: customTemplate,
    loading: customLoading,
    error: customError,
  } = useCustomTemplateDetails({ id: templateParams?.split("custom-")[1] || "", name: "", description: "" });
  const {
    template: templateV2,
    layouts: templateV2Layouts,
    loading: templateV2Loading,
    error: templateV2Error,
  } = useTemplateV2Details(templateV2Id);

  useEffect(() => {
    const existingScript = document.querySelector('script[src*="tailwindcss.com"]');
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://cdn.tailwindcss.com";
      script.async = true;
      document.head.appendChild(script);
    }
  }, [templateParams]);

  // Keep backend-served assets on the active origin in Docker/nginx preview mode.
  useEffect(() => {
    const observer = setupImageUrlConverter();
    return () => observer?.disconnect();
  }, []);

  const handleDeleteCustomTemplate = async () => {
    if (!customTemplateId) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this template? This action cannot be undone."
    );
    if (!confirmed) return;

    const success = await TemplateService.deleteCustomTemplate(customTemplateId);
    if (success.success) {
      notify.success("Template deleted", "The template was deleted successfully.");
      router.push("/templates");
    } else {
      notify.error("Could not delete template", "Something went wrong while deleting the template.");
    }
  };

  const handleDeleteTemplateV2 = async () => {
    if (!templateV2Id) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this template? This action cannot be undone."
    );
    if (!confirmed) return;

    const success = await TemplateService.deleteTemplateV2(templateV2Id);
    if (success.success) {
      notify.success("Template deleted", "The template was deleted successfully.");
      router.push("/templates");
    } else {
      notify.error("Could not delete template", "Something went wrong while deleting the template.");
    }
  };

  if ((isCustom && customLoading) || (isTemplateV2 && templateV2Loading)) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-3 text-gray-600">Compiling templates...</span>
        </div>
      </div>
    );
  }

  if ((isCustom && customError) || (isTemplateV2 && templateV2Error)) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex flex-col items-center justify-center py-24">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error loading template</h2>
          <p className="text-gray-600 mb-4">{customError || templateV2Error}</p>
          <Button onClick={() => router.push("/templates")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Templates
          </Button>
        </div>
      </div>
    );
  }

  if (
    (!isCustom && !isTemplateV2 && (!staticGroup || staticTemplates.length === 0)) ||
    (isCustom && !customTemplate) ||
    (isTemplateV2 && !templateV2)
  ) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex flex-col items-center justify-center py-24">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Template not found
          </h2>
          <Button onClick={() => router.push("/templates")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Templates
          </Button>
        </div>
      </div>
    );
  }

  const templateName = isTemplateV2
    ? templateV2?.name || "Custom Template"
    : isCustom ? customTemplate?.template.name || "Custom Template" : staticGroup?.name || "";
  const templateDescription = isCustom
    ? customTemplate?.template.description || ""
    : isTemplateV2 ? templateV2?.description || "" : staticGroup?.description || "";
  const layoutCount = isTemplateV2
    ? templateV2Layouts.length
    : isCustom
    ? customTemplate?.layouts.length || 0
    : staticTemplates.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <header className=" z-30">
        <div className=" mx-auto px-6 pb-[30px]">
          <div className="flex items-center justify-between mb-4 max-w-[1440px] mx-auto">


            {(isCustom || isTemplateV2) && (
              <div className="flex items-center justify-end ml-auto mr-0 gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    trackEvent(MixpanelEvent.TemplatePreview_Delete_Templates_Button_Clicked, { pathname });
                    trackEvent(MixpanelEvent.TemplatePreview_Delete_Templates_API_Call);
                    if (isTemplateV2) {
                      handleDeleteTemplateV2();
                    } else {
                      handleDeleteCustomTemplate();
                    }
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
              <h1 className="text-[64px] font-bold text-gray-900">{templateName}</h1>
              {(isCustom || isTemplateV2) && (
                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-sm">
                  {isTemplateV2 ? "Templates V2" : "Custom"}
                </span>
              )}
            </div>
            <p className="text-gray-600 text-xl">
              {layoutCount} layout{layoutCount !== 1 ? "s" : ""} •{" "}
              {templateDescription}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto h-full mb-4" >
        {!isCustom && !isTemplateV2 && (
          <div className="space-y-3   w-[1305px] p-2.5 bg-[#FFFFFF1A] rounded-[20px]  border border-[#EDECEC]  mx-auto"
            style={{
              boxShadow: "0 0 20px 0 rgba(122, 90, 248, 0.16) inset",

            }}
          >
            {staticTemplates.map((template: any, index: number) => {
              const LayoutComponent = template.component;

              return (
                <div
                  key={`${templateParams}-${template.layoutId}-${index}`}
                  id={template.layoutId}
                  className="overflow-hidden   rounded-tl-[10px] border border-[#EDEEEF] rounded-tr-[10px]"
                >
                  <div className=" px-4 py-6 bg-white border-b border-[#EDEEEF] ">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="px-3 py-1 bg-[#7A5AF8] text-white  font-syne  rounded-full text-sm font-medium">
                          {index + 1 < 10 ? `0${index + 1}` : index + 1}
                        </span>
                        <h3 className="text-xl font-semibold text-gray-900 mt-3">
                          {template.layoutName}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1 ">
                          {template.layoutDescription}
                        </p>
                      </div>
                      {/* <div className="flex items-center gap-3">
                        <span className="px-3 py-1  text-gray-600 rounded text-sm font-mono">
                          {template.layoutId}
                        </span>
                        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                          #{index + 1}
                        </span>
                      </div> */}
                    </div>
                  </div>

                  <div className="  flex justify-center overflow-x-auto">
                    <div
                      className="flex-shrink-0"
                      style={{ width: "1280px", height: "720px" }}
                    >
                      <LayoutComponent data={template.sampleData} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isTemplateV2 && (
          <div className="flex flex-col items-center justify-center w-full gap-10 aspect-video mx-auto">
            {templateV2Layouts.map((layout, index) => (
              <Card
                key={`${templateV2Id}-${layout.id || index}`}
                id={layout.id || `slide-${index + 1}`}
                className="overflow-hidden shadow-md"
              >
                <div className="bg-white px-6 py-4 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">
                        {layout.id || `Slide ${index + 1}`}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                        {layout.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-end justify-end ">
                    <span className="px-3 py-1 text-gray-600 rounded text-sm font-mono">
                      {templateV2Id}:{layout.id || index + 1}
                    </span>
                  </div>
                </div>

                <div className="p-6 flex justify-center overflow-x-auto">
                  <TemplateV2LayoutPreview
                    layout={layout}
                    useKonvaRenderer={useKonvaTemplateV2Preview}
                  />
                </div>
              </Card>
            ))}
          </div>
        )}

        {isCustom && (
          <div className="flex flex-col items-center justify-center w-full gap-10 aspect-video mx-auto">
            {customTemplate && customTemplate.layouts.map((layout: CustomTemplateLayout, index: number) => {
              const LayoutComponent = layout.component;
              return (
                <Card
                  key={`${templateParams}-${layout.layoutId}-${index}`}
                  id={layout.layoutId}
                  className="overflow-hidden shadow-md"
                >
                  <div className="bg-white px-6 py-4 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900">
                          {layout.rawLayoutName}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                          {layout.layoutDescription}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-end justify-end ">
                      <span className="px-3 py-1  text-gray-600 rounded text-sm font-mono">
                        {templateParams}:{layout.layoutId}
                      </span>
                    </div>
                  </div>

                  <div className=" p-6 flex justify-center overflow-x-auto">
                    <div
                      className="flex-shrink-0"
                      style={{ width: "1280px", height: "720px" }}
                    >
                      <LayoutComponent data={layout.sampleData} />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default GroupLayoutPreview;
