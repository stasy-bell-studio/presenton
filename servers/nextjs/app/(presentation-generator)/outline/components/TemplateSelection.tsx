"use client";
import React, { useEffect, memo, useState } from "react";
import CreateCustomTemplate from "../../(dashboard)/templates/components/CreateCustomTemplate";
import { useTemplateSummaries, TemplateTab } from "../../hooks/useTemplateSummaries";
import {
  TemplateListCard,
  TemplateTabSwitcher,
  TemplateListLoadingState,
  TemplateListEmptyState,
} from "../../components/TemplateListUi";

interface TemplateSelectionProps {
  selectedTemplateId: string | null;
  onSelectTemplateId: (templateId: string) => void;
}

const TemplateSelection: React.FC<TemplateSelectionProps> = memo(
  function TemplateSelection({ selectedTemplateId, onSelectTemplateId }) {
    const [tab, setTab] = useState<TemplateTab>("default");
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

    const activeTemplates = tab === "default" ? defaultTemplates : customTemplates;

    return (
      <div className="mb-4 space-y-6">
        <TemplateTabSwitcher tab={tab} onTabChange={setTab} />

        {tab === "custom" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <CreateCustomTemplate />
            {customTemplates.map((template) => (
              <TemplateListCard
                key={template.id}
                template={template}
                isSelected={selectedTemplateId === template.id}
                onClick={() => onSelectTemplateId(template.id)}
              />
            ))}
          </div>
        )}

        {tab === "default" && (
          <>
            {activeTemplates.length === 0 ? (
              <TemplateListEmptyState message="No built-in templates available." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {activeTemplates.map((template) => (
                  <TemplateListCard
                    key={template.id}
                    template={template}
                    isSelected={selectedTemplateId === template.id}
                    onClick={() => onSelectTemplateId(template.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }
);

export default TemplateSelection;
