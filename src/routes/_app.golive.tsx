import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { USERS, useTfpStore } from "@/lib/tfp/store";
import { DEFAULT_GOLIVE_CRITERIA, type Product } from "@/lib/tfp/types";
import { fmtDateTime } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import { AlertOctagon, Check, Plus, Radio, Rocket, Trash2, X } from "lucide-react";
import { SortMenu, useSortMenu } from "@/components/tfp/SortMenu";
import { sortRows } from "@/components/tfp/SortableHeader";
import { ScrollTable } from "@/components/tfp/ScrollTable";

export const Route = createFileRoute("/_app/golive")({
  component: GoLivePage,
});

function GoLivePage() {
  const goLives = useTfpStore((s) => s.goLives);
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const toggle = useTfpStore((s) => s.toggleGoLiveCriterion);
  const toggleWar = useTfpStore((s) => s.toggleGoLiveWarRoom);
  const decide = useTfpStore((s) => s.setGoLiveDecision);
  const upsert = useTfpStore((s) => s.upsertGoLive);
  const [composing, setComposing] = useState(false);

  type SortKey = "scheduled_for" | "readiness" | "product";
  const { sort, setSort } = useSortMenu<SortKey>("golive", { key: "scheduled_for", dir: "asc" });

  const sorted = useMemo(() => {
    if (sort.key && sort.dir) {
      return sortRows(goLives, sort, (g, k) => {
        if (k === "scheduled_for") return new Date(g.scheduled_for).getTime();
        if (k === "readiness") {
          const keys = Object.keys(g.criteria);
          return keys.filter((c) => g.criteria[c].done).length;
        }
        if (k === "product") return g.product;
        return null;
      });
    }
    return [...goLives].sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime());
  }, [goLives, sort]);
    // default: scheduled asc (preserves existing behaviour)
    return [...goLives].sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime());
  }, [goLives, sort]);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">View 9</p>
          <h1 className="mt-1 font-display text-3xl">Go-Live Readiness</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Five-criterion checklist + war-room mode. Go/No-Go gate before any release.
          </p>
        </div>
        <button
          onClick={() => setComposing((c) => !c)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
        >
          {composing ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {composing ? "Cancel" : "New release"}
        </button>
      </header>

      <div className="mb-4 flex items-center justify-end">
        <SortMenu
          tableId="golive"
          sort={sort}
          onChange={setSort}
          options={[
            { key: "scheduled_for", label: "Target date" },
            { key: "readiness", label: "Readiness" },
            { key: "product", label: "Product" },
          ]}
        />
      </div>

      {composing && <ComposeGoLive upsert={upsert} onDone={() => setComposing(false)} />}

      <ScrollTable className="border border-border bg-surface/40 p-3" maxHeight="calc(100vh - 360px)">
        <div className="grid gap-4 lg:grid-cols-2">
          {sorted.map((g) => {
            const sh = shaping.find((s) => s.id === g.shaping_id);
            const sig = sh ? signals.find((s) => s.id === sh.signal_id) : null;
            const doneCount = CRITERIA.filter((c) => g.criteria[c].done).length;
            const ready = doneCount === CRITERIA.length;

            return (
              <div
                key={g.id}
                className={cn("tfp-card p-5", g.war_room && "border-destructive/50 ring-2 ring-destructive/10")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Rocket className="h-4 w-4 text-primary" />
                      <h3 className="font-display text-lg">{g.release_name}</h3>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {g.product} · scheduled {fmtDateTime(g.scheduled_for)}
                    </p>
                    {sig && <p className="mt-1 text-xs text-muted-foreground">Linked: {sig.title}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        g.status === "Live"
                          ? "bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]"
                          : g.status === "Rolled Back"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {g.status}
                    </span>
                    <button
                      onClick={() => toggleWar(g.id)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]",
                        g.war_room
                          ? "border-destructive bg-destructive/10 text-destructive"
                          : "border-input bg-surface text-muted-foreground hover:border-destructive/40",
                      )}
                    >
                      <Radio className="h-3 w-3" /> War room
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${(doneCount / CRITERIA.length) * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {doneCount}/{CRITERIA.length}
                  </span>
                </div>

                <ul className="mt-4 space-y-2">
                  {CRITERIA.map((c) => {
                    const cr = g.criteria[c];
                    const checker = cr.checked_by ? USERS.find((u) => u.id === cr.checked_by) : null;

                    return (
                      <li key={c} className="flex items-start gap-2.5 rounded-md border border-border bg-surface-2 p-2.5">
                        <input
                          type="checkbox"
                          checked={cr.done}
                          onChange={(e) => toggle(g.id, c, e.target.checked)}
                          className="mt-0.5 h-4 w-4"
                        />
                        <div className="flex-1">
                          <p className={cn("text-sm", cr.done && "line-through text-muted-foreground")}>{c}</p>
                          {cr.note && <p className="mt-0.5 text-xs text-muted-foreground">{cr.note}</p>}
                          {checker && cr.checked_at && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              ✓ {checker.name} · {fmtDateTime(cr.checked_at)}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                  {g.go_no_go_decision ? (
                    <div className="flex items-center gap-2 text-sm">
                      {g.go_no_go_decision === "Go" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-status-proceed)]/10 px-2.5 py-0.5 font-medium text-[var(--color-status-proceed)]">
                          <Check className="h-3 w-3" /> Go decision
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 font-medium text-destructive">
                          <X className="h-3 w-3" /> No-Go
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        by {USERS.find((u) => u.id === g.go_no_go_by)?.name} · {fmtDateTime(g.go_no_go_at!)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {ready
                        ? "All criteria complete — make a Go/No-Go call."
                        : `${CRITERIA.length - doneCount} criteria outstanding.`}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => decide(g.id, "No-Go")}
                      disabled={g.go_no_go_decision !== null}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-40"
                    >
                      <AlertOctagon className="h-3 w-3" /> No-Go
                    </button>
                    <button
                      onClick={() => decide(g.id, "Go")}
                      disabled={!ready || g.go_no_go_decision !== null}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                    >
                      <Rocket className="h-3 w-3" /> Go
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollTable>
    </div>
  );
}

function ComposeGoLive({
  upsert,
  onDone,
}: {
  upsert: ReturnType<typeof useTfpStore.getState>["upsertGoLive"];
  onDone: () => void;
}) {
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const candidates = shaping.filter((s) => s.delivery_status && s.delivery_status !== "Done");

  const [shapingId, setShapingId] = useState(candidates[0]?.id ?? "");
  const [name, setName] = useState("");
  const [when, setWhen] = useState(() => new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16));
  const [warRoom, setWarRoom] = useState(false);

  const sh = shaping.find((s) => s.id === shapingId);
  const product = sh ? signals.find((x) => x.id === sh.signal_id)?.product : null;

  return (
    <div className="mb-6 tfp-card p-5">
      <h3 className="font-display text-lg">New release</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Linked delivery item">
          <select value={shapingId} onChange={(e) => setShapingId(e.target.value)} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm">
            {candidates.map((s) => {
              const sig = signals.find((x) => x.id === s.signal_id);
              return <option key={s.id} value={s.id}>{sig?.title ?? s.id}</option>;
            })}
          </select>
        </Field>
        <Field label="Release name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" placeholder="e.g. 2FA rollout" />
        </Field>
        <Field label="Scheduled for">
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
        </Field>
        <Field label="">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={warRoom} onChange={(e) => setWarRoom(e.target.checked)} />
            War-room mode (high-risk release)
          </label>
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onDone} className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm">Cancel</button>
        <button
          disabled={!shapingId || !name.trim()}
          onClick={() => {
            upsert({
              shaping_id: shapingId,
              product: (product ?? "Platform") as Product,
              release_name: name,
              scheduled_for: new Date(when).toISOString(),
              war_room: warRoom,
            });
            onDone();
          }}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Create checklist
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
