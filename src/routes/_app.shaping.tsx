import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  canApprove,
  completenessScore,
  daysSince,
  solutionComplete,
  techReviewComplete,
  usableCapacity,
  USERS,
  useTfpStore,
} from "@/lib/tfp/store";
import type {
  Complexity,
  DecisionType,
  RoadmapBucket,
  ShapingItem,
} from "@/lib/tfp/types";
import { fmtDateTime } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import { ArrowLeft, Check, Lock, ShieldCheck } from "lucide-react";
import { SortMenu, useSortMenu } from "@/components/tfp/SortMenu";
import { sortRows } from "@/components/tfp/SortableHeader";
import { ScrollTable } from "@/components/tfp/ScrollTable";
import { AttachmentsField } from "@/components/tfp/AttachmentsField";
import type { Attachment } from "@/lib/tfp/types";

export const Route = createFileRoute("/_app/shaping")({
  component: ShapingPage,
});

const STEPS = ["Define", "Tech Review", "Approve"] as const;

function displayStep(step: number): 1 | 2 | 3 {
  if (step >= 5) return 3;
  if (step >= 4) return 2;
  return 1;
}

function ShapingPage() {
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const [openId, setOpenId] = useState<string | null>(null);

  type SortKey = "started" | "completeness" | "priority";
  const { sort, setSort } = useSortMenu<SortKey>("shaping");

  const cards = useMemo(
    () => shaping.map((sh) => ({ sh, sig: signals.find((s) => s.id === sh.signal_id) })),
    [shaping, signals],
  );

  const sorted = useMemo(() => {
    if (sort.key && sort.dir) {
      return sortRows(cards, sort, (c, k) => {
        if (k === "started") return c.sh.shaping_started_at ? new Date(c.sh.shaping_started_at).getTime() : 0;
        if (k === "completeness") return completenessScore(c.sh);
        if (k === "priority") return c.sig?.tier ?? "Z";
        return null;
      });
    }
    // Default: overdue → fast-track → others
    return [...cards].sort((a, b) => {
      const ah = a.sh.shaping_started_at ? (Date.now() - new Date(a.sh.shaping_started_at).getTime()) / 3600000 : 0;
      const bh = b.sh.shaping_started_at ? (Date.now() - new Date(b.sh.shaping_started_at).getTime()) / 3600000 : 0;
      const aOverdue = a.sig?.issue_type === "Bug" && !a.sh.fast_track && ah > 72 && a.sh.shaping_status !== "Approved" && a.sh.shaping_status !== "In Delivery" ? 1 : 0;
      const bOverdue = b.sig?.issue_type === "Bug" && !b.sh.fast_track && bh > 72 && b.sh.shaping_status !== "Approved" && b.sh.shaping_status !== "In Delivery" ? 1 : 0;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      if (a.sh.fast_track !== b.sh.fast_track) return a.sh.fast_track ? -1 : 1;
      return 0;
    });
  }, [cards, sort]);

  const open = cards.find((c) => c.sh.id === openId);

  if (open?.sig) {
    return <ShapingWorkspace itemId={open.sh.id} onBack={() => setOpenId(null)} />;
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Shaping</p>
          <h1 className="mt-1 font-display text-3xl">Shaping Workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Approved signals move through Define → Tech Review → Approve before delivery.
          </p>
        </div>
        <SortMenu
          tableId="shaping"
          sort={sort}
          onChange={setSort}
          options={[
            { key: "started", label: "Started date" },
            { key: "completeness", label: "Completeness" },
            { key: "priority", label: "Priority" },
          ]}
        />
      </header>

      {cards.length === 0 ? (
        <div className="tfp-card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing in shaping yet. Mark an Inbox signal as <strong>Proceed</strong> to start.
          </p>
          <Link to="/inbox" className="mt-4 inline-block text-sm text-primary hover:underline">
            Open Inbox →
          </Link>
        </div>
      ) : (
        <ScrollTable className="border border-border bg-surface/40 p-3">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map(({ sh, sig }) => {
              if (!sig) return null;
              // Hide items that have moved to delivery — they live on the Delivery board
              if (sh.shaping_status === "In Delivery") return null;
              const stale = daysSince(sh.created_at);
              const hoursSinceStart = sh.shaping_started_at
                ? (Date.now() - new Date(sh.shaping_started_at).getTime()) / 3600000
                : 0;
              const isBug = sig.issue_type === "Bug";
              const overdue = isBug && !sh.fast_track && hoursSinceStart > 72 && sh.shaping_status !== "Approved";
              const borderCls = overdue
                ? "border-destructive/60 ring-1 ring-destructive/30"
                : sh.fast_track
                  ? "border-[var(--color-status-hold)]/60"
                  : stale > 12
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
                      <span className="flex items-center gap-1.5">
                        {sh.fast_track && (
                          <span className="rounded-full bg-[var(--color-status-hold)]/15 px-2 py-0.5 font-medium text-[var(--color-status-hold)]">
                            Fast-track
                          </span>
                        )}
                        {overdue && (
                          <span className="rounded-full bg-destructive/15 px-2 py-0.5 font-medium text-destructive">
                            Overdue
                          </span>
                        )}
                        <span className="rounded-full bg-muted px-2 py-0.5">{sh.shaping_status}</span>
                      </span>
                    </div>
                    <h3 className="line-clamp-2 font-display text-base leading-snug">{sig.title}</h3>
                    <div className="mt-4">
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>{sh.fast_track ? "Fast-track" : `Step ${displayStep(sh.current_step)} of 3`}</span>
                        <span>{stale}d in stage</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary"
                          style={{ width: sh.fast_track ? "50%" : `${(displayStep(sh.current_step) / 3) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollTable>
      )}
    </div>
  );
}

function ShapingWorkspace({ itemId, onBack }: { itemId: string; onBack: () => void }) {
  const sh = useTfpStore((s) => s.shaping.find((x) => x.id === itemId))!;
  const sig = useTfpStore((s) => s.signals.find((x) => x.id === sh.signal_id))!;

  // Bug timebox tracking (P2/P3 standard shaping)
  const isBug = sig.issue_type === "Bug";
  const hoursSinceStart = sh.shaping_started_at
    ? (Date.now() - new Date(sh.shaping_started_at).getTime()) / 3600000
    : 0;
  const showTimebox48 = isBug && !sh.fast_track && hoursSinceStart >= 48 && hoursSinceStart < 72 && sh.shaping_status !== "Approved" && sh.shaping_status !== "In Delivery";
  const showTimebox72 = isBug && !sh.fast_track && hoursSinceStart >= 72 && sh.shaping_status !== "Approved" && sh.shaping_status !== "In Delivery";

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

      {showTimebox48 && (
        <div className="mb-4 rounded-md border border-[var(--color-status-hold)]/40 bg-[var(--color-status-hold)]/5 p-3 text-sm text-[var(--color-status-hold)]">
          ⏱ 48h elapsed — 72h timebox applies to P2/P3 bugs.
        </div>
      )}
      {showTimebox72 && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          ⏱ Timebox breached ({Math.floor(hoursSinceStart)}h) — escalate or descope.
        </div>
      )}

      {sh.fast_track ? (
        <FastTrack item={sh} />
      ) : sig.issue_type === "Dependency Change" ? (
        <DependencyFastTrack item={sh} />
      ) : (
        <>
          {/* Stepper */}
          <ol className="mb-8 grid grid-cols-3 gap-2">
            {STEPS.map((label, i) => {
              const n = (i + 1) as 1 | 2 | 3;
              const step = displayStep(sh.current_step);
              const done = step > n;
              const active = step === n;
              const future = !done && !active;
              return (
                <li
                  key={label}
                  className={cn(
                    "rounded-md border px-3 py-2 text-xs",
                    done && "border-[var(--color-status-proceed)]/40 bg-[var(--color-status-proceed)]/5 text-[var(--color-status-proceed)]",
                    active && "border-primary/50 bg-primary/5 text-primary",
                    future && "border-border text-muted-foreground",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "grid h-5 w-5 place-items-center rounded-full text-[10px] font-medium",
                        done && "bg-[var(--color-status-proceed)] text-primary-foreground",
                        active && "bg-primary text-primary-foreground",
                        future && "bg-muted text-muted-foreground",
                      )}
                    >
                      {done ? <Check className="h-3 w-3" /> : n}
                    </span>
                    <span className="font-medium">{label}</span>
                  </div>
                </li>
              );
            })}
          </ol>

          {displayStep(sh.current_step) === 1 && <DefineBrief item={sh} />}
          {displayStep(sh.current_step) === 2 && <TechReview item={sh} />}
          {displayStep(sh.current_step) === 3 && <Approval item={sh} />}
          <InlineDecisions item={sh} />
        </>
      )}
    </div>
  );
}

function InlineDecisions({ item }: { item: ShapingItem }) {
  const allDecisions = useTfpStore((s) => s.decisions);
  const decisions = useMemo(
    () => allDecisions.filter((d) => d.linked_shaping_id === item.id),
    [allDecisions, item.id],
  );
  const createDecision = useTfpStore((s) => s.createDecision);
  const [title, setTitle] = useState("");
  const [decision, setDecision] = useState("");
  const [type, setType] = useState<DecisionType>("Product");
  const ready = title.trim().length > 2 && decision.trim().length > 2;

  return (
    <section className="mt-6 tfp-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg">Decisions on this item</h2>
          <p className="mt-1 text-xs text-muted-foreground">Record decisions here instead of sending people to a separate log.</p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{decisions.length} recorded</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_1fr_auto]">
        <select value={type} onChange={(e) => setType(e.target.value as DecisionType)} className="rounded-md border border-input bg-surface px-2 py-1.5 text-sm">
          {(["Product", "Architectural", "Process", "Vendor"] as DecisionType[]).map((t) => <option key={t}>{t}</option>)}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Decision title" className="rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
        <input value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="What was decided?" className="rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
        <button
          disabled={!ready}
          onClick={() => {
            createDecision({ title, type, context: item.problem_what || "Shaping decision", options_considered: "Recorded inline on shaping item", decision, consequences: item.solution_risks || "None noted", linked_signal_id: item.signal_id, linked_shaping_id: item.id });
            setTitle("");
            setDecision("");
          }}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          Record
        </button>
      </div>
      {decisions.length > 0 && (
        <div className="mt-4 space-y-2">
          {decisions.slice(0, 3).map((d) => <div key={d.id} className="rounded-md border border-border bg-surface px-3 py-2 text-sm"><span className="font-medium">{d.title}</span><span className="text-muted-foreground"> · {d.decision}</span></div>)}
        </div>
      )}
    </section>
  );
}

function FastTrack({ item }: { item: ShapingItem }) {
  const me = USERS.find((u) => u.id === useTfpStore((s) => s.currentUserId))!;
  const updateShaping = useTfpStore((s) => s.updateShaping);
  const approveFastTrack = useTfpStore((s) => s.approveFastTrack);
  const sig = useTfpStore((s) => s.signals.find((x) => x.id === item.signal_id))!;
  const owner = USERS.find((u) => u.id === item.pm_owner_id);

  const [rootCause, setRootCause] = useState(item.fast_track_root_cause);
  const ready = rootCause.trim().length >= 30;
  const hasRootCause = item.fast_track_root_cause.trim().length >= 30;
  const isPM = me.role === "PM" || me.role === "Senior PM";
  const isApproved = item.shaping_status === "Approved" || item.shaping_status === "In Delivery" || !!item.jira_key;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="rounded-md border border-[var(--color-status-hold)]/40 bg-[var(--color-status-hold)]/5 p-4 text-sm text-[var(--color-status-hold)]">
          <p className="font-medium">⚡ {sig.tier} Fast Track — Root cause only required</p>
          <p className="mt-1 text-xs opacity-90">
            Bugs at this severity bypass the standard shaping pipeline. Owner: {owner?.name ?? "—"} ({owner?.role}).
          </p>
        </div>

        <div className="tfp-card p-5">
          <label className="mb-1 block text-sm font-medium">
            Root cause — what is broken and why?
            <span className="ml-1 text-destructive">*</span>
          </label>
          <p className="mb-2 text-xs text-muted-foreground">Min 30 chars. Plain language summary for the PM.</p>
          <textarea
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            onBlur={() => updateShaping(item.id, { fast_track_root_cause: rootCause })}
            disabled={isApproved}
            rows={5}
            className="w-full resize-y rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
          <div className="mt-1 text-right text-xs text-muted-foreground">
            {rootCause.trim().length}/30
          </div>

          {!isApproved && (
            <div className="mt-4 flex justify-end">
              <button
                disabled={!ready}
                onClick={() => updateShaping(item.id, { fast_track_root_cause: rootCause })}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
              >
                Save root cause
              </button>
            </div>
          )}
        </div>

        {hasRootCause && !isApproved && (
          <div className="tfp-card p-5">
            <p className="text-sm font-medium">PM approval</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Approving will create the Jira ticket and move this to delivery immediately.
            </p>
            <button
              disabled={!isPM}
              onClick={() => approveFastTrack(item.id, me.id)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
            >
              <Check className="h-4 w-4" /> Approve & push to Jira
            </button>
            {!isPM && <p className="mt-2 text-xs text-muted-foreground">Switch to a PM to approve.</p>}
          </div>
        )}

        {isApproved && (
          <div className="rounded-md border border-[var(--color-status-proceed)]/30 bg-[var(--color-status-proceed)]/5 p-3 text-sm text-[var(--color-status-proceed)]">
            <Check className="mr-1 inline h-4 w-4" /> Fast-track approved
            {item.jira_key && <span className="ml-2 font-mono">{item.jira_key}</span>}
          </div>
        )}
      </div>

      <RoleHint required="PM" current={me.role} />
    </div>
  );
}

const DEP_SYSTEMS: Array<"Accuro" | "Phelix AI" | "Olive EngagedMD" | "Tia Health" | "EngagedMD"> = [
  "Accuro",
  "Phelix AI",
  "Olive EngagedMD",
  "Tia Health",
  "EngagedMD",
];

function DependencyFastTrack({ item }: { item: ShapingItem }) {
  const me = USERS.find((u) => u.id === useTfpStore((s) => s.currentUserId))!;
  const updateShaping = useTfpStore((s) => s.updateShaping);
  const sig = useTfpStore((s) => s.signals.find((x) => x.id === item.signal_id))!;

  const [whatChanged, setWhatChanged] = useState(item.dependency_what_changed);
  const [integrations, setIntegrations] = useState(item.dependency_integrations_affected);
  const [impact, setImpact] = useState(item.dependency_impact);
  const [deadline, setDeadline] = useState(item.dependency_deadline ?? "");
  const [system, setSystem] = useState<ShapingItem["dependency_system"]>(item.dependency_system);

  const ready =
    whatChanged.trim().length >= 30 &&
    integrations.trim().length > 0 &&
    impact.trim().length > 0 &&
    !!system;

  function save(advance: boolean) {
    updateShaping(item.id, {
      dependency_what_changed: whatChanged,
      dependency_integrations_affected: integrations,
      dependency_impact: impact,
      dependency_deadline: deadline || null,
      dependency_system: system,
      ...(advance ? { current_step: 2 as const, shaping_status: "In Tech Review" as const } : {}),
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium text-primary">⚡ Dependency change — impact assessment</p>
          <p className="mt-1 text-xs text-muted-foreground">
            External system change for <strong>{sig.product}</strong>. Skip Problem &amp; Solution briefs — capture impact and route straight to Tech Review.
          </p>
        </div>

        <div className="tfp-card space-y-4 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium">External system <span className="text-destructive">*</span></label>
            <select
              value={system ?? ""}
              onChange={(e) => setSystem((e.target.value || null) as ShapingItem["dependency_system"])}
              className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select…</option>
              {DEP_SYSTEMS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">What changed <span className="text-destructive">*</span></label>
            <p className="mb-1 text-xs text-muted-foreground">Min 30 chars. Be specific about endpoint, version, or behaviour change.</p>
            <textarea
              value={whatChanged}
              onChange={(e) => setWhatChanged(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">{whatChanged.trim().length}/30</div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Integrations affected <span className="text-destructive">*</span></label>
            <textarea
              value={integrations}
              onChange={(e) => setIntegrations(e.target.value)}
              rows={2}
              placeholder="Which of our products / sync jobs touch this?"
              className="w-full resize-y rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Impact if not addressed <span className="text-destructive">*</span></label>
            <textarea
              value={impact}
              onChange={(e) => setImpact(e.target.value)}
              rows={3}
              placeholder="What breaks, for whom, and when?"
              className="w-full resize-y rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">External deadline (optional)</label>
            <input
              type="date"
              value={deadline ? deadline.slice(0, 10) : ""}
              onChange={(e) => setDeadline(e.target.value ? new Date(e.target.value).toISOString() : "")}
              className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <button onClick={() => save(false)} className="text-sm text-muted-foreground hover:text-foreground">
              Save draft
            </button>
            <button
              disabled={!ready}
              onClick={() => save(true)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
            >
              Save + send to Tech Review
            </button>
          </div>
        </div>
      </div>

      <RoleHint required="PM" current={me.role} />
    </div>
  );
}


function DefineBrief({ item }: { item: ShapingItem }) {
  const updateShaping = useTfpStore((s) => s.updateShaping);
  const setComplexity = useTfpStore((s) => s.setComplexity);
  const setShapingAttachments = useTfpStore((s) => s.setShapingAttachments);
  const currentUserId = useTfpStore((s) => s.currentUserId);
  const ready =
    item.problem_what.trim().length >= 20 &&
    item.problem_why.trim().length >= 20 &&
    item.solution_approach.trim().length >= 20 &&
    !!item.solution_complexity;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="tfp-card divide-y divide-border">
        <div className="p-5">
          <h3 className="font-display text-lg">Define</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            One lightweight brief: problem, evidence, approach, open questions and rough effort. Extra detail can live in notes.
          </p>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Problem" value={item.problem_what} onChange={(v) => updateShaping(item.id, { problem_what: v })} rows={4} placeholder="What problem are we solving?" />
          <Field label="Why now / evidence" value={item.problem_why} onChange={(v) => updateShaping(item.id, { problem_why: v, problem_evidence: v })} rows={4} placeholder="Why does it matter, and what evidence do we have?" />
          <div>
            <label className="mb-1 block text-sm font-medium">Complexity</label>
            <select
              value={item.solution_complexity ?? ""}
              onChange={(e) => e.target.value && setComplexity(item.id, e.target.value as Complexity)}
              className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select…</option>
              {(["Simple", "Medium", "Complex"] as Complexity[]).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <Field label="Effort estimate" value={item.solution_effort} onChange={(v) => updateShaping(item.id, { solution_effort: v })} rows={2} placeholder="S/M/L or notes before tech estimate" />
          <div className="md:col-span-2">
            <Field label="Proposed approach" value={item.solution_approach} onChange={(v) => updateShaping(item.id, { solution_approach: v })} rows={4} placeholder="How should we solve this?" />
          </div>
          <Field label="Success criteria" value={item.solution_criteria} onChange={(v) => updateShaping(item.id, { solution_criteria: v })} rows={3} placeholder="What must be true when this is done?" />
          <Field label="Open questions" value={item.solution_questions} onChange={(v) => updateShaping(item.id, { solution_questions: v })} rows={3} placeholder="Questions for tech, QA, clinic, or leadership" />
          <div className="md:col-span-2 rounded-md border border-border bg-surface-2 p-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">Supporting attachments</p>
            <AttachmentsField attachments={item.attachments ?? []} onChange={(next: Attachment[]) => setShapingAttachments(item.id, next)} currentUserId={currentUserId} compact />
          </div>
        </div>
        <div className="flex items-center justify-between p-5">
          <p className="text-xs text-muted-foreground">Autosaves. Required: problem, why/evidence, approach and complexity.</p>
          <button
            disabled={!ready}
            onClick={() => updateShaping(item.id, { current_step: 2, shaping_status: "In Tech Review" })}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
          >
            Send to Tech Review
          </button>
        </div>
      </div>
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="tfp-card p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Simplified shaping</p>
          <p className="mt-2 text-sm text-muted-foreground">Roadmap bucket, displacement, detailed who/where and risk notes are no longer required to advance.</p>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value, onChange, rows, placeholder }: { label: string; value: string; onChange: (value: string) => void; rows: number; placeholder?: string }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full resize-y rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
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
  const setShapingAttachments = useTfpStore((s) => s.setShapingAttachments);
  const currentUserId = useTfpStore((s) => s.currentUserId);
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
              {f.key === "problem_evidence" && (
                <div className="mt-3 rounded-md border border-border bg-surface-2 p-3">
                  <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                    Supporting attachments
                  </p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Attach screenshots, recordings, tickets, or links that back this evidence up.
                  </p>
                  <AttachmentsField
                    attachments={item.attachments ?? []}
                    onChange={(next: Attachment[]) => setShapingAttachments(item.id, next)}
                    currentUserId={currentUserId}
                    compact
                  />
                </div>
              )}
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

const BUCKETS: RoadmapBucket[] = ["Committed", "Backlog", "Not Now"];

function RoadmapFit({ item }: { item: ShapingItem }) {
  const sprint = useTfpStore((s) => s.sprint);
  const setRoadmapBucket = useTfpStore((s) => s.setRoadmapBucket);
  const updateShaping = useTfpStore((s) => s.updateShaping);

  const usable = useMemo(() => usableCapacity(sprint), [sprint]);
  const usedPct = (sprint.allocated_pts / usable) * 100;
  const overloaded = usedPct > 85;

  const [bucket, setBucket] = useState<RoadmapBucket | null>(item.roadmap_bucket);
  const [displacement, setDisplacement] = useState(item.displacement);

  const needsDisplacement = bucket === "Committed" && overloaded;
  const canSave = !!bucket && (!needsDisplacement || displacement.trim().length > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="tfp-card p-5">
        <h3 className="font-display text-lg">Where does this fit?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a roadmap bucket. If it goes in <strong>Committed</strong> while the sprint is over 85% allocated, you'll need to name what gets displaced.
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


const FIELD_LABELS: Partial<Record<keyof ShapingItem, string>> = {
  solution_approach: "Approach",
  solution_criteria: "Success criteria",
  solution_effort: "Effort estimate",
  solution_decisions: "Key decisions",
  solution_questions: "Open questions",
  solution_risks: "Risks",
};

const ALL_SOLUTION_FIELDS: Array<keyof ShapingItem> = [
  "solution_approach",
  "solution_criteria",
  "solution_effort",
  "solution_decisions",
  "solution_questions",
  "solution_risks",
];

function SolutionBrief({ item }: { item: ShapingItem }) {
  const setComplexity = useTfpStore((s) => s.setComplexity);
  const updateShaping = useTfpStore((s) => s.updateShaping);
  const c = item.solution_complexity;
  const ready = solutionComplete(item);

  return (
    <div className="tfp-card p-5">
      <h3 className="font-display text-lg">Solution Brief</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick a complexity tag, then fill in as much detail as the work needs.
      </p>

      <div className="mt-5 max-w-xs">
        <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Complexity</label>
        <select
          value={c ?? ""}
          onChange={(e) => {
            const v = e.target.value as Complexity | "";
            if (v) setComplexity(item.id, v);
          }}
          className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="" disabled>Select complexity…</option>
          {(["Simple", "Medium", "Complex"] as Complexity[]).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <div className="mt-6 space-y-4">
        {ALL_SOLUTION_FIELDS.map((key) => (
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

      <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
        <button
          onClick={() => updateShaping(item.id, { current_step: 2 })}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
        <button
          disabled={!ready}
          onClick={() => updateShaping(item.id, { current_step: 2, shaping_status: "In Tech Review" })}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
        >
          Send to Tech Review
        </button>
      </div>
    </div>
  );
}

const CONCURRENT_KEYWORDS = ["accuro", "phelix", "integration", "api", "webhook", "sync"];

function TechReview({ item }: { item: ShapingItem }) {
  const me = USERS.find((u) => u.id === useTfpStore((s) => s.currentUserId))!;
  const isTechLead = me.role === "Tech Lead";
  const updateShaping = useTfpStore((s) => s.updateShaping);
  const signOff = useTfpStore((s) => s.signOffTechReview);
  const sig = useTfpStore((s) => s.signals.find((x) => x.id === item.signal_id));

  const haystack = `${sig?.description ?? ""} ${item.solution_approach}`.toLowerCase();
  const needsConcurrentCheck = CONCURRENT_KEYWORDS.some((k) => haystack.includes(k));

  const ready =
    item.tech_review_notes.trim().length > 0 &&
    typeof item.tech_estimate_pts === "number" &&
    (item.tech_estimate_pts ?? 0) > 0 &&
    (!needsConcurrentCheck || item.tech_concurrent_access_checked);

  if (item.tech_signed_off_at) {
    const reviewer = USERS.find((u) => u.id === item.tech_reviewer_id);
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="tfp-card p-5">
          <div className="flex items-center gap-2 rounded-md border border-[var(--color-status-proceed)]/30 bg-[var(--color-status-proceed)]/5 p-3 text-sm text-[var(--color-status-proceed)]">
            <ShieldCheck className="h-4 w-4" />
            Signed off by {reviewer?.name ?? "Tech Lead"} on {fmtDateTime(item.tech_signed_off_at)}.
          </div>
          <dl className="mt-5 space-y-4 text-sm">
            <ReadField label="Review notes" value={item.tech_review_notes} />
            <ReadField label="Concerns" value={item.tech_concerns || "None"} />
            <ReadField label="Estimate" value={`${item.tech_estimate_pts} points`} />
            {needsConcurrentCheck && (
              <ReadField label="Concurrent access" value={item.tech_concurrent_access_checked ? "Reviewed and documented" : "Not checked"} />
            )}
          </dl>
          <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
            <button
              onClick={() => updateShaping(item.id, { current_step: 1 })}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back
            </button>
            <button
              onClick={() => updateShaping(item.id, { current_step: 3 })}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Continue to Approval →
            </button>
          </div>
        </div>
        <RoleHint required="Tech Lead" current={me.role} />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="tfp-card p-5">
        <h3 className="font-display text-lg">Tech Review</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          A Tech Lead reviews the shaped proposal, confirms the approach, estimates effort, and signs off.
        </p>

        <fieldset disabled={!isTechLead} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Review notes</label>
            <textarea
              value={item.tech_review_notes}
              onChange={(e) => updateShaping(item.id, { tech_review_notes: e.target.value })}
              rows={4}
              placeholder="Approach feedback, suggested changes, dependencies…"
              className="w-full resize-y rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Concerns / risks (optional)</label>
            <textarea
              value={item.tech_concerns}
              onChange={(e) => updateShaping(item.id, { tech_concerns: e.target.value })}
              rows={2}
              className="w-full resize-y rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="w-32">
              <label className="mb-1 block text-sm font-medium">Estimate (pts)</label>
              <input
                type="number"
                min={1}
                max={40}
                value={item.tech_estimate_pts ?? ""}
                onChange={(e) =>
                  updateShaping(item.id, {
                    tech_estimate_pts: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Final estimate that propagates to Sprint capacity.
            </p>
          </div>

          {needsConcurrentCheck && (
            <div className="rounded-md border border-[var(--color-status-hold)]/40 bg-[var(--color-status-hold)]/5 p-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.tech_concurrent_access_checked}
                  onChange={(e) => updateShaping(item.id, { tech_concurrent_access_checked: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-[var(--color-status-hold)]">Concurrent access behaviour reviewed and documented</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Detected integration keywords (Accuro/Phelix/API/webhook/sync). Confirm concurrent-access edge cases are handled.
                  </span>
                </span>
              </label>
            </div>
          )}
        </fieldset>

        {needsConcurrentCheck && !item.tech_concurrent_access_checked && (
          <p className="mt-3 text-xs text-destructive">
            Concurrent access review required for integration items.
          </p>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
          <button
            onClick={() => updateShaping(item.id, { current_step: 1 })}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
          <button
            disabled={!isTechLead || !ready}
            onClick={() => signOff(item.id, me.id)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
          >
            <ShieldCheck className="h-4 w-4" /> Sign off
          </button>
        </div>
      </div>

      <RoleHint required="Tech Lead" current={me.role} />
    </div>
  );
}

function Approval({ item }: { item: ShapingItem }) {
  const me = USERS.find((u) => u.id === useTfpStore((s) => s.currentUserId))!;
  const isSeniorPM = me.role === "Senior PM";
  const approve = useTfpStore((s) => s.approveShaping);
  const requestChanges = useTfpStore((s) => s.requestChanges);
  const updateShaping = useTfpStore((s) => s.updateShaping);
  const pushToJira = useTfpStore((s) => s.pushToJira);

  const [notes, setNotes] = useState(item.approval_notes);
  const gates = useMemo(
    () => [
      { ok: completenessScore(item) >= 3, label: "Definition complete" },
      { ok: solutionComplete(item), label: "Approach complete" },
      { ok: techReviewComplete(item), label: "Tech Review signed off" },
    ],
    [item],
  );
  const allGatesPass = gates.every((g) => g.ok);
  const eligible = canApprove(item);

  if (item.shaping_status === "Approved" || item.jira_key) {
    const approver = USERS.find((u) => u.id === item.approver_id);
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="tfp-card p-5">
          <div className="flex items-center gap-2 rounded-md border border-[var(--color-status-proceed)]/30 bg-[var(--color-status-proceed)]/5 p-3 text-sm text-[var(--color-status-proceed)]">
            <Check className="h-4 w-4" />
            Approved by {approver?.name ?? "Senior PM"}
            {item.approved_at && ` on ${fmtDateTime(item.approved_at)}`}.
          </div>
          {item.approval_notes && (
            <ReadField label="Approval notes" value={item.approval_notes} className="mt-5" />
          )}
          <div className="mt-6 border-t border-border pt-5">
            {item.jira_key ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Pushed to Jira as</span>
                <span className="font-mono font-semibold text-foreground">{item.jira_key}</span>
              </div>
            ) : (
              <>
                <button
                  onClick={() => pushToJira(item.id)}
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                >
                  Push to Jira (Backlog)
                </button>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Creates the Jira issue in the backlog. Use <strong>Add to Sprint</strong> on the Delivery board to commit it to the current sprint.
                </p>
              </>
            )}
          </div>
        </div>
        <RoleHint required="Senior PM" current={me.role} />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="tfp-card p-5">
        <h3 className="font-display text-lg">Final Approval</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Senior PM approval is required before this item can be pushed to Jira and enter delivery.
        </p>

        <div className="mt-5 rounded-md border border-border bg-muted/40 p-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Approval gates</p>
          <ul className="space-y-1.5 text-sm">
            {gates.map((g) => (
              <li key={g.label} className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid h-4 w-4 place-items-center rounded-full text-[10px]",
                    g.ok
                      ? "bg-[var(--color-status-proceed)] text-primary-foreground"
                      : "bg-muted-foreground/30 text-muted-foreground",
                  )}
                >
                  {g.ok ? <Check className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                </span>
                <span className={g.ok ? "text-foreground" : "text-muted-foreground"}>{g.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <fieldset disabled={!isSeniorPM || !allGatesPass} className="mt-5">
          <label className="mb-1 block text-sm font-medium">Approval notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional context for the team…"
            className="w-full resize-y rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          />
        </fieldset>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <button
            onClick={() => updateShaping(item.id, { current_step: 2 })}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
          <div className="flex gap-2">
            <button
              disabled={!isSeniorPM}
              onClick={() => requestChanges(item.id, me.id, notes)}
              className="rounded-md border border-[var(--color-status-hold)]/40 bg-[var(--color-status-hold)]/5 px-4 py-2 text-sm font-medium text-[var(--color-status-hold)] transition hover:bg-[var(--color-status-hold)]/10 disabled:opacity-40"
            >
              Request changes
            </button>
            <button
              disabled={!eligible || !isSeniorPM}
              onClick={() => approve(item.id, me.id, notes)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
            >
              <Check className="h-4 w-4" /> Approve
            </button>
          </div>
        </div>
      </div>

      <RoleHint required="Senior PM" current={me.role} />
    </div>
  );
}

function RoleHint({ required, current }: { required: string; current: string }) {
  const ok = required === current;
  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="tfp-card p-5">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Required role</p>
        <p className="mt-2 font-display text-xl">{required}</p>
        <p
          className={cn(
            "mt-2 text-xs",
            ok ? "text-[var(--color-status-proceed)]" : "text-[var(--color-status-hold)]",
          )}
        >
          {ok
            ? `You are signed in as ${current} — you can sign off here.`
            : `You're viewing as ${current}. Switch user (top-right) to a ${required} to act on this step.`}
        </p>
      </div>
    </aside>
  );
}

function ReadField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">{value}</dd>
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
