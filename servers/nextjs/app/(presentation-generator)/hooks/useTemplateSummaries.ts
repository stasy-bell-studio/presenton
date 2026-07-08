"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import TemplateService, {
  TemplateListItem,
} from "../services/api/template";

export type TemplateTab = "custom" | "default";

export function splitTemplatesByDefault(templates: TemplateListItem[]) {
  const defaultTemplates = templates.filter((template) => template.is_default);
  const customTemplates = templates.filter((template) => !template.is_default);
  return { defaultTemplates, customTemplates };
}

export function useTemplateSummaries() {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadTemplates = async () => {
      setLoading(true);
      try {
        const response = await TemplateService.getTemplateSummaries();
        if (!cancelled) {
          setTemplates(response.items ?? []);
        }
      } catch (error) {
        console.error("Failed to load templates", error);
        if (!cancelled) {
          toast.error("Failed to load templates");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, []);

  const { defaultTemplates, customTemplates } = useMemo(
    () => splitTemplatesByDefault(templates),
    [templates]
  );

  return {
    templates,
    defaultTemplates,
    customTemplates,
    loading,
  };
}
