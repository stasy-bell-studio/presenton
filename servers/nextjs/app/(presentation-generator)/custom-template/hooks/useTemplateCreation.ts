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
    TemplateV2Layout,
    TemplateCreationMetadata,
} from "../types";
import { getApiUrl } from "@/utils/api";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";
import { bucketFileSize, sanitizeAnalyticsError } from "@/utils/analytics";
import { validateLayoutCodeForClient } from "../utils/layoutCodeValidation";

/** Must match `VISION_LAYOUT_ERROR_MARKER` in FastAPI `utils/template_vision_errors.py`. */
const TEMPLATE_VISION_MODEL_MARKER = "TEMPLATE_VISION_MODEL_REQUIRED";
const TEMPLATE_V2_LAYOUT_BATCH_SIZE = 1;

type CreatedTemplateV2Layout = { index: number; layout: TemplateV2Layout };
type FailedTemplateV2Layout = { index: number; error: string };
type GoogleFontReplacement = { fontName: string; fontUrl: string };

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

function readTemplateV2InitId(value: unknown): string | null {
    if (typeof value === "string" && value) {
        return value;
    }
    if (isRecord(value) && typeof value.id === "string" && value.id) {
        return value.id;
    }
    return null;
}

function extractCreatedTemplateV2Layouts(
    value: unknown
): CreatedTemplateV2Layout[] {
    const rawLayouts = isRecord(value) && Array.isArray(value.layouts)
        ? value.layouts
        : [];

    return rawLayouts.flatMap((item) => {
        if (!isRecord(item) || !Number.isInteger(item.index) || !isRecord(item.layout)) {
            return [];
        }
        return [{ index: item.index as number, layout: item.layout as TemplateV2Layout }];
    });
}

function templateV2SlideFromLayout(
    slide: ProcessedSlide,
    layout: TemplateV2Layout,
    templateId: string,
    index: number
): ProcessedSlide {
    const layoutId = typeof layout.id === "string" ? layout.id : null;
    const layoutDescription = typeof layout.description === "string"
        ? layout.description
        : "Generated with Templates V2";

    return {
        ...slide,
        processing: false,
        processed: true,
        error: undefined,
        v2Layout: layout,
        template_v2_id: templateId,
        layout_id: layoutId || `slide_${index + 1}`,
        layout_name: layoutId || `Slide ${index + 1}`,
        layout_description: layoutDescription,
    };
}

function templateV2LayoutBatches(totalSlides: number): number[][] {
    const batches: number[][] = [];
    for (let start = 0; start < totalSlides; start += TEMPLATE_V2_LAYOUT_BATCH_SIZE) {
        const end = Math.min(start + TEMPLATE_V2_LAYOUT_BATCH_SIZE, totalSlides);
        batches.push(Array.from({ length: end - start }, (_, offset) => start + offset));
    }
    return batches;
}

function errorMessageFromUnknown(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
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
            trackEvent(MixpanelEvent.CustomTemplate_Font_Check_Completed, {
                file_size_bucket: bucketFileSize(pptxFile.size),
                file_extension: fileExtension,
                available_font_count: data.available_fonts?.length ?? 0,
                unavailable_font_count: data.unavailable_fonts?.length ?? 0,
            });

            return data;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Font check failed";
            updateState({ error: errorMessage, isLoading: false });
            trackEvent(MixpanelEvent.CustomTemplate_Font_Check_Failed, {
                file_size_bucket: bucketFileSize(pptxFile.size),
                file_extension: pptxFile.name.includes(".")
                    ? pptxFile.name.slice(pptxFile.name.lastIndexOf(".")).toLowerCase()
                    : "",
                error_message: sanitizeAnalyticsError(error, "Font check failed"),
            });
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
        pptxFile: File,
        googleFontReplacementsByOriginalName: Record<string, GoogleFontReplacement> = {}
    ): Promise<FontUploadPreviewResponse | null> => {
        updateState({ isLoading: true, error: null, step: 'font-upload' });
        const startedAt = Date.now();
        const missingFontCount = getUnsupportedFonts().length;
        const selectedGoogleFontCount = Object.keys(googleFontReplacementsByOriginalName).length;
        trackEvent(MixpanelEvent.CustomTemplate_Preview_Started, {
            uploaded_font_count: uploadedFonts.length,
            missing_font_count: missingFontCount,
            selected_google_font_count: selectedGoogleFontCount,
        });

        try {
            const formData = new FormData();
            formData.append("pptx_file", pptxFile);

            // Add uploaded font files (actual File objects)
            uploadedFonts.forEach(font => {
                formData.append("font_files", font.file);
                formData.append("original_font_names", font.fontName);
            });
            Object.entries(googleFontReplacementsByOriginalName).forEach(
                ([originalFontName, googleFont]) => {
                    formData.append("google_font_original_names", originalFontName);
                    formData.append("google_font_replacement_names", googleFont.fontName);
                    formData.append("google_font_urls", googleFont.fontUrl);
                }
            );

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
            trackEvent(MixpanelEvent.CustomTemplate_Preview_Completed, {
                slide_count: data.slide_image_urls?.length ?? 0,
                uploaded_font_count: uploadedFonts.length,
                selected_google_font_count: selectedGoogleFontCount,
                duration_ms: Date.now() - startedAt,
            });

            notify.success("Document prepared", "Template generation is starting now.");
            return data;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Document preparation failed";
            updateState({ error: errorMessage, isLoading: false });
            trackEvent(MixpanelEvent.CustomTemplate_Preview_Failed, {
                uploaded_font_count: uploadedFonts.length,
                duration_ms: Date.now() - startedAt,
                error_message: sanitizeAnalyticsError(
                    error,
                    "Document preparation failed"
                ),
            });
            notify.error("Document preparation failed", errorMessage);
            return null;
        }
    }, [getUnsupportedFonts, uploadedFonts, updateState]);

    const saveTemplateV2Layouts = useCallback(async (
        templateId: string,
        layouts: CreatedTemplateV2Layout[]
    ): Promise<void> => {
        if (layouts.length === 0) return;

        const response = await fetch(
            getApiUrl(`/api/v1/ppt/templates/${encodeURIComponent(templateId)}/layouts`),
            {
                method: "PATCH",
                headers: getHeader(),
                body: JSON.stringify({ layouts }),
            }
        );

        await ApiResponseHandler.handleResponse(
            response,
            "Failed to save generated template layouts"
        );
    }, []);

    const createTemplateV2Layout = useCallback(async (
        templateId: string,
        index: number
    ): Promise<CreatedTemplateV2Layout> => {
        const response = await fetch(getApiUrl("/api/v1/ppt/templates/layouts/create"), {
            method: "POST",
            headers: getHeader(),
            body: JSON.stringify({
                template_id: templateId,
                index,
            }),
        });

        const data = await ApiResponseHandler.handleResponse(
            response,
            `Failed to generate template layout for slide ${index + 1}`
        );
        const layout = extractCreatedTemplateV2Layouts(data)
            .find((item) => item.index === index);
        if (!layout) {
            throw new Error("No generated layout was returned for this slide.");
        }
        return layout;
    }, []);

    const createAndSaveTemplateV2Layouts = useCallback(async (
        templateId: string,
        indices: number[],
        options: {
            onLayoutCreated?: (layout: CreatedTemplateV2Layout) => void;
        } = {}
    ): Promise<{ layouts: CreatedTemplateV2Layout[]; failures: FailedTemplateV2Layout[] }> => {
        const layouts: CreatedTemplateV2Layout[] = [];
        const failures: FailedTemplateV2Layout[] = [];

        for (const index of indices) {
            try {
                const layout = await createTemplateV2Layout(templateId, index);
                options.onLayoutCreated?.(layout);
                layouts.push(layout);
            } catch (error) {
                failures.push({
                    index,
                    error: errorMessageFromUnknown(
                        error,
                        "Template layout generation failed"
                    ),
                });
            }
        }

        if (layouts.length > 0) {
            try {
                await saveTemplateV2Layouts(templateId, layouts);
            } catch (error) {
                const saveError = errorMessageFromUnknown(
                    error,
                    "Failed to save generated template layouts"
                );
                return {
                    layouts: [],
                    failures: [
                        ...failures,
                        ...layouts.map((layout) => ({
                            index: layout.index,
                            error: saveError,
                        })),
                    ],
                };
            }
        }

        return { layouts, failures };
    }, [createTemplateV2Layout, saveTemplateV2Layouts]);

    const generateTemplateV2Blocks = useCallback(async (
        templateId: string
    ): Promise<void> => {
        const response = await fetch(getApiUrl("/api/v1/ppt/templates/generate-blocks"), {
            method: "POST",
            headers: getHeader(),
            body: JSON.stringify({
                template_id: templateId,
            }),
        });

        await ApiResponseHandler.handleResponse(
            response,
            "Failed to generate template blocks"
        );
    }, []);

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
        const generationStartedAt = Date.now();

        try {
            trackEvent(MixpanelEvent.CustomTemplate_Creation_Started, {
                source: options.retrySlideIndex === undefined
                    ? "template_v2_create"
                    : "template_v2_retry",
                retry_slide_index: options.retrySlideIndex,
                total_slides: previewData.slide_image_urls.length,
                uploaded_font_count: Object.keys(previewData.fonts ?? {}).length,
            });

            const initResponse = await fetch(getApiUrl("/api/v1/ppt/templates/init"), {
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

            const initData = await ApiResponseHandler.handleResponse(
                initResponse,
                "Failed to initialize template"
            );
            const templateId = readTemplateV2InitId(initData);
            if (!templateId) {
                throw new Error("Template initialization did not return a template id");
            }

            updateState({
                templateId,
                totalSlides: initialSlides.length,
                currentSlideIndex: 0,
            });

            let generatedSlides = initialSlides;
            const slideStartedAtByIndex = new Map<number, number>();
            const commitSlides = (nextSlides: ProcessedSlide[]) => {
                generatedSlides = nextSlides;
                setSlides(nextSlides);
            };
            const updateGeneratedSlides = (
                updater: (currentSlides: ProcessedSlide[]) => ProcessedSlide[]
            ) => {
                commitSlides(updater(generatedSlides));
            };

            for (const indices of templateV2LayoutBatches(initialSlides.length)) {
                indices.forEach((index) => {
                    slideStartedAtByIndex.set(index, Date.now());
                    trackEvent(MixpanelEvent.CustomTemplate_Slide_Generation_Started, {
                        template_id: templateId,
                        template_version: "v2",
                        slide_index: index,
                        auto_retry: false,
                    });
                });
                updateState({ currentSlideIndex: indices[0] ?? 0 });
                updateGeneratedSlides((currentSlides) =>
                    currentSlides.map((slide, index) =>
                        indices.includes(index)
                            ? {
                                ...slide,
                                processing: true,
                                processed: false,
                                error: undefined,
                            }
                            : slide
                    )
                );

                const { layouts: createdLayouts, failures } =
                    await createAndSaveTemplateV2Layouts(templateId, indices, {
                        onLayoutCreated: (createdLayout) => {
                            trackEvent(MixpanelEvent.CustomTemplate_Slide_Generation_Completed, {
                                template_id: templateId,
                                template_version: "v2",
                                slide_index: createdLayout.index,
                                duration_ms:
                                    Date.now() -
                                    (slideStartedAtByIndex.get(createdLayout.index) ??
                                        Date.now()),
                            });
                            updateGeneratedSlides((currentSlides) =>
                                currentSlides.map((slide, index) =>
                                    index === createdLayout.index
                                        ? templateV2SlideFromLayout(
                                            slide,
                                            createdLayout.layout,
                                            templateId,
                                            index
                                        )
                                        : slide
                                )
                            );
                        },
                    });
                const layoutByIndex = new Map(
                    createdLayouts.map((item) => [item.index, item.layout])
                );
                const failureByIndex = new Map(
                    failures.map((item) => [item.index, item.error])
                );
                failures.forEach((failure) => {
                    trackEvent(MixpanelEvent.CustomTemplate_Slide_Generation_Failed, {
                        template_id: templateId,
                        template_version: "v2",
                        slide_index: failure.index,
                        duration_ms:
                            Date.now() -
                            (slideStartedAtByIndex.get(failure.index) ?? Date.now()),
                        error_message: sanitizeAnalyticsError(
                            failure.error,
                            "Template layout generation failed"
                        ),
                    });
                });
                updateGeneratedSlides((currentSlides) =>
                    currentSlides.map((slide, index) => {
                        if (!indices.includes(index)) return slide;

                        const failure = failureByIndex.get(index);
                        if (failure) {
                            return {
                                ...slide,
                                processing: false,
                                processed: false,
                                error: failure,
                            };
                        }

                        const layout = layoutByIndex.get(index);
                        if (!layout) {
                            return {
                                ...slide,
                                processing: false,
                                processed: false,
                                error: "No generated layout was returned for this slide.",
                            };
                        }
                        return templateV2SlideFromLayout(
                            slide,
                            layout,
                            templateId,
                            index
                        );
                    })
                );
            }

            const failedCount = generatedSlides.filter((slide) => Boolean(slide.error)).length;
            const processedCount = generatedSlides.filter((slide) => slide.processed).length;
            let blocksError: string | null = null;
            if (processedCount > 0) {
                try {
                    await generateTemplateV2Blocks(templateId);
                    trackEvent(MixpanelEvent.CustomTemplate_Blocks_Generation_Completed, {
                        template_id: templateId,
                        template_version: "v2",
                    });
                } catch (error) {
                    blocksError = errorMessageFromUnknown(
                        error,
                        "Failed to generate template blocks"
                    );
                    trackEvent(MixpanelEvent.CustomTemplate_Blocks_Generation_Failed, {
                        template_id: templateId,
                        template_version: "v2",
                        error_message: sanitizeAnalyticsError(
                            error,
                            "Failed to generate template blocks"
                        ),
                    });
                    updateState({ error: blocksError });
                }
            }

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
            } else if (blocksError) {
                notify.warning(
                    "Template generated",
                    `Slides were saved, but template blocks were not generated. ${blocksError}`
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
            trackEvent(MixpanelEvent.CustomTemplate_Creation_Failed, {
                template_id: state.templateId,
                template_version: "v2",
                step: "template-creation",
                slide_index: options.retrySlideIndex ?? null,
                duration_ms: Date.now() - generationStartedAt,
                error_message: sanitizeAnalyticsError(
                    error,
                    "Template generation failed"
                ),
            });
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
    }, [
        createAndSaveTemplateV2Layouts,
        generateTemplateV2Blocks,
        state.templateId,
        updateState,
    ]);

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
        const slideStartedAt = Date.now();
        trackEvent(MixpanelEvent.CustomTemplate_Slide_Generation_Started, {
            template_id: templateId,
            template_version: "v1",
            slide_index: slideIndex,
            auto_retry: _isAutoRetry,
        });

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
            trackEvent(MixpanelEvent.CustomTemplate_Slide_Generation_Completed, {
                template_id: templateId,
                template_version: "v1",
                slide_index: slideIndex,
                duration_ms: Date.now() - slideStartedAt,
            });

            return layoutResult;
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : "Layout creation failed";
            const isVisionModelError = errorMessage.includes(TEMPLATE_VISION_MODEL_MARKER);

            // Auto-retry once on transient failures; vision/model capability errors won't recover.
            if (!_isAutoRetry && !isVisionModelError) {
                return createSlideLayout(templateId, slideIndex, autoAdvance, true);
            }
            trackEvent(MixpanelEvent.CustomTemplate_Slide_Generation_Failed, {
                template_id: templateId,
                template_version: "v1",
                slide_index: slideIndex,
                duration_ms: Date.now() - slideStartedAt,
                error_message: sanitizeAnalyticsError(
                    error,
                    "Layout creation failed"
                ),
            });

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
        metadata?: TemplateCreationMetadata,
        previewDataOverride?: FontUploadPreviewResponse
    ): Promise<string | null> => {
        const previewData = previewDataOverride ?? state.previewData;
        if (!previewData) {
            notify.error("No preview data", "Prepare the document before continuing.");
            return null;
        }

        const normalizedMetadata = normalizeTemplateMetadata(metadata);
        if (normalizedMetadata) {
            templateMetadataRef.current = normalizedMetadata;
        }

        if (useTemplateV2Generation) {
            return generateTemplateV2(previewData, {
                metadata: normalizedMetadata,
            });
        }

        updateState({ isLoading: true, error: null, step: 'template-creation' });
        const initStartedAt = Date.now();

        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/template/create/init`), {
                method: "POST",
                headers: getHeader(),
                body: JSON.stringify({
                    pptx_url: previewData.modified_pptx_url,
                    slide_image_urls: previewData.slide_image_urls,
                    fonts: previewData.fonts,
                }),
            });

            const data = await ApiResponseHandler.handleResponse(
                response,
                "Failed to initialize template creation"
            );

            // Initialize slides array based on preview images
            const initialSlides: ProcessedSlide[] = previewData.slide_image_urls.map(
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
                totalSlides: previewData.slide_image_urls.length,
                isLoading: false
            });
            trackEvent(MixpanelEvent.CustomTemplate_Creation_Started, {
                source: "template_init",
                template_id: typeof data === "string" ? data : data.id,
                total_slides: previewData.slide_image_urls.length,
                uploaded_font_count: Object.keys(previewData.fonts ?? {}).length,
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
            trackEvent(MixpanelEvent.CustomTemplate_Creation_Failed, {
                template_id: state.templateId,
                template_version: "v1",
                step: "template_init",
                slide_index: null,
                duration_ms: Date.now() - initStartedAt,
                error_message: sanitizeAnalyticsError(error, "Initialization failed"),
            });
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
        state.templateId,
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

        if (!state.templateId) {
            notify.error("Template unavailable", "Initialize the template before trying again.");
            return;
        }

        const templateId = state.templateId;
        updateState({ currentSlideIndex: slideIndex });
        setSlides((current) =>
            current.map((slide, index) =>
                index === slideIndex
                    ? {
                        ...slide,
                        processing: true,
                        processed: false,
                        error: undefined,
                    }
                    : slide
            )
        );

        void (async () => {
            const startedAt = Date.now();
            trackEvent(MixpanelEvent.CustomTemplate_Slide_Generation_Started, {
                template_id: templateId,
                template_version: "v2",
                slide_index: slideIndex,
                auto_retry: true,
            });
            try {
                const { layouts: createdLayouts, failures } = await createAndSaveTemplateV2Layouts(
                    templateId,
                    [slideIndex]
                );
                const failure = failures.find((item) => item.index === slideIndex);
                if (failure) {
                    throw new Error(failure.error);
                }
                const layout = createdLayouts.find((item) => item.index === slideIndex)?.layout;
                if (!layout) {
                    throw new Error("No generated layout was returned for this slide.");
                }
                setSlides((current) =>
                    current.map((slide, index) =>
                        index === slideIndex
                            ? templateV2SlideFromLayout(slide, layout, templateId, index)
                            : slide
                    )
                );
                trackEvent(MixpanelEvent.CustomTemplate_Slide_Generation_Completed, {
                    template_id: templateId,
                    template_version: "v2",
                    slide_index: slideIndex,
                    duration_ms: Date.now() - startedAt,
                });
                notify.success(
                    "Slide regenerated",
                    `Slide ${slideIndex + 1} was regenerated successfully.`
                );
            } catch (error) {
                const errorMessage = error instanceof Error
                    ? error.message
                    : "Template layout generation failed";
                setSlides((current) =>
                    current.map((slide, index) =>
                        index === slideIndex
                            ? {
                                ...slide,
                                processing: false,
                                processed: false,
                                error: errorMessage,
                            }
                            : slide
                    )
                );
                trackEvent(MixpanelEvent.CustomTemplate_Slide_Generation_Failed, {
                    template_id: templateId,
                    template_version: "v2",
                    slide_index: slideIndex,
                    duration_ms: Date.now() - startedAt,
                    error_message: sanitizeAnalyticsError(
                        error,
                        "Template layout generation failed"
                    ),
                });
                notify.error(`Slide ${slideIndex + 1} failed`, errorMessage);
            }
        })();
    }, [
        createSlideLayout,
        createAndSaveTemplateV2Layouts,
        state.templateId,
        updateState,
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
