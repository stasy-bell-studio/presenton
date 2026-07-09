"use client";
import React, { useEffect, memo } from "react";
import CreateCustomTemplate from "../../(dashboard)/templates/components/CreateCustomTemplate";
import { useTemplateSummaries } from "../../hooks/useTemplateSummaries";
import {
  TemplateListCard,
  TemplateListLoadingState,
  TemplateListEmptyState,
  TemplateListSection,
} from "../../components/TemplateListUi";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";

interface TemplateSelectionProps {
  presentationId: string | null;
  selectedTemplateId: string | null;
  onSelectTemplateId: (templateId: string) => void;
}

const TemplateSelection: React.FC<TemplateSelectionProps> = memo(
  function TemplateSelection({
    presentationId,
    selectedTemplateId,
    onSelectTemplateId,
  }) {
    const { defaultTemplates, customTemplates, loading } = useTemplateSummaries();

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

    if (loading) {
      return <TemplateListLoadingState />;
    }

    return (
      <div className="mb-4 space-y-8">
        <TemplateListSection label="Custom">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <CreateCustomTemplate />
            {customTemplates.map((template) => (
              <TemplateListCard
                key={template.id}
                template={template}
                isSelected={selectedTemplateId === template.id}
                onClick={() => {
                  trackEvent(MixpanelEvent.TemplateV2_Template_Selected, {
                    presentation_id: presentationId,
                    template_id: template.id,
                    template_source: "custom",
                  });
                  onSelectTemplateId(template.id);
                }}
              />
            ))}
          </div>
        </TemplateListSection>

        <TemplateListSection label="Default">
          {defaultTemplates.length === 0 ? (
            <TemplateListEmptyState message="No built-in templates available." />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {defaultTemplates.map((template) => (
                <TemplateListCard
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplateId === template.id}
                  onClick={() => {
                    trackEvent(MixpanelEvent.TemplateV2_Template_Selected, {
                      presentation_id: presentationId,
                      template_id: template.id,
                      template_source: "default",
                    });
                    onSelectTemplateId(template.id);
                  }}
                />
              ))}
            </div>
          )}
        </TemplateListSection>
      </div>
    );
  }
);

export default TemplateSelection;
