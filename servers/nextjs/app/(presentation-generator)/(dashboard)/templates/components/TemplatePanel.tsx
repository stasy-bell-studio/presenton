"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronRight, Loader2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
    CustomTemplates,
    useCustomTemplatePreview,
    useCustomTemplateSummaries,
} from "@/app/hooks/useCustomTemplates";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import {
    CustomTemplatePreview,
    LayoutsBadge,
    TemplatePreviewStage,
} from "../../../components/TemplatePreviewComponents";
import CreateCustomTemplate from "./CreateCustomTemplate";

function TemplateV2ThumbnailPreview({
    thumbnail,
    templateName,
}: {
    thumbnail?: string;
    templateName: string;
}) {
    if (!thumbnail) {
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
                style={{ backgroundImage: `url(${JSON.stringify(thumbnail)})` }}
            />
        </div>
    );
}

export const CustomTemplateCard = React.memo(
    function CustomTemplateCard({ template }: { template: CustomTemplates }) {
        const router = useRouter();
        const isTemplateV2 = template.source === "v2";
        const { previewLayouts, loading } = useCustomTemplatePreview(template.id, {
            enabled: !isTemplateV2,
        });

        const handleOpen = useCallback(() => {
            trackEvent(MixpanelEvent.Templates_Custom_Opened, {
                template_id: template.id,
                template_name: template.name,
            });

            if (isTemplateV2) {
                router.push(`/template-preview?templateV2Id=${template.id}`);
                return;
            }

            router.push(`/template-preview?slug=custom-${template.id}`);
        }, [isTemplateV2, router, template.id, template.name]);

        return (
            <Card
                className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[22px] border border-[#E8E9EC] bg-white shadow-none transition-all duration-200 hover:shadow-sm sm:shadow-none"
                onClick={handleOpen}
            >
                <TemplatePreviewStage>
                    <LayoutsBadge count={template.layoutCount} />
                    {isTemplateV2 ? (
                        <TemplateV2ThumbnailPreview
                            thumbnail={template.thumbnail}
                            templateName={template.name}
                        />
                    ) : (
                        <CustomTemplatePreview
                            previewLayouts={previewLayouts}
                            loading={loading}
                            templateId={template.id}
                        />
                    )}
                </TemplatePreviewStage>
                <div className="relative z-40 flex items-center justify-between border-t border-[#EDEEEF] bg-white px-6 py-5">
                    <h3 className="max-w-[min(191px,65%)] text-base font-bold text-gray-900">
                        {template.name}
                    </h3>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-400 transition-colors group-hover:text-purple-600" />
                </div>
            </Card>
        );
    },
    (prev, next) =>
        prev.template.id === next.template.id &&
        prev.template.name === next.template.name &&
        prev.template.thumbnail === next.template.thumbnail &&
        prev.template.layoutCount === next.template.layoutCount &&
        prev.template.source === next.template.source,
);

const LayoutPreview = ({
    useTemplateV2Templates = false,
}: {
    useTemplateV2Templates?: boolean;
}) => {
    const { templates: customTemplates, loading: customLoading } = useCustomTemplateSummaries({
        useTemplateV2: useTemplateV2Templates,
    });

    useEffect(() => {
        trackEvent(MixpanelEvent.Templates_Page_Viewed);
        const existingScript = document.querySelector('script[src*="tailwindcss.com"]');
        if (!existingScript) {
            const script = document.createElement("script");
            script.src = "https://cdn.tailwindcss.com";
            script.async = true;
            document.head.appendChild(script);
        }
    }, []);

    const customTemplateCards = useMemo(
        () =>
            customTemplates.map((template: CustomTemplates) => (
                <CustomTemplateCard key={template.id} template={template} />
            )),
        [customTemplates],
    );

    return (
        <div className="relative min-h-screen font-syne">
            <div className="sticky right-0 top-0 z-50 px-6 py-[28px] backdrop-blur">
                <div className="flex flex-col items-center justify-between gap-6 xl:flex-row xl:gap-0">
                    <h3 className="flex items-center gap-2 font-unbounded text-[28px] font-normal tracking-[-0.84px] text-[#101828]">
                        Templates
                    </h3>
                    <div className="flex gap-2.5 max-sm:w-full max-sm:flex-wrap max-md:justify-center">
                        <Link
                            href="/custom-template"
                            onClick={() =>
                                trackEvent(MixpanelEvent.Templates_New_Template_Clicked)
                            }
                            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-syne text-sm font-semibold text-black shadow-sm hover:shadow-md"
                            aria-label="Create new template"
                            style={{
                                borderRadius: "48px",
                                background:
                                    "linear-gradient(270deg, #D5CAFC 2.4%, #E3D2EB 27.88%, #F4DCD3 69.23%, #FDE4C2 100%)",
                            }}
                        >
                            <span className="hidden md:inline">New Template</span>
                            <span className="md:hidden">New</span>
                            <ChevronRight className="h-4 w-4" />
                        </Link>
                    </div>
                </div>
            </div>

            <div className="l mx-auto px-6 py-8">
                <section className="my-12">
                    {customLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                            <span className="ml-3 text-gray-600">Loading templates...</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-2 lg:grid-cols-4">
                            <CreateCustomTemplate />
                            {customTemplateCards}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default LayoutPreview;
