import { useState, useCallback, useRef } from "react";
import { notify } from "@/components/ui/sonner";
import { getHeader, getHeaderForFormData } from "@/app/(presentation-generator)/services/api/header";
import { ApiResponseHandler } from "@/app/(presentation-generator)/services/api/api-error-handler";
import {
    TemplateCreationState,
    FontData,
    FontUploadPreviewResponse,
    SlideLayoutResponse,
    UploadedFont,
    ProcessedSlide,
    TemplateV2ImportResponse,
    TemplateV2Layout,
    TemplateCreationMetadata,
} from "../types";
import { getApiUrl } from "@/utils/api";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";
import { validateLayoutCodeForClient } from "../utils/layoutCodeValidation";

/** Must match `VISION_LAYOUT_ERROR_MARKER` in FastAPI `utils/template_vision_errors.py`. */
const TEMPLATE_VISION_MODEL_MARKER = "TEMPLATE_VISION_MODEL_REQUIRED";

const initialState: TemplateCreationState = {
    step: 'file-upload',
    isLoading: false,
    error: null,
    fontsData: null,
    previewData: null,
    templateId: null,
    totalSlides: 0,
    slideLayouts: [],
    currentSlideIndex: 0,
};

function readTemplateV2Id(template: TemplateV2ImportResponse): string | null {
    return typeof template.id === "string" ? template.id : null;
}

function normalizeTemplateMetadata(
    metadata?: TemplateCreationMetadata | null
): TemplateCreationMetadata | null {
    const name = metadata?.name?.trim();
    if (!name) return null;

    const description = metadata?.description?.trim();
    return {
        name,
        ...(description ? { description } : {}),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractTemplateV2Layouts(value: unknown): TemplateV2Layout[] {
    if (Array.isArray(value)) {
        return value.filter(isRecord) as TemplateV2Layout[];
    }

    if (isRecord(value) && Array.isArray(value.layouts)) {
        return value.layouts.filter(isRecord) as TemplateV2Layout[];
    }

    return [];
}

function getRenderableTemplateV2Layouts(
    template: TemplateV2ImportResponse
): TemplateV2Layout[] {
    const layouts = extractTemplateV2Layouts(template.layouts);
    if (layouts.length > 0) return layouts;
    return extractTemplateV2Layouts(template.raw_layouts);
}

type UseTemplateCreationOptions = {
    useTemplateV2Generation?: boolean;
};

export const useTemplateCreation = ({
    useTemplateV2Generation = false,
}: UseTemplateCreationOptions = {}) => {
    const [state, setState] = useState<TemplateCreationState>(initialState);
    const [uploadedFonts, setUploadedFonts] = useState<UploadedFont[]>([]);
    const [slides, setSlides] = useState<ProcessedSlide[]>([]);
    const templateMetadataRef = useRef<TemplateCreationMetadata | null>(null);

    // Helper to update state partially
    const updateState = useCallback((updates: Partial<TemplateCreationState>) => {
        setState(prev => ({ ...prev, ...updates }));
    }, []);

    // Reset to initial state
    const reset = useCallback(() => {
        setState(initialState);
        setUploadedFonts([]);
        setSlides([]);
        templateMetadataRef.current = null;
    }, []);

    // Step 1: Check fonts in PPTX file
    const checkFonts = useCallback(async (pptxFile: File): Promise<FontData | null> => {
        updateState({ isLoading: true, error: null });

        try {
            const extensionIndex = pptxFile.name.lastIndexOf(".");
            const fileExtension = extensionIndex >= 0 ? pptxFile.name.slice(extensionIndex).toLowerCase() : "";
            trackEvent(MixpanelEvent.CustomTemplate_Creation_Started, {
                source: "pptx_upload",
                file_name: pptxFile.name,
                file_size_bytes: pptxFile.size,
                file_extension: fileExtension,
            });
            const formData = new FormData();
            formData.append("pptx_file", pptxFile);

            const response = await fetch(getApiUrl(`/api/v1/ppt/fonts/check`), {
                method: "POST",
                headers: getHeaderForFormData(),
                body: formData,
            });

            const data = await ApiResponseHandler.handleResponse(
                response,
                "Failed to check fonts in the presentation"
            );

            updateState({
                fontsData: data,
                step: 'font-check',
                isLoading: false
            });

            return data;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Font check failed";
            updateState({ error: errorMessage, isLoading: false });
            notify.error("Font check failed", errorMessage);
            return null;
        }
    }, [updateState]);


    const uploadFont = useCallback((fontName: string, file: File): string | null => {
        // Check if font is already added
        const existingFont = uploadedFonts.find((f) => f.fontName === fontName);
        if (existingFont) {
            notify.warning("Font already added", `Font "${fontName}" is already in your upload list.`);
            return fontName;
        }

        // Validate file type
        const validExtensions = [".ttf", ".otf", ".woff", ".woff2", ".eot"];
        const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf("."));

        if (!validExtensions.includes(fileExtension)) {
            notify.error("Invalid font file", "Please upload .ttf, .otf, .woff, .woff2, or .eot files.");
            return null;
        }

        // Validate file size (10MB limit)
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            notify.error("File too large", "Font file size must be less than 10MB.");
            return null;
        }

        // Store font locally
        const newFont: UploadedFont = {
            fontName: fontName,
            fontUrl: '', // Will be set after upload
            fontPath: '',
            file: file,
        };

        setUploadedFonts(prev => [...prev, newFont]);
        notify.success("Font added", `Font "${fontName}" was added successfully.`);
        return fontName;
    }, [uploadedFonts]);

    // Remove a font
    const removeFont = useCallback((fontName: string) => {
        setUploadedFonts(prev => prev.filter(font => font.fontName !== fontName));
        notify.info("Font removed", "The font was removed from your upload list.");
    }, []);

    // Get all unsupported fonts that need upload
    const getUnsupportedFonts = useCallback((): string[] => {
        if (!state.fontsData?.unavailable_fonts) {
            return [];
        }
        return state.fontsData.unavailable_fonts
            .map((font) => font.name)
            .filter(
                (fontName) =>
                    !uploadedFonts.some(
                        (uploaded) =>
                            uploaded.fontName === fontName ||
                            uploaded.fontName ===
                                state.fontsData?.unavailable_fonts.find(
                                    (f) => f.name === fontName
                                )?.original_name
                    )
            );
    }, [state.fontsData, uploadedFonts]);

    // Check if all required fonts are uploaded
    const allFontsUploaded = useCallback((): boolean => {
        return getUnsupportedFonts().length === 0;
    }, [getUnsupportedFonts]);

    // Step 2: Upload fonts and get slide preview
    const fontUploadAndPreview = useCallback(async (
        pptxFile: File
    ): Promise<FontUploadPreviewResponse | null> => {
        updateState({ isLoading: true, error: null, step: 'font-upload' });

        try {
            const formData = new FormData();
            formData.append("pptx_file", pptxFile);

            // Add uploaded font files (actual File objects)
            uploadedFonts.forEach(font => {
                formData.append("font_files", font.file);
                formData.append("original_font_names", font.fontName);
            });

            const response = await fetch(
                getApiUrl(`/api/v1/ppt/template/fonts-upload-and-slides-preview`),
                {
                    method: "POST",
                    headers: getHeaderForFormData(),
                    body: formData,
                }
            );

            const data = await ApiResponseHandler.handleResponse(
                response,
                "Failed to upload fonts and preview slides"
            );

            updateState({
                previewData: data,
                step: 'slides-preview',
                isLoading: false
            });

            notify.success("Preview generated", "Slides preview was generated successfully.");
            return data;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Preview generation failed";
            updateState({ error: errorMessage, isLoading: false });
            notify.error("Preview failed", errorMessage);
            return null;
        }
    }, [uploadedFonts, updateState]);

    const generateTemplateV2 = useCallback(async (
        previewData: FontUploadPreviewResponse,
        options: {
            retrySlideIndex?: number;
            metadata?: TemplateCreationMetadata | null;
        } = {}
    ): Promise<string | null> => {
        const metadata = normalizeTemplateMetadata(options.metadata)
            ?? templateMetadataRef.current;
        const initialSlides: ProcessedSlide[] = previewData.slide_image_urls.map(
            (url, index) => ({
                slide_number: index + 1,
                screenshot_url: url,
                processing: true,
                processed: false,
                error: undefined,
            })
        );

        setSlides(initialSlides);
        updateState({
            isLoading: true,
            error: null,
            step: 'template-creation',
            totalSlides: initialSlides.length,
            currentSlideIndex: 0,
        });

        try {
            trackEvent(MixpanelEvent.CustomTemplate_Creation_Started, {
                source: options.retrySlideIndex === undefined
                    ? "template_v2_create"
                    : "template_v2_retry",
                retry_slide_index: options.retrySlideIndex,
                total_slides: previewData.slide_image_urls.length,
                uploaded_font_count: Object.keys(previewData.fonts ?? {}).length,
            });

            const response = await fetch(getApiUrl("/api/v2/templates"), {
                method: "POST",
                headers: getHeader(),
                body: JSON.stringify({
                    pptx_url: previewData.modified_pptx_url,
                    slide_image_urls: previewData.slide_image_urls,
                    fonts: previewData.fonts,
                    ...(metadata ? { name: metadata.name } : {}),
                    ...(metadata?.description ? { description: metadata.description } : {}),
                }),
            });

            const template = (await ApiResponseHandler.handleResponse(
                response,
                "Failed to generate template"
            )) as TemplateV2ImportResponse;
            const layouts = getRenderableTemplateV2Layouts(template);
            const templateId = readTemplateV2Id(template);

            const generatedSlides: ProcessedSlide[] = previewData.slide_image_urls.map(
                (url, index) => {
                    const layout = layouts[index];
                    const layoutId = typeof layout?.id === "string" ? layout.id : null;
                    const layoutDescription = typeof layout?.description === "string"
                        ? layout.description
                        : "Generated with Templates V2";

                    return {
                        slide_number: index + 1,
                        screenshot_url: url,
                        processing: false,
                        processed: Boolean(layout),
                        v2Layout: layout,
                        template_v2_id: templateId ?? undefined,
                        layout_id: layoutId || `slide_${index + 1}`,
                        layout_name: layoutId || `Slide ${index + 1}`,
                        layout_description: layoutDescription,
                        error: layout ? undefined : "No generated layout was returned for this slide.",
                    };
                }
            );

            updateState({
                templateId,
                totalSlides: generatedSlides.length,
                currentSlideIndex: 0,
            });

            for (let index = 0; index < generatedSlides.length; index += 1) {
                if (index > 0) {
                    await new Promise((resolve) => setTimeout(resolve, 150));
                }
                updateState({ currentSlideIndex: index });
                setSlides((current) =>
                    current.map((slide, slideIndex) =>
                        slideIndex === index ? generatedSlides[index] : slide
                    )
                );
            }

            const failedCount = generatedSlides.filter((slide) => Boolean(slide.error)).length;
            const processedCount = generatedSlides.filter((slide) => slide.processed).length;
            updateState({
                step: 'completed',
                isLoading: false,
            });
            trackEvent(MixpanelEvent.CustomTemplate_Creation_Completed, {
                template_id: templateId,
                template_version: "v2",
                total_slides: generatedSlides.length,
                processed_slides: processedCount,
                failed_slides: failedCount,
            });

            if (failedCount > 0) {
                notify.warning(
                    "Some slides could not be generated",
                    `${processedCount} of ${generatedSlides.length} slides were generated.`
                );
            } else {
                notify.success(
                    "Template generated",
                    "The template was generated and saved successfully."
                );
            }

            return templateId;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Template generation failed";
            updateState({ error: errorMessage, isLoading: false });
            setSlides((current) =>
                (current.length ? current : initialSlides).map((slide) => ({
                    ...slide,
                    processing: false,
                    processed: false,
                    error: errorMessage,
                }))
            );
            notify.error("Generation failed", errorMessage);
            return null;
        }
    }, [updateState]);

    // Step 4: Create slide layout for a specific slide (with auto-advance for initial processing)
    const createSlideLayout = useCallback(async (
        templateId: string,
        slideIndex: number,
        autoAdvance: boolean = true,
        _isAutoRetry: boolean = false
    ): Promise<SlideLayoutResponse | null> => {
        // Mark slide as processing
        setSlides(prev => prev.map((s, i) =>
            i === slideIndex ? { ...s, processing: true, error: undefined } : s
        ));

        updateState({ currentSlideIndex: slideIndex });

        try {
            const startResponse = await fetch(
                getApiUrl(`/api/v1/ppt/template/slide-layout/create/start`),
                {
                    method: "POST",
                    headers: getHeader(),
                    body: JSON.stringify({
                        id: templateId,
                        index: slideIndex,
                    }),
                }
            );

            const startData = await ApiResponseHandler.handleResponse(
                startResponse,
                `Failed to start layout job for slide ${slideIndex + 1}`
            );
            const jobId = startData.job_id as string;

            const pollMs = 2000;
            const maxWaitMs = 45 * 60 * 1000;
            const deadline = Date.now() + maxWaitMs;
            let data: { react_component: string } | undefined;

            while (Date.now() < deadline) {
                const statusResponse = await fetch(
                    getApiUrl(`/api/v1/ppt/template/slide-layout/create/job/${encodeURIComponent(jobId)}`),
                    { headers: getHeader() }
                );
                const statusData = await ApiResponseHandler.handleResponse(
                    statusResponse,
                    `Failed to check layout job for slide ${slideIndex + 1}`
                );
                if (statusData.status === "complete" && statusData.react_component) {
                    data = { react_component: statusData.react_component };
                    break;
                }
                if (statusData.status === "failed") {
                    throw new Error(
                        statusData.error ||
                            `Layout generation failed for slide ${slideIndex + 1}`
                    );
                }
                await new Promise((r) => setTimeout(r, pollMs));
            }

            if (!data) {
                throw new Error(
                    "Timed out waiting for slide layout generation (exceeded 45 minutes)"
                );
            }

            const validatedLayout = await validateLayoutCodeForClient(data.react_component);
            const layoutResult: SlideLayoutResponse = {
                slide_index: slideIndex,
                react_component: validatedLayout.layout_code,
                layout_id: validatedLayout.layoutId,
                layout_name: validatedLayout.layoutName,
                layout_description: validatedLayout.layoutDescription,
            };

            // Update slide with the react component
            setSlides(prev => {
                const newSlides = prev.map((s, i) =>
                    i === slideIndex ? {
                        ...s,
                        processing: false,
                        processed: true,
                        react: layoutResult.react_component,
                        layout_id: layoutResult.layout_id || undefined,
                        layout_name: layoutResult.layout_name || undefined,
                        layout_description: layoutResult.layout_description || undefined,
                    } : s
                );

                // Only auto-advance during initial processing
                if (autoAdvance) {
                    const nextIndex = slideIndex + 1;
                    if (nextIndex < newSlides.length && !newSlides[nextIndex].processed) {
                        setTimeout(() => {
                            createSlideLayout(templateId, nextIndex, true);
                        }, 500);
                    } else {
                        // Check if all slides are processed
                        const allProcessed = newSlides.every(s => s.processed || s.error);
                        if (allProcessed) {
                            updateState({ step: 'completed' });
                            trackEvent(MixpanelEvent.CustomTemplate_Creation_Completed, {
                                template_id: templateId,
                                total_slides: newSlides.length,
                                processed_slides: newSlides.filter(s => s.processed).length,
                                failed_slides: newSlides.filter(s => Boolean(s.error)).length,
                            });
                            const failedCount = newSlides.filter(s => Boolean(s.error)).length;
                            const processedCount = newSlides.filter(s => s.processed).length;
                            if (failedCount > 0) {
                                notify.warning(
                                    "Some slides could not be processed",
                                    `${processedCount} of ${newSlides.length} slides were reconstructed. ${failedCount} slide(s) failed - review them and try again.`
                                );
                            } else {
                                notify.success(
                                    "All slides processed",
                                    "Every slide was reconstructed successfully."
                                );
                            }
                        }
                    }
                } else {
                    // Single slide reconstruction - just show success
                    notify.success("Slide reconstructed", `Slide ${slideIndex + 1} was reconstructed successfully.`);
                }

                return newSlides;
            });

            return layoutResult;
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : "Layout creation failed";
            const isVisionModelError = errorMessage.includes(TEMPLATE_VISION_MODEL_MARKER);

            // Auto-retry once on transient failures; vision/model capability errors won't recover.
            if (!_isAutoRetry && !isVisionModelError) {
                console.log(`Auto-retrying slide ${slideIndex + 1} after API failure...`);
                return createSlideLayout(templateId, slideIndex, autoAdvance, true);
            }

            // Mark slide with error
            setSlides(prev => {
                const newSlides = prev.map((s, i) =>
                    i === slideIndex ? { ...s, processing: false, error: errorMessage } : s
                );

                // Only auto-advance during initial processing
                if (autoAdvance) {
                    const nextIndex = slideIndex + 1;
                    if (nextIndex < newSlides.length && !newSlides[nextIndex].processed) {
                        setTimeout(() => {
                            createSlideLayout(templateId, nextIndex, true);
                        }, 500);
                    } else {
                        const allProcessed = newSlides.every(s => s.processed || s.error);
                        if (allProcessed) {
                            updateState({ step: 'completed' });
                        }
                    }
                }

                return newSlides;
            });

            if (isVisionModelError) {
                const description = errorMessage
                    .replace(TEMPLATE_VISION_MODEL_MARKER, "")
                    .trim()
                    .replace(/^\n+/, "");
                notify.error(
                    "Vision-capable text model required",
                    description ||
                        "Choose a text model that accepts images in Settings, save, and try again.",
                    { duration: 12_000 }
                );
            } else {
                notify.error(`Slide ${slideIndex + 1} failed`, errorMessage);
            }
            return null;
        }
    }, [updateState]);

    // Step 3: Initialize template creation
    const initTemplateCreation = useCallback(async (
        metadata?: TemplateCreationMetadata
    ): Promise<string | null> => {
        if (!state.previewData) {
            notify.error("No preview data", "Generate a preview before continuing.");
            return null;
        }

        const normalizedMetadata = normalizeTemplateMetadata(metadata);
        if (normalizedMetadata) {
            templateMetadataRef.current = normalizedMetadata;
        }

        if (useTemplateV2Generation) {
            return generateTemplateV2(state.previewData, {
                metadata: normalizedMetadata,
            });
        }

        updateState({ isLoading: true, error: null, step: 'template-creation' });

        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/template/create/init`), {
                method: "POST",
                headers: getHeader(),
                body: JSON.stringify({
                    pptx_url: state.previewData.modified_pptx_url,
                    slide_image_urls: state.previewData.slide_image_urls,
                    fonts: state.previewData.fonts,
                }),
            });

            const data = await ApiResponseHandler.handleResponse(
                response,
                "Failed to initialize template creation"
            );

            // Initialize slides array based on preview images
            const initialSlides: ProcessedSlide[] = state.previewData.slide_image_urls.map(
                (url, index) => ({
                    slide_number: index + 1,
                    screenshot_url: url,
                    processing: false,
                    processed: false,
                })
            );

            setSlides(initialSlides);
            updateState({
                templateId: data.id || data,
                totalSlides: state.previewData.slide_image_urls.length,
                isLoading: false
            });
            trackEvent(MixpanelEvent.CustomTemplate_Creation_Started, {
                source: "template_init",
                template_id: typeof data === "string" ? data : data.id,
                total_slides: state.previewData.slide_image_urls.length,
                uploaded_font_count: Object.keys(state.previewData.fonts ?? {}).length,
            });

            notify.success("Template initialized", "Template creation was initialized successfully.");

            // Automatically start processing the first slide
            if (typeof data === 'string') {
                createSlideLayout(data, 0);
            } else if (data.id) {
                createSlideLayout(data.id, 0);
            }

            return typeof data === 'string' ? data : data.id;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Initialization failed";
            updateState({ error: errorMessage, isLoading: false });
            notify.error("Initialization failed", errorMessage);
            // reset the state
            reset();
            return null;
        }
    }, [
        createSlideLayout,
        generateTemplateV2,
        reset,
        state.previewData,
        updateState,
        useTemplateV2Generation,
    ]);

    // Reconstruct a single slide (no auto-advance)
    const retrySlide = useCallback((slideIndex: number) => {
        if (!useTemplateV2Generation) {
            if (state.templateId) {
                // Pass false for autoAdvance to only reconstruct this specific slide
                createSlideLayout(state.templateId, slideIndex, false);
            }
            return;
        }

        if (!state.previewData) {
            notify.error("No preview data", "Generate a preview before trying again.");
            return;
        }

        notify.info(
            "Regenerating template",
            "Templates V2 regenerates the full template for this preview."
        );
        void generateTemplateV2(state.previewData, { retrySlideIndex: slideIndex });
    }, [
        createSlideLayout,
        generateTemplateV2,
        state.previewData,
        state.templateId,
        useTemplateV2Generation,
    ]);

    // Move to font upload step (when font check is done)
    const proceedToFontUpload = useCallback(() => {
        updateState({ step: 'font-upload' });
    }, [updateState]);

    // Calculate progress
    const completedSlides = slides.filter(s => s.processed || s.error).length;
    const progressPercentage = state.totalSlides > 0
        ? Math.round((completedSlides / state.totalSlides) * 100)
        : 0;

    return {
        // State
        state,
        uploadedFonts,
        slides,
        setSlides,

        // Progress
        completedSlides,
        progressPercentage,

        // Font operations
        checkFonts,
        uploadFont,
        removeFont,
        getUnsupportedFonts,
        allFontsUploaded,

        // Template creation operations
        fontUploadAndPreview,
        initTemplateCreation,
        createSlideLayout,
        retrySlide,

        // Navigation
        proceedToFontUpload,
        reset,
        updateState,
    };
};
