import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type PipelineStage =
  | "signal"
  | "triage"
  | "shaping"
  | "tech-review"
  | "delivery"
  | "outcome";

const STAGES: Array<{ key: PipelineStage; label: string }> = [
  { key: "signal", label: "Signal" },
  { key: "triage", label: "Triage" },
  { key: "shaping", label: "Shaping" },
  { key: "tech-review", label: "Tech Review" },
  { key: "delivery", label: "Delivery" },
  { key: "outcome", label: "Outcome" },
];

const ROUTE_TO_STAGE: Array<{ match: RegExp; stage: PipelineStage }> = [
  { match: /^\/inbox/, stage: "triage" },
  { match: /^\/triage/, stage: "triage" },
  { match: /^\/intake/, stage: "signal" },
  { match: /^\/shaping/, stage: "shaping" },
  { match: /^\/delivery/, stage: "delivery" },
  { match: /^\/review/, stage: "outcome" },
  { match: /^\/governance/, stage: "outcome" },
];

const EXCLUDE = [/^\/$/, /^\/signals/, /^\/self-test/, /^\/clinics/, /^\/admin/];

export function stageForPath(pathname: string): PipelineStage | null {
  if (EXCLUDE.some((r) => r.test(pathname))) return null;
  const m = ROUTE_TO_STAGE.find((r) => r.match.test(pathname));
  return m?.stage ?? null;
}

export function PipelineHeader({ activeStage }: { activeStage?: PipelineStage }) {
  const loc = useLocation();
  const stage = activeStage ?? stageForPath(loc.pathname);
  if (!stage) return null;
  return (
    <nav
      data-testid="pipeline-header"
      data-active-stage={stage}
      aria-label="Pipeline stages"
      className="mb-4 flex w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-md border border-border bg-surface/40 px-3 py-2 text-xs"
    >
      {STAGES.map((s, i) => {
        const active = s.key === stage;
        return (
          <span key={s.key} className="flex min-w-0 items-center gap-1">
            {i > 0 && <span className="text-muted-foreground/50">→</span>}
            <span
              data-testid={`pipeline-stage-${s.key}`}
              data-active={active ? "true" : "false"}
              className={cn(
                "truncate px-1.5 py-0.5",
                active
                  ? "font-semibold text-primary"
                  : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
          </span>
        );
      })}
    </nav>
  );
}
