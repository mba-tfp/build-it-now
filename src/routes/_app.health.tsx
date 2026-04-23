import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { USERS, daysSince, useTfpStore, usableCapacity } from "@/lib/tfp/store";
import { fmtDate, fmtDateTime, slaState } from "@/lib/tfp/format";
import { downloadCsv, signalsToCsv } from "@/lib/tfp/exports";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  AlertTriangle,
  Download,
  FileText,
  Info,
  Plus,
  Send,
  Wrench,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { SprintUpdateModal } from "@/components/tfp/SprintUpdateModal";
import { QuarterlySummaryModal } from "@/components/tfp/QuarterlySummaryModal";
import { SortMenu, useSortMenu } from "@/components/tfp/SortMenu";
import { sortRows } from "@/components/tfp/SortableHeader";
import type { MonitoringSeverity, MonitoringSystem } from "@/lib/tfp/types";

export const Route = createFileRoute("/_app/health")({
  component: () => <Navigate to="/governance" search={{ tab: "health" }} />,
});

const BANDWIDTH: Array<{ id: string; weeklyHours: number }> = [
  { id: "u-bazil", weeklyHours: 32 },
  { id: "u-alizar", weeklyHours: 24 },
  { id: "u-sami", weeklyHours: 32 },
  { id: "u-karim", weeklyHours: 36 },
  { id: "u-waseem", weeklyHours: 30 },
  { id: "u-ahmed", weeklyHours: 30 },
  { id: "u-farooq", weeklyHours: 36 },
  { id: "u-zeeshan", weeklyHours: 36 },
];

const TABS = ["Overview", "Monthly", "Clinics", "Sprints", "Tech debt", "Integrations"] as const;
type Tab = (typeof TABS)[number];

const MONITORING_SYSTEMS: MonitoringSystem[] = ["Accuro", "Phelix AI", "Olive EngagedMD", "Tia Health", "EngagedMD"];

export function QueueHealthPage() {
  const sprint = useTfpStore((s) => s.sprint);
  const signals = useTfpStore((s) => s.signals);
  const shaping = useTfpStore((s) => s.shaping);
  const currentUserId = useTfpStore((s) => s.currentUserId);
  const me = USERS.find((u) => u.id === currentUserId)!;
  const isPM = me.role === "PM" || me.role === "Senior PM";
  const isTechLead = me.role === "Tech Lead";

  const [tab, setTab] = useState<Tab>("Overview");
  const [sprintModal, setSprintModal] = useState(false);
  const [quarterlyModal, setQuarterlyModal] = useState(false);

  const usable = usableCapacity(sprint);
  const usedPct = Math.round((sprint.allocated_pts / Math.max(1, usable)) * 100);

  const slaBreaches = signals.filter(
    (s) => (s.status === "New" || s.status === "In Review") && slaState(s.sla_due_at) === "breach",
  );

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">View 6</p>
          <h1 className="mt-1 font-display text-3xl">Queue Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sprint metrics, per-person bandwidth, prioritised alerts, and operational levers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => downloadCsv("signals.csv", signalsToCsv(signals, shaping, USERS))}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-1.5 text-xs hover:bg-accent"
          >
            <Download className="h-3.5 w-3.5" /> Export signals CSV
          </button>
          <button
            onClick={() => setSprintModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-1.5 text-xs hover:bg-accent"
          >
            <FileText className="h-3.5 w-3.5" /> Sprint update
          </button>
          <button
            onClick={() => setQuarterlyModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <FileText className="h-3.5 w-3.5" /> Generate quarterly summary
          </button>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Open signals" value={signals.filter((s) => s.status === "New" || s.status === "In Review").length} />
        <Tile label="In shaping" value={shaping.filter((s) => s.shaping_status !== "Approved" && s.shaping_status !== "In Delivery").length} />
        <Tile label="SLA breaches" value={slaBreaches.length} tone={slaBreaches.length > 0 ? "danger" : "ok"} />
        <Tile label="Sprint utilisation" value={`${usedPct}%`} tone={usedPct > 85 ? "warn" : "ok"} />
      </section>

      <nav className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const hide = (t === "Clinics" || t === "Sprints") && !isPM;
          const hideTd = t === "Tech debt" && !isPM && !isTechLead;
          if (hide || hideTd) return null;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "border-b-2 px-3 py-2 text-sm transition",
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          );
        })}
      </nav>

      {tab === "Overview" && <OverviewTab />}
      {tab === "Monthly" && <MonthlyTab />}
      {tab === "Clinics" && isPM && <ClinicsTab />}
      {tab === "Sprints" && isPM && <SprintsTab />}
      {tab === "Tech debt" && (isPM || isTechLead) && <TechDebtTab />}
      {tab === "Integrations" && <IntegrationsTab />}

      <SprintUpdateModal open={sprintModal} onClose={() => setSprintModal(false)} />
      <QuarterlySummaryModal open={quarterlyModal} onClose={() => setQuarterlyModal(false)} />
    </div>
  );
}

// ============= Overview =============

function OverviewTab() {
  const sprint = useTfpStore((s) => s.sprint);
  const signals = useTfpStore((s) => s.signals);
  const shaping = useTfpStore((s) => s.shaping);
  const reviews = useTfpStore((s) => s.reviews);
  const overrides = useTfpStore((s) => s.overrides);
  const comms = useTfpStore((s) => s.comms);

  const usable = usableCapacity(sprint);
  const usedPct = Math.round((sprint.allocated_pts / Math.max(1, usable)) * 100);

  const slaBreaches = signals.filter(
    (s) => (s.status === "New" || s.status === "In Review") && slaState(s.sla_due_at) === "breach",
  );
  const blocked = shaping.filter((s) => s.delivery_status === "Blocked");
  const stuck = shaping.filter((s) => s.shaping_status !== "Approved" && s.shaping_status !== "In Delivery" && daysSince(s.created_at) > 12);
  const stale = shaping.filter((s) => s.shaping_status !== "Approved" && s.shaping_status !== "In Delivery" && daysSince(s.created_at) > 6 && daysSince(s.created_at) <= 12);
  const pendingOverrides = overrides.filter((o) => o.ack_status === "Pending");
  const pendingComms = comms.filter((c) => c.status === "Pending Approval");
  const overdueReviews = reviews.filter((r) => r.status !== "Completed");

  const personLoad = useMemo(() => {
    return BANDWIDTH.map(({ id, weeklyHours }) => {
      const u = USERS.find((x) => x.id === id)!;
      let load = 0;
      if (u.role === "PM" || u.role === "Senior PM" || u.role === "Associate PM") {
        const owned = signals.filter((s) => s.owner_id === id && s.status !== "Rejected" && s.status !== "Hold").length;
        const shapingOwned = shaping.filter((s) => s.pm_owner_id === id && s.shaping_status !== "Approved" && s.shaping_status !== "In Delivery").length;
        load = owned * 4 + shapingOwned * 6;
      } else if (u.role === "Tech Lead") {
        const r = shaping.filter((s) => s.tech_reviewer_id === id && s.shaping_status === "In Tech Review").length;
        load = r * 8;
      } else if (u.role === "QA Scrum Master") {
        const inQA = shaping.filter((s) => s.delivery_status === "In QA").length;
        load = inQA * 6 + 8;
      } else if (u.role === "Developer") {
        const inProgress = shaping.filter((s) => s.delivery_status === "In Progress").length;
        load = (inProgress * 12) / 2;
      }
      const pct = Math.round((load / weeklyHours) * 100);
      return { user: u, load, bandwidth: weeklyHours, pct };
    });
  }, [shaping, signals]);

  type AlertRow = {
    priority: "P1" | "P2" | "P3" | "P4";
    title: string;
    body: string;
    triggered_at: string;
    system: string;
  };
  const alerts: AlertRow[] = [];
  slaBreaches.forEach((s) => alerts.push({ priority: "P1", title: `SLA breach: ${s.title}`, body: `${s.tier} signal · ${s.product}`, triggered_at: s.sla_due_at, system: s.product }));
  blocked.forEach((s) => alerts.push({ priority: "P2", title: `${s.jira_key} blocked`, body: `Blocked since ${s.blocked_since ? fmtDateTime(s.blocked_since) : "—"}`, triggered_at: s.blocked_since ?? s.updated_at, system: "Delivery" }));
  pendingOverrides.forEach((o) => alerts.push({ priority: "P2", title: `${o.id} pending acknowledgement`, body: o.kind, triggered_at: o.raised_at, system: "Overrides" }));
  if (usedPct > 85) alerts.push({ priority: "P2", title: `Sprint at ${usedPct}% capacity`, body: "New scope must declare displacement.", triggered_at: sprint.start_date, system: "Sprint" });
  stuck.forEach((s) => alerts.push({ priority: "P3", title: `Shaping stuck >12d`, body: s.problem_what.slice(0, 80) || s.id, triggered_at: s.created_at, system: "Shaping" }));
  pendingComms.forEach((c) => alerts.push({ priority: "P3", title: `Comms awaiting approval: ${c.subject}`, body: c.audience, triggered_at: c.drafted_at, system: "Comms" }));
  overdueReviews.forEach((r) => alerts.push({ priority: "P3", title: "Review pending", body: r.size + " review for " + r.shaping_id, triggered_at: r.created_at, system: "Reviews" }));
  stale.forEach((s) => alerts.push({ priority: "P4", title: "Shaping stale (>6d)", body: s.problem_what.slice(0, 80) || s.id, triggered_at: s.created_at, system: "Shaping" }));
  // Dependency Change deadline alerts
  const nowMs = Date.now();
  shaping.forEach((sh) => {
    if (!sh.dependency_deadline) return;
    if (sh.shaping_status === "Approved" || sh.shaping_status === "In Delivery") return;
    const days = Math.ceil((new Date(sh.dependency_deadline).getTime() - nowMs) / 86400000);
    if (days < 0 || days > 14) return;
    const sys = sh.dependency_system ?? "External system";
    if (days <= 7) {
      alerts.push({ priority: "P1", title: `${sys} API change due in ${days}d — shaping not approved`, body: sh.dependency_what_changed.slice(0, 100) || "Dependency change requires shaping approval.", triggered_at: sh.dependency_deadline, system: sys });
    } else {
      alerts.push({ priority: "P2", title: `${sys} API change due in ${days}d — shaping not yet approved`, body: sh.dependency_what_changed.slice(0, 100) || "Dependency change requires shaping approval.", triggered_at: sh.dependency_deadline, system: sys });
    }
  });

  type AlertSortKey = "severity" | "triggered_at" | "system";
  const { sort: alertSort, setSort: setAlertSort } = useSortMenu<AlertSortKey>("health-alerts", { key: "severity", dir: "desc" });

  const sortedAlerts = useMemo(() => {
    if (alertSort.key && alertSort.dir) {
      return sortRows(alerts, alertSort, (a, k) => {
        if (k === "severity") return ({ P1: 4, P2: 3, P3: 2, P4: 1 } as const)[a.priority];
        if (k === "triggered_at") return new Date(a.triggered_at).getTime();
        if (k === "system") return a.system;
        return null;
      });
    }
    // Default: P1 → P4 (priority lex sort)
    return [...alerts].sort((a, b) => a.priority.localeCompare(b.priority));
  }, [alerts, alertSort]);

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="tfp-card p-5">
        <h3 className="font-display text-lg">Per-person bandwidth</h3>
        <p className="text-xs text-muted-foreground">
          Load estimate vs weekly hours. Green &lt; 70% · amber 70–90% · orange 90–110% · red &gt; 110%.
        </p>
        <div className="mt-4 space-y-3">
          {personLoad.map(({ user, load, bandwidth, pct }) => {
            const tone =
              pct > 110 ? "bg-destructive" : pct > 90 ? "bg-orange-500" : pct > 70 ? "bg-[var(--color-status-hold)]" : "bg-[var(--color-status-proceed)]";
            return (
              <div key={user.id}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span>
                    <span className="font-medium">{user.name}</span>{" "}
                    <span className="text-muted-foreground">· {user.role}</span>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {load}h / {bandwidth}h ({pct}%)
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full transition-all", tone)} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="tfp-card flex max-h-[80vh] flex-col">
        <div className="flex items-start justify-between gap-2 border-b border-border p-4">
          <div>
            <h3 className="font-display text-lg">Alerts ({sortedAlerts.length})</h3>
            <p className="text-xs text-muted-foreground">
              {alertSort.key ? `Sorted by ${alertSort.key} ${alertSort.dir}.` : "Sorted P1 → P4."}
            </p>
          </div>
          <SortMenu
            tableId="health-alerts"
            sort={alertSort}
            onChange={setAlertSort}
            options={[
              { key: "severity", label: "Severity" },
              { key: "triggered_at", label: "Triggered at" },
              { key: "system", label: "System" },
            ]}
          />
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {sortedAlerts.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">All clear.</p>}
          {sortedAlerts.map((a, i) => {
            const Icon = a.priority === "P1" ? AlertCircle : a.priority === "P2" ? AlertTriangle : Info;
            const tone =
              a.priority === "P1"
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : a.priority === "P2"
                ? "border-[var(--color-status-hold)]/30 bg-[var(--color-status-hold)]/5 text-[var(--color-status-hold)]"
                : a.priority === "P3"
                ? "border-[var(--color-status-new)]/30 bg-[var(--color-status-new)]/5 text-[var(--color-status-new)]"
                : "border-border bg-surface-2 text-muted-foreground";
            return (
              <div key={i} className={cn("rounded-md border p-2.5", tone)}>
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-sm bg-background/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold">{a.priority}</span>
                      <p className="text-sm font-medium">{a.title}</p>
                    </div>
                    <p className="mt-0.5 text-xs opacity-80">{a.body}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ============= Monthly =============

function MonthlyTab() {
  const sprints = useTfpStore((s) => s.sprints);
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const overrides = useTfpStore((s) => s.overrides);
  const reviews = useTfpStore((s) => s.reviews);

  // Pull last 3 sprints by end_date desc
  const last3 = [...sprints]
    .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime())
    .slice(0, 3);

  // For each sprint, derive metrics. With limited per-sprint linkage in seed data,
  // approximate using overall shaping/signals + sprint-window filters.
  const metrics = last3.map((sp) => {
    const start = new Date(sp.start_date).getTime();
    const end = new Date(sp.end_date).getTime();
    const inWindow = (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= start && t <= end;
    };
    const inSprint = shaping.filter((s) => s.delivery_status); // anything that hit delivery
    const done = inSprint.filter((s) => s.delivery_status === "Done");
    const committed = Math.max(1, inSprint.length);
    const successRate = Math.round((done.length / committed) * 100);
    const carryFwd = Math.round((sp.carryforward_estimate_pts / Math.max(1, sp.gross_capacity_pts)) * 100);
    const ovrCount = overrides.filter((o) => inWindow(o.raised_at)).length;
    const periodSignals = signals.filter((s) => inWindow(s.created_at));
    const triagedInSla = periodSignals.filter((s) => s.status !== "New" && s.status !== "In Review");
    const slaPct = periodSignals.length === 0 ? 100 : Math.round((triagedInSla.length / periodSignals.length) * 100);
    const periodReviews = reviews.filter((r) => inWindow(r.created_at));
    const reviewedPct =
      periodReviews.length === 0 ? 0 : Math.round((periodReviews.filter((r) => r.status === "Completed").length / periodReviews.length) * 100);
    return { sprint: sp, successRate, carryFwd, ovrCount, slaPct, reviewedPct };
  });

  const trend = (current: number, prev: number | undefined) => {
    if (prev === undefined) return "→";
    if (current > prev) return "↑";
    if (current < prev) return "↓";
    return "→";
  };

  const carryTone = (pct: number) =>
    pct < 20 ? "text-[var(--color-status-proceed)]" : pct <= 35 ? "text-[var(--color-status-hold)]" : "text-destructive";

  return (
    <section className="tfp-card p-5">
      <h3 className="font-display text-lg">Monthly system health</h3>
      <p className="text-xs text-muted-foreground">Last 3 sprints — used by Shahid in the System Health Review.</p>
      {metrics.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No sprints recorded yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2">Metric</th>
                {metrics.map((m) => (
                  <th key={m.sprint.id} className="py-2 text-right">
                    {m.sprint.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="Sprint success rate" values={metrics.map((m) => `${m.successRate}%`)} trends={metrics.map((m, i) => trend(m.successRate, metrics[i + 1]?.successRate))} />
              <Row
                label="Carry-forward rate"
                values={metrics.map((m) => `${m.carryFwd}%`)}
                trends={metrics.map((m, i) => trend(m.carryFwd, metrics[i + 1]?.carryFwd))}
                tones={metrics.map((m) => carryTone(m.carryFwd))}
              />
              <Row label="Override count" values={metrics.map((m) => String(m.ovrCount))} trends={metrics.map((m, i) => trend(m.ovrCount, metrics[i + 1]?.ovrCount))} />
              <Row label="SLA adherence" values={metrics.map((m) => `${m.slaPct}%`)} trends={metrics.map((m, i) => trend(m.slaPct, metrics[i + 1]?.slaPct))} />
              <Row label="Reviews completed" values={metrics.map((m) => `${m.reviewedPct}%`)} trends={metrics.map((m, i) => trend(m.reviewedPct, metrics[i + 1]?.reviewedPct))} />
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Row({
  label,
  values,
  trends,
  tones,
}: {
  label: string;
  values: string[];
  trends: string[];
  tones?: string[];
}) {
  return (
    <tr className="border-b border-border/40">
      <td className="py-2 text-sm">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="py-2 text-right font-mono text-sm">
          <span className={cn(tones?.[i])}>{v}</span>
          <span className="ml-2 text-xs text-muted-foreground">{trends[i]}</span>
        </td>
      ))}
    </tr>
  );
}

// ============= Clinics =============

function ClinicsTab() {
  const clinics = useTfpStore((s) => s.clinics);
  const signals = useTfpStore((s) => s.signals);
  const shaping = useTfpStore((s) => s.shaping);
  const offboard = useTfpStore((s) => s.offboardClinic);

  const [confirm, setConfirm] = useState<null | { id: string; name: string }>(null);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");

  function impactCount(name: string) {
    const sigs = signals.filter((s) => s.description.toLowerCase().includes(name.toLowerCase()) || s.title.toLowerCase().includes(name.toLowerCase()));
    const shapingIds = new Set(sigs.map((s) => s.id));
    const sh = shaping.filter((x) => shapingIds.has(x.signal_id));
    return { signals: sigs.length, shaping: sh.length };
  }

  return (
    <section className="tfp-card p-5">
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <h3 className="font-display text-lg">Clinics</h3>
          <p className="text-xs text-muted-foreground">{clinics.filter((c) => c.status === "Active").length} active · PM-only view.</p>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2">Clinic</th>
              <th className="py-2">Status</th>
              <th className="py-2">Product</th>
              <th className="py-2">Go-live</th>
              <th className="py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {clinics.map((c) => {
              const tone =
                c.status === "Active"
                  ? "bg-[var(--color-status-proceed)]/15 text-[var(--color-status-proceed)]"
                  : c.status === "Dormant"
                  ? "bg-muted text-muted-foreground"
                  : "bg-destructive/15 text-destructive";
              return (
                <tr key={c.id} className="border-b border-border/40">
                  <td className="py-2 font-medium">{c.name}</td>
                  <td className="py-2">
                    <span className={cn("rounded-sm px-1.5 py-0.5 text-[11px] font-medium", tone)}>{c.status}</span>
                  </td>
                  <td className="py-2 text-muted-foreground">{c.product}</td>
                  <td className="py-2 font-mono text-xs text-muted-foreground">{c.go_live_date ? fmtDate(c.go_live_date) : "—"}</td>
                  <td className="py-2 text-right">
                    {c.status === "Active" && (
                      <button
                        onClick={() => {
                          setConfirm({ id: c.id, name: c.name });
                          setConfirmText("");
                          setReason("");
                        }}
                        className="text-xs text-destructive hover:underline"
                      >
                        Offboard…
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setConfirm(null)} />
          <div className="relative w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl">
            <h4 className="font-display text-lg">Offboard {confirm.name}?</h4>
            {(() => {
              const c = impactCount(confirm.name);
              return (
                <p className="mt-2 text-sm text-muted-foreground">
                  This will move {c.signals} signal{c.signals === 1 ? "" : "s"} to <strong>Hold</strong> and {c.shaping} shaping item{c.shaping === 1 ? "" : "s"} to <strong>Not Now</strong>.
                </p>
              );
            })()}
            <label className="mt-4 block text-xs uppercase tracking-wider text-muted-foreground">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              placeholder="Contract ended / migrated to another platform / …"
            />
            <label className="mt-3 block text-xs uppercase tracking-wider text-muted-foreground">
              Type <strong>{confirm.name}</strong> to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent">
                Cancel
              </button>
              <button
                disabled={confirmText !== confirm.name || reason.trim().length === 0}
                onClick={() => {
                  offboard(confirm.id, reason);
                  toast.success(`${confirm.name} offboarded`);
                  setConfirm(null);
                }}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-50"
              >
                Offboard clinic
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ============= Sprints =============

function SprintsTab() {
  const sprints = useTfpStore((s) => s.sprints);
  const createSprint = useTfpStore((s) => s.createSprint);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [cap, setCap] = useState("40");
  const [notes, setNotes] = useState("");

  function submit() {
    if (!name || !start || !end || !cap) return;
    createSprint({
      name,
      start_date: new Date(start).toISOString(),
      end_date: new Date(end).toISOString(),
      gross_capacity_pts: Number(cap),
      notes,
    });
    toast.success(`Sprint ${name} created`);
    setOpen(false);
    setName("");
    setStart("");
    setEnd("");
    setCap("40");
    setNotes("");
  }

  return (
    <section className="tfp-card p-5">
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <h3 className="font-display text-lg">Sprint management</h3>
          <p className="text-xs text-muted-foreground">Forward capacity planning.</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" /> Add future sprint
        </button>
      </header>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2">Name</th>
            <th className="py-2">Window</th>
            <th className="py-2">Status</th>
            <th className="py-2 text-right">Usable capacity</th>
          </tr>
        </thead>
        <tbody>
          {sprints.map((sp) => {
            const usable = usableCapacity(sp);
            const isPlanning = sp.status === "Planning";
            return (
              <tr key={sp.id} className="border-b border-border/40">
                <td className="py-2 font-medium">{sp.name}</td>
                <td className="py-2 font-mono text-xs text-muted-foreground">
                  {fmtDate(sp.start_date)} → {fmtDate(sp.end_date)}
                </td>
                <td className="py-2">
                  <span
                    className={cn(
                      "rounded-sm px-1.5 py-0.5 text-[11px] font-medium",
                      sp.status === "Active"
                        ? "bg-primary/15 text-primary"
                        : sp.status === "Planning"
                        ? "bg-[var(--color-status-new)]/15 text-[var(--color-status-new)]"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {sp.status}
                  </span>
                </td>
                <td className="py-2 text-right font-mono text-sm">
                  {isPlanning ? "~" : ""}
                  {usable} pts
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl">
            <h4 className="font-display text-lg">Add future sprint</h4>
            <div className="mt-4 space-y-3">
              <Field label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint 7" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start date">
                  <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                </Field>
                <Field label="End date">
                  <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                </Field>
              </div>
              <Field label="Estimated capacity (points)">
                <input type="number" value={cap} onChange={(e) => setCap(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
              </Field>
              <Field label="Notes (optional)">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent">
                Cancel
              </button>
              <button
                disabled={!name || !start || !end || !cap}
                onClick={submit}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                Create sprint
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

// ============= Tech Debt =============

function TechDebtTab() {
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const markReviewed = useTfpStore((s) => s.markTechDebtReviewed);
  const recordReview = useTfpStore((s) => s.recordTechDebtReview);
  const setBucket = useTfpStore((s) => s.setRoadmapBucket);

  const techDebt = useMemo(() => {
    return shaping.filter((s) => {
      const sig = signals.find((x) => x.id === s.signal_id);
      const inLabels = sig?.labels.some((l) => l.toLowerCase().includes("tech-debt"));
      const inRisks = (s.solution_risks ?? "").toLowerCase().includes("tech debt");
      return inLabels || inRisks;
    });
  }, [shaping, signals]);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof techDebt>();
    techDebt.forEach((s) => {
      const sig = signals.find((x) => x.id === s.signal_id);
      const p = sig?.product ?? "Unknown";
      if (!m.has(p)) m.set(p, []);
      m.get(p)!.push(s);
    });
    return m;
  }, [techDebt, signals]);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [stagedNotes, setStagedNotes] = useState("");

  const dueForReview = techDebt.filter(
    (s) => !s.tech_debt_reviewed_at || daysSince(s.tech_debt_reviewed_at) > 90,
  );

  function startReview() {
    if (dueForReview.length === 0) {
      toast.info("No items due for review.");
      return;
    }
    setReviewOpen(true);
  }

  function completeReview() {
    const scheduled = dueForReview.filter((s) => s.roadmap_bucket === "Now" || s.roadmap_bucket === "Next").length;
    const deferred = dueForReview.filter((s) => s.roadmap_bucket === "Later" || s.roadmap_bucket === "Not Now").length;
    const q = `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`;
    recordReview({ quarter: q, items_scheduled: scheduled, items_deferred: deferred, notes: stagedNotes });
    dueForReview.forEach((s) => markReviewed(s.id));
    toast.success(`Tech debt review complete — ${scheduled} scheduled, ${deferred} deferred`);
    setReviewOpen(false);
    setStagedNotes("");
  }

  return (
    <section className="tfp-card p-5">
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <h3 className="font-display text-lg">Tech debt</h3>
          <p className="text-xs text-muted-foreground">{techDebt.length} items · {dueForReview.length} due for review.</p>
        </div>
        <button onClick={startReview} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          <Wrench className="h-3.5 w-3.5" /> Start quarterly review
        </button>
      </header>

      {grouped.size === 0 && <p className="text-sm text-muted-foreground">No tech-debt items found.</p>}

      {[...grouped.entries()].map(([product, items]) => (
        <div key={product} className="mb-5">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{product}</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2">Title</th>
                <th className="py-2">Bucket</th>
                <th className="py-2">Age</th>
                <th className="py-2">Estimate</th>
                <th className="py-2">Last reviewed</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const sig = signals.find((s) => s.id === it.signal_id);
                return (
                  <tr key={it.id} className="border-b border-border/40">
                    <td className="py-2">{sig?.title ?? "(untitled)"}</td>
                    <td className="py-2 text-muted-foreground">{it.roadmap_bucket ?? "—"}</td>
                    <td className="py-2 font-mono text-xs text-muted-foreground">{daysSince(it.created_at)}d</td>
                    <td className="py-2 font-mono text-xs text-muted-foreground">{it.tech_estimate_pts ?? "—"} pts</td>
                    <td className="py-2 font-mono text-xs text-muted-foreground">
                      {it.tech_debt_reviewed_at ? fmtDate(it.tech_debt_reviewed_at) : <span className="text-destructive">Never</span>}
                    </td>
                    <td className="py-2 text-right">
                      <button onClick={() => { markReviewed(it.id); toast.success("Marked reviewed"); }} className="text-xs text-primary hover:underline">
                        Mark reviewed
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {reviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setReviewOpen(false)} />
          <div className="relative w-full max-w-2xl max-h-[86vh] overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl">
            <h4 className="font-display text-lg">Quarterly tech debt review</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Set a bucket per item. Now/Next = scheduled · Later/Not Now = deferred.
            </p>
            <div className="mt-4 space-y-3">
              {dueForReview.map((it) => {
                const sig = signals.find((s) => s.id === it.signal_id);
                return (
                  <div key={it.id} className="rounded-md border border-border p-3">
                    <p className="text-sm font-medium">{sig?.title ?? "(untitled)"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{sig?.product} · {it.tech_estimate_pts ?? "—"} pts</p>
                    <div className="mt-2 flex gap-1.5">
                      {(["Now", "Next", "Later", "Not Now"] as const).map((b) => (
                        <button
                          key={b}
                          onClick={() => setBucket(it.id, b, "Tech debt review")}
                          className={cn(
                            "rounded-md px-2 py-1 text-xs",
                            it.roadmap_bucket === b ? "bg-primary text-primary-foreground" : "border border-input bg-background hover:bg-accent",
                          )}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <label className="mt-4 block text-xs uppercase tracking-wider text-muted-foreground">Notes</label>
            <textarea value={stagedNotes} onChange={(e) => setStagedNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setReviewOpen(false)} className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent">
                Cancel
              </button>
              <button onClick={completeReview} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                Complete review
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ============= Integrations =============

function IntegrationsTab() {
  const alerts = useTfpStore((s) => s.monitoringAlerts);
  const signals = useTfpStore((s) => s.signals);
  const simulate = useTfpStore((s) => s.simulateMonitoringAlert);

  const [open, setOpen] = useState(false);
  const [system, setSystem] = useState<MonitoringSystem>("Accuro");
  const [integration, setIntegration] = useState("");
  const [severity, setSeverity] = useState<MonitoringSeverity>("P1");
  const [message, setMessage] = useState("");

  const now = Date.now();
  const day = 24 * 3600000;

  function rowFor(sys: MonitoringSystem) {
    const sysAlerts = alerts.filter((a) => a.system === sys);
    const last = sysAlerts[0];
    const lastAge = last ? now - new Date(last.detected_at).getTime() : Infinity;
    const has24h = lastAge < day;
    const isRedAlert = has24h && last && (last.severity === "P0" || last.severity === "P1");
    const openIncident = signals.find(
      (s) => s.issue_type === "Incident" && s.status !== "Rejected" && s.title.toLowerCase().includes(sys.toLowerCase()),
    );
    let tone: "ok" | "warn" | "danger" = "ok";
    if (isRedAlert || openIncident) tone = "danger";
    else if (has24h && last && last.severity === "P2") tone = "warn";
    return { sys, last, tone, openIncident };
  }

  return (
    <section className="space-y-4">
      <div className="tfp-card p-5">
        <header className="mb-3 flex items-baseline justify-between">
          <div>
            <h3 className="font-display text-lg">Integration health</h3>
            <p className="text-xs text-muted-foreground">External systems we depend on.</p>
          </div>
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-1.5 text-xs hover:bg-accent">
            <Zap className="h-3.5 w-3.5" /> Simulate alert
          </button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2">System</th>
              <th className="py-2">Last alert</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {MONITORING_SYSTEMS.map((sys) => {
              const r = rowFor(sys);
              const toneCls =
                r.tone === "danger"
                  ? "bg-destructive/15 text-destructive"
                  : r.tone === "warn"
                  ? "bg-[var(--color-status-hold)]/15 text-[var(--color-status-hold)]"
                  : "bg-[var(--color-status-proceed)]/15 text-[var(--color-status-proceed)]";
              return (
                <tr key={sys} className="border-b border-border/40">
                  <td className="py-2 font-medium">{sys}</td>
                  <td className="py-2 font-mono text-xs text-muted-foreground">
                    {r.last ? `${r.last.severity} · ${fmtDateTime(r.last.detected_at)}` : "No alerts"}
                  </td>
                  <td className="py-2">
                    <span className={cn("rounded-sm px-1.5 py-0.5 text-[11px] font-medium", toneCls)}>
                      {r.openIncident ? "Open incident" : r.tone === "danger" ? "Critical" : r.tone === "warn" ? "Warning" : "Healthy"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="tfp-card p-5">
        <h3 className="font-display text-lg">Recent monitoring alerts</h3>
        {alerts.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No alerts logged.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {alerts.slice(0, 10).map((a) => (
              <li key={a.id} className="rounded-md border border-border p-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold">{a.severity}</span>
                  <span className="font-medium">{a.system}</span>
                  <span className="text-muted-foreground">· {a.integration}</span>
                  {a.deduplicated && <span className="ml-auto rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">deduped</span>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{a.message}</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{fmtDateTime(a.detected_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl">
            <h4 className="font-display text-lg">Simulate monitoring alert</h4>
            <p className="mt-1 text-xs text-muted-foreground">Triggers an Incident signal (or appends to existing) and notifies on-call.</p>
            <div className="mt-4 space-y-3">
              <Field label="System">
                <select value={system} onChange={(e) => setSystem(e.target.value as MonitoringSystem)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                  {MONITORING_SYSTEMS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Integration">
                <input value={integration} onChange={(e) => setIntegration(e.target.value)} placeholder="Patient roster sync" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
              </Field>
              <Field label="Severity">
                <select value={severity} onChange={(e) => setSeverity(e.target.value as MonitoringSeverity)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                  <option value="P0">P0</option>
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                </select>
              </Field>
              <Field label="Message">
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
              </Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent">Cancel</button>
              <button
                disabled={!integration || !message}
                onClick={() => {
                  simulate({ system, integration, severity, message });
                  toast.success("Monitoring alert simulated");
                  setOpen(false);
                  setIntegration("");
                  setMessage("");
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> Fire alert
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ============= Tile =============

function Tile({ label, value, tone = "ok" }: { label: string; value: number | string; tone?: "ok" | "warn" | "danger" }) {
  const toneCls =
    tone === "danger" ? "text-destructive" : tone === "warn" ? "text-[var(--color-status-hold)]" : "text-foreground";
  return (
    <div className="tfp-card p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-display text-3xl", toneCls)}>{value}</p>
    </div>
  );
}
