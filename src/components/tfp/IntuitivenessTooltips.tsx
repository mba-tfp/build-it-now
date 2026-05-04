import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StageTooltipKey =
  | "Triage"
  | "Shaping"
  | "Tech Review"
  | "In Progress"
  | "In QA"
  | "Done"
  | "Outcome Review"
  | "Closed";

export const STAGE_TOOLTIPS: Record<StageTooltipKey, string> = {
  Triage: "Being assessed — is this worth pursuing?",
  Shaping: "Being defined — what exactly needs to be built?",
  "Tech Review": "Awaiting technical sign-off before development starts.",
  "In Progress": "In active development.",
  "In QA": "Being tested before release.",
  Done: "Shipped. Awaiting outcome review.",
  "Outcome Review":
    "Checking whether the work solved the original problem.",
  Closed: "Work complete. Outcome reviewed and logged.",
};

export const ACTION_TOOLTIPS = {
  "log-as-new-signal":
    "Create a follow-up signal from this item to track a new issue it revealed.",
  "carry-forward":
    "Move incomplete items from this sprint into the next sprint.",
  "start-outcome-review":
    "Record whether this work actually solved the problem it was built for.",
  "tech-sign-off":
    "Confirm this item is technically feasible and ready for development.",
} as const;

export type ActionTooltipKey = keyof typeof ACTION_TOOLTIPS;

const SHOW_DELAY_MS = 300;

export function HoverTip({
  text,
  children,
  testId,
}: {
  text: string;
  children: ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [timer, setTimer] = useState<number | null>(null);
  function show() {
    const t = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    setTimer(t);
  }
  function hide() {
    if (timer) window.clearTimeout(timer);
    setTimer(null);
    setOpen(false);
  }
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          data-testid={testId}
          className={cn(
            "pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-[11px] font-normal text-background shadow",
          )}
          style={{ maxWidth: 220 }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

export function StageTooltip({
  stage,
  children,
}: {
  stage: StageTooltipKey;
  children: ReactNode;
}) {
  return (
    <HoverTip text={STAGE_TOOLTIPS[stage]} testId={`stage-tooltip-${stage}`}>
      <span data-testid={`stage-badge-${stage}`} data-stage={stage}>
        {children}
      </span>
    </HoverTip>
  );
}

export function ActionTooltip({
  action,
  children,
}: {
  action: ActionTooltipKey;
  children: ReactNode;
}) {
  return (
    <HoverTip text={ACTION_TOOLTIPS[action]} testId={`action-tooltip-${action}`}>
      {children}
    </HoverTip>
  );
}
