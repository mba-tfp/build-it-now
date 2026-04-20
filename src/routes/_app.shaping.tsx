import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  completenessScore,
  daysSince,
  usableCapacity,
  useTfpStore,
} from "@/lib/tfp/store";
import type {
  Complexity,
  RoadmapBucket,
  ShapingItem,
} from "@/lib/tfp/types";
import { cn } from "@/lib/utils";
import { ArrowLeft, Check } from "lucide-react";

export const Route = createFileRoute("/_app/shaping")({
  component: ShapingPage,
});

const STEPS = [
  "Problem Brief",
  "Roadmap Fit",
  "Solution Brief",
  "Tech Review",
  "Approval",
];

function ShapingPage() {
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const [openId, setOpenId] = useState<string | null>(null);

  const cards = shaping.map((sh) => ({
    sh,
    sig: signals.find((s) => s.id === sh.signal_id),
  }));

  const open = cards.find((c) => c.sh.id === openId);

  if (open?.sig) {
    return <ShapingWorkspace itemId={open.sh.id} onBack={() => setOpenId(null)} />;
  }

  return (
    <div>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">View 3</p>
        <h1 className="mt-1 font-display text-3xl">Shaping Workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approved signals move through five steps before they're pushed to Jira for delivery.
        </p>
      </header>

      {cards.length === 0 ? (
        <div className="tfp-card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing in shaping yet. Triage a signal as <strong>Proceed</strong> to start.
          </p>
          <Link to="/triage" className="mt-4 inline-block text-sm text-primary hover:underline">
            Open Triage Queue →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ sh, sig }) => {
            if (!sig) return null;
            const stale = daysSince(sh.created_at);
            const borderCls =
              stale > 12
                ? "border-destructive/40"
                : stale > 6
                  ? "border-[var(--color-status-hold)]/50"
                  : "border-border";
            return (
              <button
                key={sh.id}
                onClick={() => setOpenId(sh.id)}
                className={cn(
                  "tfp-card text-left transition hover:-translate-y-0.5 hover:shadow-lg",
                  "border",
                  borderCls,
                )}
              >
                <div className="p-5">
                  <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{sig.product}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5">{sh.shaping_status}</span>
                  </div>
                  <h3 className="line-clamp-2 font-display text-base leading-snug">{sig.title}</h3>
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>Step {sh.current_step} of 5</span>
                      <span>{stale}d in stage</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${(sh.current_step / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ShapingWorkspace({ itemId, onBack }: { itemId: string; onBack: () => void }) {
  const sh = useTfpStore((s) => s.shaping.find((x) => x.id === itemId))!;
  const sig = useTfpStore((s) => s.signals.find((x) => x.id === sh.signal_id))!;

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to pipeline
      </button>

      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {sig.product} · {sig.issue_type}
        </p>
        <h1 className="mt-1 font-display text-3xl leading-tight">{sig.title}</h1>
      </header>

      {/* Stepper */}
      <ol className="mb-8 grid grid-cols-5 gap-2">
        {STEPS.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3 | 4 | 5;
          const done = sh.current_step > n;
          const active = sh.current_step === n;
          const future = !done && !active;
          const wave2 = n >= 4;
          return (
            <li
              key={label}
              className={cn(
                "rounded-md border px-3 py-2 text-xs",
                done && "border-[var(--color-status-proceed)]/40 bg-[var(--color-status-proceed)]/5 text-[var(--color-status-proceed)]",
                active && "border-primary/50 bg-primary/5 text-primary",
                future && "border-border text-muted-foreground",
                wave2 && "opacity-60",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full text-[10px] font-medium",
                    done && "bg-[var(--color-status-proceed)] text-white",
                    active && "bg-primary text-primary-foreground",
                    future && "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : n}
                </span>
                <span className="font-medium">{label}</span>
              </div>
              {wave2 && <p className="mt-1 text-[10px] uppercase tracking-wider">Wave 2</p>}
            </li>
          );
        })}
      </ol>

      {sh.current_step === 1 && <ProblemBrief item={sh} />}
      {sh.current_step === 2 && <RoadmapFit item={sh} />}
      {sh.current_step === 3 && <SolutionBrief item={sh} />}
      {sh.current_step >= 4 && (
        <div className="tfp-card p-8 text-center text-sm text-muted-foreground">
          Tech Review and Approval ship in <strong className="text-foreground">Wave 2</strong>.
        </div>
      )}
    </div>
  );
}

const PROBLEM_FIELDS: Array<{
  key: keyof Pick<ShapingItem, "problem_what" | "problem_why" | "problem_who" | "problem_where" | "problem_evidence" | "problem_out_of_scope">;
  label: string;
  hint: string;
  min: number;
  rows: number;
}> = [
  { key: "problem_what", label: "What", hint: "What is the problem in plain language? Min 50 chars.", min: 50, rows: 3 },
  { key: "problem_why", label: "Why", hint: "Why does this matter now? What happens if we don't solve it? Min 50 chars.", min: 50, rows: 3 },
  { key: "problem_who", label: "Who", hint: "Who is affected? Roles and approximate numbers. Min 30 chars.", min: 30, rows: 2 },
  { key: "problem_where", label: "Where", hint: "Where does this surface — which screen, flow, or context? Min 30 chars.", min: 30, rows: 2 },
  { key: "problem_evidence", label: "Evidence", hint: "Tickets, logs, conversations that show this is real. Min 30 chars.", min: 30, rows: 2 },
  { key: "problem_out_of_scope", label: "Out of scope", hint: "What we're explicitly not solving here.", min: 1, rows: 2 },
];

function ProblemBrief({ item }: { item: ShapingItem }) {
  const updateShaping = useTfpStore((s) => s.updateShaping);
  const score = completenessScore(item);
  const canAdvance = score >= 5;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="tfp-card divide-y divide-border">
        {PROBLEM_FIELDS.map((f) => {
          const value = item[f.key];
          const len = value.trim().length;
          const ok = len >= f.min;
          return (
            <div key={f.key} className="p-5">
              <label className="mb-1 flex items-baseline justify-between text-sm font-medium">
                <span>
                  {f.label}
                  <span className="ml-1 text-destructive">*</span>
                </span>
                <span className={cn("text-xs", ok ? "text-[var(--color-status-proceed)]" : "text-muted-foreground")}>
                  {len}/{f.min}
                </span>
              </label>
              <p className="mb-2 text-xs text-muted-foreground">{f.hint}</p>
              <textarea
                value={value}
                onChange={(e) => updateShaping(item.id, { [f.key]: e.target.value } as Partial<ShapingItem>)}
                rows={f.rows}
                className={cn(
                  "w-full resize-y rounded-md border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring",
                  len > 0 && !ok ? "border-destructive/50" : "border-input",
                )}
              />
            </div>
          );
        })}
        <div className="flex items-center justify-between p-5">
          <p className="text-xs text-muted-foreground">Autosaves on every change.</p>
          <button
            disabled={!canAdvance}
            onClick={() => updateShaping(item.id, { current_step: 2, shaping_status: "In Shaping" })}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
          >
            Save + continue
          </button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="tfp-card p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Completeness</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="font-display text-4xl">{score}</span>
            <span className="text-sm text-muted-foreground">/ 6</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full transition-all", score >= 5 ? "bg-[var(--color-status-proceed)]" : "bg-primary")}
              style={{ width: `${(score / 6) * 100}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {canAdvance
              ? "Ready to advance to Roadmap Fit."
              : `Need ${5 - score} more field${5 - score === 1 ? "" : "s"} to advance.`}
          </p>
        </div>
      </aside>
    </div>
  );
}

const BUCKETS: RoadmapBucket[] = ["Now", "Next", "Later", "Not Now"];

function RoadmapFit({ item }: { item: ShapingItem }) {
  const sprint = useTfpStore((s) => s.sprint);
  const setRoadmapBucket = useTfpStore((s) => s.setRoadmapBucket);
  const updateShaping = useTfpStore((s) => s.updateShaping);

  const usable = useMemo(() => usableCapacity(sprint), [sprint]);
  const usedPct = (sprint.allocated_pts / usable) * 100;
  const overloaded = usedPct > 85;

  const [bucket, setBucket] = useState<RoadmapBucket | null>(item.roadmap_bucket);
  const [displacement, setDisplacement] = useState(item.displacement);

  const needsDisplacement = bucket === "Now" && overloaded;
  const canSave = !!bucket && (!needsDisplacement || displacement.trim().length > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="tfp-card p-5">
        <h3 className="font-display text-lg">Where does this fit?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a roadmap bucket. If it goes in <strong>Now</strong> while the sprint is over 85% allocated, you'll need to name what gets displaced.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {BUCKETS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBucket(b)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm transition",
                bucket === b
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface hover:border-primary/40 hover:bg-accent/40",
              )}
            >
              {b}
            </button>
          ))}
        </div>

        {needsDisplacement && (
          <div className="mt-5 rounded-md border border-[var(--color-status-hold)]/40 bg-[var(--color-status-hold)]/5 p-4">
            <p className="text-sm font-medium text-[var(--color-status-hold)]">
              Sprint capacity is at {Math.round(usedPct)}%. What moves to make room?
            </p>
            <textarea
              value={displacement}
              onChange={(e) => setDisplacement(e.target.value)}
              placeholder="Name the item that gets postponed or descoped…"
              rows={3}
              className="mt-3 w-full resize-y rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
          <button
            onClick={() => updateShaping(item.id, { current_step: 1 })}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
          <button
            disabled={!canSave}
            onClick={() => {
              setRoadmapBucket(item.id, bucket!, displacement);
              updateShaping(item.id, { current_step: 3 });
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
          >
            Save + continue
          </button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="tfp-card p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{sprint.name} capacity</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="font-display text-3xl">{sprint.allocated_pts}</span>
            <span className="text-sm text-muted-foreground">/ {usable} pts usable</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full transition-all", overloaded ? "bg-destructive" : "bg-primary")}
              style={{ width: `${Math.min(100, usedPct)}%` }}
            />
          </div>
          <dl className="mt-4 space-y-1 text-xs">
            <Row label="Gross" value={`${sprint.gross_capacity_pts} pts`} />
            <Row label="Leave" value={`-${sprint.leave_deduction_pts}`} />
            <Row label="Interrupts" value={`-${sprint.interrupt_buffer_pts}`} />
            <Row label="QA buffer" value={`-${sprint.qa_buffer_pts}`} />
            <Row label="Uncertainty" value={`-${sprint.uncertainty_buffer_pts}`} />
            <Row label="Carry-forward" value={`-${sprint.carryforward_estimate_pts}`} />
          </dl>
        </div>
      </aside>
    </div>
  );
}

const COMPLEX_FIELDS: Record<Complexity, Array<keyof ShapingItem>> = {
  Simple: ["solution_approach", "solution_criteria", "solution_effort"],
  Medium: [
    "solution_approach",
    "solution_criteria",
    "solution_effort",
    "solution_decisions",
    "solution_questions",
    "solution_risks",
  ],
  Complex: [
    "solution_approach",
    "solution_criteria",
    "solution_effort",
    "solution_decisions",
    "solution_questions",
    "solution_risks",
  ],
};

const FIELD_LABELS: Partial<Record<keyof ShapingItem, string>> = {
  solution_approach: "Approach",
  solution_criteria: "Success criteria",
  solution_effort: "Effort estimate",
  solution_decisions: "Key decisions",
  solution_questions: "Open questions",
  solution_risks: "Risks",
};

function SolutionBrief({ item }: { item: ShapingItem }) {
  const setComplexity = useTfpStore((s) => s.setComplexity);
  const updateShaping = useTfpStore((s) => s.updateShaping);
  const c = item.solution_complexity;
  const fields = c ? COMPLEX_FIELDS[c] : [];

  return (
    <div className="tfp-card p-5">
      <h3 className="font-display text-lg">Solution Brief</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose complexity — the form expands to match.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {(["Simple", "Medium", "Complex"] as Complexity[]).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setComplexity(item.id, opt)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition",
              c === opt
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface hover:border-primary/40 hover:bg-accent/40",
            )}
          >
            {opt}
          </button>
        ))}
      </div>

      {c && (
        <div className="mt-6 space-y-4">
          {fields.map((key) => (
            <div key={key}>
              <label className="mb-1 block text-sm font-medium">{FIELD_LABELS[key]}</label>
              <textarea
                value={String(item[key] ?? "")}
                onChange={(e) => updateShaping(item.id, { [key]: e.target.value } as Partial<ShapingItem>)}
                rows={3}
                className="w-full resize-y rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
        <button
          onClick={() => updateShaping(item.id, { current_step: 2 })}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
        <button
          disabled={!c}
          onClick={() => updateShaping(item.id, { current_step: 4, shaping_status: "Shaped" })}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
        >
          Send to Tech Review
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
