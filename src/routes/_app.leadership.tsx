import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { toast } from "sonner";
import { SprintUpdateModal } from "@/components/tfp/SprintUpdateModal";
import { USERS, daysSince, usableCapacity, useTfpStore } from "@/lib/tfp/store";
import { fmtDate } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import type { OutcomeRating, Override, Review, ShapingItem, Signal } from "@/lib/tfp/types";

export const Route = createFileRoute("/_app/leadership")({
  component: LeadershipPage,
});

const JIRA_BOARD_URL = "https://thefertilitypartners.atlassian.net/jira/software/projects/TFP/boards";
const ACK_UNDO_WINDOW_MS = 6000;
const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3600000;
const blockedEscalationHoursForTier = (tier: Signal["tier"]) => ({ P0: 24, P1: 48, P2: 72, P3: 96 })[tier];

export function LeadershipPage() {
  const signals = useTfpStore((s) => s.signals);
  const shaping = useTfpStore((s) => s.shaping);
  const reviews = useTfpStore((s) => s.reviews);
  const sprint = useTfpStore((s) => s.sprint);
  const overrides = useTfpStore((s) => s.overrides);
  const retros = useTfpStore((s) => s.retros);
  const users = useTfpStore((s) => s.users);
  const ackOverride = useTfpStore((s) => s.ackOverride);
  const unackOverride = useTfpStore((s) => s.unackOverride);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ackingId, setAckingId] = useState<string | null>(null);

  const usable = usableCapacity(sprint);
  const inSprint = shaping.filter((item) => item.in_sprint && item.delivery_status);
  const blocked = inSprint.filter((item) => item.delivery_status === "Blocked");
  const done = inSprint.filter((item) => item.delivery_status === "Done");
  const inProgress = inSprint.filter((item) => item.delivery_status === "In Progress" || item.delivery_status === "In QA");
  const capacityPct = Math.round((sprint.allocated_pts / Math.max(1, usable)) * 100);
  const pendingOverrides = overrides.filter((override) => override.shahid_visible && override.ack_status === "Pending");
  const acknowledgedOverrides = overrides.filter((o) => o.ack_status === "Acknowledged");
  const blockedEscalated = blocked.filter((item) => {
    const signal = signals.find((s) => s.id === item.signal_id);
    return !!item.blocked_since && hoursSince(item.blocked_since) >= blockedEscalationHoursForTier(signal?.tier ?? "P2");
  });
  const slaBreached = signals.filter((signal) => isOpen(signal) && new Date(signal.sla_due_at).getTime() < Date.now());
  const reviewsMissing = shaping.filter((item) => item.delivery_status === "Done" && daysSince(item.updated_at) > 5 && !completedReview(reviews, item.id));
  const retroOverdue = new Date(sprint.end_date).getTime() < Date.now() && !retros.some((retro) => retro.sprint_id === sprint.id);
  const attentionCount = pendingOverrides.length + blockedEscalated.length + slaBreached.length + reviewsMissing.length + (retroOverdue ? 1 : 0);
  const sprintAtRisk = blocked.length >= 2 || sprint.allocated_pts > usable;
  const recentClinicSignals = signals.filter((signal) => signal.source === "Clinic" && daysSince(signal.created_at) <= 14);
  const rejectedClinicSignals = recentClinicSignals.filter((signal) => signal.status === "Rejected");
  const shipped = shaping
    .filter((item) => item.delivery_status === "Done")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);
  const shippedVisible = [...reviewsMissing, ...shipped.filter((item) => !reviewsMissing.some((missing) => missing.id === item.id))].slice(0, 7);

  // Trend line — last sprint vs this sprint
  const sprintStartMs = new Date(sprint.start_date).getTime();
  const lastSprintShipped = shaping.filter((item) => item.delivery_status === "Done" && new Date(item.updated_at).getTime() < sprintStartMs);
  const lastSprintMissed = reviews.filter((r) => r.status === "Completed" && r.outcome_rating === "Missed" && new Date(r.updated_at ?? r.created_at ?? sprint.start_date).getTime() < sprintStartMs);
  const hasLastSprintData = lastSprintShipped.length > 0 || lastSprintMissed.length > 0;

  const briefingMarkdown = useMemo(() => {
    const lines = [
      `# Leadership briefing — ${fmtDate(new Date().toISOString())}`,
      "",
      "## Needs your attention",
      attentionCount ? `- ${attentionCount} item(s): ${pendingOverrides.length} overrides, ${blockedEscalated.length} escalated blockers, ${slaBreached.length} SLA breaches, ${reviewsMissing.length} items shipped with no outcome review${retroOverdue ? ", retro overdue" : ""}.` : "- Nothing needs your attention right now.",
      "",
      "## This sprint",
      `- ${sprint.notes || "Sprint goal not set."}`,
      `- ${done.length}/${inSprint.length} done · ${blocked.length} blocked · ${sprint.allocated_pts}/${usable} pts allocated.`,
      "",
      "## Clinic signals",
      `- ${recentClinicSignals.length} clinic signals in the last 14 days; ${rejectedClinicSignals.length} rejected.`,
      "",
      "## What shipped and did it work",
      ...(shippedVisible.length ? shippedVisible.map((item) => `- ${signalTitle(signals, item)} — ${reviewLabel(completedReview(reviews, item.id))}`) : ["- Nothing marked Done yet."]),
    ];
    return lines.join("\n");
  }, [attentionCount, blocked.length, blockedEscalated.length, done.length, inSprint.length, pendingOverrides.length, recentClinicSignals.length, rejectedClinicSignals.length, reviews, reviewsMissing.length, retroOverdue, shippedVisible, signals, slaBreached.length, sprint, usable]);

  function copyBriefing() {
    navigator.clipboard?.writeText(briefingMarkdown);
    toast.success("Briefing copied", { description: "Markdown summary copied to clipboard." });
  }

  function handleConfirmAck(id: string, comment: string) {
    ackOverride(id, comment);
    setAckingId(null);
    const expires = Date.now() + ACK_UNDO_WINDOW_MS;
    toast.success("Override acknowledged.", {
      duration: ACK_UNDO_WINDOW_MS,
      action: {
        label: "Undo",
        onClick: () => {
          if (Date.now() > expires) return;
          unackOverride(id);
          toast("Acknowledgement reversed.");
        },
      },
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Leadership</p>
          <h1 className="mt-1 font-display text-3xl">Leadership Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Attention, sprint status, clinic signals, and outcomes.</p>
        </div>
      </header>

      {/* Sprint goal as hero */}
      <section data-testid="leadership-sprint-hero" className="tfp-card p-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">This sprint</p>
        {sprint.notes ? (
          <p className="mt-2 font-display text-3xl leading-tight md:text-4xl">{sprint.notes}</p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No sprint goal set. <Link to="/delivery" className="text-primary hover:underline">Set one in Delivery</Link>
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{sprint.name} · {fmtDate(sprint.start_date)} → {fmtDate(sprint.end_date)}</p>
        {sprintAtRisk && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-[var(--color-status-hold)]/30 bg-[var(--color-status-hold)]/10 px-3 py-1.5 text-sm text-[var(--color-status-hold)]">
            <AlertTriangle className="h-4 w-4" /> Sprint at risk
          </div>
        )}
      </section>

      {/* Needs your attention */}
      <section data-testid="leadership-attention" className={cn("tfp-card p-5", attentionCount ? "border-destructive/50" : "border-[var(--color-status-proceed)]/30")}>
        <h2 className="mb-4 font-display text-xl">
          {attentionCount === 0 ? (
            <>Needs your attention <span className="text-[var(--color-status-proceed)]">✓</span></>
          ) : (
            <>Needs your attention <span className="text-destructive">({attentionCount})</span></>
          )}
        </h2>
        {attentionCount === 0 ? (
          <div className="rounded-md border border-[var(--color-status-proceed)]/30 bg-[var(--color-status-proceed)]/10 px-3 py-2 text-sm text-[var(--color-status-proceed)]">Nothing needs your attention right now</div>
        ) : (
          <div className="space-y-3">
            {/* Severity 1: escalated blockers */}
            {blockedEscalated.map((item) => (
              <AttentionRow key={item.id} tone="bad" title={`${item.jira_key}: ${signalTitle(signals, item)}`} meta={`${item.blocker_description || "Blocked"} · ${item.blocked_since ? daysSince(item.blocked_since) : 0}d blocked`} />
            ))}
            {/* Severity 2: pending overrides */}
            {pendingOverrides.map((override) => (
              <div key={override.id} data-testid={`override-row-${override.id}`}>
                <AttentionRow tone="bad" title={`${override.kind}: ${override.reason}`} meta={`Raised by ${userName(users, override.raised_by)} · ${fmtDate(override.raised_at)}`}>
                  {ackingId !== override.id && (
                    <button
                      data-testid={`override-ack-${override.id}`}
                      onClick={() => setAckingId(override.id)}
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Acknowledge
                    </button>
                  )}
                </AttentionRow>
                {ackingId === override.id && (
                  <AckForm
                    overrideId={override.id}
                    onCancel={() => setAckingId(null)}
                    onConfirm={(comment) => handleConfirmAck(override.id, comment)}
                  />
                )}
              </div>
            ))}
            {/* Severity 3: SLA breaches */}
            {slaBreached.map((signal) => (
              <AttentionRow key={signal.id} tone="bad" title={signal.title} meta={`${signal.source} · ${daysSince(signal.sla_due_at)}d overdue`} />
            ))}
            {/* Severity 4: reviews missing */}
            {reviewsMissing.map((item) => (
              <AttentionRow key={item.id} tone="bad" title="Item shipped with no outcome review" meta={`${signalTitle(signals, item)} · ${daysSince(item.updated_at)}d since Done`} />
            ))}
            {/* Severity 5: retro overdue */}
            {retroOverdue && <AttentionRow tone="bad" title={`${sprint.name} retro overdue`} meta={`${daysSince(sprint.end_date)}d overdue`} />}
          </div>
        )}

        {acknowledgedOverrides.length > 0 && (
          <div data-testid="ack-history" className="mt-4 border-t border-border pt-3">
            <button
              data-testid="ack-history-toggle"
              onClick={() => setHistoryOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-muted"
            >
              <span>Acknowledged overrides ({acknowledgedOverrides.length})</span>
              {historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {historyOpen && (
              <div data-testid="ack-history-list" className="mt-2 space-y-2">
                {acknowledgedOverrides.map((o) => (
                  <div key={o.id} className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                    <p className="font-medium">{o.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Raised by {userName(users, o.raised_by)} · {fmtDate(o.raised_at)} → Acknowledged {o.acknowledged_at ? fmtDate(o.acknowledged_at) : "—"}
                    </p>
                    {o.ack_comment && <p className="mt-1 text-xs italic text-muted-foreground">"{o.ack_comment}"</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* This sprint — counts + capacity + trend */}
      <Panel title="This sprint">
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Capacity</span><span className="font-mono">{sprint.allocated_pts}/{usable} pts</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full", capacityPct > 100 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, capacityPct)}%` }} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            <Count label="Committed" value={inSprint.length} />
            <Count label="Done" value={done.length} />
            <Count label="In Progress" value={inProgress.length} />
            <Count label="Blocked" value={blocked.length} tone={blocked.length ? "bad" : "good"} />
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {hasLastSprintData
            ? `Last sprint: ${lastSprintShipped.length} shipped · ${lastSprintMissed.length} missed outcome · This sprint so far: ${done.length} done · ${blocked.length} blocked`
            : "No previous sprint data available."}
        </p>
        <a
          href={JIRA_BOARD_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-sm text-primary hover:underline"
        >
          View active sprint in Jira →
        </a>
      </Panel>

      <Panel title="Clinic signals (last 14 days)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Title</th><th className="px-3 py-2 font-medium">Clinic</th><th className="px-3 py-2 font-medium">Product</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Days since logged</th></tr></thead>
            <tbody>
              {recentClinicSignals.map((signal) => (
                <tr key={signal.id} className="border-b border-border/60 last:border-0"><td className="px-3 py-2 font-medium">{signal.title}</td><td className="px-3 py-2 text-muted-foreground">{clinicNameFromSignal(signal)}</td><td className="px-3 py-2 text-muted-foreground">{signal.product}</td><td className="px-3 py-2 text-muted-foreground">{signal.status}</td><td className="px-3 py-2 text-muted-foreground">{daysSince(signal.created_at)}d</td></tr>
              ))}
              {recentClinicSignals.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No clinic signals in the last 14 days.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-4 rounded-md border border-border bg-surface p-3">
          <h3 className="text-sm font-medium">What we said no to and why</h3>
          <p className="mt-1 text-xs text-muted-foreground">{rejectedClinicSignals.length} rejected in the last 14 days</p>
          <div className="mt-3 space-y-2">
            {rejectedClinicSignals.map((signal) => <p key={signal.id} className="text-sm"><span className="font-medium">{signal.title}</span> — {signal.triage_reason || "No reason recorded."}</p>)}
            {rejectedClinicSignals.length === 0 && <p className="text-sm text-muted-foreground">No rejected clinic signals in this period.</p>}
          </div>
        </div>
      </Panel>

      <Panel title="What shipped and did it work">
        <div className="space-y-3">
          {shippedVisible.map((item) => {
            const signal = signals.find((s) => s.id === item.signal_id);
            const review = completedReview(reviews, item.id);
            const overdue = !review && daysSince(item.updated_at) > 5;
            return (
              <div key={item.id} className={cn("rounded-md border bg-surface p-3", overdue ? "border-destructive/50 bg-destructive/5" : "border-border")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-medium">{signal?.title ?? item.jira_key}</p><p className="mt-1 text-xs text-muted-foreground">{signal?.product ?? "—"} · {item.jira_key ?? "—"} · completed {fmtDate(item.updated_at)}</p></div>
                  <div className="flex flex-wrap gap-2"><OutcomeBadge rating={review?.outcome_rating ?? null} />{overdue && <Badge tone="bad">Review overdue</Badge>}</div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{reviewSummary(review)}</p>
              </div>
            );
          })}
          {shippedVisible.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing marked Done yet.</p>}
        </div>
      </Panel>

      {/* Stakeholder briefing collapsed */}
      <section data-testid="briefing-section" className="tfp-card p-5">
        <button
          onClick={() => setBriefingOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left"
        >
          <h2 className="font-display text-xl">Stakeholder briefing</h2>
          <span className="text-xs text-primary hover:underline">{briefingOpen ? "Hide" : "Show"}</span>
        </button>
        {briefingOpen && (
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs leading-relaxed text-foreground">{briefingMarkdown}</pre>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={copyBriefing}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <FileText className="h-4 w-4" /> Export for board update
        </button>
        <button
          onClick={() => setUpdateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          <FileText className="h-4 w-4" /> Sprint update
        </button>
      </div>

      <SprintUpdateModal open={updateOpen} onClose={() => setUpdateOpen(false)} />
    </div>
  );
}

function AckForm({ overrideId, onCancel, onConfirm }: { overrideId: string; onCancel: () => void; onConfirm: (comment: string) => void }) {
  const [comment, setComment] = useState("");
  return (
    <div data-testid={`override-ack-form-${overrideId}`} className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
      <input
        type="text"
        maxLength={200}
        autoFocus
        placeholder="Add a note (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="flex-1 min-w-[200px] rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        data-testid={`override-ack-confirm-${overrideId}`}
        onClick={() => onConfirm(comment)}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        Confirm acknowledge
      </button>
      <button onClick={onCancel} className="text-xs text-muted-foreground hover:underline">Cancel</button>
    </div>
  );
}

function Panel({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return <section className={cn("tfp-card p-5", className)}><h2 className="mb-4 font-display text-xl">{title}</h2>{children}</section>;
}

function AttentionRow({ title, meta, tone, children }: { title: string; meta: string; tone: "bad" | "warn"; children?: React.ReactNode }) {
  return <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm", tone === "bad" ? "border-destructive/30 bg-destructive/5" : "border-[var(--color-status-hold)]/30 bg-[var(--color-status-hold)]/5")}><div className="min-w-0"><p className="font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{meta}</p></div>{children}</div>;
}

function Count({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "good" | "bad" | "neutral" }) {
  return <div className="rounded-md border border-border bg-surface p-3"><p className={cn("font-display text-2xl", tone === "good" && "text-[var(--color-status-proceed)]", tone === "bad" && "text-destructive")}>{value}</p><p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p></div>;
}

function Badge({ tone, children }: { tone: "good" | "warn" | "bad" | "muted"; children: React.ReactNode }) {
  return <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", tone === "good" && "border-[var(--color-status-proceed)]/30 bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]", tone === "warn" && "border-[var(--color-status-hold)]/30 bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]", tone === "bad" && "border-destructive/30 bg-destructive/10 text-destructive", tone === "muted" && "border-border bg-muted text-muted-foreground")}>{children}</span>;
}

function OutcomeBadge({ rating }: { rating: OutcomeRating | null }) {
  if (rating === "Met") return <Badge tone="good">Met</Badge>;
  if (rating === "Partially Met") return <Badge tone="warn">Partially Met</Badge>;
  if (rating === "Missed") return <Badge tone="bad">Missed</Badge>;
  return <Badge tone="muted">Review pending</Badge>;
}

function isOpen(signal: Signal) {
  return signal.status === "New" || signal.status === "In Review";
}

function completedReview(reviews: Review[], shapingId: string) {
  return reviews.find((review) => review.shaping_id === shapingId && review.status === "Completed") ?? null;
}

function reviewLabel(review: Review | null) {
  return review?.outcome_rating ?? "Review pending";
}

function reviewSummary(review: Review | null) {
  if (!review) return "Outcome review has not been completed yet.";
  return review.notes || review.what_worked || review.what_didnt || "Review completed without detailed notes.";
}

function signalTitle(signals: Signal[], item: ShapingItem) {
  return signals.find((signal) => signal.id === item.signal_id)?.title ?? item.jira_key ?? item.id;
}

function userName(users: typeof USERS, id: string | null | undefined) {
  return users.find((user) => user.id === id)?.name ?? USERS.find((user) => user.id === id)?.name ?? "Unassigned";
}

function clinicNameFromSignal(signal: Signal) {
  const text = `${signal.title} ${signal.description}`.toLowerCase();
  const known = ["Generation Fertility", "Procrea QC", "Heartland", "RCC", "Olive"];
  return known.find((name) => text.includes(name.toLowerCase())) ?? "Clinic";
}

// Re-exports for type stability (unused-import safe)
export type _OverrideRef = Override;
