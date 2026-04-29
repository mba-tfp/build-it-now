import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  completenessScore,
  daysSince,
  USERS,
  useTfpStore,
} from "@/lib/tfp/store";
import type {
  DecisionType,
  ShapingItem,
} from "@/lib/tfp/types";
import { fmtDateTime } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { SortMenu, useSortMenu } from "@/components/tfp/SortMenu";
import { sortRows } from "@/components/tfp/SortableHeader";
import { ScrollTable } from "@/components/tfp/ScrollTable";
import { AttachmentsField } from "@/components/tfp/AttachmentsField";
import { CommitmentBadge, LabelsList } from "@/components/tfp/Badge";
import type { Attachment } from "@/lib/tfp/types";

export const Route = createFileRoute("/_app/shaping")({
  component: ShapingPage,
});

const STEPS = ["Define", "Tech Review"] as const;

function isFix(item: ShapingItem): boolean {
  return item.commitment_type === "Fix" || item.commitment_type === "Incident";
}

function displayStep(step: number): 1 | 2 {
  if (step >= 4) return 2;
  if (step >= 2) return 2;
  return 1;
}

function techLeadName(user?: { name: string } | null): string {
  if (!user) return "Tech Lead";
  return user.name === "M. Ahmed" ? "Ahmed" : user.name;
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
      const aOverdue = isFix(a.sh) && !a.sh.fast_track && ah > 72 && a.sh.shaping_status !== "Approved" && a.sh.shaping_status !== "In Delivery" ? 1 : 0;
      const bOverdue = isFix(b.sh) && !b.sh.fast_track && bh > 72 && b.sh.shaping_status !== "Approved" && b.sh.shaping_status !== "In Delivery" ? 1 : 0;
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
            Approved signals move through Define → Tech Review before delivery.
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
              const daysInStatus = daysSince(sh.updated_at || sh.created_at);
              const hoursSinceStart = sh.shaping_started_at
                ? (Date.now() - new Date(sh.shaping_started_at).getTime()) / 3600000
                : 0;
              const isBug = isFix(sh);
              const overdue = isBug && !sh.fast_track && hoursSinceStart > 72 && sh.shaping_status !== "Approved";
              const score = completenessScore(sh);
              const techLead = USERS.find((u) => u.id === sh.tech_reviewer_id);
              const borderCls = overdue
                ? "border-destructive/60 ring-1 ring-destructive/30"
                : sh.fast_track
                  ? "border-[var(--color-status-hold)]/60"
                  : daysInStatus > 12
                    ? "border-destructive/40"
                    : daysInStatus > 6
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
                    <div className="mb-2 flex items-start justify-between gap-3 text-[11px] text-muted-foreground">
                      <span className="font-medium">{sig.product}</span>
                      <span className="flex flex-col items-end gap-1.5">
                        <span className="flex flex-wrap justify-end gap-1.5">
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
                        {sh.shaping_status === "Ready for Sprint" && (
                          <span className="rounded-full bg-[var(--color-status-proceed)]/15 px-2 py-0.5 font-medium text-[var(--color-status-proceed)]">
                            Ready
                          </span>
                        )}
                        </span>
                        {sh.shaping_status === "In Tech Review" && (
                          <span className="font-medium text-[var(--color-status-hold)]">
                            Waiting on {techLeadName(techLead)}
                          </span>
                        )}
                      </span>
                    </div>
                    <h3 className="line-clamp-2 font-display text-base leading-snug">{sig.title}</h3>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <CommitmentBadge type={sh.commitment_type} />
                      <LabelsList labels={sig.labels} />
                    </div>
                    <div className="mt-4">
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>Completeness {score}/5</span>
                        <span>{daysInStatus}d in current status</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full", score === 5 ? "bg-[var(--color-status-proceed)]" : "bg-primary")}
                          style={{ width: `${(score / 5) * 100}%` }}
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
  const isBug = isFix(sh);
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
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{sig.product}</p>
          <CommitmentBadge type={sh.commitment_type} />
        </div>
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
      ) : sh.commitment_type === "Dependency" ? (
        <DependencyFastTrack item={sh} />
      ) : (
        <>
          {/* Stepper */}
          <ol className="mb-8 grid grid-cols-2 gap-2">
            {STEPS.map((label, i) => {
              const n = (i + 1) as 1 | 2;
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
  const isApproved = item.shaping_status === "Ready for Sprint" || item.shaping_status === "Approved" || item.shaping_status === "In Delivery" || !!item.jira_key;

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
              Approving marks this item Ready for Sprint. Jira is created only during Sprint Planning.
            </p>
            <button
              disabled={!isPM}
              onClick={() => approveFastTrack(item.id, me.id)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
            >
              <Check className="h-4 w-4" /> Approve for sprint planning
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
      ...(advance ? { current_step: 4 as const, shaping_status: "In Tech Review" as const } : {}),
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
  const setShapingAttachments = useTfpStore((s) => s.setShapingAttachments);
  const pushNotification = useTfpStore((s) => s.pushNotification);
  const currentUserId = useTfpStore((s) => s.currentUserId);
  const [assignOpen, setAssignOpen] = useState(false);
  const techLeads = USERS.filter((u) => u.role === "Tech Lead");
  const [selectedTechLead, setSelectedTechLead] = useState(item.tech_reviewer_id ?? techLeads[0]?.id ?? "");
  const requiredFields = [
    { key: "problem_what" as const, label: "Problem", min: 30 },
    { key: "problem_why" as const, label: "Why now", min: 30 },
    { key: "problem_who" as const, label: "Who is affected", min: 20 },
    { key: "solution_criteria" as const, label: "Success criteria", min: 30 },
    { key: "solution_approach" as const, label: "Proposed approach", min: 30 },
  ];
  const missingRequired = requiredFields
    .filter((f) => String(item[f.key] ?? "").trim().length < f.min)
    .map((f) => f.label);
  const ready = missingRequired.length === 0;

  function confirmAssignment() {
    const lead = USERS.find((u) => u.id === selectedTechLead);
    if (!lead) return;
    updateShaping(item.id, {
      current_step: 2,
      shaping_status: "In Tech Review",
      tech_reviewer_id: lead.id,
      solution_complexity: item.solution_complexity ?? "Medium",
    });
    pushNotification({
      trigger: "tech_review_ready",
      title: "Tech review assigned",
      body: "A shaping item is waiting for your review.",
      link_to: "/shaping",
      for_user_id: lead.id,
      entity_id: item.id,
    });
    setAssignOpen(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="tfp-card divide-y divide-border">
        <div className="p-5">
          <h3 className="font-display text-lg">Define</h3>
        </div>
        <div className="space-y-4 p-5">
          <Field label="Problem (what is broken or missing?)" value={item.problem_what} onChange={(v) => updateShaping(item.id, { problem_what: v })} rows={4} min={30} required />
          <Field label="Why now (why does this matter and what happens if we don't solve it?)" value={item.problem_why} onChange={(v) => updateShaping(item.id, { problem_why: v })} rows={4} min={30} required />
          <Field label="Who is affected (which clinics, which roles, how many people)" value={item.problem_who} onChange={(v) => updateShaping(item.id, { problem_who: v })} rows={3} min={20} required />
          <Field label="Success criteria (what must be true when this is done?)" value={item.solution_criteria} onChange={(v) => updateShaping(item.id, { solution_criteria: v })} rows={3} min={30} required />
          <Field label="Proposed approach (how do we solve this at a high level?)" value={item.solution_approach} onChange={(v) => updateShaping(item.id, { solution_approach: v })} rows={4} min={30} required />
          <Field label="Open questions (what needs to be answered before building?)" value={item.solution_questions} onChange={(v) => updateShaping(item.id, { solution_questions: v })} rows={3} />
          <Field label="Out of scope (what are we explicitly not solving?)" value={item.problem_out_of_scope} onChange={(v) => updateShaping(item.id, { problem_out_of_scope: v })} rows={3} />
          <div className="md:col-span-2 rounded-md border border-border bg-surface-2 p-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">Supporting attachments</p>
            <AttachmentsField attachments={item.attachments ?? []} onChange={(next: Attachment[]) => setShapingAttachments(item.id, next)} currentUserId={currentUserId} compact />
          </div>
        </div>
        <div className="flex items-center justify-between p-5">
          <p className="text-xs text-muted-foreground">
            {ready ? "Ready to send." : `Required: ${missingRequired.join(", ")}.`}
          </p>
          <button
            disabled={!ready}
            onClick={() => setAssignOpen(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
          >
            Send to Tech Review
          </button>
        </div>
      </div>
      {assignOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-md border border-border bg-surface p-5 shadow-xl">
            <h3 className="font-display text-lg">Assign a Tech Lead for this review</h3>
            <select
              value={selectedTechLead}
              onChange={(e) => setSelectedTechLead(e.target.value)}
              className="mt-4 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {techLeads.map((lead) => <option key={lead.id} value={lead.id}>{techLeadName(lead)}</option>)}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setAssignOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent/40">Cancel</button>
              <button onClick={confirmAssignment} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Confirm</button>
            </div>
          </div>
        </div>
      )}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="tfp-card p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Completeness</p>
          <div className="mt-2 flex items-baseline gap-1"><span className="font-display text-4xl">{completenessScore(item)}</span><span className="text-sm text-muted-foreground">/ 5</span></div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value, onChange, rows, placeholder, min, required }: { label: string; value: string; onChange: (value: string) => void; rows: number; placeholder?: string; min?: number; required?: boolean }) {
  const len = value.trim().length;
  const ok = !required || len >= (min ?? 0);
  return (
    <div>
      <label className="mb-1 flex items-baseline justify-between gap-3 text-sm font-medium">
        <span>{label}{required && <span className="ml-1 text-destructive">*</span>}</span>
        {required && <span className={cn("text-xs", ok ? "text-[var(--color-status-proceed)]" : "text-muted-foreground")}>{len}/{min}</span>}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={cn("w-full resize-y rounded-md border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring", !ok && len > 0 ? "border-destructive/50" : "border-input")}
      />
    </div>
  );
}

const CONCURRENT_KEYWORDS = ["accuro", "phelix", "integration", "api", "webhook", "sync"];

function TechReview({ item }: { item: ShapingItem }) {
  const me = USERS.find((u) => u.id === useTfpStore((s) => s.currentUserId))!;
  const assignedLead = USERS.find((u) => u.id === item.tech_reviewer_id);
  const canEdit = me.role === "Tech Lead" && (!item.tech_reviewer_id || item.tech_reviewer_id === me.id);
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
            Tech review complete — this item is ready for sprint planning.
          </div>
          <dl className="mt-5 space-y-4 text-sm">
            <ReadField label="Assigned to" value={techLeadName(reviewer)} />
            <ReadField label="Review notes" value={item.tech_review_notes} />
            <ReadField label="Concerns" value={item.tech_concerns || "None"} />
            <ReadField label="Estimate" value={`${item.tech_estimate_pts} points`} />
            <ReadField label="Signed off" value={fmtDateTime(item.tech_signed_off_at)} />
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
        <div className="mt-5 rounded-md border border-border bg-surface-2 p-3 text-sm">
          <span className="text-muted-foreground">Assigned to</span>
          <span className="ml-2 font-medium">{techLeadName(assignedLead)}</span>
        </div>
        {!canEdit && (
          <div className="mt-3 rounded-md border border-[var(--color-status-hold)]/40 bg-[var(--color-status-hold)]/5 p-3 text-sm text-[var(--color-status-hold)]">
            Switch to {techLeadName(assignedLead)} to complete this review.
          </div>
        )}

        <fieldset disabled={!canEdit} className="mt-5 space-y-4">
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
            disabled={!canEdit || !ready}
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

