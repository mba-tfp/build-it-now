import { useMemo, useState } from "react";
import { useTfpStore, USERS } from "@/lib/tfp/store";
import { fmtDateTime } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import type {
  DecisionStage,
  DecisionType,
  ShapingItem,
  Sprint,
} from "@/lib/tfp/types";

const STAGE_LABEL: Record<DecisionStage, string> = {
  triage: "Triage",
  shaping: "Shaping",
  "tech-review": "Tech Review",
  "in-progress": "In Progress",
  "in-qa": "In QA",
  done: "Done",
  "outcome-complete": "Outcome Complete",
  "sprint-closed": "Sprint Closed",
};

const STAGE_TONE: Record<DecisionStage, string> = {
  triage: "bg-muted text-muted-foreground ring-border",
  shaping: "bg-muted text-muted-foreground ring-border",
  "tech-review": "bg-primary/10 text-primary ring-primary/20",
  "in-progress": "bg-primary/10 text-primary ring-primary/20",
  "in-qa": "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)] ring-[var(--color-status-hold)]/20",
  done: "bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)] ring-[var(--color-status-proceed)]/20",
  "outcome-complete": "bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)] ring-[var(--color-status-proceed)]/20",
  "sprint-closed": "bg-muted text-muted-foreground ring-border",
};

export function StageBadge({ stage }: { stage: DecisionStage }) {
  return (
    <span
      data-testid="decision-stage-badge"
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        STAGE_TONE[stage],
      )}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}

export function deriveItemStage(
  sh: ShapingItem | null | undefined,
  sprint: Sprint | null | undefined,
  hasCompletedReview: boolean,
): DecisionStage {
  if (sprint && sprint.closed_at) return "sprint-closed";
  if (!sh) return "triage";
  if (sh.delivery_status === "Done") {
    return hasCompletedReview ? "outcome-complete" : "done";
  }
  if (sh.delivery_status === "In QA") return "in-qa";
  if (
    sh.delivery_status === "In Progress" ||
    sh.delivery_status === "Blocked" ||
    sh.delivery_status === "To Do"
  ) {
    return "in-progress";
  }
  if (sh.tech_signed_off_at) return "tech-review";
  if (sh.current_step >= 2) return "tech-review";
  return "shaping";
}

type Props = {
  signalId: string | null;
  shapingItemId?: string | null;
};

export function InlineDecisions({ signalId, shapingItemId }: Props) {
  const allDecisions = useTfpStore((s) => s.decisions);
  const allReviews = useTfpStore((s) => s.reviews);
  const sprints = useTfpStore((s) => s.sprints);
  const shaping = useTfpStore((s) => s.shaping.find((x) => x.id === shapingItemId));
  const createDecision = useTfpStore((s) => s.createDecision);

  // Determine sprint via existing sprint shaping_ids if available, else current single sprint
  const currentSprint = useTfpStore((s) => s.sprint);
  const sprint = useMemo<Sprint | null>(() => {
    // Try to find a sprint that references this shaping item id
    const found = sprints.find(
      (sp) =>
        sp.closed_at &&
        // Heuristic: sprints don't carry shaping_ids in this model; use single-sprint app default
        sp.id === currentSprint?.id,
    );
    return found ?? currentSprint ?? null;
  }, [sprints, currentSprint]);

  const hasCompletedReview = useMemo(
    () =>
      shapingItemId
        ? allReviews.some((r) => r.shaping_id === shapingItemId && r.completed_at)
        : false,
    [allReviews, shapingItemId],
  );

  const stage = deriveItemStage(shaping ?? null, sprint, hasCompletedReview);

  const decisions = useMemo(
    () =>
      allDecisions.filter((d) => {
        if (shapingItemId && d.linked_shaping_id === shapingItemId) return true;
        if (signalId && d.linked_signal_id === signalId && !d.linked_shaping_id) return true;
        return false;
      }),
    [allDecisions, signalId, shapingItemId],
  );

  const [title, setTitle] = useState("");
  const [decision, setDecision] = useState("");
  const [type, setType] = useState<DecisionType>("Product");
  const ready = title.trim().length > 2 && decision.trim().length > 2;

  return (
    <section className="mt-6 tfp-card p-5" data-testid="inline-decisions">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg">Decisions on this item</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Append-only timeline. Decisions can be added at any stage, including after sprint close.
          </p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {decisions.length} recorded · current stage: {STAGE_LABEL[stage]}
        </span>
      </div>

      {decisions.length === 0 ? (
        <p
          data-testid="decisions-empty"
          className="mt-4 rounded-md border border-dashed border-border bg-surface/40 px-3 py-3 text-sm text-muted-foreground"
        >
          No decisions logged yet. Use the form below to add the first one.
        </p>
      ) : (
        <ol className="mt-4 space-y-2">
          {decisions.map((d) => {
            const author = USERS.find((u) => u.id === d.decided_by);
            return (
              <li
                key={d.id}
                data-testid="decision-row"
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{d.title}</span>
                  {d.stage && <StageBadge stage={d.stage} />}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {author?.name ?? "Unknown"} · {fmtDateTime(d.decided_at)}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">{d.decision}</p>
              </li>
            );
          })}
        </ol>
      )}

      <form
        data-testid="inline-decisions-form"
        className="mt-5 grid gap-3 md:grid-cols-[160px_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          createDecision({
            title,
            type,
            stage,
            context: shaping?.problem_what || "Decision logged on item",
            options_considered: "Recorded inline on item",
            decision,
            consequences: shaping?.solution_risks || "None noted",
            linked_signal_id: signalId,
            linked_shaping_id: shapingItemId ?? null,
          });
          setTitle("");
          setDecision("");
        }}
      >
        <select
          value={type}
          onChange={(e) => setType(e.target.value as DecisionType)}
          className="rounded-md border border-input bg-surface px-2 py-1.5 text-sm"
        >
          {(["Product", "Architectural", "Process", "Vendor"] as DecisionType[]).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Decision title"
          className="rounded-md border border-input bg-surface px-2 py-1.5 text-sm"
        />
        <input
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          placeholder="What was decided?"
          className="rounded-md border border-input bg-surface px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          data-testid="inline-decisions-submit"
          disabled={!ready}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          Record
        </button>
      </form>
    </section>
  );
}
