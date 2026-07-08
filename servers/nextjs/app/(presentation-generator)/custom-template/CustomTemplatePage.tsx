"use client";



import React, { useEffect, useCallback, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2, RefreshCw, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { useSelector } from "react-redux";



import { useFileUpload } from "./hooks/useFileUpload";
import { useTemplateCreation } from "./hooks/useTemplateCreation";
import { useLayoutSaving } from "./hooks/useLayoutSaving";

import type { ProcessedSlide } from "./types";
import { TAILWIND_CDN_URL } from "./constants";
import { TemplateStudioHeader } from "./components/TemplateStudioHeader";
import { TemplateCreationProgress } from "./components/TemplateCreationProgress";
import { Step2FontManagement } from "./components/steps/Step2FontManagement";
import { Step3SlidePreview } from "./components/steps/Step3SlidePreview";
import { Step4TemplateCreation } from "./components/steps/Step4TemplateCreation";
import { SaveLayoutButton } from "./components/SaveLayoutButton";
import { SaveLayoutModal } from "./components/SaveLayoutModal";
import { FileUploadSection } from "./components/FileUploadSection";
import { validateLayoutCodeForClient } from "./utils/layoutCodeValidation";

import { useFontLoader as loadFontAssets } from "../hooks/useFontLoad";
import Header from "@/app/(presentation-generator)/(dashboard)/dashboard/components/Header";
import { normalizeBackendAssetUrls } from "@/utils/api";
import type { RootState } from "@/store/store";
import {
    dismissTemplateV2ModelWarning,
    showTemplateV2ModelWarningIfNeeded,
} from "./utils/templateModelWarning";

type LibreOfficeGateState = "checking" | "ready" | "missing" | "installing" | "error";
type LibreOfficeGateSnapshot = {
    status: LibreOfficeGateState;
    message: string;
    progress?: number;
};
type LibreOfficeGateAction = {
    type: "set";
    payload: Partial<LibreOfficeGateSnapshot>;
};

function getDefaultTemplateName(file: File | null): string {
    if (!file?.name) return "";
    return file.name.replace(/\.pptx$/i, "").trim();
}

const initialLibreOfficeGate: LibreOfficeGateSnapshot = {
    status: "checking",
    message: "Checking LibreOffice availability...",
};

function libreOfficeGateReducer(
    state: LibreOfficeGateSnapshot,
    action: LibreOfficeGateAction,
): LibreOfficeGateSnapshot {
    if (action.type === "set") {
        return { ...state, ...action.payload };
    }
    return state;
}







type CustomTemplatePageProps = {
    useTemplateV2Generation?: boolean;
};

const CustomTemplatePage = ({
    useTemplateV2Generation = false,
}: CustomTemplatePageProps) => {
    const router = useRouter();
    const llmConfig = useSelector((state: RootState) => state.userConfig.llm_config);

    const [schemaEditorSlideIndex, setSchemaEditorSlideIndex] = useState<number | null>(null);
    const [schemaPreviewData, setSchemaPreviewData] = useState<Record<number, Record<string, any>>>({});



    const { selectedFile, handleFileSelect, removeFile } = useFileUpload();


    const {
        state,
        uploadedFonts,
        slides,
        setSlides,
        completedSlides,
        checkFonts,
        uploadFont,
        removeFont,
        fontUploadAndPreview,
        initTemplateCreation,
        retrySlide,
    } = useTemplateCreation({ useTemplateV2Generation });

    // Layout saving hook
    const {
        isSavingLayout,
        isModalOpen,
        openSaveModal,
        closeSaveModal,
        saveLayout,
    } = useLayoutSaving(slides);


    useEffect(() => {
        if (useTemplateV2Generation) {
            showTemplateV2ModelWarningIfNeeded(llmConfig);
        }

        return () => {
            dismissTemplateV2ModelWarning();
        };
    }, [llmConfig, useTemplateV2Generation]);

    useEffect(() => {
        const existingScript = document.querySelector('script[src*="tailwindcss.com"]');
        if (!existingScript) {
            const script = document.createElement("script");
            script.src = TAILWIND_CDN_URL;
            script.async = true;
            document.head.appendChild(script);
        }
    }, []);

    /**
     * Step 1: Check fonts in uploaded PPTX
     */
    const handleCheckFonts = useCallback(async () => {


        if (selectedFile) {
            await checkFonts(selectedFile);
        }
    }, [selectedFile, checkFonts]);

    /**
     * Step 2: Upload fonts and generate preview
     */
    const handleFontUploadAndPreview = useCallback(async () => {
        if (selectedFile) {
            const data = await fontUploadAndPreview(selectedFile);
            if (data) {

                const normalizedFonts = normalizeBackendAssetUrls(data.fonts);

                loadFontAssets(normalizedFonts);
            }
        }
    }, [selectedFile, fontUploadAndPreview]);

    /**
     * Step 5: Save template with metadata
     */
    const handleSaveTemplate = useCallback(async (
        layoutName: string,
        description: string,
        template_info_id: string
    ): Promise<string | null> => {
        const id = await saveLayout(layoutName, description, template_info_id);
        if (id) {
            router.push(`/template-preview?slug=custom-${id}`);
        }
        return id;
    }, [saveLayout, router]);

    /**
     * Update a specific slide's data
     */
    const handleSlideUpdate = useCallback((index: number, updatedSlideData: Partial<ProcessedSlide>) => {
        setSlides((prevSlides) =>
            prevSlides.map((s, i) =>
                i === index
                    ? { ...s, ...updatedSlideData, modified: true }
                    : s
            )
        );
    }, [setSlides]);

    /**
     * Open schema editor for a specific slide
     */
    const handleOpenSchemaEditor = useCallback((index: number | null) => {
        setSchemaEditorSlideIndex(index);
    }, []);

    /**
     * Close schema editor
     */
    const handleCloseSchemaEditor = useCallback(() => {
        setSchemaEditorSlideIndex(null);
    }, []);

    /**
     * Save changes from schema editor
     */
    const handleSchemaEditorSave = useCallback(async (updatedReact: string) => {
        if (schemaEditorSlideIndex !== null) {
            try {
                const validatedLayout = await validateLayoutCodeForClient(updatedReact);
                setSlides(prev => prev.map((s, i) =>
                    i === schemaEditorSlideIndex
                        ? {
                            ...s,
                            react: validatedLayout.layout_code,
                            layout_id: validatedLayout.layoutId,
                            layout_name: validatedLayout.layoutName,
                            layout_description: validatedLayout.layoutDescription,
                        }
                        : s
                ));
            } catch (error) {
                toast.error("Invalid layout code", {
                    description:
                        error instanceof Error
                            ? error.message
                            : "The schema changes produced invalid TSX.",
                });
                return;
            }
        }
        setSchemaEditorSlideIndex(null);
    }, [schemaEditorSlideIndex, setSlides]);

    /**
     * Update schema preview content (for AI fill)
     */
    const handleSchemaPreviewContent = useCallback((content: Record<string, any>) => {
        if (schemaEditorSlideIndex !== null) {
            setSchemaPreviewData(prev => ({
                ...prev,
                [schemaEditorSlideIndex]: content
            }));
        }
    }, [schemaEditorSlideIndex]);

    /**
     * Clear schema preview data for a specific slide
     */
    const handleClearSchemaPreview = useCallback((slideIndex: number) => {
        setSchemaPreviewData(prev => {
            const newData = { ...prev };
            delete newData[slideIndex];
            return newData;
        });
    }, []);



    const showFileUpload = state.step === 'file-upload';
    const showFontManager = state.step === 'font-check' || state.step === 'font-upload';
    const showPreview = state.step === 'slides-preview';
    const showSlides = state.step === 'template-creation' || state.step === 'completed';
    const isProcessingCompleted = state.step === 'completed';
    const hasV2GeneratedSlides = slides.some((slide) => slide.v2Layout);
    const defaultTemplateName = getDefaultTemplateName(selectedFile);



    return (
        <div className="relative min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">

            <div className={"pointer-events-none select-none blur-[3px]"}>
                <Header />
                <TemplateStudioHeader />
                {showFileUpload ? (
                    <div className="pb-24">
                        <FileUploadSection
                            selectedFile={selectedFile}
                            handleFileSelect={handleFileSelect}
                            removeFile={removeFile}
                            CheckFonts={handleCheckFonts}
                            isProcessingPptx={state.isLoading}
                            slides={[]}
                            completedSlides={0}
                        />

                    </div>
                ) : (
                    <div className="mx-auto min-h-[600px] px-6 pb-24">

                        <TemplateCreationProgress
                            currentStep={state.step}
                            totalSlides={state.totalSlides}
                            processedSlides={completedSlides}
                        />

                        {/* Step 2: Font Management */}
                        {showFontManager && (
                            <Step2FontManagement
                                fontsData={state.fontsData}
                                uploadedFonts={uploadedFonts}
                                uploadFont={uploadFont}
                                removeFont={removeFont}
                                onContinue={handleFontUploadAndPreview}
                                isUploading={state.isLoading}
                            />
                        )}

                        {/* Step 3: Slide Preview */}
                        {showPreview && (
                            <Step3SlidePreview
                                previewData={state.previewData}
                                onInitTemplate={initTemplateCreation}
                                isLoading={state.isLoading}
                                defaultTemplateName={defaultTemplateName}
                                requiresTemplateMetadata={useTemplateV2Generation}
                            />
                        )}

                        {/* Step 4: Template Creation & Editing */}
                        {showSlides && slides.length > 0 && (
                            <Step4TemplateCreation
                                slides={slides}
                                templateFonts={state.previewData?.fonts}
                                setSlides={setSlides}
                                retrySlide={retrySlide}
                                onSlideUpdate={handleSlideUpdate}
                                schemaEditorSlideIndex={schemaEditorSlideIndex}
                                onOpenSchemaEditor={handleOpenSchemaEditor}
                                onCloseSchemaEditor={handleCloseSchemaEditor}
                                onSchemaEditorSave={handleSchemaEditorSave}
                                schemaPreviewData={schemaPreviewData}
                                onSchemaPreviewContent={handleSchemaPreviewContent}
                                onClearSchemaPreview={handleClearSchemaPreview}
                            />
                        )}

                        {/* Floating Save Template Button */}
                        {isProcessingCompleted && !hasV2GeneratedSlides && slides.some((s) => s.processed) && (
                            <SaveLayoutButton
                                onSave={openSaveModal}
                                isSaving={isSavingLayout}
                                isProcessing={slides.some((s) => s.processing)}
                            />
                        )}

                        {/* Save Template Modal */}
                        <SaveLayoutModal
                            isOpen={isModalOpen}
                            onClose={closeSaveModal}
                            onSave={handleSaveTemplate}
                            isSaving={isSavingLayout}
                            template_info_id={state.templateId || ''}
                        />
                    </div>
                )}
            </div>


        </div>
    );
};

export default CustomTemplatePage;
