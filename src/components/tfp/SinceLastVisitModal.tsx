import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useMemo } from "react";
import { computeSprintHealthSnapshot, useTfpStore } from "@/lib/tfp/store";
import type { LastVisitEntry } from "@/lib/tfp/types";

export type SinceLastVisitChanges = {
  newSignals: { id: string; title: string }[];
  stageMovements: { id: string; title: string; stage: string }[];
  decisionsByOthers: { id: string; title: string; summary: string }[];
  outcomeOverdue: { id: string; title: string }[];
  sprintChanges: { id: string; name: string; kind: "started" | "closed" }[];
  sprintHealthChanges: {
    id: string;
    name: string;
    capacityDelta: number;
    blockerDelta: number;
    spilloverDelta: number;
  }[];
};

export function computeSinceLastVisit(prev: LastVisitEntry): SinceLastVisitChanges {
  const state = useTfpStore.getState();
  const cutoff = new Date(prev.ts).getTime();
  const myId = state.currentUserId;
  const newSignals = state.signals
    .filter((s) => new Date(s.created_at).getTime() > cutoff)
    .map((s) => ({ id: s.id, title: s.title }));
  const stageMovements = state.shaping
    .filter((i) => new Date(i.updated_at).getTime() > cutoff && (i.delivery_status || i.shaping_status))
    .slice(0, 10)
    .map((i) => {
      const sig = state.signals.find((s) => s.id === i.signal_id);
      const stage = i.delivery_status ?? i.shaping_status ?? "—";
      return { id: i.id, title: sig?.title ?? i.id, stage };
    });
  const decisionsByOthers = state.decisions
    .filter((d) => new Date(d.decided_at).getTime() > cutoff && d.decided_by !== myId)
    .map((d) => {
      const item = state.shaping.find((s) => s.id === d.linked_shaping_id);
      const sig = item ? state.signals.find((s) => s.id === item.signal_id) : null;
      const text = (d.decision || "").slice(0, 60);
      return { id: d.id, title: sig?.title ?? d.title, summary: text };
    });
  const now = Date.now();
  const outcomeOverdue = state.reviews
    .filter((r) => r.status === "Pending" && now - new Date(r.created_at).getTime() > 48 * 3600 * 1000)
    .map((r) => {
      const item = state.shaping.find((s) => s.id === r.shaping_id);
      const sig = item ? state.signals.find((s) => s.id === item.signal_id) : null;
      return { id: r.id, title: sig?.title ?? r.id };
    });
  const sprintChanges: SinceLastVisitChanges["sprintChanges"] = [];
  for (const sp of state.sprints) {
    if (sp.closed_at && new Date(sp.closed_at).getTime() > cutoff) {
      sprintChanges.push({ id: sp.id, name: sp.name, kind: "closed" });
    } else if (new Date(sp.start_date).getTime() > cutoff) {
      sprintChanges.push({ id: sp.id, name: sp.name, kind: "started" });
    }
  }
  const currentSnap = computeSprintHealthSnapshot(state.sprints, state.shaping);
  const sprintHealthChanges: SinceLastVisitChanges["sprintHealthChanges"] = [];
  for (const sp of state.sprints) {
    const before = prev.sprintSnapshot[sp.id];
    const after = currentSnap[sp.id];
    if (!before || !after) continue;
    const capacityDelta = after.capacity - before.capacity;
    const blockerDelta = after.blockers - before.blockers;
    const spilloverDelta = after.spillover - before.spillover;
    if (capacityDelta || blockerDelta || spilloverDelta) {
      sprintHealthChanges.push({ id: sp.id, name: sp.name, capacityDelta, blockerDelta, spilloverDelta });
    }
  }
  return { newSignals, stageMovements, decisionsByOthers, outcomeOverdue, sprintChanges, sprintHealthChanges };
}

export function totalChanges(c: SinceLastVisitChanges): number {
  return (
    c.newSignals.length +
    c.stageMovements.length +
    c.decisionsByOthers.length +
    c.outcomeOverdue.length +
    c.sprintChanges.length +
    c.sprintHealthChanges.length
  );
}

function formatLastSeen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SinceLastVisitModal({
  prev,
  onClose,
}: {
  prev: LastVisitEntry;
  onClose: () => void;
}) {
  const changes = useMemo(() => computeSinceLastVisit(prev), [prev]);
  const total = totalChanges(changes);
  return (
    <div
      data-testid="since-last-visit-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[540px] overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-border p-5">
          <div className="flex-1">
            <h2 className="font-display text-lg">Since your last visit</h2>
            <p className="mt-1 text-xs text-muted-foreground">Last seen: {formatLastSeen(prev.ts)}</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="max-h-[60vh] overflow-y-auto p-5 text-sm">
          {total === 0 ? (
            <p data-testid="since-last-visit-empty" className="text-muted-foreground">
              Nothing changed since your last visit.
            </p>
          ) : (
            <div className="space-y-4">
              {changes.newSignals.length > 0 && (
                <Section title={`${changes.newSignals.length} new signal${changes.newSignals.length > 1 ? "s" : ""}`}>
                  <Link to="/inbox" onClick={onClose} className="text-primary hover:underline">View →</Link>
                </Section>
              )}
              {changes.stageMovements.length > 0 && (
                <Section title="Stage movements">
                  <ul className="mt-1 space-y-1">
                    {changes.stageMovements.map((m) => (
                      <li key={m.id} className="text-muted-foreground">
                        <span className="text-foreground">{m.title}</span> → {m.stage}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {changes.decisionsByOthers.length > 0 && (
                <Section title="Decisions made">
                  <ul className="mt-1 space-y-1">
                    {changes.decisionsByOthers.map((d) => (
                      <li key={d.id} className="text-muted-foreground">
                        <span className="text-foreground">{d.title}</span>
                        {d.summary ? <> — {d.summary}</> : null}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {changes.outcomeOverdue.length > 0 && (
                <Section title="Outcome reviews overdue">
                  <ul className="mt-1 space-y-1">
                    {changes.outcomeOverdue.map((o) => (
                      <li key={o.id}>
                        <Link to="/delivery" onClick={onClose} className="text-primary hover:underline">{o.title}</Link>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {changes.sprintChanges.length > 0 && (
                <Section title="Sprint changes">
                  <ul className="mt-1 space-y-1">
                    {changes.sprintChanges.map((s) => (
                      <li key={`${s.id}-${s.kind}`} className="text-muted-foreground">
                        <span className="text-foreground">{s.name}</span> {s.kind}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {changes.sprintHealthChanges.length > 0 && (
                <Section title="Sprint health changes">
                  <ul className="mt-1 space-y-1">
                    {changes.sprintHealthChanges.map((s) => (
                      <li key={s.id} className="text-muted-foreground">
                        <span className="text-foreground">{s.name}</span>
                        {s.capacityDelta ? <> · capacity {s.capacityDelta > 0 ? "+" : ""}{s.capacityDelta}</> : null}
                        {s.blockerDelta ? <> · blockers {s.blockerDelta > 0 ? "+" : ""}{s.blockerDelta}</> : null}
                        {s.spilloverDelta ? <> · spillover {s.spilloverDelta > 0 ? "+" : ""}{s.spilloverDelta}</> : null}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-end border-t border-border bg-muted/20 px-5 py-3">
          <button
            data-testid="since-last-visit-got-it"
            onClick={onClose}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Got it
          </button>
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="mt-1">{children}</div>
    </section>
  );
}
