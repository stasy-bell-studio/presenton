import React, { Suspense } from "react";
import { Loader2 } from "lucide-react";
import GroupLayoutPreview from "./components/TemplatePreviewClient";

const ENABLED_FEATURE_FLAG_VALUES = new Set(["1", "true", "yes", "on"]);

export const dynamic = "force-dynamic";

function isSlideEditorImportEnabled() {
  const value =
    process.env.USE_SLIDE_EDITOR_IMPORT ??
    process.env.NEXT_PUBLIC_USE_SLIDE_EDITOR_IMPORT ??
    "";

  return ENABLED_FEATURE_FLAG_VALUES.has(value.trim().toLowerCase());
}

const TemplatePreviewPage = () => {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>}>
      <GroupLayoutPreview
        useKonvaTemplateV2Preview={isSlideEditorImportEnabled()}
      />
    </Suspense>
  );
};

export default TemplatePreviewPage;
