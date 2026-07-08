/* eslint-disable @next/next/no-img-element */
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  LayoutPanelTop,
  Loader2,
  RotateCcw,
  Trash2,
  Type,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import { useSelector } from "react-redux";

import { notify } from "@/components/ui/sonner";
import type { RootState } from "@/store/store";
import { normalizeBackendAssetUrls, resolveBackendAssetUrl } from "@/utils/api";
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

type LibreOfficeGateState =
  | "checking"
  | "ready"
  | "missing"
  | "installing"
  | "error";
type LibreOfficeGateSnapshot = {
  status: LibreOfficeGateState;
  message: string;
  progress?: number;
};
type LibreOfficeGateAction = {
  type: "set";
  payload: Partial<LibreOfficeGateSnapshot>;
};

type StudioStep = 1 | 2 | 3 | 4;

const initialLibreOfficeGate: LibreOfficeGateSnapshot = {
  status: "checking",
  message: "Checking LibreOffice availability...",
};

const studioSteps: { id: StudioStep; label: string }[] = [
  { id: 1, label: "Upload" },
  { id: 2, label: "Analyze" },
  { id: 3, label: "Generate" },
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

function libreOfficeGateReducer(
  state: LibreOfficeGateSnapshot,
  action: LibreOfficeGateAction,
): LibreOfficeGateSnapshot {
  if (action.type === "set") {
    return { ...state, ...action.payload };
  }
  return state;
}

const LibreOfficeGate = ({
  status,
  message,
  progress,
  onInstall,
  onCancel,
  onRecheck,
  onExit,
}: {
  status: LibreOfficeGateState;
  message: string;
  progress?: number;
  onInstall: () => void;
  onCancel: () => void;
  onRecheck: () => void;
  onExit: () => void;
}) => {
  if (status === "ready") return null;

  const isChecking = status === "checking";
  const isInstalling = status === "installing";
  const isBusy = isChecking || isInstalling;
  const percent =
    typeof progress === "number" ? Math.max(0, Math.min(100, progress)) : undefined;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#101323]/30 px-4 backdrop-blur-[5px]">
      <div className="relative w-full max-w-[460px] rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={isInstalling ? onCancel : onExit}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6B7280] transition hover:bg-[#F3F4F6] hover:text-[#101323]"
          aria-label={isInstalling ? "Cancel LibreOffice installation" : "Go back"}
          title={isInstalling ? "Cancel install" : "Go back"}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#EBE9FE] text-[#6D5BD0]">
            {isBusy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Wrench className="h-5 w-5" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#101323]">
              Install LibreOffice to continue
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#5D6375]">
              Template Studio uses LibreOffice to convert uploaded PPTX files before
              generating reusable templates.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-[#EEF0F4] bg-[#FAFAFF] px-4 py-3 text-sm text-[#3A4054]">
          {message}
        </div>

        {isInstalling && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-[#EDEEF5]">
              <div
                className={`h-full rounded-full bg-[#6D5BD0] transition-all ${percent === undefined ? "w-1/2 animate-pulse" : ""}`}
                style={percent === undefined ? undefined : { width: `${percent}%` }}
              />
            </div>
          </div>
        )}

        {isInstalling ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled
              className="inline-flex h-11 flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-[#B8BDCB] px-4 text-sm font-semibold text-white"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Installing...
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#D9DCE7] px-4 text-sm font-semibold text-[#101323] transition hover:bg-[#F6F7FB]"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onInstall}
              disabled={isChecking}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#101323] px-4 text-sm font-semibold text-white transition hover:bg-[#252A3F] disabled:cursor-not-allowed disabled:bg-[#B8BDCB] sm:col-span-2"
            >
              {isChecking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Install LibreOffice
            </button>
            <button
              type="button"
              onClick={onRecheck}
              disabled={isChecking}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#D9DCE7] px-4 text-sm font-semibold text-[#101323] transition hover:bg-[#F6F7FB] disabled:cursor-not-allowed disabled:text-[#9AA1B5]"
            >
              <RotateCcw className="h-4 w-4" />
              Recheck
            </button>
            <button
              type="button"
              onClick={onExit}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#D9DCE7] px-4 text-sm font-semibold text-[#101323] transition hover:bg-[#F6F7FB]"
            >
              <ArrowLeft className="h-4 w-4" />
              Go back
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

function useLibreOfficeGate(router: ReturnType<typeof useRouter>) {
  const [libreGate, dispatchLibreGate] = useReducer(
    libreOfficeGateReducer,
    initialLibreOfficeGate,
  );

  const checkLibreOffice = useCallback(async () => {
    const api = window.electron;
    if (!api?.checkLibreOffice) {
      dispatchLibreGate({ type: "set", payload: { status: "ready" } });
      return;
    }

    dispatchLibreGate({
      type: "set",
      payload: {
        status: "checking",
        message: "Checking LibreOffice availability...",
        progress: undefined,
      },
    });
    try {
      const result = await api.checkLibreOffice();
      if (result.installed) {
        dispatchLibreGate({
          type: "set",
          payload: {
            status: "ready",
            message: "LibreOffice is ready.",
            progress: undefined,
          },
        });
      } else {
        dispatchLibreGate({
          type: "set",
          payload: {
            status: "missing",
            message: "LibreOffice is not installed yet. Install it to use Template Studio.",
            progress: undefined,
          },
        });
      }
    } catch (error) {
      dispatchLibreGate({
        type: "set",
        payload: {
          status: "error",
          message: error instanceof Error ? error.message : "Could not check LibreOffice.",
          progress: undefined,
        },
      });
    }
  }, []);

  useEffect(() => {
    void checkLibreOffice();
  }, [checkLibreOffice]);

  useEffect(() => {
    const api = window.electron;
    if (!api?.onLibreOfficeProgress || !api?.onLibreOfficeLog) {
      return;
    }

    const offProgress = api.onLibreOfficeProgress((payload) => {
      if (payload.phase === "downloading" || payload.phase === "installing") {
        dispatchLibreGate({
          type: "set",
          payload: {
            status: "installing",
            progress: payload.percent,
            ...(payload.message
              ? { message: payload.message.split("|").filter(Boolean).join(" - ") }
              : {}),
          },
        });
      } else if (payload.phase === "done") {
        dispatchLibreGate({
          type: "set",
          payload: {
            progress: 100,
            message: "LibreOffice is ready.",
          },
        });
        void checkLibreOffice();
      } else if (payload.phase === "error") {
        if (payload.message?.toLowerCase().includes("cancelled")) {
          dispatchLibreGate({
            type: "set",
            payload: {
              status: "missing",
              progress: undefined,
              message:
                "LibreOffice installation cancelled. You can install it later to use Template Studio.",
            },
          });
          return;
        }
        dispatchLibreGate({
          type: "set",
          payload: {
            status: "error",
            progress: undefined,
            message: payload.message || "LibreOffice installation failed.",
          },
        });
      }
    });
    const offLog = api.onLibreOfficeLog((payload) => {
      if (payload.level === "error" && payload.text) {
        dispatchLibreGate({
          type: "set",
          payload: { message: payload.text },
        });
      }
    });

    return () => {
      offProgress();
      offLog();
    };
  }, [checkLibreOffice]);

  const installLibreOffice = useCallback(async () => {
    const api = window.electron;
    if (!api?.installLibreOffice) {
      dispatchLibreGate({
        type: "set",
        payload: {
          status: "error",
          message: "LibreOffice installer is unavailable in this build.",
          progress: undefined,
        },
      });
      return;
    }

    dispatchLibreGate({
      type: "set",
      payload: {
        status: "installing",
        progress: undefined,
        message: "Preparing LibreOffice installer...",
      },
    });
    try {
      const result = await api.installLibreOffice();
      if (result?.ok) {
        await checkLibreOffice();
        return;
      }
      if (result?.cancelled) {
        dispatchLibreGate({
          type: "set",
          payload: {
            status: "missing",
            progress: undefined,
            message:
              "LibreOffice installation cancelled. You can install it later to use Template Studio.",
          },
        });
        return;
      }
      dispatchLibreGate({
        type: "set",
        payload: {
          status: "error",
          progress: undefined,
          message: result?.error || "LibreOffice installation failed.",
        },
      });
    } catch (error) {
      dispatchLibreGate({
        type: "set",
        payload: {
          status: "error",
          progress: undefined,
          message: error instanceof Error ? error.message : "LibreOffice installation failed.",
        },
      });
    }
  }, [checkLibreOffice]);

  const cancelLibreOfficeInstall = useCallback(async () => {
    const api = window.electron;
    dispatchLibreGate({
      type: "set",
      payload: { message: "Cancelling LibreOffice installation..." },
    });
    try {
      await api?.cancelLibreOfficeInstall?.();
    } finally {
      dispatchLibreGate({
        type: "set",
        payload: {
          status: "missing",
          progress: undefined,
          message:
            "LibreOffice installation cancelled. You can install it later to use Template Studio.",
        },
      });
    }
  }, []);

  const leaveTemplateStudio = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/templates");
  }, [router]);

  return {
    cancelLibreOfficeInstall,
    checkLibreOffice,
    installLibreOffice,
    leaveTemplateStudio,
    libreMessage: libreGate.message,
    libreProgress: libreGate.progress,
    libreStatus: libreGate.status,
  };
}

function activeStudioStep(step: TemplateCreationStep): StudioStep {
  if (step === "font-check" || step === "font-upload") return 2;
  if (step === "slides-preview" || step === "template-creation") return 3;
  if (step === "completed") return 4;
  return 1;
}

function StudioTopBar({
  activeStep,
  centerAction,
}: {
  activeStep: StudioStep;
  centerAction?: React.ReactNode;
}) {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[88px] bg-gradient-to-b from-white via-white to-white/0">
      <div className="relative mx-auto h-full max-w-[1280px] px-[70px]">
        <a
          href="/dashboard"
          className="pointer-events-auto absolute left-[70px] top-[26px] block h-[38px] w-[38px]"
          aria-label="Dashboard"
        >
          <img
            src="/logo-with-bg.png"
            alt="Presenton"
            className="h-full w-full"
            draggable={false}
          />
        </a>

        {centerAction ? (
          <div className="pointer-events-auto absolute left-1/2 top-6 -translate-x-1/2">
            {centerAction}
          </div>
        ) : null}

        <nav
          className="pointer-events-auto absolute right-[32px] top-[28px] flex items-center"
          aria-label="Template Studio progress"
        >
          {studioSteps.map((step, index) => {
            const isActive = step.id === activeStep;
            return (
              <React.Fragment key={step.id}>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] leading-none ${
                      isActive
                        ? "border-black bg-black text-white"
                        : "border-[#E4E5EB] bg-white text-[#9B9CA3]"
                    }`}
                  >
                    {step.id}
                  </span>
                  <span className="text-[11px] font-medium text-black">{step.label}</span>
                </div>
                {index < studioSteps.length - 1 ? (
                  <span className="mx-2 h-px w-[22px] bg-[#E9EAF0]" />
                ) : null}
              </React.Fragment>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function GradientPillButton({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-[58px] px-5 text-sm font-medium text-black shadow-none transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      style={{ background: pillGradient }}
    >
      {children}
    </button>
  );
}

function TemplateStudioTitle() {
  return (
    <div className="px-4 pt-[118px] text-center">
      <h1 className="font-unbounded text-[52px] font-normal leading-none tracking-[-1.6px] text-[#101323] md:text-[64px]">
        Template Studio
      </h1>
      <p className="mx-auto mt-5 max-w-[550px] text-center font-syne text-[18px] font-normal leading-[1.35] text-[#101323CC]">
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

      <section className="mt-12 w-full max-w-[760px] px-4">
        <div className="group relative">
          <div className="relative z-10 ml-8 w-max rounded-t-[28px] border border-b-0 border-[#EDEEF4] bg-white px-3 pb-2.5 pt-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-[34px] items-center gap-1.5 rounded-[80px] bg-white px-3.5 text-[12px] font-semibold text-black shadow-[0_0_4px_rgba(0,0,0,0.06)]"
            >
              <Upload className="h-3.5 w-3.5 text-[#7A5AF8]" />
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

          <div className="relative -mt-px rounded-[28px] border border-[#EDEEF4] bg-white p-2.5 shadow-[0_0_16px_rgba(80,71,230,0.08)] transition-shadow duration-200 group-hover:shadow-[0_8px_32px_rgba(80,71,230,0.16)]">
            <div
              className={`relative h-[120px] overflow-hidden rounded-[18px] border border-[#E8E8EF] bg-white ${
                selectedFile ? "" : "cursor-pointer"
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
                <div className="relative flex h-full items-center p-2">
                  <div
                    className="flex h-full min-w-0 items-center rounded-[14px] bg-[#F6F6FA] px-4 transition-[width] duration-300"
                    style={{ width: isProcessing ? "62%" : "85%" }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-[#20212A]">
                        {selectedFile.name}
                      </p>
                      <p className="mt-2 text-sm text-[#777985]">
                        {isProcessing ? "62%" : formatFileSize(selectedFile.size)}
                        <span className="px-2">•</span>
                        {isProcessing ? "Process" : "Ready"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove();
                    }}
                    disabled={isProcessing}
                    className="absolute right-3 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-[#E8E8EF] bg-[#EFF0F4] text-black disabled:opacity-50"
                    aria-label="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center">
                  <img
                    src="/upload_icon.png"
                    alt=""
                    className="h-[40px] w-[52px]"
                    draggable={false}
                  />
                  <p className="mt-4 text-sm font-normal text-[#8A8A93]">
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

        <ul className="mx-auto mt-6 flex max-w-[480px] items-center justify-between gap-5">
          {["Test in Real Time", "Max 100MB", "5min Generation"].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#EBE9FE]" />
              <span className="text-[13px] font-normal text-[#3A3A3A]">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-auto w-full pb-5 pt-12">
        <div className="mx-auto flex max-w-[558px] items-center gap-2 rounded-[6px] bg-[#F4F7FB] px-3 py-2 text-[11px] leading-tight text-[#505462]">
          <span className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full bg-[#0B4FBD] text-[10px] font-bold text-white">
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
  return font.family_name || font.name;
}

function uniqueFontChips(fontsData: FontData): FontItem[] {
  const seen = new Set<string>();
  return [...fontsData.unavailable_fonts, ...fontsData.available_fonts].filter((font) => {
    const key = chipLabel(font).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function AnalyzePanel({
  fontsData,
  uploadedFonts,
  isUploading,
  onContinue,
  uploadFont,
}: {
  fontsData: FontData | null;
  uploadedFonts: UploadedFont[];
  isUploading: boolean;
  onContinue: () => void;
  uploadFont: (fontName: string, file: File) => string | null;
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

  const handleFontFile = (fontName: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    uploadFont(fontName, file);
    event.target.value = "";
  };

  return (
    <main className="min-h-screen bg-white px-6 pb-24 pt-[132px] font-syne">
      <section className="mx-auto w-full max-w-[496px]">
        <div className="relative pl-12">
          {isUploading ? (
            <div className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-[#ECECF2]" />
          ) : null}

          <div className="relative">
            <div className="absolute -left-12 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#F0F1F5] text-black">
              <Type className="h-4 w-4" />
            </div>

            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-semibold text-black">
                {missingFonts.length > 0
                  ? "Waiting for missing fonts"
                  : "Fonts detected"}
              </h2>
              <span className="shrink-0 text-[10px] font-medium text-[#70737D]">
                Current State
              </span>
            </div>

            <div className="rounded-[5px] border border-[#E8E8EF] bg-[#F7F7FA] px-3 py-3">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-black">
                  {missingFonts.length > 0 ? (
                    <span className="text-[#EF5D3E]">△</span>
                  ) : (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#2CA36B] text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  {missingFonts.length > 0
                    ? `${missingFonts.length} fonts require attention`
                    : "All detected fonts are ready"}
                </div>
                {showFontAttentionSpinner ? (
                  <span className="h-5 w-5 shrink-0 rounded-full border-2 border-[#7A5AF8] border-r-transparent" />
                ) : fontsStepComplete ? (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#2CA36B] text-[10px] text-white">
                    <Check className="h-3 w-3" />
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {fontChips.length > 0 ? (
                  fontChips.map((font, index) => {
                    const label = chipLabel(font);
                    const isMissing = missingFontKeys.has(label.toLowerCase());
                    return (
                      <span
                        key={`${font.name}-${index}`}
                        className={`truncate rounded-full border px-3 py-1 text-center text-[11px] ${
                          isMissing
                            ? "border-[#FDBA74] bg-[#FFF7ED] text-[#EA580C]"
                            : "border-[#E1E2E8] bg-[#F0F1F4] text-[#555862]"
                        }`}
                        title={label}
                      >
                        {label}
                      </span>
                    );
                  })
                ) : (
                  <span className="col-span-3 rounded-full border border-[#E1E2E8] bg-[#F0F1F4] px-3 py-1 text-center text-[11px] text-[#555862]">
                    No fonts detected
                  </span>
                )}
              </div>
            </div>

            {missingFonts.length > 0 ? (
              <div className="mt-3 space-y-4">
                {missingFonts.map((font, index) => {
                  const fontName = font.name;
                  const isUploaded = uploadedFontNames.has(fontName);
                  return (
                    <div key={`${fontName}-${index}`} className="space-y-2">
                      <p className="text-[12px] font-medium text-[#4D505A]">{fontName}</p>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
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
                          className="flex h-10 items-center gap-2 rounded-[5px] border border-[#E2E3E8] bg-white px-3 text-left text-[13px] text-[#72757F] transition hover:border-[#B9ABFF] hover:bg-[#FAFAFF] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Upload className="h-4 w-4 text-black" />
                          {isUploaded ? "Uploaded" : "Upload .ttf / .otf"}
                        </button>
                        <span className="text-[14px] text-black">or</span>
                        <div className="relative">
                          <select
                            aria-label={`Fallback font for ${fontName}`}
                            disabled={isUploading}
                            className="h-10 w-full appearance-none rounded-[5px] border border-[#E2E3E8] bg-white px-4 pr-8 text-[13px] text-[#282A32] outline-none transition hover:border-[#B9ABFF] disabled:cursor-not-allowed disabled:opacity-60"
                            defaultValue="Poppins"
                          >
                            <option>Poppins</option>
                            <option>Inter</option>
                            <option>Manrope</option>
                            <option>Syne</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {isUploading ? (
            <div className="relative mt-7">
              <div className="absolute -left-12 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-black text-white">
                <LayoutPanelTop className="h-4 w-4" />
              </div>

              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[17px] font-semibold text-black">Creating Preview</h2>
                <span className="text-[10px] font-medium text-[#70737D]">In Progress</span>
              </div>

              <div className="rounded-[5px] border border-[#E8E8EF] bg-[#F7F7FA] px-3 py-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-2 text-[13px] text-[#777985]">
                    <p className="font-medium text-black">✓ Checking fonts</p>
                    <p className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7A5AF8]" />
                      Creating preview
                    </p>
                    <p>Waiting to generate layouts</p>
                  </div>
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#7A5AF8]" />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <button
        type="button"
        onClick={onContinue}
        disabled={isUploading}
        className={`fixed bottom-9 right-7 inline-flex h-[38px] items-center justify-center gap-2 rounded-[58px] px-5 text-[14px] font-medium text-black transition-all ${
          isUploading
            ? "cursor-not-allowed shadow-[0_0_22px_rgba(122,90,248,0.32)]"
            : "hover:shadow-[0_8px_24px_rgba(122,90,248,0.22)]"
        }`}
        style={{ background: pillGradient }}
      >
        {isUploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating Preview...
          </>
        ) : (
          "Continue"
        )}
      </button>
    </main>
  );
}

function ThumbnailStrip({
  urls,
  selectedIndex,
  onSelect,
}: {
  urls: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="fixed bottom-[26px] left-1/2 z-20 flex w-[calc(100vw-320px)] max-w-[930px] -translate-x-1/2 items-center gap-4 overflow-x-auto pb-1 hide-scrollbar">
      {urls.map((url, index) => (
        <button
          key={`${url}-${index}`}
          type="button"
          onClick={() => onSelect(index)}
          className={`relative h-[50px] w-[90px] shrink-0 overflow-visible rounded-[6px] border bg-white p-0 transition ${
            selectedIndex === index ? "border-[#D9D9E2]" : "border-[#ECECF2]"
          }`}
        >
          <img
            src={resolveBackendAssetUrl(url)}
            alt={`Slide ${index + 1}`}
            className="h-full w-full rounded-[6px] object-cover"
            draggable={false}
          />
          <span className="absolute -bottom-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full border border-[#E6E7ED] bg-white text-[11px] text-black shadow-sm">
            {index + 1}
          </span>
        </button>
      ))}
    </div>
  );
}

function ScaledTemplateV2Slide({
  layout,
  fonts,
}: {
  layout: TemplateV2Layout;
  fonts?: Record<string, string>;
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

  const scale = width > 0 ? width / 1280 : 1;

  return (
    <div ref={containerRef} className="relative aspect-video w-full overflow-hidden bg-white">
      <div
        className="absolute left-0 top-0 h-[720px] w-[1280px]"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <TemplateV2LayoutPreview layout={layout} fonts={fonts} />
      </div>
    </div>
  );
}

function ReviewSlideCanvas({
  slide,
  fonts,
}: {
  slide: ProcessedSlide | undefined;
  fonts?: Record<string, string>;
}) {
  if (!slide) {
    return <div className="aspect-video w-full bg-white" />;
  }

  if (slide.v2Layout && slide.processed && !slide.processing) {
    return <ScaledTemplateV2Slide layout={slide.v2Layout} fonts={fonts} />;
  }

  if (slide.screenshot_url) {
    return (
      <img
        src={resolveBackendAssetUrl(slide.screenshot_url)}
        alt={`Slide ${slide.slide_number}`}
        className="block w-full"
        draggable={false}
      />
    );
  }

  return (
    <div className="flex aspect-video w-full items-center justify-center bg-[#F7F7FA] text-sm text-[#777985]">
      {slide.processing ? "Generating slide..." : "Slide unavailable"}
    </div>
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
    <main className="min-h-screen bg-white px-6 pb-28 pt-[102px] font-syne">
      <div className="relative mx-auto w-full max-w-[948px]">
        <div className="overflow-hidden border border-[#E8E8EF] bg-white shadow-[0_2px_16px_rgba(16,24,40,0.06)]">
          {selectedUrl ? (
            <img
              src={resolveBackendAssetUrl(selectedUrl)}
              alt={`Slide ${selectedIndex + 1}`}
              className="block w-full"
              draggable={false}
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-[#F7F7FA] text-sm text-[#777985]">
              Preview unavailable
            </div>
          )}
        </div>
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
}: {
  slides: ProcessedSlide[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  retrySlide: (index: number) => void;
  setSlides: React.Dispatch<React.SetStateAction<ProcessedSlide[]>>;
  fonts?: Record<string, string>;
  enableEditing?: boolean;
}) {
  const selectedSlide = slides[selectedIndex] ?? slides[0];
  const thumbnailUrls = slides.map((slide) => slide.screenshot_url).filter(Boolean);
  const isReady =
    Boolean(selectedSlide?.processed && !selectedSlide.processing && selectedSlide.v2Layout) ||
    Boolean(selectedSlide?.screenshot_url);

  const handleDelete = () => {
    if (!selectedSlide) return;
    setSlides((current) => current.filter((_, index) => index !== selectedIndex));
    onSelect(Math.max(0, selectedIndex - 1));
  };

  return (
    <main className="min-h-screen bg-white px-6 pb-28 pt-[102px] font-syne">
      <div className="relative mx-auto w-full max-w-[948px]">
        <div
          className={`relative border bg-white shadow-[0_2px_16px_rgba(16,24,40,0.08)] ${
            enableEditing ? "border-[#7A5AF8]" : "border-[#E8E8EF]"
          }`}
        >
          {enableEditing ? (
            <>
              <SelectionHandles />
              <div className="absolute left-1/2 top-2 z-30 -translate-x-1/2 rounded-[5px] border border-[#E6E7EC] bg-white px-2 py-1.5 shadow-[0_4px_12px_rgba(16,24,40,0.12)]">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => retrySlide(selectedIndex)}
                    disabled={!selectedSlide || selectedSlide.processing}
                    className="h-8 rounded-[4px] px-2.5 text-[12px] font-medium text-black transition hover:bg-[#F6F6F9] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Re-Construct
                  </button>
                  <span className="h-6 w-px bg-[#E8E8EE]" />
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={!isReady}
                    className="flex h-8 w-8 items-center justify-center rounded-[4px] text-black transition hover:bg-[#F6F6F9] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Delete slide"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          ) : null}
          <ReviewSlideCanvas slide={selectedSlide} fonts={fonts} />
        </div>
      </div>

      <ThumbnailStrip urls={thumbnailUrls} selectedIndex={selectedIndex} onSelect={onSelect} />
    </main>
  );
}

function SaveTemplateModal({
  isOpen,
  defaultName,
  isSaving,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  defaultName: string;
  isSaving: boolean;
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
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 px-4 font-syne">
      <div className="relative w-full max-w-[512px] rounded-[14px] bg-white shadow-[0_18px_55px_rgba(16,24,40,0.18)]">
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          aria-label="Close"
          className="absolute -right-[54px] top-0 flex h-[46px] w-[46px] items-center justify-center rounded-full bg-white text-black shadow-sm disabled:opacity-50"
        >
          <X className="h-6 w-6" />
        </button>
        <div className="flex h-[74px] items-center justify-between border-b border-[#EDEEF3] px-5">
          <div>
            <h2 className="text-[16px] font-medium text-black">Save Template</h2>
            <p className="mt-1 text-[11px] text-[#7E818C]">Give your template a name.</p>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving || !name.trim()}
            className="inline-flex h-8 min-w-[78px] items-center justify-center rounded-[58px] px-5 text-[13px] font-medium text-black disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: pillGradient }}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </button>
        </div>

        <div className="space-y-4 px-[18px] pb-[18px] pt-5">
          <label className="block">
            <span className="mb-2 block text-[12px] font-medium text-[#25272F]">
              Template Name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isSaving}
              placeholder="e.g. Modern Tech Pitch Deck"
              className="h-9 w-full rounded-[5px] border border-[#E1E2E8] bg-white px-3 text-[13px] text-black outline-none placeholder:text-[#8C8E96] focus:border-[#B9ABFF]"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-medium text-[#25272F]">
              Description
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={isSaving}
              placeholder="Briefly describe when or how this template should be used."
              rows={4}
              className="h-[86px] w-full resize-none rounded-[5px] border border-[#E1E2E8] bg-white px-3 py-3 text-[13px] text-black outline-none placeholder:text-[#8C8E96] focus:border-[#B9ABFF]"
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
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const {
    cancelLibreOfficeInstall,
    checkLibreOffice,
    installLibreOffice,
    leaveTemplateStudio,
    libreMessage,
    libreProgress,
    libreStatus,
  } = useLibreOfficeGate(router);

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
    initTemplateCreation,
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
  const generatedSlidesReady =
    isFinalReview && slides.some((slide) => slide.processed && !slide.error);

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
    setReviewSlideIndex((current) => {
      const slideCount =
        slides.length > 0
          ? slides.length
          : (state.previewData?.slide_image_urls.length ?? 0);
      if (slideCount === 0) return 0;
      return Math.min(current, slideCount - 1);
    });
  }, [slides.length, state.previewData?.slide_image_urls.length]);

  const handleCheckFonts = useCallback(async () => {
    if (!selectedFile) return;
    await checkFonts(selectedFile);
  }, [checkFonts, selectedFile]);

  const handleFontUploadAndPreview = useCallback(async () => {
    if (!selectedFile) return;
    const data = await fontUploadAndPreview(selectedFile);
    if (data) {
      loadFontAssets(normalizeBackendAssetUrls(data.fonts));
      trackEvent(MixpanelEvent.Templates_Build_Template_Clicked, {
        source: "template_studio_preview_ready",
        slide_count: data.slide_image_urls.length,
      });
    }
  }, [fontUploadAndPreview, selectedFile]);

  const handleGenerateTemplate = useCallback(async () => {
    if (!state.previewData) return;
    trackEvent(MixpanelEvent.Templates_Build_Template_Clicked, {
      source: "template_studio_generate",
      slide_count: state.previewData.slide_image_urls.length,
    });
    await initTemplateCreation(
      {
        name: defaultTemplateName,
      },
      state.previewData,
    );
  }, [defaultTemplateName, initTemplateCreation, state.previewData]);

  const handleSaveTemplate = useCallback(
    async (name: string, description: string) => {
      if (!state.templateId) {
        notify.error("Template unavailable", "Generate the template before saving.");
        return;
      }

      setIsSavingTemplate(true);
      try {
        await TemplateService.updateTemplateMetadata(state.templateId, {
          name,
          description: description || null,
        });
        notify.success("Template saved", "The template was saved successfully.");
        setIsSaveModalOpen(false);
        router.push(`/template-preview?templateV2Id=${encodeURIComponent(state.templateId)}`);
      } catch (error) {
        notify.error(
          "Failed to save template",
          error instanceof Error ? error.message : "An unexpected error occurred",
        );
      } finally {
        setIsSavingTemplate(false);
      }
    },
    [router, state.templateId],
  );

  const centerAction = useMemo(() => {
    if (showPreview) {
      return (
        <GradientPillButton onClick={handleGenerateTemplate} disabled={state.isLoading}>
          {state.isLoading ? "Preparing..." : "Generate"}
        </GradientPillButton>
      );
    }

    if (showReview) {
      return (
        <GradientPillButton
          onClick={() => setIsSaveModalOpen(true)}
          disabled={!generatedSlidesReady || state.isLoading}
        >
          {generatedSlidesReady ? "Save as Template" : "Generating Template"}
        </GradientPillButton>
      );
    }

    return null;
  }, [
    generatedSlidesReady,
    handleGenerateTemplate,
    showPreview,
    showReview,
    state.isLoading,
  ]);

  return (
    <div className="relative min-h-screen bg-white">
      <div className={libreStatus === "ready" ? "" : "pointer-events-none select-none blur-[3px]"}>
        <StudioTopBar activeStep={activeStep} centerAction={centerAction} />

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
            onContinue={handleFontUploadAndPreview}
            uploadFont={uploadFont}
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
          />
        ) : null}
      </div>

      <SaveTemplateModal
        isOpen={isSaveModalOpen}
        defaultName={defaultTemplateName}
        isSaving={isSavingTemplate}
        onClose={() => {
          if (!isSavingTemplate) setIsSaveModalOpen(false);
        }}
        onSave={handleSaveTemplate}
      />

      <LibreOfficeGate
        status={libreStatus}
        message={libreMessage}
        progress={libreProgress}
        onInstall={installLibreOffice}
        onCancel={cancelLibreOfficeInstall}
        onRecheck={checkLibreOffice}
        onExit={leaveTemplateStudio}
      />
    </div>
  );
};

export default CustomTemplatePage;
