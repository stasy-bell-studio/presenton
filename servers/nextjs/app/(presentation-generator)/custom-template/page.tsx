import CustomTemplatePage from "./CustomTemplatePage";

const ENABLED_FEATURE_FLAG_VALUES = new Set(["1", "true", "yes", "on"]);

export const dynamic = "force-dynamic";

function isSlideEditorImportEnabled() {
    const value =
        process.env.USE_SLIDE_EDITOR_IMPORT ??
        process.env.NEXT_PUBLIC_USE_SLIDE_EDITOR_IMPORT ??
        "";

    return ENABLED_FEATURE_FLAG_VALUES.has(value.trim().toLowerCase());
}

export default function Page() {
    return (
        <CustomTemplatePage useSlideEditorImport={isSlideEditorImportEnabled()} />
    );
}
