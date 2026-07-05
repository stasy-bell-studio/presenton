export const PRESENTON_BLANK_SLIDE_PROMPT_EVENT =
  "presenton:blank-slide-prompt";

export type BlankSlidePromptEventDetail = {
  prompt: string;
  slideIndex?: number | null;
};
