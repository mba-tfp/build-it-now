import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { USERS, useTfpStore } from "@/lib/tfp/store";
import type { RetroTheme } from "@/lib/tfp/types";
import { fmtDate } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import { AlertTriangle, Plus, X } from "lucide-react";
import { SortMenu, useSortMenu } from "@/components/tfp/SortMenu";
import { sortRows } from "@/components/tfp/SortableHeader";
import { ScrollTable } from "@/components/tfp/ScrollTable";

export const Route = createFileRoute("/_app/retros")({
  component: () => <Navigate to="/governance" search={{ tab: "retros" }} />,
});

const THEMES: RetroTheme[] = ["Process", "Tools", "Communication", "Quality", "Capacity", "Other"];
const THEME_TONE: Record<RetroTheme, string> = {
  Process: "bg-primary/10 text-primary",
  Tools: "bg-[var(--color-status-new)]/10 text-[var(--color-status-new)]",
  Communication: "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]",
  Quality: "bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]",
  Capacity: "bg-destructive/10 text-destructive",
  Other: "bg-muted text-muted-foreground",
};

export function RetrosPage() {
  const retros = useTfpStore((s) => s.retros);
  const sprint = useTfpStore((s) => s.sprint);
  const create = useTfpStore((s) => s.createRetro);
  const [composing, setComposing] = useState(false);

  type SortKey = "created_at" | "actions";
  const { sort, setSort } = useSortMenu<SortKey>("retros", { key: "created_at", dir: "desc" });

  const sorted = useMemo(
    () =>
      sortRows(retros, sort, (r, k) => {
        if (k === "created_at") return new Date(r.created_at).getTime();
        if (k === "actions") {
          const text = r.one_change ?? "";
          // count actions as comma- or newline-separated entries
          return text.split(/[,\n]/).filter((s) => s.trim().length > 0).length;
        }
        return null;
      }),
    [retros, sort],
  );

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">View 12</p>
          <h1 className="mt-1 font-display text-3xl">Sprint Retros</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Three fields, one theme. 3 consecutive sprints sharing a theme triggers escalation.
          </p>
        </div>
        <button
          onClick={() => setComposing((c) => !c)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
        >
          {composing ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {composing ? "Cancel" : "New retro"}
        </button>
      </header>

      <div className="mb-4 flex items-center justify-end">
        <SortMenu
          tableId="retros"
          sort={sort}
          onChange={setSort}
          options={[
            { key: "created_at", label: "Sprint date" },
            { key: "actions", label: "Action items" },
          ]}
        />
      </div>

      {composing && <Compose create={create} onDone={() => setComposing(false)} sprintId={sprint.id} />}

      <ScrollTable className="border border-border bg-surface/40 p-3" maxHeight="calc(100vh - 360px)">
        <div className="space-y-3">
          {sorted.length === 0 && (
            <div className="tfp-card p-12 text-center text-sm text-muted-foreground">No retros yet.</div>
          )}
          {sorted.map((r) => {
            const author = USERS.find((u) => u.id === r.created_by);
            return (
              <article key={r.id} className={cn("tfp-card p-5", r.escalated && "border-destructive/50 ring-2 ring-destructive/10")}>
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-lg">{r.sprint_id.toUpperCase()} retrospective</h3>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", THEME_TONE[r.primary_theme])}>
                        {r.primary_theme}
                      </span>
                      {r.escalated && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                          <AlertTriangle className="h-3 w-3" /> Escalated · 3 sprints
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {author?.name} · {fmtDate(r.created_at)}
                    </p>
                  </div>
                </header>
                <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                  <Section label="What worked">{r.what_worked}</Section>
                  <Section label="What didn't">{r.what_didnt}</Section>
                  <Section label="One change">{r.one_change}</Section>
                </div>
              </article>
            );
          })}
        </div>
      </ScrollTable>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p>{children}</p>
    </div>
  );
}

function Compose({
  create,
  onDone,
  sprintId,
}: {
  create: ReturnType<typeof useTfpStore.getState>["createRetro"];
  onDone: () => void;
  sprintId: string;
}) {
  const [worked, setWorked] = useState("");
  const [didnt, setDidnt] = useState("");
  const [change, setChange] = useState("");
  const [theme, setTheme] = useState<RetroTheme>("Process");

  return (
    <div className="mb-6 tfp-card p-5">
      <h3 className="font-display text-lg">New retro</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Field label="What worked">
          <textarea value={worked} onChange={(e) => setWorked(e.target.value)} rows={4} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
        </Field>
        <Field label="What didn't">
          <textarea value={didnt} onChange={(e) => setDidnt(e.target.value)} rows={4} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
        </Field>
        <Field label="One change next sprint">
          <textarea value={change} onChange={(e) => setChange(e.target.value)} rows={4} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
        </Field>
        <Field label="Primary theme">
          <select value={theme} onChange={(e) => setTheme(e.target.value as RetroTheme)} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm">
            {THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onDone} className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm">Cancel</button>
        <button
          disabled={!worked.trim() || !didnt.trim() || !change.trim()}
          onClick={() => {
            create({ sprint_id: sprintId, what_worked: worked, what_didnt: didnt, one_change: change, primary_theme: theme });
            onDone();
          }}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Log retro
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
