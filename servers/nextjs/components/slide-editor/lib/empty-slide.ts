import type { Slide } from "./slide-schema";

export function createEmptySlide({
  background = "#FFFFFF",
  background_role,
  title = "Blank Slide",
}: {
  background?: string;
  background_role?: Slide["background_role"];
  title?: string;
} = {}): Slide {
  return {
    title,
    background,
    background_role,
    elements: [
      {
        type: "rectangle",
        position: { x: 0, y: 0 },
        size: { width: 0.1, height: 0.1 },
        fill: { color: "#FFFFFF" },
        opacity: 0,
      },
    ],
  };
}
