import { useEffect } from "react";
import { USERS, useTfpStore } from "@/lib/tfp/store";
import { auditFor } from "@/lib/tfp/exports";
import { fmtDateTime } from "@/lib/tfp/format";
import { TierBadge, StatusBadge } from "@/components/tfp/Badge";
import { cn } from "@/lib/utils";
import { X, Activity } from "lucide-react";

export function SignalTimelineDrawer({
  signalId,
  onClose,
}: {
  signalId: string | null;
  onClose: () => void;
}) {
  const signals = useTfpStore((s) => s.signals);
  const shaping = useTfpStore((s) => s.shaping);
  const audit = useTfpStore((s) => s.audit);

  useEffect(() => {
    if (!signalId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [signalId, onClose]);

  if (!signalId) return null;
  const signal = signals.find((s) => s.id === signalId);
  if (!signal) return null;
  const sh = shaping.find((x) => x.signal_id === signalId);

  const entries = [
    ...auditFor(audit, { signalId, shapingId: sh?.id }),
    // Synthesise the creation event so the timeline always has a tail.
    {
      id: "synth-" + signalId,
      ts: signal.created_at,
      actor_id: signal.created_by,
      entity_type: "signal" as const,
      entity_id: signalId,
      action: "Signal received from " + signal.source,
    },
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  // Deduplicate (synthetic creation may collide with an audit entry)
  const seen = new Set<string>();
  const dedup = entries.filter((e) => {
    const key = `${e.ts}-${e.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div
        className="flex-1 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close drawer"
      />
      <aside className="flex h-full w-full max-w-[520px] flex-col border-l border-border bg-surface shadow-2xl">
        <header className="flex items-start gap-3 border-b border-border p-5">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <Activity className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Signal timeline</p>
            <h2 className="mt-0.5 truncate font-display text-lg leading-tight">{signal.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-mono">{signal.id}</span>
              <span>·</span>
              <span>{signal.product}</span>
              <span>·</span>
              <span>{signal.source}</span>
              <TierBadge tier={signal.tier} />
              <StatusBadge status={signal.status} />
              {sh?.jira_key && <span className="font-mono text-foreground">{sh.jira_key}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <ol className="relative ml-3 border-l border-border">
            {dedup.map((e, idx) => {
              const actor = USERS.find((u) => u.id === e.actor_id);
              return (
                <li key={e.id} className="mb-4 ml-5 last:mb-0">
                  <span
                    className={cn(
                      "absolute -left-[6px] mt-1.5 h-3 w-3 rounded-full border-2 border-surface",
                      idx === 0 ? "bg-primary" : "bg-muted-foreground/60",
                    )}
                  />
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="text-sm font-medium text-foreground">{e.action}</p>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {e.entity_type}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {fmtDateTime(e.ts)} · {actor?.name ?? "system"}
                    {actor && ` · ${actor.role}`}
                  </p>
                  {(e.before || e.after) && (
                    <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                      {e.before && (
                        <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 line-through text-muted-foreground">
                          {e.before}
                        </span>
                      )}
                      {e.after && (
                        <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-foreground">
                          {e.after}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {dedup.length === 0 && (
            <p className="text-sm text-muted-foreground">No timeline events yet.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
