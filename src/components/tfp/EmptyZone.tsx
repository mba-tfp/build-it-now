import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type EmptyZoneVariant =
  | "signals"
  | "triage"
  | "shaping"
  | "tech-review"
  | "sprint-board"
  | "backlog"
  | "sprint-planning"
  | "outcomes"
  | "clinics"
  | "queue"
  | "since-last-visit";

type EmptyDef = { label: string; ctaLabel?: string; ctaTo?: string; ctaSearch?: Record<string, string> };

export const EMPTY_ZONE: Record<EmptyZoneVariant, EmptyDef> = {
  signals: {
    label:
      "Signals are observations — anything that feels off, a clinic request, a pattern in feedback.",
    ctaLabel: "Log the first signal →",
    ctaTo: "/inbox",
    ctaSearch: { tab: "submit" },
  },
  triage: {
    label: "Nothing to triage right now.",
    ctaLabel: "View all signals →",
    ctaTo: "/inbox",
    ctaSearch: { tab: "triage" },
  },
  shaping: {
    label:
      "Shaping is where you turn a triaged signal into a defined piece of work.",
    ctaLabel: "Start shaping an item →",
    ctaTo: "/inbox",
    ctaSearch: { tab: "triage" },
  },
  "tech-review": {
    label: "No items are waiting for tech sign-off.",
    ctaLabel: "View shaping items →",
    ctaTo: "/shaping",
  },
  "sprint-board": {
    label:
      "The active sprint is empty. Start the sprint to begin tracking delivery.",
    ctaLabel: "Go to Sprint Planning →",
    ctaTo: "/delivery",
  },
  backlog: {
    label: "The backlog holds everything not yet planned into a sprint.",
    ctaLabel: "Log a signal to get started →",
    ctaTo: "/inbox",
    ctaSearch: { tab: "submit" },
  },
  "sprint-planning": {
    label: "Drag items from the Backlog to plan the next sprint.",
  },
  outcomes: {
    label:
      "Outcome reviews close the loop — did the work actually solve the problem?",
    ctaLabel: "Mark a delivered item for review →",
    ctaTo: "/delivery",
  },
  clinics: {
    label: "Clinics are your live and onboarding Otto-Onboard tenants.",
  },
  queue: { label: "You're clear." },
  "since-last-visit": { label: "Nothing changed since your last visit." },
};

export function EmptyZone({
  variant,
  className,
}: {
  variant: EmptyZoneVariant;
  className?: string;
}) {
  const def = EMPTY_ZONE[variant];
  return (
    <div
      data-testid={`empty-zone-${variant}`}
      data-empty-variant={variant}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-2 px-6 py-12 text-center",
        className,
      )}
    >
      <p
        data-testid={`empty-zone-label-${variant}`}
        className="max-w-md text-sm text-muted-foreground"
      >
        {def.label}
      </p>
      {def.ctaLabel && def.ctaTo && (
        <Link
          to={def.ctaTo as never}
          search={(def.ctaSearch ?? undefined) as never}
          data-testid={`empty-zone-cta-${variant}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          {def.ctaLabel}
        </Link>
      )}
    </div>
  );
}
