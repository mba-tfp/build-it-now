import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { USERS, useTfpStore } from "@/lib/tfp/store";
import type { DecisionType } from "@/lib/tfp/types";
import { fmtDate } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import { Plus, Search, X } from "lucide-react";
import { SortMenu, useSortMenu } from "@/components/tfp/SortMenu";
import { sortRows } from "@/components/tfp/SortableHeader";
import { ScrollTable } from "@/components/tfp/ScrollTable";

export const Route = createFileRoute("/_app/decisions")({
  component: DecisionsPage,
});

const TYPES: DecisionType[] = ["Architectural", "Product", "Process", "Vendor"];
const TYPE_TONE: Record<DecisionType, string> = {
  Architectural: "bg-primary/10 text-primary",
  Product: "bg-[var(--color-status-new)]/10 text-[var(--color-status-new)]",
  Process: "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]",
  Vendor: "bg-muted text-muted-foreground",
};

function DecisionsPage() {
  const decisions = useTfpStore((s) => s.decisions);
  const signals = useTfpStore((s) => s.signals);
  const create = useTfpStore((s) => s.createDecision);
  const [q, setQ] = useState("");
  const [type, setType] = useState<DecisionType | "All">("All");
  const [composing, setComposing] = useState(false);

  type SortKey = "decided_at" | "type" | "owner";
  const { sort, setSort } = useSortMenu<SortKey>("decisions", { key: "decided_at", dir: "desc" });

  const filtered = useMemo(() => {
    const ql = q.toLowerCase().trim();
    const base = decisions.filter((d) => {
      if (type !== "All" && d.type !== type) return false;
      if (!ql) return true;
      return (
        d.title.toLowerCase().includes(ql) ||
        d.context.toLowerCase().includes(ql) ||
        d.decision.toLowerCase().includes(ql) ||
        d.id.toLowerCase().includes(ql)
      );
    });
    return sortRows(base, sort, (d, k) => {
      if (k === "decided_at") return new Date(d.decided_at).getTime();
      if (k === "type") return d.type;
      if (k === "owner") return USERS.find((u) => u.id === d.decided_by)?.name ?? "";
      return null;
    });
  }, [decisions, q, type, sort]);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">View 11</p>
          <h1 className="mt-1 font-display text-3xl">Decision Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Architectural, product, and process decisions — searchable and linked to signals.
          </p>
        </div>
        <button
          onClick={() => setComposing((c) => !c)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
        >
          {composing ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {composing ? "Cancel" : "Log decision"}
        </button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search decisions, context, or DEC-NNN…"
            className="w-full rounded-md border border-input bg-surface py-1.5 pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          onClick={() => setType("All")}
          className={cn("rounded-full border px-3 py-1 text-xs", type === "All" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface")}
        >
          All
        </button>
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cn("rounded-full border px-3 py-1 text-xs", type === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface")}
          >
            {t}
          </button>
        ))}
        <SortMenu
          className="ml-auto"
          tableId="decisions"
          sort={sort}
          onChange={setSort}
          options={[
            { key: "decided_at", label: "Date" },
            { key: "type", label: "Type" },
            { key: "owner", label: "Owner" },
          ]}
        />
      </div>

      {composing && <Compose create={create} onDone={() => setComposing(false)} />}

      <ScrollTable className="border border-border bg-surface/40 p-3" maxHeight="calc(100vh - 360px)">
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="tfp-card p-12 text-center text-sm text-muted-foreground">No decisions match.</div>
          )}
          {filtered.map((d) => {
          const decider = USERS.find((u) => u.id === d.decided_by);
          const sig = d.linked_signal_id ? signals.find((s) => s.id === d.linked_signal_id) : null;
          return (
            <article key={d.id} className="tfp-card p-5">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{d.id}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", TYPE_TONE[d.type])}>{d.type}</span>
                    <span className="rounded-full bg-[var(--color-status-proceed)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--color-status-proceed)]">
                      {d.status}
                    </span>
                  </div>
                  <h3 className="mt-1 font-display text-lg leading-tight">{d.title}</h3>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {decider?.name} · {fmtDate(d.decided_at)}
                </p>
              </header>
              <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <Section label="Context">{d.context}</Section>
                <Section label="Options considered">{d.options_considered}</Section>
                <Section label="Decision">{d.decision}</Section>
                <Section label="Consequences">{d.consequences}</Section>
              </div>
              {sig && (
                <p className="mt-3 text-xs text-muted-foreground">Linked signal: {sig.title}</p>
              )}
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
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p>{children}</p>
    </div>
  );
}

function Compose({
  create,
  onDone,
}: {
  create: ReturnType<typeof useTfpStore.getState>["createDecision"];
  onDone: () => void;
}) {
  const signals = useTfpStore((s) => s.signals);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<DecisionType>("Product");
  const [context, setContext] = useState("");
  const [options, setOptions] = useState("");
  const [decision, setDecision] = useState("");
  const [consequences, setConsequences] = useState("");
  const [linkedSig, setLinkedSig] = useState("");

  return (
    <div className="mb-6 tfp-card p-5">
      <h3 className="font-display text-lg">New decision</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as DecisionType)} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Context">
          <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={3} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
        </Field>
        <Field label="Options considered">
          <textarea value={options} onChange={(e) => setOptions(e.target.value)} rows={3} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
        </Field>
        <Field label="Decision">
          <textarea value={decision} onChange={(e) => setDecision(e.target.value)} rows={3} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
        </Field>
        <Field label="Consequences">
          <textarea value={consequences} onChange={(e) => setConsequences(e.target.value)} rows={3} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
        </Field>
        <Field label="Linked signal (optional)">
          <select value={linkedSig} onChange={(e) => setLinkedSig(e.target.value)} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm">
            <option value="">—</option>
            {signals.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onDone} className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm">Cancel</button>
        <button
          disabled={!title.trim() || !decision.trim()}
          onClick={() => {
            create({
              title,
              type,
              context,
              options_considered: options,
              decision,
              consequences,
              linked_signal_id: linkedSig || null,
              linked_shaping_id: null,
            });
            onDone();
          }}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Log decision
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
