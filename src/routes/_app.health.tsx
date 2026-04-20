import { createFileRoute } from "@tanstack/react-router";
import { usableCapacity, useTfpStore, daysSince } from "@/lib/tfp/store";
import { slaState } from "@/lib/tfp/format";

export const Route = createFileRoute("/_app/health")({
  component: QueueHealthPage,
});

function QueueHealthPage() {
  const sprint = useTfpStore((s) => s.sprint);
  const signals = useTfpStore((s) => s.signals);
  const shaping = useTfpStore((s) => s.shaping);

  const usable = usableCapacity(sprint);
  const usedPct = Math.round((sprint.allocated_pts / usable) * 100);
  const slaBreaches = signals.filter(
    (s) => (s.status === "New" || s.status === "In Review") && slaState(s.sla_due_at) === "breach",
  ).length;
  const stale = shaping.filter((s) => daysSince(s.created_at) > 6).length;
  const stuck = shaping.filter((s) => daysSince(s.created_at) > 12).length;
  const open = signals.filter((s) => s.status === "New" || s.status === "In Review").length;
  const inShaping = shaping.filter((s) => s.shaping_status !== "Approved").length;

  return (
    <div>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">View 6</p>
        <h1 className="mt-1 font-display text-3xl">Queue Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sprint metrics + alerts for Wave 1. Per-person bandwidth and override log arrive in Wave 2.
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Open signals" value={open} />
        <Tile label="In shaping" value={inShaping} />
        <Tile label="SLA breaches" value={slaBreaches} tone={slaBreaches > 0 ? "danger" : "ok"} />
        <Tile label="Stale items" value={stale + stuck} tone={stuck > 0 ? "danger" : stale > 0 ? "warn" : "ok"} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="tfp-card p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-display text-lg">{sprint.name}</h3>
            <span className="text-xs text-muted-foreground">{sprint.status}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-4xl">{sprint.allocated_pts}</span>
            <span className="text-sm text-muted-foreground">/ {usable} pts usable ({usedPct}%)</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(100, usedPct)}%` }}
            />
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <Row label="Gross capacity" value={`${sprint.gross_capacity_pts}`} />
            <Row label="Leave" value={`-${sprint.leave_deduction_pts}`} />
            <Row label="Interrupt buffer" value={`-${sprint.interrupt_buffer_pts}`} />
            <Row label="QA buffer" value={`-${sprint.qa_buffer_pts}`} />
            <Row label="Uncertainty" value={`-${sprint.uncertainty_buffer_pts}`} />
            <Row label="Carry-forward" value={`-${sprint.carryforward_estimate_pts}`} />
          </dl>
        </div>

        <div className="tfp-card p-5">
          <h3 className="font-display text-lg">Alerts</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {slaBreaches > 0 && (
              <Alert tone="danger">
                {slaBreaches} signal{slaBreaches === 1 ? " is" : "s are"} past SLA — see the Triage Queue.
              </Alert>
            )}
            {stuck > 0 && (
              <Alert tone="danger">
                {stuck} shaping item{stuck === 1 ? "" : "s"} have been in stage more than 12 days.
              </Alert>
            )}
            {stale > 0 && (
              <Alert tone="warn">
                {stale} shaping item{stale === 1 ? "" : "s"} have been in stage more than 6 days.
              </Alert>
            )}
            {usedPct > 85 && (
              <Alert tone="warn">
                Sprint capacity is at {usedPct}% — new <em>Now</em> items must declare displacement.
              </Alert>
            )}
            {slaBreaches === 0 && stuck === 0 && stale === 0 && usedPct <= 85 && (
              <li className="rounded-md border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
                All clear — no SLA breaches, no stale items, sprint within capacity.
              </li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Tile({ label, value, tone = "ok" }: { label: string; value: number; tone?: "ok" | "warn" | "danger" }) {
  const toneCls =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-[var(--color-status-hold)]"
        : "text-foreground";
  return (
    <div className="tfp-card p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-3xl ${toneCls}`}>{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-mono">{value}</dd>
    </>
  );
}

function Alert({ tone, children }: { tone: "warn" | "danger"; children: React.ReactNode }) {
  const cls =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/5 text-destructive"
      : "border-[var(--color-status-hold)]/40 bg-[var(--color-status-hold)]/5 text-[var(--color-status-hold)]";
  return <li className={`rounded-md border p-3 ${cls}`}>{children}</li>;
}
