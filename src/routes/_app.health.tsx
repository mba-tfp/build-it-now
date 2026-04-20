import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { USERS, daysSince, useTfpStore, usableCapacity } from "@/lib/tfp/store";
import { slaState } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

export const Route = createFileRoute("/_app/health")({
  component: QueueHealthPage,
});

// Per-person bandwidth model from spec §4
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

function QueueHealthPage() {
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

  // Per-person load — count items where they're the owner / reviewer
  const personLoad = useMemo(() => {
    return BANDWIDTH.map(({ id, weeklyHours }) => {
      const u = USERS.find((x) => x.id === id)!;
      let load = 0;
      let bandwidth = weeklyHours;
      if (u.role === "PM" || u.role === "Senior PM" || u.role === "Associate PM") {
        const owned = signals.filter((s) => s.owner_id === id && s.status !== "Rejected" && s.status !== "Hold").length;
        const shapingOwned = shaping.filter((s) => s.pm_owner_id === id && s.shaping_status !== "Approved" && s.shaping_status !== "In Delivery").length;
        load = owned * 4 + shapingOwned * 6; // hrs/wk estimate
      } else if (u.role === "Tech Lead") {
        const reviews = shaping.filter((s) => s.tech_reviewer_id === id && s.shaping_status === "In Tech Review").length;
        load = reviews * 8;
      } else if (u.role === "QA Scrum Master") {
        const inQA = shaping.filter((s) => s.delivery_status === "In QA").length;
        load = inQA * 6 + 8;
      } else if (u.role === "Developer") {
        const inProgress = shaping.filter((s) => s.delivery_status === "In Progress").length;
        load = (inProgress * 12) / 2; // split across devs
      }
      const pct = Math.round((load / bandwidth) * 100);
      return { user: u, load, bandwidth, pct };
    });
  }, [shaping, signals]);

  // Priority-ordered alerts (P1 → P4)
  const alerts: Array<{ priority: "P1" | "P2" | "P3" | "P4"; title: string; body: string }> = [];
  slaBreaches.forEach((s) => alerts.push({ priority: "P1", title: `SLA breach: ${s.title}`, body: `${s.tier} signal · ${s.product}` }));
  blocked.forEach((s) => alerts.push({ priority: "P2", title: `${s.jira_key} blocked`, body: `Blocked since ${s.blocked_since ? new Date(s.blocked_since).toUTCString().slice(0, 16) : "—"}` }));
  pendingOverrides.forEach((o) => alerts.push({ priority: "P2", title: `${o.id} pending acknowledgement`, body: o.kind }));
  if (usedPct > 85) alerts.push({ priority: "P2", title: `Sprint at ${usedPct}% capacity`, body: "New scope must declare displacement." });
  stuck.forEach((s) => alerts.push({ priority: "P3", title: `Shaping stuck >12d`, body: s.problem_what.slice(0, 80) || s.id }));
  pendingComms.forEach((c) => alerts.push({ priority: "P3", title: `Comms awaiting approval: ${c.subject}`, body: c.audience }));
  overdueReviews.forEach((r) => alerts.push({ priority: "P3", title: "Review pending", body: r.size + " review for " + r.shaping_id }));
  stale.forEach((s) => alerts.push({ priority: "P4", title: "Shaping stale (>6d)", body: s.problem_what.slice(0, 80) || s.id }));

  alerts.sort((a, b) => a.priority.localeCompare(b.priority));

  return (
    <div>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">View 6</p>
        <h1 className="mt-1 font-display text-3xl">Queue Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sprint metrics, per-person bandwidth, and prioritised alerts.
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Open signals" value={signals.filter((s) => s.status === "New" || s.status === "In Review").length} />
        <Tile label="In shaping" value={shaping.filter((s) => s.shaping_status !== "Approved" && s.shaping_status !== "In Delivery").length} />
        <Tile label="SLA breaches" value={slaBreaches.length} tone={slaBreaches.length > 0 ? "danger" : "ok"} />
        <Tile label="Sprint utilisation" value={`${usedPct}%`} tone={usedPct > 85 ? "warn" : "ok"} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="tfp-card p-5">
          <h3 className="font-display text-lg">Per-person bandwidth</h3>
          <p className="text-xs text-muted-foreground">Load estimate vs weekly hours. Green &lt; 70% · amber 70–90% · orange 90–110% · red &gt; 110%.</p>
          <div className="mt-4 space-y-3">
            {personLoad.map(({ user, load, bandwidth, pct }) => {
              const tone =
                pct > 110 ? "bg-destructive" : pct > 90 ? "bg-orange-500" : pct > 70 ? "bg-[var(--color-status-hold)]" : "bg-[var(--color-status-proceed)]";
              return (
                <div key={user.id}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span><span className="font-medium">{user.name}</span> <span className="text-muted-foreground">· {user.role}</span></span>
                    <span className="font-mono text-xs text-muted-foreground">{load}h / {bandwidth}h ({pct}%)</span>
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
          <div className="border-b border-border p-4">
            <h3 className="font-display text-lg">Alerts ({alerts.length})</h3>
            <p className="text-xs text-muted-foreground">Sorted P1 → P4.</p>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {alerts.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">All clear.</p>}
            {alerts.map((a, i) => {
              const Icon = a.priority === "P1" ? AlertCircle : a.priority === "P2" ? AlertTriangle : Info;
              const tone =
                a.priority === "P1" ? "border-destructive/30 bg-destructive/5 text-destructive" :
                a.priority === "P2" ? "border-[var(--color-status-hold)]/30 bg-[var(--color-status-hold)]/5 text-[var(--color-status-hold)]" :
                a.priority === "P3" ? "border-[var(--color-status-new)]/30 bg-[var(--color-status-new)]/5 text-[var(--color-status-new)]" :
                "border-border bg-surface-2 text-muted-foreground";
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
    </div>
  );
}

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
