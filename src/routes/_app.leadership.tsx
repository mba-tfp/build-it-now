import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  USERS,
  daysSince,
  useTfpStore,
  usableCapacity,
} from "@/lib/tfp/store";
import type {
  IssueType,
  Product,
  ShapingItem,
  Signal,
  Source,
  Tier,
} from "@/lib/tfp/types";
import { fmtDate, fmtDateTime } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Gauge,
  Printer,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { TierBadge, StatusBadge } from "@/components/tfp/Badge";
import { SignalTimelineDrawer } from "@/components/tfp/SignalTimelineDrawer";
import { SprintUpdateModal } from "@/components/tfp/SprintUpdateModal";
import { downloadCsv, signalsToCsv } from "@/lib/tfp/exports";

export const Route = createFileRoute("/_app/leadership")({
  component: LeadershipPage,
});

const TIERS: Tier[] = ["T1", "T2", "T3", "T4"];

function LeadershipPage() {
  const signals = useTfpStore((s) => s.signals);
  const shaping = useTfpStore((s) => s.shaping);
  const reviews = useTfpStore((s) => s.reviews);
  const sprint = useTfpStore((s) => s.sprint);
  const overrides = useTfpStore((s) => s.overrides);
  const goLives = useTfpStore((s) => s.goLives);
  const ackOverride = useTfpStore((s) => s.ackOverride);
  const currentUserId = useTfpStore((s) => s.currentUserId);
  const users = useTfpStore((s) => s.users);
  const me = (users.find((u) => u.id === currentUserId) ?? USERS.find((u) => u.id === currentUserId))!;
  const [openSignalId, setOpenSignalId] = useState<string | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);

  // ---------- KPI computation ----------
  const now = useMemo(() => new Date("2026-04-15T09:00:00.000Z").getTime(), []);

  const open = signals.filter((s) => s.status === "New" || s.status === "In Review");
  const breached = signals.filter(
    (s) => (s.status === "New" || s.status === "In Review") && new Date(s.sla_due_at).getTime() < now,
  );
  const slaOnTime = open.length === 0 ? 100 : Math.round(((open.length - breached.length) / open.length) * 100);

  const delivered = shaping.filter((s) => s.delivery_status === "Done");
  const deliveredPts = delivered.reduce((acc, s) => acc + (s.tech_estimate_pts ?? 0), 0);
  const inFlight = shaping.filter(
    (s) => s.delivery_status && s.delivery_status !== "Done" && s.delivery_status !== "Blocked",
  );
  const blocked = shaping.filter((s) => s.delivery_status === "Blocked");

  const displaced = signals.filter((s) => s.displacement_flag).length;

  // Avg cycle time: signal created_at -> delivery Done (using updated_at as proxy)
  const cycleTimes = delivered
    .map((sh) => {
      const sig = signals.find((s) => s.id === sh.signal_id);
      if (!sig) return null;
      return (new Date(sh.updated_at).getTime() - new Date(sig.created_at).getTime()) / 86400000;
    })
    .filter((x): x is number => x !== null);
  const avgCycle = cycleTimes.length === 0 ? 0 : Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length);

  const completedReviews = reviews.filter((r) => r.status === "Completed");
  const outcomeMet = completedReviews.filter((r) => r.outcome_rating === "Met").length;
  const outcomePct = completedReviews.length === 0 ? 0 : Math.round((outcomeMet / completedReviews.length) * 100);

  const usable = usableCapacity(sprint);
  const allocated = sprint.allocated_pts;
  const capacityPct = Math.min(100, Math.round((allocated / Math.max(1, usable)) * 100));

  // ---------- Throughput by week (last 6 weeks) ----------
  const throughput = useMemo(() => {
    const weeks: { label: string; pts: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = now - (i + 1) * 7 * 86400000;
      const end = now - i * 7 * 86400000;
      const items = delivered.filter((s) => {
        const t = new Date(s.updated_at).getTime();
        return t >= start && t < end;
      });
      // also include in-flight created in week to give signal volume
      const sigs = signals.filter((s) => {
        const t = new Date(s.created_at).getTime();
        return t >= start && t < end;
      });
      weeks.push({
        label: `W-${i}`,
        pts: items.reduce((a, b) => a + (b.tech_estimate_pts ?? 0), 0),
        count: sigs.length,
      });
    }
    return weeks;
  }, [delivered, signals, now]);
  const maxPts = Math.max(8, ...throughput.map((w) => w.pts));
  const maxCount = Math.max(4, ...throughput.map((w) => w.count));

  // ---------- Tier mix ----------
  const tierMix = useMemo(() => {
    const m: Record<Tier, number> = { T1: 0, T2: 0, T3: 0, T4: 0 };
    signals.forEach((s) => m[s.tier]++);
    const total = signals.length || 1;
    return TIERS.map((t) => ({ tier: t, count: m[t], pct: Math.round((m[t] / total) * 100) }));
  }, [signals]);

  // ---------- Source / Product breakdown ----------
  const sourceMix = useMemo(() => {
    const m: Record<string, number> = {};
    signals.forEach((s) => (m[s.source] = (m[s.source] ?? 0) + 1));
    return Object.entries(m).map(([k, v]) => ({ name: k, count: v }));
  }, [signals]);

  const productMix = useMemo(() => {
    const m: Record<string, number> = {};
    signals.forEach((s) => (m[s.product] = (m[s.product] ?? 0) + 1));
    return Object.entries(m)
      .map(([k, v]) => ({ name: k, count: v }))
      .sort((a, b) => b.count - a.count);
  }, [signals]);

  const issueTypeMix = useMemo(() => {
    const m: Record<string, number> = {};
    signals.forEach((s) => (m[s.issue_type] = (m[s.issue_type] ?? 0) + 1));
    return Object.entries(m)
      .map(([k, v]) => ({ name: k, count: v }))
      .sort((a, b) => b.count - a.count);
  }, [signals]);

  // ---------- Sprint burndown ----------
  const sprintBurndown = useMemo(() => {
    const start = new Date(sprint.start_date).getTime();
    const end = new Date(sprint.end_date).getTime();
    const totalDays = Math.max(1, Math.round((end - start) / 86400000));
    const points: { x: number; ideal: number; actual: number; label: string }[] = [];
    for (let i = 0; i <= totalDays; i++) {
      const dayTs = start + i * 86400000;
      const ideal = allocated * (1 - i / totalDays);
      // actual: subtract done points up to this day
      const doneByDay = delivered
        .filter((s) => new Date(s.updated_at).getTime() <= dayTs)
        .reduce((a, b) => a + (b.tech_estimate_pts ?? 0), 0);
      const actual = Math.max(0, allocated - doneByDay);
      // Only show actual up to "today" (now)
      const showActual = dayTs <= now;
      points.push({
        x: i,
        ideal: Math.round(ideal * 10) / 10,
        actual: showActual ? actual : -1,
        label: `D${i}`,
      });
    }
    return { points, totalDays };
  }, [sprint, allocated, delivered, now]);

  // ---------- Signal table filters ----------
  const [statusFilter, setStatusFilter] = useState<"All" | "Open" | "Breached" | "Hold" | "Done">("All");
  const [sourceFilter, setSourceFilter] = useState<Source | "All">("All");
  const [productFilter, setProductFilter] = useState<Product | "All">("All");
  const [tierFilter, setTierFilter] = useState<Tier | "All">("All");

  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      if (sourceFilter !== "All" && s.source !== sourceFilter) return false;
      if (productFilter !== "All" && s.product !== productFilter) return false;
      if (tierFilter !== "All" && s.tier !== tierFilter) return false;
      if (statusFilter === "Open" && !(s.status === "New" || s.status === "In Review")) return false;
      if (statusFilter === "Hold" && s.status !== "Hold") return false;
      if (statusFilter === "Breached") {
        if (!(s.status === "New" || s.status === "In Review")) return false;
        if (new Date(s.sla_due_at).getTime() >= now) return false;
      }
      if (statusFilter === "Done") {
        const sh = shaping.find((x) => x.signal_id === s.id);
        if (sh?.delivery_status !== "Done") return false;
      }
      return true;
    });
  }, [signals, sourceFilter, productFilter, tierFilter, statusFilter, shaping, now]);

  function exportCsv() {
    const csv = signalsToCsv(filteredSignals, shaping, USERS);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`tfp-signals-${stamp}.csv`, csv);
    toast.success("CSV exported", {
      description: `${filteredSignals.length} signals downloaded.`,
    });
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">View 6 · Leadership</p>
          <h1 className="mt-1 font-display text-3xl">Portfolio Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live read-out of signals, throughput, capacity and outcomes across the TFP product surface.
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <button
            onClick={() => setUpdateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <FileText className="h-3.5 w-3.5" />
            Sprint update
          </button>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Printer className="h-3.5 w-3.5" />
            Print / PDF
          </button>
        </div>
      </header>

      {me.role !== "Leadership" && (
        <div className="no-print mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
          You are viewing the Leadership dashboard. Switch to Shahid in the user menu to see his perspective.
        </div>
      )}

      <SprintStatusStrip
        sprint={sprint}
        usable={usable}
        allocated={allocated}
        capacityPct={capacityPct}
        blockedCount={blocked.length}
        deliveredCount={delivered.length}
        committedCount={shaping.filter((s) => s.delivery_status).length}
        now={now}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr] print-page-break">
        <OverrideLogPanel
          overrides={overrides}
          sprintId={sprint.id}
          onAck={ackOverride}
          canAck={me.role === "Leadership"}
        />
        <GoLivePipelinePanel goLives={goLives} />
      </div>

      <div className="no-print mt-4 flex justify-end">
        <Link
          to="/roadmap"
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-1.5 text-xs hover:bg-muted"
        >
          Open full Roadmap →
        </Link>
      </div>

      {/* KPI tiles */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="SLA on-time"
          value={`${slaOnTime}%`}
          delta={breached.length === 0 ? "All open signals within SLA" : `${breached.length} breached`}
          tone={breached.length === 0 ? "good" : "warn"}
          icon={<Gauge className="h-4 w-4" />}
        />
        <Kpi
          label="Throughput (pts done)"
          value={`${deliveredPts}`}
          delta={`${delivered.length} items shipped`}
          tone="neutral"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <Kpi
          label="In flight / blocked"
          value={`${inFlight.length}`}
          delta={`${blocked.length} blocked`}
          tone={blocked.length > 0 ? "warn" : "neutral"}
          icon={<Activity className="h-4 w-4" />}
        />
        <Kpi
          label="Avg cycle time"
          value={`${avgCycle}d`}
          delta={`signal → done · n=${cycleTimes.length}`}
          tone="neutral"
          icon={<Clock className="h-4 w-4" />}
        />
        <Kpi
          label="Sprint allocation"
          value={`${allocated} / ${usable} pts`}
          delta={`${capacityPct}% of usable capacity`}
          tone={capacityPct > 100 ? "bad" : capacityPct > 90 ? "warn" : "good"}
          icon={<Gauge className="h-4 w-4" />}
        />
        <Kpi
          label="Outcomes met"
          value={`${outcomePct}%`}
          delta={`${outcomeMet}/${completedReviews.length} reviews`}
          tone={outcomePct >= 70 ? "good" : "warn"}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <Kpi
          label="Displacement"
          value={`${displaced}`}
          delta="signals flagged as trade-offs"
          tone={displaced > 5 ? "warn" : "neutral"}
          icon={<ArrowDownRight className="h-4 w-4" />}
        />
        <Kpi
          label="Open signals"
          value={`${open.length}`}
          delta={`${signals.length} total in system`}
          tone="neutral"
          icon={<ArrowUpRight className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Throughput */}
        <Panel title="Throughput · last 6 weeks" subtitle="Pts delivered (bars) vs. signals received (line)">
          <div className="flex h-48 items-end gap-3 px-2">
            {throughput.map((w) => (
              <div key={w.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="relative w-full flex-1">
                  <div
                    className="absolute inset-x-1 bottom-0 rounded-t bg-primary/80 transition-all"
                    style={{ height: `${(w.pts / maxPts) * 100}%` }}
                    title={`${w.pts} pts`}
                  />
                  <div
                    className="absolute inset-x-0 rounded-full bg-[var(--color-status-hold)]"
                    style={{
                      height: 6,
                      bottom: `${(w.count / maxCount) * 100}%`,
                      transform: "translateY(50%)",
                    }}
                    title={`${w.count} signals`}
                  />
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">{w.label}</div>
                <div className="text-[10px] text-muted-foreground">{w.pts}p · {w.count}s</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-primary/80" /> Pts delivered</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1 w-3 rounded-full bg-[var(--color-status-hold)]" /> Signals received</span>
          </div>
        </Panel>

        {/* Tier mix */}
        <Panel title="Tier mix" subtitle="All signals by SLA tier">
          <div className="flex items-center gap-6">
            <DonutChart segments={tierMix.map((t) => ({
              label: t.tier,
              value: t.count,
              color: `var(--color-tier-${t.tier.toLowerCase()})`,
            }))} />
            <div className="flex-1 space-y-2">
              {tierMix.map((t) => (
                <div key={t.tier} className="flex items-center gap-2 text-sm">
                  <TierBadge tier={t.tier} />
                  <div className="ml-auto font-mono text-xs text-muted-foreground">
                    {t.count} · {t.pct}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* Sprint burndown */}
        <Panel title={`Sprint burndown · ${sprint.name}`} subtitle={`${fmtDate(sprint.start_date)} → ${fmtDate(sprint.end_date)}`}>
          <Burndown points={sprintBurndown.points} allocated={allocated} />
        </Panel>

        {/* Source / product breakdown */}
        <Panel title="Source & product mix" subtitle="Where signals come from and where they land">
          <div className="grid gap-4 sm:grid-cols-2">
            <BarList title="By source" data={sourceMix} />
            <BarList title="By product" data={productMix} />
          </div>
          <div className="mt-4">
            <BarList title="By issue type" data={issueTypeMix} />
          </div>
        </Panel>
      </div>

      {/* Breached & Blocked drill-down */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel
          title={`SLA breaches (${breached.length})`}
          subtitle="Open signals past their tier-based due date"
          tone={breached.length > 0 ? "warn" : "ok"}
        >
          {breached.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">All open signals within SLA.</p>
          ) : (
            <ul className="space-y-2">
              {breached.map((s) => (
                <li key={s.id} className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {s.product} · due {fmtDateTime(s.sla_due_at)} · {Math.abs(daysSince(s.sla_due_at))}d overdue
                    </div>
                  </div>
                  <TierBadge tier={s.tier} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`Blocked work (${blocked.length})`} subtitle="Delivery items currently blocked" tone={blocked.length > 0 ? "warn" : "ok"}>
          {blocked.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing blocked. 🎉</p>
          ) : (
            <ul className="space-y-2">
              {blocked.map((sh) => {
                const sig = signals.find((s) => s.id === sh.signal_id);
                return (
                  <li key={sh.id} className="rounded-md border border-[var(--color-status-hold)]/30 bg-[var(--color-status-hold)]/5 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">{sh.jira_key}</span>
                      <span className="font-medium">{sig?.title}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{sig?.product} · {sh.tech_estimate_pts ?? "—"} pts</div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* Signal table */}
      <div className="mt-6 tfp-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h3 className="font-display text-lg">All signals</h3>
            <p className="text-xs text-muted-foreground">Filter and drill in to any signal across the system.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <SelectFilter value={statusFilter} onChange={(v) => setStatusFilter(v as typeof statusFilter)} options={["All", "Open", "Breached", "Hold", "Done"]} />
            <SelectFilter value={sourceFilter} onChange={(v) => setSourceFilter(v as Source | "All")} options={["All", "Leadership", "Clinic", "Internal", "Dev Team"]} />
            <SelectFilter value={productFilter} onChange={(v) => setProductFilter(v as Product | "All")} options={["All", "Otto-Onboard", "Otto Notes", "Otto Pulse", "FertiWise", "StimSmart", "Platform"]} />
            <SelectFilter value={tierFilter} onChange={(v) => setTierFilter(v as Tier | "All")} options={["All", "T1", "T2", "T3", "T4"]} />
          </div>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-border bg-surface text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Title</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-left font-medium">Product</th>
                <th className="px-3 py-2 text-left font-medium">Tier</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Owner</th>
                <th className="px-3 py-2 text-left font-medium">Created</th>
                <th className="px-3 py-2 text-left font-medium">SLA due</th>
              </tr>
            </thead>
            <tbody>
              {filteredSignals.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">No signals match these filters.</td></tr>
              ) : (
                filteredSignals.map((s) => {
                  const owner = USERS.find((u) => u.id === s.owner_id);
                  const breach = (s.status === "New" || s.status === "In Review") && new Date(s.sla_due_at).getTime() < now;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setOpenSignalId(s.id)}
                      className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/30"
                      title="View timeline"
                    >
                      <td className="px-3 py-2"><div className="font-medium leading-tight">{s.title}</div><div className="text-[10px] text-muted-foreground">{s.id}</div></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{s.source}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{s.product}</td>
                      <td className="px-3 py-2"><TierBadge tier={s.tier} /></td>
                      <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{owner?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(s.created_at)}</td>
                      <td className={cn("px-3 py-2 text-xs", breach ? "text-destructive" : "text-muted-foreground")}>
                        {fmtDateTime(s.sla_due_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SignalTimelineDrawer signalId={openSignalId} onClose={() => setOpenSignalId(null)} />
      <SprintUpdateModal open={updateOpen} onClose={() => setUpdateOpen(false)} />
    </div>
  );
}

function Kpi({
  label, value, delta, tone, icon,
}: { label: string; value: string; delta: string; tone: "good" | "warn" | "bad" | "neutral"; icon?: React.ReactNode }) {
  const toneCls = {
    good: "text-[var(--color-status-proceed)]",
    warn: "text-[var(--color-status-hold)]",
    bad: "text-destructive",
    neutral: "text-muted-foreground",
  }[tone];
  return (
    <div className="tfp-card p-4">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="font-display text-2xl">{value}</div>
      <div className={cn("mt-1 text-[11px]", toneCls)}>{delta}</div>
    </div>
  );
}

function Panel({
  title, subtitle, tone, children,
}: { title: string; subtitle?: string; tone?: "ok" | "warn"; children: React.ReactNode }) {
  return (
    <section className={cn("tfp-card p-5", tone === "warn" && "border-[var(--color-status-hold)]/40")}>
      <header className="mb-3">
        <h3 className="font-display text-lg leading-tight">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function BarList({ title, data }: { title: string; data: { name: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="space-y-1.5">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2 text-xs">
            <span className="w-28 truncate text-foreground">{d.name}</span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="absolute inset-y-0 left-0 bg-primary/70" style={{ width: `${(d.count / max) * 100}%` }} />
            </div>
            <span className="w-6 text-right font-mono text-muted-foreground">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((a, b) => a + b.value, 0) || 1;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
      <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--color-muted)" strokeWidth="14" />
      {segments.map((s) => {
        const len = (s.value / total) * circumference;
        const dasharray = `${len} ${circumference - len}`;
        const dashoffset = -offset;
        offset += len;
        return (
          <circle
            key={s.label}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth="14"
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
          />
        );
      })}
      <text x="50" y="52" textAnchor="middle" className="rotate-90 fill-foreground font-mono text-[10px]" transform="rotate(90 50 50)">
        {total}
      </text>
    </svg>
  );
}

function Burndown({ points, allocated }: { points: { x: number; ideal: number; actual: number; label: string }[]; allocated: number }) {
  if (points.length === 0) return <p className="text-sm text-muted-foreground">No sprint data.</p>;
  const w = 360;
  const h = 160;
  const padX = 28;
  const padY = 16;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const maxX = points.length - 1;
  const maxY = Math.max(allocated, 1);

  const fx = (x: number) => padX + (x / maxX) * innerW;
  const fy = (y: number) => padY + (1 - y / maxY) * innerH;

  const idealPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${fx(p.x)} ${fy(p.ideal)}`).join(" ");
  const actualPoints = points.filter((p) => p.actual >= 0);
  const actualPath = actualPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${fx(p.x)} ${fy(p.actual)}`).join(" ");

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full min-w-[320px]">
        {/* gridlines */}
        {[0, 0.5, 1].map((g) => (
          <line key={g} x1={padX} x2={w - padX} y1={padY + g * innerH} y2={padY + g * innerH} stroke="var(--color-border)" strokeDasharray="2 3" />
        ))}
        <path d={idealPath} fill="none" stroke="var(--color-muted-foreground)" strokeWidth="1" strokeDasharray="3 3" />
        <path d={actualPath} fill="none" stroke="var(--color-primary)" strokeWidth="2" />
        {actualPoints.map((p) => (
          <circle key={p.x} cx={fx(p.x)} cy={fy(p.actual)} r="2.5" fill="var(--color-primary)" />
        ))}
        {/* axis labels */}
        <text x={padX} y={h - 2} className="fill-muted-foreground font-mono text-[8px]">{points[0].label}</text>
        <text x={w - padX} y={h - 2} textAnchor="end" className="fill-muted-foreground font-mono text-[8px]">{points[points.length - 1].label}</text>
        <text x={padX - 4} y={padY + 4} textAnchor="end" className="fill-muted-foreground font-mono text-[8px]">{maxY}</text>
        <text x={padX - 4} y={h - padY} textAnchor="end" className="fill-muted-foreground font-mono text-[8px]">0</text>
      </svg>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-muted-foreground" /> Ideal</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-primary" /> Actual</span>
        <span className="ml-auto inline-flex items-center gap-1 text-foreground"><ChevronRight className="h-3 w-3" /> {allocated} pts allocated</span>
      </div>
    </div>
  );
}

function SelectFilter({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-input bg-surface px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

// Suppress unused-type warnings — these are imported for documentation.
const _types: { sh?: ShapingItem; sig?: Signal; it?: IssueType } = {};
void _types;

// ============== Wave 4 panels ==============

function SprintStatusStrip({
  sprint,
  usable,
  allocated,
  capacityPct,
  blockedCount,
  deliveredCount,
  committedCount,
  now,
}: {
  sprint: { name: string; start_date: string; end_date: string };
  usable: number;
  allocated: number;
  capacityPct: number;
  blockedCount: number;
  deliveredCount: number;
  committedCount: number;
  now: number;
}) {
  const daysLeft = Math.max(0, Math.ceil((new Date(sprint.end_date).getTime() - now) / 86400000));
  const tone = capacityPct > 100 ? "bg-destructive" : capacityPct > 90 ? "bg-amber-500" : "bg-primary";
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Active sprint</p>
          <p className="font-display text-lg leading-tight">{sprint.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {fmtDate(sprint.start_date)} → {fmtDate(sprint.end_date)} · {daysLeft}d remaining
          </p>
        </div>
        <div className="min-w-[200px] flex-1">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Capacity</span>
            <span className="font-mono">
              {allocated} / {usable} pts · {capacityPct}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full transition-all", tone)} style={{ width: `${Math.min(100, capacityPct)}%` }} />
          </div>
        </div>
        <div className="text-center">
          <p className="font-mono text-2xl">{deliveredCount}<span className="text-muted-foreground">/{committedCount}</span></p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Done / committed</p>
        </div>
        <div className="text-center">
          <p
            className={cn(
              "font-mono text-2xl",
              blockedCount > 0 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {blockedCount}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Blocked</p>
        </div>
      </div>
    </section>
  );
}

function OverrideLogPanel({
  overrides,
  sprintId,
  onAck,
  canAck,
}: {
  overrides: import("@/lib/tfp/types").Override[];
  sprintId: string;
  onAck: (id: string) => void;
  canAck: boolean;
}) {
  const sprintOverrides = overrides.filter((o) => o.sprint_id === sprintId || o.sprint_id === null);
  const pending = sprintOverrides.filter((o) => o.ack_status === "Pending").length;
  return (
    <div className="tfp-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-display text-base">Override log · this sprint</h3>
          <p className="text-[11px] text-muted-foreground">
            {sprintOverrides.length} total
            {pending > 0 && (
              <span className="ml-2 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-amber-700">
                {pending} pending
              </span>
            )}
          </p>
        </div>
      </div>
      {sprintOverrides.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No overrides this sprint.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Kind</th>
                <th className="px-2 py-1.5 text-left font-medium">Reason</th>
                <th className="px-2 py-1.5 text-left font-medium">Displaced</th>
                <th className="px-2 py-1.5 text-left font-medium">Status</th>
                <th className="px-2 py-1.5 text-right font-medium no-print"></th>
              </tr>
            </thead>
            <tbody>
              {sprintOverrides.map((o) => (
                <tr key={o.id} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-2 font-medium">{o.kind}</td>
                  <td className="px-2 py-2 text-muted-foreground">{o.reason}</td>
                  <td className="px-2 py-2 text-muted-foreground">{o.displaced_pts}p</td>
                  <td className="px-2 py-2">
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px]",
                        o.ack_status === "Acknowledged"
                          ? "bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]"
                          : "bg-amber-500/15 text-amber-700",
                      )}
                    >
                      {o.ack_status}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right no-print">
                    {o.ack_status === "Pending" && canAck && (
                      <button
                        onClick={() => onAck(o.id)}
                        className="rounded-md bg-primary px-2 py-1 text-[10px] text-primary-foreground hover:bg-primary/90"
                      >
                        Acknowledge
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GoLivePipelinePanel({ goLives }: { goLives: import("@/lib/tfp/types").GoLiveChecklist[] }) {
  const sorted = [...goLives].sort(
    (a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime(),
  );
  return (
    <div className="tfp-card p-4">
      <h3 className="mb-3 font-display text-base">Go-live pipeline</h3>
      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No go-lives scheduled.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((g) => {
            const total = Object.values(g.criteria).length;
            const done = Object.values(g.criteria).filter((c) => c.done).length;
            const pct = total === 0 ? 0 : Math.round((done / total) * 100);
            return (
              <li key={g.id} className="rounded-md border border-border bg-muted/20 p-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{g.release_name}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px]",
                      g.go_no_go_decision === "Go"
                        ? "bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]"
                        : g.go_no_go_decision === "No-Go"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {g.go_no_go_decision ?? "Pending"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {g.product} · {fmtDate(g.scheduled_for)}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {done}/{total}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

