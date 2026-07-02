"use client";

import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Ungroup,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  canApplyComponentLayerAction,
  type ComponentLayerAction,
} from "../template-v2-layering/componentLayering";

type TemplateV2ComponentToolbarProps = {
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  canUngroup: boolean;
  componentIndex: number;
  componentCount: number;
  position?: { left: number; top: number };
  slideWidth: number;
  onLayerAction: (action: ComponentLayerAction) => void;
  onUngroup: () => void;
};

const LAYER_ACTIONS: Array<{
  action: ComponentLayerAction;
  label: string;
  icon: LucideIcon;
}> = [
  {
    action: "send-to-back",
    label: "Send to back",
    icon: ChevronsDown,
  },
  {
    action: "send-backward",
    label: "Send backward",
    icon: ArrowDown,
  },
  {
    action: "bring-forward",
    label: "Bring forward",
    icon: ArrowUp,
  },
  {
    action: "bring-to-front",
    label: "Bring to front",
    icon: ChevronsUp,
  },
];

const TOOLBAR_WIDTH = 270;

export function TemplateV2ComponentToolbar({
  box,
  canUngroup,
  componentIndex,
  componentCount,
  position,
  slideWidth,
  onLayerAction,
  onUngroup,
}: TemplateV2ComponentToolbarProps) {
  const left =
    position?.left ??
    Math.max(8, Math.min(box.x, Math.max(8, slideWidth - TOOLBAR_WIDTH)));
  const top = position?.top ?? Math.max(8, box.y - 48);

  const toolbar = (
    <div
      data-template-v2-floating-toolbar="true"
      style={{ left, top }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className="fixed z-[10000] flex h-10 items-center gap-1 rounded-md bg-white px-2 text-[#191919] shadow-[0_0_4px_rgba(0,0,0,0.15)]"
    >
      <span className="mr-1 border-r border-[#E7E8EC] pr-2 text-xs font-semibold text-[#5B5D66]">
        Component
      </span>
      {LAYER_ACTIONS.map(({ action, label, icon: Icon }) => {
        const disabled = !canApplyComponentLayerAction(
          componentIndex,
          componentCount,
          action,
        );
        return (
          <button
            key={action}
            type="button"
            title={label}
            aria-label={label}
            disabled={disabled}
            onClick={() => {
              if (!disabled) onLayerAction(action);
            }}
            className={toolbarButtonClassName(disabled)}
          >
            <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        );
      })}
      {canUngroup ? (
        <>
          <span className="mx-1 h-6 w-px bg-[#E7E8EC]" aria-hidden />
          <button
            type="button"
            title="Ungroup"
            aria-label="Ungroup"
            onClick={onUngroup}
            className={cn(
              toolbarButtonClassName(false),
              "w-auto gap-1.5 px-2 text-xs font-medium",
            )}
          >
            <Ungroup size={15} strokeWidth={2.2} aria-hidden="true" />
            <span>Ungroup</span>
          </button>
        </>
      ) : null}
    </div>
  );

  return position && typeof document !== "undefined"
    ? createPortal(toolbar, document.body)
    : toolbar;
}

function toolbarButtonClassName(disabled: boolean) {
  return cn(
    "flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent text-[#05070A] transition-colors hover:bg-[#F4F3FF] hover:text-[#7A5AF8]",
    disabled &&
      "cursor-not-allowed text-[#B7B9C2] opacity-50 hover:bg-transparent hover:text-[#B7B9C2]",
  );
}
