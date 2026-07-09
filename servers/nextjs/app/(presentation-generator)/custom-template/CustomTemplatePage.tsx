/* eslint-disable @next/next/no-img-element */
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutPanelTop,
  Loader2,
  Sparkles,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";
import { useSelector } from "react-redux";

import { notify } from "@/components/ui/sonner";
import {
  EDITOR_STAGE_HEIGHT,
  EDITOR_STAGE_WIDTH,
} from "@/components/slide-editor/types";
import {
  loadGoogleFontOptions,
  type GoogleFontOption,
} from "@/components/slide-editor/text/google-fonts";
import type { RootState } from "@/store/store";
import { normalizeBackendAssetUrls, resolveBackendAssetUrl } from "@/utils/api";
import { setupImageUrlConverter } from "@/utils/image-url-converter";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";

import { useFontLoader as loadFontAssets } from "../hooks/useFontLoad";
import TemplateService from "../services/api/template";
import { TAILWIND_CDN_URL } from "./constants";
import { TemplateV2LayoutPreview } from "./components/EachSlide/TemplateV2LayoutPreview";
import { useFileUpload } from "./hooks/useFileUpload";
import { useTemplateCreation } from "./hooks/useTemplateCreation";
import type {
  FontData,
  FontItem,
  ProcessedSlide,
  TemplateCreationStep,
  TemplateV2Layout,
  UploadedFont,
} from "./types";
import {
  dismissTemplateV2ModelWarning,
  showTemplateV2ModelWarningIfNeeded,
} from "./utils/templateModelWarning";



type StudioStep = 1 | 2 | 3 | 4;



const studioSteps: { id: StudioStep; label: string }[] = [
  { id: 1, label: "Upload" },
  { id: 2, label: "Analyze" },
  { id: 3, label: "Preview" },
  { id: 4, label: "Review" },
];

const pillGradient =
  "linear-gradient(270deg, #D5CAFC 2.4%, #E3D2EB 27.88%, #F4DCD3 69.23%, #FDE4C2 100%)";

function getDefaultTemplateName(file: File | null): string {
  if (!file?.name) return "";
  return file.name.replace(/\.pptx$/i, "").trim();
}

function formatFileSize(size: number): string {
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function activeStudioStep(step: TemplateCreationStep): StudioStep {
  if (step === "font-check" || step === "font-upload") return 2;
  if (step === "slides-preview") return 3;
  if (step === "template-creation" || step === "completed") return 4;
  return 1;
}

function StudioTopBar({ activeStep }: { activeStep: StudioStep }) {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[72px] sm:h-[80px] 2xl:h-[96px] bg-gradient-to-b from-white via-white to-white/0">
      <div className="relative mx-auto flex h-full max-w-[1280px] 2xl:max-w-[1536px] items-center justify-between px-5 sm:px-8 2xl:px-[90px]">
        <a
          href="/dashboard"
          className="pointer-events-auto block h-8 w-8 sm:h-[34px] sm:w-[34px] 2xl:h-[44px] 2xl:w-[44px] shrink-0"
          aria-label="Dashboard"
        >
          <img
            src="/logo-with-bg.png"
            alt="Presenton"
            className="h-full w-full"
            draggable={false}
          />
        </a>

        <nav
          className="pointer-events-auto flex items-center"
          aria-label="Template Studio progress"
        >
          {studioSteps.map((step, index) => {
            const isActive = step.id === activeStep;
            return (
              <React.Fragment key={step.id}>
                <div className="flex items-center gap-1 sm:gap-1.5 2xl:gap-2">
                  <span
                    className={`flex h-5 w-5 sm:h-6 sm:w-6 2xl:h-7 2xl:w-7 items-center justify-center rounded-full border text-[10px] sm:text-[11px] 2xl:text-xs leading-none ${isActive
                      ? "border-black bg-black text-white"
                      : "border-[#E4E5EB] bg-white text-[#9B9CA3]"
                      }`}
                  >
                    {step.id}
                  </span>
                  <span
                    className={`hidden text-[10px] font-medium sm:inline sm:text-[11px] 2xl:text-xs ${isActive ? "text-black" : "text-[#9B9CA3]"}`}
                  >
                    {step.label}
                  </span>
                </div>
                {index < studioSteps.length - 1 ? (
                  <span className="mx-1.5 sm:mx-2 2xl:mx-2.5 h-px w-3 sm:w-[18px] 2xl:w-[22px] bg-[#E9EAF0]" />
                ) : null}
              </React.Fragment>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function StudioBottomAction({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 sm:bottom-6 2xl:bottom-8 z-30 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-[260px] sm:max-w-[300px] 2xl:max-w-[380px]">
        {children}
      </div>
    </div>
  );
}

function GradientPillButton({
  children,
  onClick,
  disabled,
  className = "",
  mutedWhenDisabled = false,
  fullWidth = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  mutedWhenDisabled?: boolean;
  fullWidth?: boolean;
}) {
  const isMuted = mutedWhenDisabled && disabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex ${fullWidth ? "w-full" : ""} h-10 items-center justify-center gap-2 rounded-[58px] px-5 text-sm font-medium text-black shadow-none transition disabled:cursor-not-allowed ${isMuted
        ? "bg-[#ECECF1] text-[#5C5E68] disabled:opacity-100"
        : "disabled:opacity-60"
        } ${className}`}
      style={isMuted ? undefined : { background: pillGradient }}
    >
      {children}
    </button>
  );
}

function TemplateStudioTitle({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`px-4 text-center ${compact ? "pt-[88px] sm:pt-[96px] 2xl:pt-[112px]" : "pt-[96px] sm:pt-[108px] 2xl:pt-[128px]"}`}
    >
      <h1 className="font-unbounded text-[36px] font-normal leading-none tracking-[-1.2px] text-[#101323] sm:text-[48px] sm:tracking-[-1.4px] md:text-[56px] 2xl:text-[68px] 2xl:tracking-[-1.8px]">
        Template Studio
      </h1>
      <p className="mx-auto mt-3 max-w-[480px] text-center font-syne text-[15px] font-normal leading-[1.4] text-[#101323CC] sm:mt-4 sm:max-w-[520px] sm:text-[16px] 2xl:mt-5 2xl:max-w-[600px] 2xl:text-[18px]">
        Upload your PPTX file to extract slides and convert them to a template
        which you can use to generate AI presentations.
      </p>
    </div>
  );
}

function UploadPanel({
  selectedFile,
  isProcessing,
  onFileInput,
  onFileDrop,
  onRemove,
  onStart,
}: {
  selectedFile: File | null;
  isProcessing: boolean;
  onFileInput: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFileDrop: (file: File) => void;
  onRemove: () => void;
  onStart: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropInputRef = useRef<HTMLInputElement | null>(null);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) onFileDrop(file);
  };

  const handleGetStarted = () => {
    if (!selectedFile) {
      inputRef.current?.click();
      return;
    }
    onStart();
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-white font-syne">
      <TemplateStudioTitle />

      <section className="mt-8 w-full max-w-[640px] px-4 sm:mt-10 sm:max-w-[700px] 2xl:mt-12 2xl:max-w-[820px]">
        <div className="group relative">
          <div className="relative z-10 ml-8 2xl:ml-10 w-max rounded-t-[28px] 2xl:rounded-t-[32px] border border-b-0 border-[#EDEEF4] bg-white px-3 2xl:px-4 pb-2.5 2xl:pb-3 pt-2 2xl:pt-2.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-[34px] 2xl:h-[42px] items-center gap-1.5 2xl:gap-2 rounded-[80px] bg-white px-3.5 2xl:px-4 text-[12px] 2xl:text-sm font-semibold text-black shadow-[0_0_4px_rgba(0,0,0,0.06)]"
            >
              <Upload className="h-3.5 w-3.5 2xl:h-4 2xl:w-4 text-[#7A5AF8]" />
              Upload PPTX File
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".pptx"
              className="hidden"
              onChange={onFileInput}
            />
          </div>

          <div className="relative -mt-px rounded-[28px] 2xl:rounded-[32px] border border-[#EDEEF4] bg-white p-2.5 2xl:p-3 shadow-[0_0_16px_rgba(80,71,230,0.08)] transition-shadow duration-200 ">
            <div
              className={`relative h-[120px] 2xl:h-[150px] overflow-hidden rounded-[18px] 2xl:rounded-[22px] border border-[#E8E8EF] bg-white ${selectedFile ? "" : "cursor-pointer"
                }`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              onClick={() => {
                if (!selectedFile) dropInputRef.current?.click();
              }}
            >
              <input
                ref={dropInputRef}
                type="file"
                accept=".pptx"
                onChange={onFileInput}
                className="hidden"
              />

              {selectedFile ? (
                <div className="relative flex h-full items-center ">
                  <div
                    className="flex  flex-1 h-full min-w-0 items-center rounded-[14px] bg-[#F6F6FA] px-5 transition-[width] duration-300"

                  >
                    <div className="min-w-0">
                      <p className="truncate text-base 2xl:text-lg font-medium text-[#20212A]">
                        {selectedFile.name}
                      </p>
                      <p className="mt-2 2xl:mt-2.5 text-sm 2xl:text-base text-[#777985]">
                        {isProcessing ? "62%" : formatFileSize(selectedFile.size)}
                        <span className="px-2">•</span>
                        {isProcessing ? "Process" : "Ready"}
                      </p>
                    </div>
                  </div>
                  <div className="w-[64px] 2xl:w-[76px] h-full flex justify-center items-center px-3.5">

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemove();
                      }}
                      disabled={isProcessing}
                      className="w-[36px] h-[36px] 2xl:w-[44px] 2xl:h-[44px] top-1/2 z-20 flex items-center justify-center rounded-full border border-[#E8E8EF] bg-[#EFF0F4] text-black disabled:opacity-50"
                      aria-label="Remove file"
                    >
                      <X className="h-3.5 w-3.5 2xl:h-4 2xl:w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col py-[28px] 2xl:py-[36px] items-center justify-center">
                  <img
                    src="/upload_icon.png"
                    alt=""
                    className="h-[42px] w-[55px] 2xl:h-[52px] 2xl:w-[68px]"
                    draggable={false}
                  />
                  <p className="mt-3 2xl:mt-4 text-sm 2xl:text-base font-normal text-[#808080]">
                    Drag &amp; Drop your files here
                  </p>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-end gap-3 px-1">
              <GradientPillButton
                onClick={handleGetStarted}
                disabled={isProcessing}
                className="h-9 px-5 text-xs font-semibold"
              >
                {isProcessing ? "Processing" : "Get Started"}
                {isProcessing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </GradientPillButton>
            </div>
          </div>
        </div>

        <ul className="mx-auto mt-6 2xl:mt-8 flex max-w-[480px] 2xl:max-w-[600px] items-center justify-between gap-5 2xl:gap-8">
          {["Test in Real Time", "Max 100MB", "5min Generation"].map((item) => (
            <li key={item} className="flex items-center gap-2 2xl:gap-2.5">
              <span className="h-2.5 w-2.5 2xl:h-3 2xl:w-3 rounded-full bg-[#EBE9FE]" />
              <span className="text-[13px] 2xl:text-[15px] font-normal text-[#3A3A3A]">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-auto w-full pb-5 2xl:pb-8 pt-12 2xl:pt-16">
        <div className="mx-auto flex max-w-[558px] 2xl:max-w-[700px] items-center gap-2 2xl:gap-3 rounded-[6px] bg-[#F4F7FB] px-3 2xl:px-4 py-2 2xl:py-2.5 text-[11px] 2xl:text-[13px] leading-tight text-[#505462]">
          <span className="flex h-[14px] w-[14px] 2xl:h-4 2xl:w-4 shrink-0 items-center justify-center rounded-full bg-[#0B4FBD] text-[10px] 2xl:text-[11px] font-bold text-white">
            i
          </span>
          <p>
            Presenton sends each slide as a screenshot and HTML reference. Use a
            vision-enabled model for accurate layouts. Text-only models may produce
            poor results or fail.
          </p>
        </div>
      </div>
    </main>
  );
}

function chipLabel(font: FontItem): string {
  return font.name || font.family_name || font.original_name || "Unknown font";
}

function uniqueFontChips(fontsData: FontData): FontItem[] {
  const seen = new Set<string>();
  return [...fontsData.available_fonts, ...fontsData.unavailable_fonts].filter((font) => {
    const key = chipLabel(font).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function googleFontKey(family: string): string {
  return family.trim().toLowerCase();
}

function preferredFallbackFont(
  font: FontItem,
  googleFontOptions: GoogleFontOption[],
): GoogleFontOption | null {
  if (googleFontOptions.length === 0) return null;

  const byFamily = new Map(
    googleFontOptions.map((option) => [googleFontKey(option.family), option]),
  );
  const candidates = [
    font.family_name,
    font.original_name,
    "Poppins",
    "Inter",
    "Roboto",
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const option = byFamily.get(googleFontKey(candidate));
    if (option) return option;
  }

  return googleFontOptions[0] ?? null;
}

function AnalyzePanel({
  fontsData,
  uploadedFonts,
  isUploading,
  uploadFont,
  hasPendingMissingFonts,
  googleFontOptions,
  selectedFallbackFonts,
  onFallbackFontChange,
}: {
  fontsData: FontData | null;
  uploadedFonts: UploadedFont[];
  isUploading: boolean;
  uploadFont: (fontName: string, file: File) => string | null;
  hasPendingMissingFonts: boolean;
  googleFontOptions: GoogleFontOption[];
  selectedFallbackFonts: Record<string, GoogleFontOption>;
  onFallbackFontChange: (fontName: string, option: GoogleFontOption) => void;
}) {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const missingFonts = fontsData?.unavailable_fonts ?? [];
  const fontChips = fontsData ? uniqueFontChips(fontsData) : [];
  const missingFontKeys = new Set(missingFonts.map((font) => chipLabel(font).toLowerCase()));

  const uploadedFontNames = new Set(uploadedFonts.map((font) => font.fontName));
  const pendingMissingFonts = missingFonts.filter(
    (font) => !uploadedFontNames.has(font.name),
  );
  const showFontAttentionSpinner = pendingMissingFonts.length > 0 && !isUploading;
  const fontsStepComplete =
    missingFonts.length === 0 || pendingMissingFonts.length === 0 || isUploading;
  const availableFontCount = fontsData?.available_fonts.length ?? 0;
  const missingFontCount = missingFonts.length;
  const uploadedMissingCount = missingFonts.filter((font) =>
    uploadedFontNames.has(font.name),
  ).length;
  const totalDetectedFonts = availableFontCount + missingFontCount;
  const fontStatusLabel = isUploading
    ? "Preparing Preview"
    : fontsStepComplete
      ? "Ready"
      : "Needs Fonts";
  const fontStatusClass = isUploading
    ? "border-[#E7D8FF] bg-[#F6F1FF] text-[#6941C6]"
    : fontsStepComplete
      ? "border-[#CFEBDD] bg-[#F0FBF5] text-[#227A50]"
      : "border-[#FAD7BF] bg-[#FFF7ED] text-[#B45309]";

  const handleFontFile = (fontName: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    uploadFont(fontName, file);
    event.target.value = "";
  };

  return (
    <main className="flex min-h-screen flex-col bg-white px-4 pb-28 font-syne sm:px-6 sm:pb-32 2xl:px-10 2xl:pb-36">
      <TemplateStudioTitle compact />
      <section className="mx-auto mt-8 w-full max-w-[980px] sm:mt-10 2xl:mt-12 2xl:max-w-[1180px]">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_400px] 2xl:gap-5">
          <div className="h-fit rounded-[10px] border border-[#E3E5EC] bg-gradient-to-br from-white to-[#FAFAFF] p-4 shadow-[0_12px_34px_rgba(16,24,40,0.06)] sm:p-5 2xl:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F0EFFD] text-[#5146E5] 2xl:h-12 2xl:w-12">
                  <Type className="h-4 w-4 2xl:h-5 2xl:w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-[#161820] 2xl:text-2xl">
                    Font Readiness
                  </h2>
                  <p className="mt-1 max-w-[560px] text-[13px] leading-relaxed text-[#686B76] 2xl:text-[15px]">
                    Review detected fonts before creating the slide preview.
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex w-fit shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium 2xl:text-sm ${fontStatusClass}`}
              >
                {isUploading || showFontAttentionSpinner ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : fontsStepComplete ? (
                  <Check className="h-3.5 w-3.5" />
                ) : null}
                {fontStatusLabel}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 2xl:mt-6 2xl:gap-3">
              {[
                { label: "Detected", value: totalDetectedFonts },
                { label: "Available", value: availableFontCount },
                { label: "Missing", value: pendingMissingFonts.length },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[8px] border border-[#E6E7EF] bg-white px-3 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.03)] 2xl:px-4 2xl:py-4"
                >
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#777985] 2xl:text-xs">
                    {item.label}
                  </p>
                  <p className="mt-1 font-mono text-2xl font-semibold leading-none text-[#15161C] 2xl:text-3xl">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 2xl:mt-6">
              <div className="mb-2 flex items-center justify-between gap-3 2xl:mb-3">
                <p className="text-[13px] font-medium text-[#30323A] 2xl:text-[15px]">
                  Detected Fonts
                </p>
                <p className="text-[12px] text-[#777985] 2xl:text-sm">
                  {missingFontCount} missing
                </p>
              </div>
              <div className="flex max-h-[190px] flex-wrap gap-2 overflow-y-auto pr-1 [scrollbar-color:#C7CBD6_transparent] [scrollbar-width:thin] 2xl:max-h-[240px] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#C7CBD6] [&::-webkit-scrollbar-track]:bg-transparent">
                {fontChips.length > 0 ? (
                  fontChips.map((font, index) => {
                    const label = chipLabel(font);
                    const isMissing = missingFontKeys.has(label.toLowerCase());
                    return (
                      <span
                        key={`${font.name}-${index}`}
                        className={`max-w-full truncate rounded-full border px-3 py-1.5 text-[12px] 2xl:px-3.5 2xl:text-[13px] ${isMissing
                          ? "border-[#FDBA74] bg-[#FFF7ED] text-[#C2410C]"
                          : "border-[#DDEADF] bg-[#F4FBF6] text-[#236C4A]"
                          }`}
                        title={label}
                      >
                        {label}
                      </span>
                    );
                  })
                ) : (
                  <span className="rounded-full border border-[#E1E2E8] bg-[#F0F1F4] px-3 py-1.5 text-[12px] text-[#555862] 2xl:text-[13px]">
                    No fonts detected
                  </span>
                )}
              </div>
            </div>

            {uploadedMissingCount > 0 ? (
              <div className="mt-4 rounded-[8px] border border-[#CFEBDD] bg-[#F0FBF5] px-3 py-2.5 text-[12px] text-[#236C4A] 2xl:text-[13px]">
                {uploadedMissingCount} missing font{uploadedMissingCount === 1 ? "" : "s"} uploaded.
              </div>
            ) : null}
          </div>

          <aside className="h-fit rounded-[10px] border border-[#E3E5EC] bg-white p-4 shadow-[0_12px_34px_rgba(16,24,40,0.05)] sm:p-5 2xl:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-[#181A22] 2xl:text-lg">
                  Missing Fonts
                </h3>
                <p className="mt-1 text-[12px] leading-relaxed text-[#70737D] 2xl:text-sm">
                  Upload exact font files or continue with fallbacks.
                </p>
              </div>
              <span className="rounded-full border border-[#E5E7EF] bg-white px-2.5 py-1 text-[11px] font-medium text-[#555862] 2xl:text-xs">
                {pendingMissingFonts.length} left
              </span>
            </div>

            {hasPendingMissingFonts && !isUploading ? (
              <div className="mt-4 rounded-[7px] border border-[#FDE4C2] bg-[#FFFBF5] px-3 py-2.5 text-[12px] leading-relaxed text-[#8A5B2C] 2xl:text-[13px]">
                Continuing without uploads will use available fallback fonts.
              </div>
            ) : null}

            {missingFonts.length > 0 ? (
              <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-1 [scrollbar-color:#C7CBD6_transparent] [scrollbar-width:thin] 2xl:mt-5 2xl:max-h-[430px] 2xl:space-y-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#C7CBD6] [&::-webkit-scrollbar-track]:bg-transparent">
                {missingFonts.map((font, index) => {
                  const fontName = font.name;
                  const isUploaded = uploadedFontNames.has(fontName);
                  const selectedFallback = selectedFallbackFonts[fontName];
                  return (
                    <div key={`${fontName}-${index}`} className="rounded-[8px] border border-[#ECECF2] bg-white p-3 2xl:p-4">
                      <div className="mb-2 flex items-center justify-between gap-2 2xl:mb-3">
                        <p className="min-w-0 truncate text-[12px] font-medium text-[#30323A] 2xl:text-sm" title={fontName}>
                          {fontName}
                        </p>
                        {isUploaded ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[10px] font-medium text-[#237A50] 2xl:text-[11px]">
                            <Check className="h-3 w-3" />
                            Uploaded
                          </span>
                        ) : null}
                      </div>
                      <input
                        ref={(node) => {
                          fileInputRefs.current[fontName] = node;
                        }}
                        type="file"
                        accept=".ttf,.otf,.woff,.woff2,.eot"
                        className="hidden"
                        onChange={(event) => handleFontFile(fontName, event)}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRefs.current[fontName]?.click()}
                        disabled={isUploading}
                        className="flex h-9 w-full items-center justify-center gap-2 rounded-[5px] border border-[#D9DAE2] bg-white px-3 text-[12px] font-medium text-[#25272F] transition hover:border-[#B9ABFF] hover:bg-[#FAFAFF] disabled:cursor-not-allowed disabled:opacity-60 2xl:h-10 2xl:text-[13px]"
                      >
                        <Upload className="h-3.5 w-3.5 2xl:h-4 2xl:w-4" />
                        {isUploaded ? "Replace Font File" : "Upload Font File"}
                      </button>
                      <div className="relative mt-2 2xl:mt-2.5">
                        <select
                          aria-label={`Fallback font for ${fontName}`}
                          disabled={isUploading}
                          className="h-9 w-full appearance-none rounded-[5px] border border-[#D9DAE2] bg-white px-3 pr-8 text-[12px] text-[#282A32] outline-none transition hover:border-[#B9ABFF] disabled:cursor-not-allowed disabled:opacity-60 2xl:h-10 2xl:text-[13px]"
                          value={selectedFallback?.family ?? ""}
                          onChange={(event) => {
                            const option = googleFontOptions.find(
                              (item) => item.family === event.target.value,
                            );
                            if (option) onFallbackFontChange(fontName, option);
                          }}
                        >
                          {googleFontOptions.length === 0 ? (
                            <option value="">Loading Google fonts...</option>
                          ) : null}
                          {googleFontOptions.map((option) => (
                            <option key={option.family} value={option.family}>
                              {option.family}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black" />
                      </div>
                      {selectedFallback ? (
                        <p
                          className="mt-1.5 truncate text-[10px] text-[#777985] 2xl:text-[11px]"
                          title={`${fontName} -> ${selectedFallback.family} (${selectedFallback.cssUrl})`}
                        >
                          Replaces with {selectedFallback.family}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 flex min-h-[180px] flex-col items-center justify-center rounded-[8px] border border-[#DDEADF] bg-[#F4FBF6] px-4 text-center 2xl:min-h-[220px]">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2CA36B] text-white 2xl:h-11 2xl:w-11">
                  <Check className="h-4 w-4 2xl:h-5 2xl:w-5" />
                </span>
                <p className="mt-3 text-[13px] font-medium text-[#236C4A] 2xl:text-[15px]">
                  All fonts resolved
                </p>
              </div>
            )}
          </aside>
        </div>

        {isUploading ? (
          <div className="mt-4 rounded-[10px] border border-[#E7E8EE] bg-white p-4 shadow-[0_8px_28px_rgba(16,24,40,0.05)] sm:p-5 2xl:mt-5 2xl:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-white 2xl:h-11 2xl:w-11">
                <LayoutPanelTop className="h-4 w-4 2xl:h-5 2xl:w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[16px] font-semibold text-black 2xl:text-xl">
                    Creating Preview
                  </h2>
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#7A5AF8] 2xl:h-6 2xl:w-6" />
                </div>
                <div className="mt-3 grid gap-2 text-[13px] text-[#777985] sm:grid-cols-3 2xl:text-[15px]">
                  <p className="font-medium text-black">Extracting Slides</p>
                  <p className="font-medium text-black">Preparing Fonts</p>
                  <p className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7A5AF8] 2xl:h-4 2xl:w-4" />
                    Rendering Preview
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

const SLIDE_WIDTH = EDITOR_STAGE_WIDTH;
const SLIDE_HEIGHT = EDITOR_STAGE_HEIGHT;

function ResponsiveSlideViewport({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateWidth = () => setWidth(node.clientWidth);
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = width > 0 ? Math.min((width / SLIDE_WIDTH) * 0.98, 1) : 0;

  return (
    <div
      ref={containerRef}
      className={`relative mx-auto w-full max-w-[1280px] ${className}`}
    >
      <div
        className="relative mx-auto overflow-hidden"
        style={{
          width: scale > 0 ? SLIDE_WIDTH * scale : "100%",
          height: scale > 0 ? SLIDE_HEIGHT * scale : undefined,
          aspectRatio: scale > 0 ? undefined : "16 / 9",
        }}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            width: SLIDE_WIDTH,
            height: SLIDE_HEIGHT,
            transformOrigin: "top left",
            transform: scale > 0 ? `scale(${scale})` : undefined,
          }}
        >
          {scale > 0 ? children : null}
        </div>
      </div>
    </div>
  );
}

function KonvaLayoutSlide({
  layout,
  fonts,
  slideKey,
  className = "border border-[#E8E8EF] bg-white shadow-[0_2px_16px_rgba(16,24,40,0.06)]",
}: {
  layout: TemplateV2Layout;
  fonts?: Record<string, string>;
  slideKey: string;
  className?: string;
}) {
  return (
    <ResponsiveSlideViewport className={className}>
      <TemplateV2LayoutPreview
        key={slideKey}
        layout={layout}
        fonts={fonts}
        useKonvaRenderer
      />
    </ResponsiveSlideViewport>
  );
}

function GeneratingSlidesOverlay() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center sm:bottom-8">
      <span className="relative z-20 flex items-center overflow-hidden rounded-[50px] bg-white px-4 py-2.5 text-sm font-medium text-[#666666] shadow-[0_2px_12px_rgba(16,24,40,0.08)]">
        <span aria-hidden className="generating-slides-background absolute" />
        <span className="relative z-10 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#9034EA]" />
          Generating slides...
        </span>
      </span>
    </div>
  );
}

function EmptyGeneratingSlide() {
  return (
    <ResponsiveSlideViewport className="border border-[#E8E8EF] bg-white shadow-[0_2px_16px_rgba(16,24,40,0.06)]">
      <div className="relative h-full w-full bg-white">
        <GeneratingSlidesOverlay />
      </div>
    </ResponsiveSlideViewport>
  );
}

function ScaledScreenshotSlide({ src, alt }: { src: string; alt: string }) {
  return (
    <ResponsiveSlideViewport className="border border-[#E8E8EF] bg-white shadow-[0_2px_16px_rgba(16,24,40,0.06)]">
      <img
        src={resolveBackendAssetUrl(src)}
        alt={alt}
        className="block h-full w-full"
        draggable={false}
      />
    </ResponsiveSlideViewport>
  );
}

function ThumbnailStrip({
  slides,
  urls,
  selectedIndex,
  onSelect,
  bottomOffset = "bottom-[88px] sm:bottom-[96px] 2xl:bottom-[104px]",
}: {
  slides?: ProcessedSlide[];
  urls?: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  bottomOffset?: string;
}) {
  const count = slides?.length ?? urls?.length ?? 0;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const node = scrollRef.current;
    if (!node) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    const maxScrollLeft = node.scrollWidth - node.clientWidth;
    setCanScrollLeft(node.scrollLeft > 1);
    setCanScrollRight(node.scrollLeft < maxScrollLeft - 1);
  }, []);

  useEffect(() => {
    updateScrollState();

    const node = scrollRef.current;
    if (!node) return;

    node.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateScrollState)
        : null;
    observer?.observe(node);

    return () => {
      node.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
      observer?.disconnect();
    };
  }, [count, updateScrollState]);

  const scrollThumbnails = useCallback(
    (direction: -1 | 1) => {
      const node = scrollRef.current;
      if (!node) return;

      const distance = Math.max(180, node.clientWidth * 0.72);
      node.scrollBy({ left: direction * distance, behavior: "smooth" });
      window.setTimeout(updateScrollState, 260);
    },
    [updateScrollState],
  );

  return (
    <div
      className={`fixed ${bottomOffset} left-1/2 z-20 w-[calc(100vw-2rem)] max-w-[min(100%,1280px)] -translate-x-1/2 sm:w-[calc(100vw-4rem)]`}
    >
      <button
        type="button"
        onClick={() => scrollThumbnails(-1)}
        aria-label="Scroll thumbnails left"
        className={`absolute left-0 top-1/2 z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#E6E7ED] bg-white/95 text-black shadow-[0_2px_10px_rgba(16,24,40,0.14)] transition sm:h-9 sm:w-9 ${canScrollLeft ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
      </button>
      <div
        ref={scrollRef}
        className="hide-scrollbar flex max-w-full items-center gap-2 overflow-x-auto overscroll-x-contain rounded-[8px] px-1 pb-3 pt-1 [-webkit-overflow-scrolling:touch] sm:gap-3 2xl:gap-4"
      >
        {Array.from({ length: count }, (_, index) => {
          const slide = slides?.[index];
          const url = urls?.[index] ?? slide?.screenshot_url;
          const isReady = slide
            ? Boolean(slide.processed && !slide.processing && slide.v2Layout)
            : Boolean(url);
          const isSelected = selectedIndex === index;

          return (
            <button
              key={`thumb-${index}`}
              type="button"
              onClick={() => onSelect(index)}
              className={`relative aspect-video w-[76px] shrink-0 overflow-visible rounded-[5px] border bg-white p-0 transition sm:w-[86px] sm:rounded-[6px] 2xl:w-[96px] ${isSelected ? "border-[#D9D9E2] ring-1 ring-[#D9D9E2]" : "border-[#ECECF2]"
                }`}
            >
              {isReady && url ? (
                <img
                  src={resolveBackendAssetUrl(url)}
                  alt={`Slide ${index + 1}`}
                  className="h-full w-full rounded-[5px] object-cover sm:rounded-[6px]"
                  draggable={false}
                />
              ) : (
                <div className="h-full w-full rounded-[5px] bg-white sm:rounded-[6px]" />
              )}
              <span className="absolute -bottom-1.5 -left-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-[#E6E7ED] bg-white text-[9px] text-black shadow-sm sm:-bottom-2 sm:-left-2 sm:h-5 sm:w-5 sm:text-[10px]">
                {index + 1}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => scrollThumbnails(1)}
        aria-label="Scroll thumbnails right"
        className={`absolute right-0 top-1/2 z-10 flex h-8 w-8 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#E6E7ED] bg-white/95 text-black shadow-[0_2px_10px_rgba(16,24,40,0.14)] transition sm:h-9 sm:w-9 ${canScrollRight ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
      </button>
    </div>
  );
}

function hasRenderableKonvaLayout(
  slide: ProcessedSlide | undefined,
): slide is ProcessedSlide & { v2Layout: TemplateV2Layout } {
  return Boolean(slide?.v2Layout && slide.processed && !slide.processing);
}

function ReviewSlideCanvas({
  slide,
  fonts,
  isGenerating = false,
}: {
  slide: ProcessedSlide | undefined;
  fonts?: Record<string, string>;
  isGenerating?: boolean;
}) {
  if (hasRenderableKonvaLayout(slide)) {
    return (
      <KonvaLayoutSlide
        layout={slide.v2Layout}
        fonts={fonts}
        slideKey={`${slide.slide_number}-${slide.v2Layout.id ?? slide.layout_id ?? "layout"}`}
      />
    );
  }

  if (isGenerating) {
    return <EmptyGeneratingSlide />;
  }

  if (!slide) {
    return (
      <ResponsiveSlideViewport className="border border-[#E8E8EF] bg-white">
        <div className="h-full w-full bg-white" />
      </ResponsiveSlideViewport>
    );
  }

  if (slide.screenshot_url) {
    return (
      <ScaledScreenshotSlide
        src={slide.screenshot_url}
        alt={`Slide ${slide.slide_number}`}
      />
    );
  }

  return (
    <ResponsiveSlideViewport className="border border-[#E8E8EF] bg-[#F7F7FA]">
      <div className="flex h-full w-full items-center justify-center text-sm text-[#777985] 2xl:text-base">
        {slide.processing ? "Generating slide..." : "Slide unavailable"}
      </div>
    </ResponsiveSlideViewport>
  );
}

function SelectionHandles() {
  const handleClass =
    "absolute z-20 h-[13px] w-[13px] rounded-full border border-[#D9DAE2] bg-white shadow-[0_1px_4px_rgba(16,24,40,0.18)]";
  const sideClass =
    "absolute z-20 rounded-[3px] border border-[#E4E4EA] bg-white shadow-[0_1px_4px_rgba(16,24,40,0.14)]";

  return (
    <>
      <span className={`${handleClass} -left-[7px] -top-[7px]`} />
      <span className={`${handleClass} -right-[7px] -top-[7px]`} />
      <span className={`${handleClass} -bottom-[7px] -left-[7px]`} />
      <span className={`${handleClass} -bottom-[7px] -right-[7px]`} />
      <span className={`${sideClass} left-1/2 top-[-4px] h-2 w-4 -translate-x-1/2`} />
      <span className={`${sideClass} bottom-[-4px] left-1/2 h-2 w-4 -translate-x-1/2`} />
      <span className={`${sideClass} left-[-4px] top-1/2 h-4 w-2 -translate-y-1/2`} />
      <span className={`${sideClass} right-[-4px] top-1/2 h-4 w-2 -translate-y-1/2`} />
    </>
  );
}

function PreviewPanel({
  previewUrls,
  selectedIndex,
  onSelect,
}: {
  previewUrls: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const selectedUrl = previewUrls[selectedIndex] ?? previewUrls[0];

  return (
    <main className="min-h-screen bg-white px-4 pb-44 pt-[80px] font-syne sm:px-6 sm:pb-48 sm:pt-[92px] 2xl:px-10 2xl:pb-52 2xl:pt-[104px]">
      <div className="relative mx-auto w-full max-w-[1280px]">
        {selectedUrl ? (
          <ScaledScreenshotSlide
            src={selectedUrl}
            alt={`Slide ${selectedIndex + 1}`}
          />
        ) : (
          <ResponsiveSlideViewport className="border border-[#E8E8EF] bg-[#F7F7FA]">
            <div className="flex h-full w-full items-center justify-center text-sm text-[#777985] 2xl:text-base">
              Preview unavailable
            </div>
          </ResponsiveSlideViewport>
        )}
      </div>

      <ThumbnailStrip urls={previewUrls} selectedIndex={selectedIndex} onSelect={onSelect} />
    </main>
  );
}

function ReviewPanel({
  slides,
  selectedIndex,
  onSelect,
  retrySlide,
  setSlides,
  fonts,
  enableEditing = false,
  isGenerating = false,
}: {
  slides: ProcessedSlide[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  retrySlide: (index: number) => void;
  setSlides: React.Dispatch<React.SetStateAction<ProcessedSlide[]>>;
  fonts?: Record<string, string>;
  enableEditing?: boolean;
  isGenerating?: boolean;
}) {
  const selectedSlide = slides[selectedIndex] ?? slides[0];
  const isReady =
    Boolean(selectedSlide?.processed && !selectedSlide.processing && selectedSlide.v2Layout) ||
    Boolean(selectedSlide?.screenshot_url && selectedSlide?.processed);

  const handleDelete = () => {
    if (!selectedSlide) return;
    setSlides((current) => current.filter((_, index) => index !== selectedIndex));
    onSelect(Math.max(0, selectedIndex - 1));
  };

  return (
    <main className="min-h-screen bg-white px-4 pb-44 pt-[80px] font-syne sm:px-6 sm:pb-48 sm:pt-[92px] 2xl:px-10 2xl:pb-52 2xl:pt-[104px]">
      <div className="relative mx-auto w-full max-w-[1280px]">
        <div
          className={`relative ${enableEditing ? "" : ""}`}
        >
          {enableEditing ? (
            <div className="relative border border-[#7A5AF8] bg-white shadow-[0_2px_16px_rgba(16,24,40,0.08)]">
              <SelectionHandles />
              <div className="absolute left-1/2 top-2 z-30 -translate-x-1/2 rounded-[5px] border border-[#E6E7EC] bg-white px-2 py-1.5 shadow-[0_4px_12px_rgba(16,24,40,0.12)] sm:top-3 2xl:px-3 2xl:py-2">
                <div className="flex items-center gap-1 2xl:gap-1.5">
                  <button
                    type="button"
                    onClick={() => retrySlide(selectedIndex)}
                    disabled={!selectedSlide || selectedSlide.processing}
                    className="h-8 rounded-[4px] px-2.5 text-[12px] font-medium text-black transition hover:bg-[#F6F6F9] disabled:cursor-not-allowed disabled:opacity-50 2xl:h-9 2xl:px-3 2xl:text-sm"
                  >
                    Re-Construct
                  </button>
                  <span className="h-6 w-px bg-[#E8E8EE] 2xl:h-7" />
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={!isReady}
                    className="flex h-8 w-8 items-center justify-center rounded-[4px] text-black transition hover:bg-[#F6F6F9] disabled:cursor-not-allowed disabled:opacity-50 2xl:h-9 2xl:w-9"
                    aria-label="Delete slide"
                  >
                    <Trash2 className="h-4 w-4 2xl:h-[18px] 2xl:w-[18px]" />
                  </button>
                </div>
              </div>
              <ReviewSlideCanvas slide={selectedSlide} fonts={fonts} isGenerating={false} />
            </div>
          ) : (
            <ReviewSlideCanvas
              slide={selectedSlide}
              fonts={fonts}
              isGenerating={isGenerating}
            />
          )}
        </div>
      </div>

      <ThumbnailStrip
        slides={slides}
        selectedIndex={selectedIndex}
        onSelect={onSelect}
      />
    </main>
  );
}

function SaveTemplateModal({
  isOpen,
  defaultName,
  isSaving,
  title = "Save Template",
  subtitle = "Give your template a name.",
  submitLabel = "Save",
  onClose,
  onSave,
}: {
  isOpen: boolean;
  defaultName: string;
  isSaving: boolean;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  onClose: () => void;
  onSave: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setDescription("");
    }
  }, [defaultName, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    void onSave(trimmedName, description.trim());
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 px-4 2xl:px-6 font-syne">
      <div className="relative w-full max-w-[512px] 2xl:max-w-[600px] rounded-[14px] 2xl:rounded-[16px] bg-white shadow-[0_18px_55px_rgba(16,24,40,0.18)]">
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          aria-label="Close"
          className="absolute -right-[54px] 2xl:-right-[62px] top-0 flex h-[46px] w-[46px] 2xl:h-[52px] 2xl:w-[52px] items-center justify-center rounded-full bg-white text-black shadow-sm disabled:opacity-50"
        >
          <X className="h-6 w-6 2xl:h-7 2xl:w-7" />
        </button>
        <div className="flex h-[74px] 2xl:h-[84px] items-center justify-between border-b border-[#EDEEF3] px-5 2xl:px-6">
          <div>
            <h2 className="text-[16px] 2xl:text-lg font-medium text-black">{title}</h2>
            <p className="mt-1 text-[11px] 2xl:text-[13px] text-[#7E818C]">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving || !name.trim()}
            className="inline-flex h-8 2xl:h-9 min-w-[78px] 2xl:min-w-[88px] items-center justify-center rounded-[58px] px-5 2xl:px-6 text-[13px] 2xl:text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: pillGradient }}
          >
            {isSaving ? <Loader2 className="h-4 w-4 2xl:h-5 2xl:w-5 animate-spin" /> : submitLabel}
          </button>
        </div>

        <div className="space-y-4 2xl:space-y-5 px-[18px] 2xl:px-6 pb-[18px] 2xl:pb-6 pt-5 2xl:pt-6">
          <label className="block">
            <span className="mb-2 2xl:mb-2.5 block text-[12px] 2xl:text-sm font-medium text-[#25272F]">
              Template Name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isSaving}
              placeholder="e.g. Modern Tech Pitch Deck"
              className="h-9 2xl:h-10 w-full rounded-[5px] border border-[#E1E2E8] bg-white px-3 2xl:px-4 text-[13px] 2xl:text-[15px] text-black outline-none placeholder:text-[#8C8E96] focus:border-[#B9ABFF]"
            />
          </label>
          <label className="block">
            <span className="mb-2 2xl:mb-2.5 block text-[12px] 2xl:text-sm font-medium text-[#25272F]">
              Description
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={isSaving}
              placeholder="Briefly describe when or how this template should be used."
              rows={4}
              className="h-[86px] 2xl:h-[100px] w-full resize-none rounded-[5px] border border-[#E1E2E8] bg-white px-3 2xl:px-4 py-3 2xl:py-3.5 text-[13px] 2xl:text-[15px] text-black outline-none placeholder:text-[#8C8E96] focus:border-[#B9ABFF]"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

type CustomTemplatePageProps = {
  useTemplateV2Generation?: boolean;
};

const CustomTemplatePage = ({
  useTemplateV2Generation = true,
}: CustomTemplatePageProps) => {
  const router = useRouter();
  const llmConfig = useSelector((state: RootState) => state.userConfig.llm_config);
  const [reviewSlideIndex, setReviewSlideIndex] = useState(0);
  const [templateModalMode, setTemplateModalMode] = useState<"create" | "save" | null>(null);
  const [isSubmittingTemplate, setIsSubmittingTemplate] = useState(false);
  const [googleFontOptions, setGoogleFontOptions] = useState<GoogleFontOption[]>([]);
  const [selectedFallbackFonts, setSelectedFallbackFonts] = useState<
    Record<string, GoogleFontOption>
  >({});

  const {
    selectedFile,
    handleFileSelect,
    handleRawFileSelect,
    removeFile,
  } = useFileUpload();

  const {
    state,
    uploadedFonts,
    slides,
    setSlides,
    checkFonts,
    uploadFont,
    fontUploadAndPreview,
    retrySlide,
  } = useTemplateCreation({ useTemplateV2Generation });

  const defaultTemplateName = getDefaultTemplateName(selectedFile) || "Untitled Template";
  const activeStep = activeStudioStep(state.step);
  const showUpload = state.step === "file-upload";
  const showAnalyze = state.step === "font-check" || state.step === "font-upload";
  const previewUrls = state.previewData?.slide_image_urls ?? [];
  const showPreview = state.step === "slides-preview" && previewUrls.length > 0;
  const showReview =
    (state.step === "template-creation" || state.step === "completed") && slides.length > 0;
  const isFinalReview = state.step === "completed";
  const isGenerating = state.step === "template-creation";
  const generatedSlidesReady =
    isFinalReview && slides.some((slide) => slide.processed && !slide.error);
  const isTemplateModalOpen = templateModalMode !== null;
  const isCreateTemplateModal = templateModalMode === "create";

  const missingFonts = state.fontsData?.unavailable_fonts ?? [];
  const uploadedFontNames = useMemo(
    () => new Set(uploadedFonts.map((font) => font.fontName)),
    [uploadedFonts],
  );
  const pendingMissingFonts = useMemo(
    () => missingFonts.filter((font) => !uploadedFontNames.has(font.name)),
    [missingFonts, uploadedFontNames],
  );
  const hasPendingMissingFonts = pendingMissingFonts.length > 0;
  const selectedGoogleFontReplacements = useMemo<
    Record<string, { fontName: string; fontUrl: string }>
  >(
    () =>
      Object.fromEntries(
        pendingMissingFonts.flatMap((font) => {
          const selectedFont = selectedFallbackFonts[font.name];
          if (!selectedFont?.family || !selectedFont.cssUrl) return [];
          return [
            [
              font.name,
              {
                fontName: selectedFont.family,
                fontUrl: selectedFont.cssUrl,
              },
            ] as const,
          ];
        }),
      ),
    [pendingMissingFonts, selectedFallbackFonts],
  );
  const selectedGoogleFontAssets = useMemo<Record<string, string>>(
    () =>
      Object.fromEntries(
        Object.values(selectedGoogleFontReplacements).map((font) => [
          font.fontName,
          font.fontUrl,
        ]),
      ),
    [selectedGoogleFontReplacements],
  );
  const handleFallbackFontChange = useCallback(
    (fontName: string, option: GoogleFontOption) => {
      setSelectedFallbackFonts((current) => ({
        ...current,
        [fontName]: option,
      }));
    },
    [],
  );

  useEffect(() => {
    showTemplateV2ModelWarningIfNeeded(llmConfig);
    return () => {
      dismissTemplateV2ModelWarning();
    };
  }, [llmConfig]);

  useEffect(() => {
    const existingScript = document.querySelector('script[src*="tailwindcss.com"]');
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = TAILWIND_CDN_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadGoogleFontOptions()
      .then((options) => {
        if (!cancelled) setGoogleFontOptions(options);
      })
      .catch((error) => {
        console.error("Failed to load Google font options", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (googleFontOptions.length === 0 || pendingMissingFonts.length === 0) return;

    setSelectedFallbackFonts((current) => {
      let changed = false;
      const next = { ...current };
      const pendingFontNames = new Set(pendingMissingFonts.map((font) => font.name));

      Object.keys(next).forEach((fontName) => {
        if (!pendingFontNames.has(fontName)) {
          delete next[fontName];
          changed = true;
        }
      });

      pendingMissingFonts.forEach((font) => {
        if (next[font.name]) return;
        const fallbackFont = preferredFallbackFont(font, googleFontOptions);
        if (!fallbackFont) return;
        next[font.name] = fallbackFont;
        changed = true;
      });

      return changed ? next : current;
    });
  }, [googleFontOptions, pendingMissingFonts]);

  useEffect(() => {
    if (!state.previewData?.fonts) return;
    loadFontAssets(normalizeBackendAssetUrls(state.previewData.fonts));
  }, [state.previewData?.fonts]);

  useEffect(() => {
    if (!showReview && !showPreview) return;
    const observer = setupImageUrlConverter();
    return () => observer?.disconnect();
  }, [showPreview, showReview]);

  useEffect(() => {
    setReviewSlideIndex((current) => {
      const slideCount =
        slides.length > 0
          ? slides.length
          : (state.previewData?.slide_image_urls.length ?? 0);
      if (slideCount === 0) return 0;
      return Math.min(current, slideCount - 1);
    });
  }, [slides.length, state.previewData?.slide_image_urls.length]);

  useEffect(() => {
    if (!isGenerating) return;
    setReviewSlideIndex((currentIndex) => {
      const currentGeneratingSlide = slides[state.currentSlideIndex];
      if (
        hasRenderableKonvaLayout(currentGeneratingSlide) ||
        (currentGeneratingSlide?.error && !currentGeneratingSlide.processing)
      ) {
        return state.currentSlideIndex;
      }

      if (hasRenderableKonvaLayout(slides[currentIndex])) {
        return currentIndex;
      }

      return state.currentSlideIndex;
    });
  }, [isGenerating, slides, state.currentSlideIndex]);

  const handleCheckFonts = useCallback(async () => {
    if (!selectedFile) return;
    await checkFonts(selectedFile);
  }, [checkFonts, selectedFile]);

  const handleFontUploadAndPreview = useCallback(async () => {
    if (!selectedFile) return;
    if (hasPendingMissingFonts) {
      notify.warning(
        "Missing fonts",
        "Continuing without uploaded font files. Selected Google replacements will be applied.",
      );
    }
    const data = await fontUploadAndPreview(
      selectedFile,
      selectedGoogleFontReplacements,
    );
    if (data) {
      loadFontAssets(normalizeBackendAssetUrls(data.fonts));
      trackEvent(MixpanelEvent.Templates_Build_Template_Clicked, {
        source: "template_studio_preview_ready",
        slide_count: data.slide_image_urls.length,
      });
    }
  }, [
    fontUploadAndPreview,
    hasPendingMissingFonts,
    loadFontAssets,
    selectedGoogleFontReplacements,
    selectedFile,
  ]);

  const handleCreateTemplate = useCallback(
    async (name: string, description: string) => {
      if (!state.previewData) {
        notify.error("Preview unavailable", "Create the slide preview before continuing.");
        return;
      }

      setIsSubmittingTemplate(true);
      try {
        trackEvent(MixpanelEvent.Templates_Build_Template_Clicked, {
          source: "template_studio_create_async",
          slide_count: state.previewData.slide_image_urls.length,
        });
        await TemplateService.createTemplate({
          pptx_url: state.previewData.modified_pptx_url,
          slide_image_urls: state.previewData.slide_image_urls,
          fonts: {
            ...state.previewData.fonts,
            ...selectedGoogleFontAssets,
          },
          name,
          description: description || null,
        });
        notify.success(
          "Template generation started",
          "You can track the template status from the Templates page.",
        );
        setTemplateModalMode(null);
        router.push("/templates?tab=custom");
      } catch (error) {
        notify.error(
          "Failed to create template",
          error instanceof Error ? error.message : "An unexpected error occurred",
        );
      } finally {
        setIsSubmittingTemplate(false);
      }
    },
    [router, selectedGoogleFontAssets, state.previewData],
  );

  const handleSaveTemplate = useCallback(
    async (name: string, description: string) => {
      if (!state.templateId) {
        notify.error("Template unavailable", "Generate the template before saving.");
        return;
      }

      setIsSubmittingTemplate(true);
      try {
        await TemplateService.updateTemplateMetadata(state.templateId, {
          name,
          description: description || null,
        });
        notify.success("Template saved", "The template was saved successfully.");
        setTemplateModalMode(null);
        router.push(`/template-preview?templateV2Id=${encodeURIComponent(state.templateId)}`);
      } catch (error) {
        notify.error(
          "Failed to save template",
          error instanceof Error ? error.message : "An unexpected error occurred",
        );
      } finally {
        setIsSubmittingTemplate(false);
      }
    },
    [router, state.templateId],
  );

  const handleTemplateModalSubmit = useCallback(
    async (name: string, description: string) => {
      if (templateModalMode === "save") {
        await handleSaveTemplate(name, description);
        return;
      }
      await handleCreateTemplate(name, description);
    },
    [handleCreateTemplate, handleSaveTemplate, templateModalMode],
  );

  const bottomAction = useMemo(() => {
    if (showAnalyze) {
      return (
        <GradientPillButton
          onClick={handleFontUploadAndPreview}
          disabled={state.isLoading}
          className={state.isLoading ? "disabled:opacity-100" : ""}
          fullWidth
        >
          {state.isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin 2xl:h-5 2xl:w-5" />
              Creating Preview...
            </>
          ) : (
            "Continue"
          )}
        </GradientPillButton>
      );
    }

    if (showPreview) {
      return (
        <GradientPillButton
          onClick={() => setTemplateModalMode("create")}
          disabled={state.isLoading || isSubmittingTemplate}
          fullWidth
        >
          {isSubmittingTemplate ? "Creating Template..." : "Create Template"}
        </GradientPillButton>
      );
    }

    if (showReview) {
      return (
        <GradientPillButton
          onClick={() => setTemplateModalMode("save")}
          disabled={!generatedSlidesReady || state.isLoading || isSubmittingTemplate}
          fullWidth
        >
          {generatedSlidesReady ? "Save as Template" : "Generating Template"}
        </GradientPillButton>
      );
    }

    return null;
  }, [
    generatedSlidesReady,
    isSubmittingTemplate,
    handleFontUploadAndPreview,
    showAnalyze,
    showPreview,
    showReview,
    state.isLoading,
  ]);

  return (
    <div className="relative min-h-screen bg-white">
      <div className={""}>
        <StudioTopBar activeStep={activeStep} />

        {showUpload ? (
          <UploadPanel
            selectedFile={selectedFile}
            isProcessing={state.isLoading}
            onFileInput={handleFileSelect}
            onFileDrop={handleRawFileSelect}
            onRemove={removeFile}
            onStart={handleCheckFonts}
          />
        ) : null}

        {showAnalyze ? (
          <AnalyzePanel
            fontsData={state.fontsData}
            uploadedFonts={uploadedFonts}
            isUploading={state.isLoading}
            uploadFont={uploadFont}
            hasPendingMissingFonts={hasPendingMissingFonts}
            googleFontOptions={googleFontOptions}
            selectedFallbackFonts={selectedFallbackFonts}
            onFallbackFontChange={handleFallbackFontChange}
          />
        ) : null}

        {showPreview ? (
          <PreviewPanel
            previewUrls={previewUrls}
            selectedIndex={reviewSlideIndex}
            onSelect={setReviewSlideIndex}
          />
        ) : null}

        {showReview ? (
          <ReviewPanel
            slides={slides}
            selectedIndex={reviewSlideIndex}
            onSelect={setReviewSlideIndex}
            retrySlide={retrySlide}
            setSlides={setSlides}
            fonts={state.previewData?.fonts}
            enableEditing={isFinalReview}
            isGenerating={isGenerating}
          />
        ) : null}
      </div>

      {bottomAction ? <StudioBottomAction>{bottomAction}</StudioBottomAction> : null}

      <SaveTemplateModal
        isOpen={isTemplateModalOpen}
        defaultName={defaultTemplateName}
        isSaving={isSubmittingTemplate}
        title={isCreateTemplateModal ? "Create Template" : "Save Template"}
        subtitle={
          isCreateTemplateModal
            ? "Name this template before generation starts."
            : "Give your template a name."
        }
        submitLabel={isCreateTemplateModal ? "Create" : "Save"}
        onClose={() => {
          if (!isSubmittingTemplate) setTemplateModalMode(null);
        }}
        onSave={handleTemplateModalSubmit}
      />


    </div>
  );
};

export default CustomTemplatePage;
