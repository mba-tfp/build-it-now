import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { USERS, useTfpStore, usableCapacity } from "@/lib/tfp/store";
import type { OverrideKind } from "@/lib/tfp/types";
import { fmtDateTime } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import { AlertCircle, Check, Eye, EyeOff, Plus, X } from "lucide-react";
import { SortMenu, useSortMenu } from "@/components/tfp/SortMenu";
import { sortRows } from "@/components/tfp/SortableHeader";
import { ScrollTable } from "@/components/tfp/ScrollTable";

export const Route = createFileRoute("/_app/overrides")({
  component: OverridesPage,
});

const KINDS: OverrideKind[] = [
  "Capacity exceeded",
  "Scope added mid-sprint",
  "Tier escalation",
  "Bypass tech review",
  "Other",
];

const KIND_TONE: Record<OverrideKind, string> = {
  "Capacity exceeded": "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]",
  "Scope added mid-sprint": "bg-primary/10 text-primary",
  "Tier escalation": "bg-destructive/10 text-destructive",
  "Bypass tech review": "bg-destructive/10 text-destructive",
  Other: "bg-muted text-muted-foreground",
};

function OverridesPage() {
  const overrides = useTfpStore((s) => s.overrides);
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const sprint = useTfpStore((s) => s.sprint);
  const me = useTfpStore((s) => s.currentUserId);
  const meUser = USERS.find((u) => u.id === me)!;
  const ack = useTfpStore((s) => s.ackOverride);
  const log = useTfpStore((s) => s.logOverride);

  const [showOnlyShahid, setShowOnlyShahid] = useState(meUser.role === "Leadership");
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending" | "Acknowledged">("All");
  const [composing, setComposing] = useState(false);

  type SortKey = "raised_at" | "kind" | "ack_status" | "displaced_pts";
  const { sort, setSort } = useSortMenu<SortKey>("overrides", { key: "raised_at", dir: "desc" });

  const filtered = useMemo(() => {
    const base = overrides.filter((o) => {
      if (showOnlyShahid && !o.shahid_visible) return false;
      if (statusFilter !== "All" && o.ack_status !== statusFilter) return false;
      return true;
    });
    return sortRows(base, sort, (o, k) => {
      if (k === "raised_at") return new Date(o.raised_at).getTime();
      if (k === "kind") return o.kind;
      if (k === "ack_status") return o.ack_status;
      if (k === "displaced_pts") return o.displaced_pts ?? 0;
      return null;
    });
  }, [overrides, showOnlyShahid, statusFilter, sort]);

  const pending = overrides.filter((o) => o.ack_status === "Pending").length;
  const usable = usableCapacity(sprint);
  const utilPct = Math.round((sprint.allocated_pts / Math.max(1, usable)) * 100);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">View 8</p>
          <h1 className="mt-1 font-display text-3xl">Override Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every deviation from the standard flow lives here. {pending} pending Shahid acknowledgement.
          </p>
        </div>
        <button
          onClick={() => setComposing((c) => !c)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
        >
          {composing ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {composing ? "Cancel" : "Log override"}
        </button>
      </header>

      <section className="mb-4 flex flex-wrap items-center gap-2">
        <Pill active={statusFilter === "All"} onClick={() => setStatusFilter("All")}>All ({overrides.length})</Pill>
        <Pill active={statusFilter === "Pending"} onClick={() => setStatusFilter("Pending")}>Pending ({pending})</Pill>
        <Pill active={statusFilter === "Acknowledged"} onClick={() => setStatusFilter("Acknowledged")}>Acknowledged</Pill>
        <div className="ml-auto flex items-center gap-2">
          <SortMenu
            tableId="overrides"
            sort={sort}
            onChange={setSort}
            options={[
              { key: "raised_at", label: "Date raised" },
              { key: "kind", label: "Kind" },
              { key: "ack_status", label: "Ack status" },
              { key: "displaced_pts", label: "Displaced pts" },
            ]}
          />
          <button
            onClick={() => setShowOnlyShahid((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-2.5 py-1 text-xs hover:bg-accent/40"
          >
            {showOnlyShahid ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {showOnlyShahid ? "Showing Shahid-visible only" : "Show all"}
          </button>
        </div>
      </section>

      {composing && <ComposeOverride onDone={() => setComposing(false)} log={log} />}

      <div className="mb-6 tfp-card flex flex-wrap items-center gap-6 p-4 text-sm">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Sprint</p>
          <p className="font-medium">{sprint.name} · {sprint.status}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Allocation</p>
          <p className="font-mono">{sprint.allocated_pts} / {usable} pts ({utilPct}%)</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Locked by</p>
          <p>{sprint.scope_locked_by ? USERS.find((u) => u.id === sprint.scope_locked_by)?.name : "—"}</p>
        </div>
        {utilPct > 85 && (
          <div className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[var(--color-status-hold)]/30 bg-[var(--color-status-hold)]/10 px-3 py-1.5 text-xs text-[var(--color-status-hold)]">
            <AlertCircle className="h-3.5 w-3.5" />
            Above 85% capacity — new scope must be logged here.
          </div>
        )}
      </div>

      <ScrollTable className="border border-border bg-surface/40">
        <div className="space-y-3 p-3">
          {filtered.length === 0 ? (
            <div className="tfp-card p-12 text-center text-sm text-muted-foreground">
              Nothing to show with current filters.
            </div>
          ) : (
            filtered.map((o) => {
              const sig = signals.find((s) => s.id === o.signal_id);
              const raisedBy = USERS.find((u) => u.id === o.raised_by);
              const ackedBy = o.acknowledged_by ? USERS.find((u) => u.id === o.acknowledged_by) : null;
              const displaced = o.displaced_shaping_ids.map((id) => {
                const s = shaping.find((x) => x.id === id);
                const sg = signals.find((x) => x.id === s?.signal_id);
                return sg?.title ?? "(missing)";
              });
              return (
                <div key={o.id} className="tfp-card p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex flex-col items-start gap-1">
                      <span className="font-mono text-sm font-semibold">{o.id}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", KIND_TONE[o.kind])}>
                        {o.kind}
                      </span>
                    </div>
                    <div className="flex-1 min-w-[300px]">
                      <p className="text-sm">{o.reason}</p>
                      {sig && (
                        <Link to="/triage" className="mt-1 block text-xs text-primary hover:underline">
                          Linked signal: {sig.title}
                        </Link>
                      )}
                      {displaced.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Displaced: {displaced.join(", ")} · {o.displaced_pts} pts
                        </p>
                      )}
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Raised by {raisedBy?.name} · {fmtDateTime(o.raised_at)}
                        {o.shahid_visible && <span className="ml-2 rounded-sm bg-accent px-1.5 py-0.5 font-medium uppercase tracking-wider text-accent-foreground">Shahid-visible</span>}
                      </p>
                    </div>
                    <div className="ml-auto flex flex-col items-end gap-2">
                      {o.ack_status === "Acknowledged" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-status-proceed)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--color-status-proceed)]">
                          <Check className="h-3 w-3" /> Acknowledged
                        </span>
                      ) : (
                        <span className="rounded-full bg-[var(--color-status-hold)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--color-status-hold)]">
                          Pending
                        </span>
                      )}
                      {ackedBy && (
                        <span className="text-[10px] text-muted-foreground">
                          by {ackedBy.name} · {fmtDateTime(o.acknowledged_at!)}
                        </span>
                      )}
                      {o.ack_status === "Pending" && meUser.role === "Leadership" && (
                        <button
                          onClick={() => ack(o.id)}
                          className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                        >
                          Acknowledge
                        </button>
                      )}
                      {o.ack_status === "Pending" && meUser.role !== "Leadership" && (
                        <span className="text-[10px] text-muted-foreground">awaiting Shahid</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollTable>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface hover:border-primary/40",
      )}
    >
      {children}
    </button>
  );
}

function ComposeOverride({ onDone, log }: { onDone: () => void; log: ReturnType<typeof useTfpStore.getState>["logOverride"] }) {
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const [kind, setKind] = useState<OverrideKind>("Scope added mid-sprint");
  const [reason, setReason] = useState("");
  const [signalId, setSignalId] = useState("");
  const [displaced, setDisplaced] = useState<string[]>([]);
  const [pts, setPts] = useState(0);
  const [shahidVisible, setShahidVisible] = useState(true);

  const candidates = shaping.filter((s) => s.delivery_status && s.delivery_status !== "Done");

  return (
    <div className="mb-6 tfp-card p-5">
      <h3 className="font-display text-lg">New override</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Kind">
          <select value={kind} onChange={(e) => setKind(e.target.value as OverrideKind)} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm">
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Linked signal (optional)">
          <select value={signalId} onChange={(e) => setSignalId(e.target.value)} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm">
            <option value="">—</option>
            {signals.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </Field>
        <Field label="Reason (Shahid-visible)">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm"
            placeholder="Why is this override necessary? What changed?"
          />
        </Field>
        <Field label="Displaces (existing in-flight items)">
          <div className="space-y-1.5 max-h-[120px] overflow-y-auto rounded-md border border-input bg-surface p-2">
            {candidates.length === 0 && <p className="text-xs text-muted-foreground">No candidates.</p>}
            {candidates.map((s) => {
              const sig = signals.find((x) => x.id === s.signal_id);
              return (
                <label key={s.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={displaced.includes(s.id)}
                    onChange={(e) => setDisplaced((d) => (e.target.checked ? [...d, s.id] : d.filter((x) => x !== s.id)))}
                  />
                  <span className="truncate">{sig?.title ?? s.id} · {s.tech_estimate_pts ?? 0}pts</span>
                </label>
              );
            })}
          </div>
        </Field>
        <Field label="Displaced points">
          <input type="number" value={pts} onChange={(e) => setPts(Number(e.target.value))} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
        </Field>
        <Field label="">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={shahidVisible} onChange={(e) => setShahidVisible(e.target.checked)} />
            Visible to leadership (Shahid)
          </label>
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onDone} className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm">Cancel</button>
        <button
          disabled={!reason.trim()}
          onClick={() => {
            log({
              kind,
              reason,
              signal_id: signalId || null,
              displaced_shaping_ids: displaced,
              displaced_pts: pts,
              shahid_visible: shahidVisible,
            });
            onDone();
          }}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Log override
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label && <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">{label}</label>}
      {children}
    </div>
  );
}
