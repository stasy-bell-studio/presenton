"use client";

import { Plus, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import type { RootState } from '@/store/store';
import type { LLMConfig } from '@/types/llm_config';

const NON_SOTA_TEMPLATE_TOAST_KEY = "presenton.nonSotaTemplateToastDismissed";
const NON_SOTA_TEMPLATE_TOAST_ID = "non-sota-template-generation";

const OPENAI_SOTA_VISION_MODELS = [
    "gpt-5.5",
    "gpt-5.5-pro",
    "gpt-5.4",
    "gpt-5.4-pro",
    "gpt-5",
    "gpt-5-pro",
    "gpt-5-chat-latest",
    "gpt-4.1",
    "gpt-4o",
    "gpt-4-turbo",
];

function selectedTextModel(config: LLMConfig): string {
    switch (config.LLM) {
        case "openai":
            return config.OPENAI_MODEL || "";
        case "azure":
            return config.AZURE_OPENAI_MODEL || "";
        case "openrouter":
            return config.OPENROUTER_MODEL || "";
        case "anthropic":
            return config.ANTHROPIC_MODEL || "";
        case "bedrock":
            return config.BEDROCK_MODEL || "";
        case "codex":
            return config.CODEX_MODEL || "";
        default:
            return "";
    }
}

function normalizeModelName(model: string): string {
    return model.trim().toLowerCase().split("/").pop()?.replace(/^.*anthropic\./, "") || "";
}

function matchesOpenAIModel(model: string, family: string): boolean {
    return model === family || model.startsWith(`${family}-20`);
}

function isSotaTemplateModel(config: LLMConfig): boolean {
    const model = normalizeModelName(selectedTextModel(config));

    if (!model) return false;
    if (OPENAI_SOTA_VISION_MODELS.some((family) => matchesOpenAIModel(model, family))) return true;
    return model.includes("claude-") && (model.includes("opus") || model.includes("sonnet"));
}

function hasDismissedNonSotaToast(): boolean {
    try {
        return typeof window !== "undefined" && window.localStorage.getItem(NON_SOTA_TEMPLATE_TOAST_KEY) === "1";
    } catch {
        return false;
    }
}

function rememberNonSotaToastDismissed() {
    try {
        window.localStorage.setItem(NON_SOTA_TEMPLATE_TOAST_KEY, "1");
    } catch {
        // Best effort only.
    }
}

const CreateCustomTemplate = () => {
    const router = useRouter();
    const llmConfig = useSelector((state: RootState) => state.userConfig.llm_config);

    const handleOpenTemplateBuilder = () => {
        trackEvent(MixpanelEvent.Templates_Build_Template_Clicked);

        if (!isSotaTemplateModel(llmConfig) && !hasDismissedNonSotaToast()) {
            toast.info("Template quality may vary", {
                id: NON_SOTA_TEMPLATE_TOAST_ID,
                description: "For best results, use a recent OpenAI vision model or Claude Opus/Sonnet.",
                onDismiss: rememberNonSotaToastDismissed,
                onAutoClose: rememberNonSotaToastDismissed,
            });
        }

        router.push('/custom-template');
    };

    return (
        <div
            onClick={handleOpenTemplateBuilder}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleOpenTemplateBuilder();
                }
            }}
            role="button"
            tabIndex={0}
            className='w-full rounded-[22px] border border-[#EDEEEF] cursor-pointer font-syne'>
            <div className='relative h-[215px] flex justify-center items-center '>
                <img src="/card_bg.svg" alt="" className="absolute top-0 z-[1] left-0 w-full h-full object-cover" />
                <div className='w-[36px] h-[36px] relative z-[4]  rounded-full bg-[#7A5AF8] flex items-center justify-center'
                    style={{
                        background: 'linear-gradient(0deg, rgba(0, 0, 0, 0.20) 0%, rgba(0, 0, 0, 0.20) 100%), #FFF'
                    }}
                ><div className='w-[26px] h-[26px] rounded-full bg-white flex items-center justify-center'>

                        <Plus className='w-4 h-4 text-[#A2A0A1]' />
                    </div>
                </div>
            </div>
            <div className='px-5 py-4 bg-white flex items-center gap-4 overflow-hidden border-t  border-[#EDEEEF]'>
                <div className='bg-[#7A5AF8] w-[45px] h-[45px] rounded-lg p-2 flex items-center justify-center'>

                    <Sparkles className='w-6 h-6 text-white' />
                </div>
                <div>
                    <h4 className='text-[#191919] text-sm font-semibold '>Build Template</h4>
                    <p className='flex text-[#808080] text-sm  font-medium items-center gap-2'>Build Your Own Template</p>
                </div>

            </div>
        </div>
    )
}

export default CreateCustomTemplate
