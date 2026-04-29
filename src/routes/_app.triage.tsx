import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTfpStore, daysSince, isAllowedStatusTransition } from "@/lib/tfp/store";
import { classifySignal, slaDueAt } from "@/lib/tfp/classify";
import { fmtDateTime, slaState } from "@/lib/tfp/format";
import type { CommitmentType, IntakePriority, Product, Signal, SignalStatus, Source, Tier } from "@/lib/tfp/types";
import { LabelsList, StatusBadge, TierBadge } from "@/components/tfp/Badge";
import { AttachmentsField } from "@/components/tfp/AttachmentsField";
import { LabelSuggestions } from "@/components/tfp/LabelSuggestions";
import { ConfirmDialog } from "@/components/tfp/ConfirmDialog";
import { cn } from "@/lib/utils";
import { Pencil, Save, Search, Sparkles, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_app/triage")({
  component: () => <Navigate to="/inbox" search={{ tab: "triage" }} />,
});

const STATUSES: Array<SignalStatus | "All"> = ["All", "New", "In Review", "Proceed", "Hold", "Rejected"];
const SOURCES: Array<Source | "All"> = ["All", "Leadership", "Clinic", "Internal"];
const PRODUCTS: Array<Product | "All"> = [
  "All",
  "Otto-Onboard",
  "Otto Notes",
  "Otto Pulse",
  "FertiWise",
  "StimSmart",
  "Platform",
];
const TIERS: Array<Tier | "All"> = ["All", "P0", "P1", "P2", "P3"];

const ALL_STATUSES: SignalStatus[] = ["New", "In Review", "Proceed", "Hold", "Rejected"];
const ALL_SOURCES: Source[] = ["Leadership", "Clinic", "Internal"];
const ALL_PRODUCTS: Product[] = ["Otto-Onboard", "Otto Notes", "Otto Pulse", "FertiWise", "StimSmart", "Platform"];
const ALL_TIERS: Tier[] = ["P0", "P1", "P2", "P3"];
const COMMITMENT_TYPES: CommitmentType[] = ["Feature", "Fix", "Research", "Dependency", "Incident"];
const parseLabels = (value: string) => value.split(",").map((label) => label.trim()).filter(Boolean);
const ALL_PRIORITIES: IntakePriority[] = ["P0", "P1", "P2", "P3"];

function priorityClasses(p: IntakePriority | undefined): string {
  switch (p) {
    case "P0":
      return "bg-destructive/10 text-destructive";
    case "P1":
      return "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]";
    case "P2":
      return "bg-primary/10 text-primary";
    case "P3":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function TriageQueuePage({ initialOpenId }: { initialOpenId?: string }) {
  const signals = useTfpStore((s) => s.signals);
  const users = useTfpStore((s) => s.users);
  const triageDecision = useTfpStore((s) => s.triageDecision);
  const updateSignal = useTfpStore((s) => s.updateSignal);
  const navigate = useNavigate();

  const [statusF, setStatusF] = useState<(typeof STATUSES)[number]>("New");
  const [sourceF, setSourceF] = useState<(typeof SOURCES)[number]>("All");
  const [productF, setProductF] = useState<(typeof PRODUCTS)[number]>("All");
  const [tierF, setTierF] = useState<(typeof TIERS)[number]>("All");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [bypass, setBypass] = useState<{ signalId: string; patch: Partial<Signal>; from: SignalStatus; to: SignalStatus } | null>(null);

  useEffect(() => {
    if (initialOpenId) setOpenId(initialOpenId);
  }, [initialOpenId]);

  // Wrapper that surfaces toasts + opens the bypass confirm dialog when needed.
  function tryUpdate(signalId: string, patch: Partial<Signal>) {
    const sig = signals.find((s) => s.id === signalId);
    if (!sig) return;
    if (patch.status && patch.status !== sig.status && !isAllowedStatusTransition(sig.status, patch.status)) {
      setBypass({ signalId, patch, from: sig.status, to: patch.status });
      return;
    }
    const res = updateSignal(signalId, patch);
    if (res.ok) toast.success("Saved");
    else toast.error(res.error ?? "Couldn't save");
  }

  const filtered = useMemo(() => {
    return signals
      .filter((s) => statusF === "All" || s.status === statusF)
      .filter((s) => sourceF === "All" || s.source === sourceF)
      .filter((s) => productF === "All" || s.product === productF)
      .filter((s) => tierF === "All" || s.tier === tierF)
      .filter((s) => !q || s.title.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => new Date(a.sla_due_at).getTime() - new Date(b.sla_due_at).getTime());
  }, [signals, statusF, sourceF, productF, tierF, q]);

  const open = signals.find((s) => s.id === openId);
  const breaches = signals.filter((s) => s.status === "New" && slaState(s.sla_due_at) === "breach").length;

  const stop = (e: React.MouseEvent | React.ChangeEvent) => e.stopPropagation();

  return (
    <div>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Inbox</p>
          <h1 className="mt-1 font-display text-3xl">Review Incoming Work</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Click a row to decide whether a signal should proceed, wait, or be rejected.
          </p>
        </div>
        {breaches > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {breaches} new signal{breaches === 1 ? "" : "s"} past SLA
          </div>
        )}
      </header>

      <div className="tfp-card mb-4 flex flex-wrap items-center gap-2 p-3">
        <FilterSelect label="Status" value={statusF} onChange={setStatusF} options={STATUSES} />
        <FilterSelect label="Source" value={sourceF} onChange={setSourceF} options={SOURCES} />
        <FilterSelect label="Product" value={productF} onChange={setProductF} options={PRODUCTS} />
        <FilterSelect label="Priority tier" value={tierF} onChange={setTierF} options={TIERS} />
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title…"
            className="w-64 rounded-md border border-input bg-surface py-1.5 pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="tfp-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">ID</th>
              <th className="px-3 py-2.5 font-medium">Title</th>
              <th className="px-3 py-2.5 font-medium">Priority</th>
              <th className="px-3 py-2.5 font-medium">Source</th>
              <th className="px-3 py-2.5 font-medium">Product</th>
              <th className="px-3 py-2.5 font-medium">Labels</th>
              <th className="px-3 py-2.5 font-medium">Tier</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Owner</th>
              <th className="px-3 py-2.5 font-medium">Days</th>
              <th className="px-3 py-2.5 font-medium">SLA due</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const sla = slaState(s.sla_due_at);
              const owner = users.find((u) => u.id === s.owner_id);
              return (
                <tr
                  key={s.id}
                  onClick={() => setOpenId(s.id)}
                  className={cn(
                    "cursor-pointer border-b border-border/60 transition hover:bg-accent/30",
                    sla === "breach" && "bg-destructive/5",
                    sla === "today" && "bg-[var(--color-status-hold)]/5",
                  )}
                >
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{s.id.slice(0, 8)}</td>
                  <td className="px-3 py-2.5 font-medium">{s.title}</td>
                  <td className="px-3 py-2.5" onClick={stop}>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", priorityClasses(s.priority))}>
                      {s.priority ?? s.tier}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{s.source}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{s.product}</td>
                  <td className="px-3 py-2.5" onClick={stop}>
                    <LabelsList labels={s.labels} />
                  </td>
                  <td className="px-3 py-2.5" onClick={stop}>
                    <InlineSelect
                      value={s.tier}
                      options={ALL_TIERS}
                      onChange={(v) => tryUpdate(s.id, { tier: v as Tier })}
                    />
                  </td>
                  <td className="px-3 py-2.5" onClick={stop}>
                    <InlineSelect
                      value={s.status}
                      options={ALL_STATUSES}
                      onChange={(v) => tryUpdate(s.id, { status: v as SignalStatus })}
                    />
                  </td>
                  <td className="px-3 py-2.5" onClick={stop}>
                    <InlineSelect
                      value={s.owner_id ?? ""}
                      options={["", ...users.map((u) => u.id)]}
                      labels={["—", ...users.map((u) => u.name)]}
                      onChange={(v) => tryUpdate(s.id, { owner_id: v === "" ? null : v })}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{daysSince(s.created_at)}d</td>
                  <td className={cn(
                    "px-3 py-2.5 text-xs",
                    sla === "breach" && "font-medium text-destructive",
                    sla === "today" && "font-medium text-[var(--color-status-hold)]",
                  )}>
                    {fmtDateTime(s.sla_due_at)}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-12 text-center text-sm text-muted-foreground">
                  No signals match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <TriagePanel
          key={open.id}
          signalId={open.id}
          onClose={() => setOpenId(null)}
          onProceed={(commitmentType) => {
            triageDecision(open.id, "Proceed", undefined, undefined, commitmentType);
            const created = useTfpStore.getState().signals.find((signal) => signal.id === open.id)?.shaping_item_id;
            setOpenId(null);
            if (created) navigate({ to: "/shaping", search: { item: created } });
            else navigate({ to: "/shaping" });
          }}
          onHold={(reason, until) => {
            triageDecision(open.id, "Hold", reason, until);
            setOpenId(null);
          }}
          onReject={(reason) => {
            triageDecision(open.id, "Reject", reason);
            setOpenId(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!bypass}
        title="Bypass inbox review?"
        description={
          bypass
            ? `Moving status from "${bypass.from}" to "${bypass.to}" is not part of the normal flow. This will be logged as an Override and added to the audit trail.`
            : ""
        }
        requireReason
        confirmLabel="Bypass and save"
        destructive
        onCancel={() => setBypass(null)}
        onConfirm={(reason) => {
          if (!bypass) return;
          const res = updateSignal(bypass.signalId, bypass.patch, { force: true, reason });
          if (res.ok) toast.success("Bypass saved — override recorded");
          else toast.error(res.error ?? "Couldn't save");
          setBypass(null);
        }}
      />
    </div>
  );
}

function InlineSelect({
  value,
  options,
  labels,
  onChange,
}: {
  value: string;
  options: string[];
  labels?: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => {
        e.stopPropagation();
        onChange(e.target.value);
      }}
      onClick={(e) => e.stopPropagation()}
      className="rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs hover:border-input focus:border-input focus:outline-none focus:ring-1 focus:ring-ring"
    >
      {options.map((o, i) => (
        <option key={o || `__empty_${i}`} value={o}>
          {labels?.[i] ?? o}
        </option>
      ))}
    </select>
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-md border border-input bg-surface px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function TriagePanel({
  signalId,
  onClose,
  onProceed,
  onHold,
  onReject,
}: {
  signalId: string;
  onClose: () => void;
  onProceed: (commitmentType: CommitmentType | null) => void;
  onHold: (reason: string, holdUntil: string) => void;
  onReject: (reason: string) => void;
}) {
  const sig = useTfpStore((s) => s.signals.find((x) => x.id === signalId))!;
  const users = useTfpStore((s) => s.users);
  const updateSignal = useTfpStore((s) => s.updateSignal);
  const reopenSignal = useTfpStore((s) => s.reopenSignal);
  const setSignalAttachments = useTfpStore((s) => s.setSignalAttachments);
  const currentUserId = useTfpStore((s) => s.currentUserId);

  // Live auto-classification suggestion (re-runs against current source + description)
  const suggestion = useMemo(
    () => classifySignal({ source: sig.source, description: sig.description }),
    [sig.source, sig.description],
  );
  const suggestedSla = useMemo(() => slaDueAt(suggestion.tier), [suggestion.tier]);
  const matchesSuggestion = sig.tier === suggestion.tier;

  function tryUpdateInPanel(patch: Partial<Signal>) {
    const res = updateSignal(sig.id, patch);
    if (res.ok) toast.success("Saved");
    else toast.error(res.error ?? "Couldn't save");
  }
  const owner = users.find((u) => u.id === sig.created_by);
  const [mode, setMode] = useState<"none" | "hold" | "reject" | "reopen">("none");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState("");
  const minReviewDate = new Date().toISOString().slice(0, 10);
  const defaultReviewDate = () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const [holdDate, setHoldDate] = useState(
    defaultReviewDate(),
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Signal>>({});
  const [commitmentType, setCommitmentType] = useState<CommitmentType | "">(suggestion.origin === "Incident" ? "Incident" : "");
  const [labelsText, setLabelsText] = useState(sig.labels.join(", "));

  const openMode = (next: typeof mode) => {
    setReason("");
    setFormError("");
    setMode(next);
    if (next === "hold") setHoldDate(defaultReviewDate());
  };

  const startEdit = () => {
    setDraft({
      title: sig.title,
      description: sig.description,
      source: sig.source,
      product: sig.product,
      tier: sig.tier,
      status: sig.status,
      owner_id: sig.owner_id,
    });
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft({});
  };
  const saveEdit = () => {
    const res = updateSignal(sig.id, draft);
    if (res.ok) {
      toast.success("Saved");
      setEditing(false);
      setDraft({});
    } else {
      toast.error(res.error ?? "Couldn't save");
    }
  };

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm" />
      <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-[520px] overflow-y-auto bg-surface shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface/90 px-5 py-3 backdrop-blur">
          <span className="font-mono text-xs text-muted-foreground">{sig.id}</span>
          <div className="flex items-center gap-1">
            {!editing ? (
              <button
                onClick={startEdit}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-muted"
                title="Edit details"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            ) : (
              <>
                <button onClick={cancelEdit} className="rounded px-2 py-1 text-xs hover:bg-muted">
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90"
                >
                  <Save className="h-3.5 w-3.5" /> Save
                </button>
              </>
            )}
            <button onClick={onClose} className="rounded p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          {!editing ? (
            <>
              <div>
                <h2 className="font-display text-xl leading-snug">{sig.title}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <TierBadge tier={sig.tier} />
                  <StatusBadge status={sig.status} />
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", priorityClasses(sig.priority))}>
                    {sig.priority ?? sig.tier}
                  </span>
                  <span className="text-xs text-muted-foreground">· {sig.source} → {sig.product}</span>
                </div>
              </div>

              <div className="rounded-md bg-muted/50 p-3 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                {sig.description}
              </div>

              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="h-3 w-3" /> Origin-based SLA suggestion
                </div>
                <div className="mt-2 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Suggested tier</span>
                    <div className="flex items-center gap-2">
                      <TierBadge tier={suggestion.tier} />
                      {sig.tier !== suggestion.tier && (
                        <button type="button" onClick={() => tryUpdateInPanel({ tier: suggestion.tier })} className="text-primary hover:underline">apply</button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Would set SLA due</span>
                    <span>{fmtDateTime(suggestedSla.toISOString())}</span>
                  </div>
                  <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">
                    <strong className="text-foreground">Why:</strong> {suggestion.reason}{matchesSuggestion && <span className="ml-1">· current values match.</span>}
                  </p>
                </div>
              </div>

              {/* Priority editor */}
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Priority</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => tryUpdateInPanel({ priority: p })}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[11px] transition",
                        (sig.priority ?? sig.tier) === p
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-surface hover:border-primary/40 hover:bg-accent/40",
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Labels</p>
                <input
                  value={labelsText}
                  onChange={(e) => {
                    setLabelsText(e.target.value);
                    tryUpdateInPanel({ labels: parseLabels(e.target.value) });
                  }}
                  placeholder="e.g. PHIPA, patient-facing"
                  className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm"
                />
                <LabelSuggestions selected={parseLabels(labelsText)} onAdd={(label) => {
                  const next = parseLabels(labelsText).includes(label) ? parseLabels(labelsText) : [...parseLabels(labelsText), label];
                  setLabelsText(next.join(", "));
                  tryUpdateInPanel({ labels: next });
                }} />
              </div>

              {/* Conflicts with committed item (moved from Intake) */}
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sig.displacement_flag}
                    onChange={(e) =>
                      tryUpdateInPanel({
                        displacement_flag: e.target.checked,
                        displacement_note: e.target.checked ? sig.displacement_note ?? "" : null,
                      })
                    }
                    className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                  />
                  <span>
                    Conflicts with a currently committed item
                    <span className="block text-[11px] text-muted-foreground">
                      Tick if accepting this signal would displace something already in this sprint.
                    </span>
                  </span>
                </label>
                {sig.displacement_flag && (
                  <input
                    value={sig.displacement_note ?? ""}
                    onChange={(e) => tryUpdateInPanel({ displacement_note: e.target.value })}
                    placeholder="Which item gets displaced?"
                    className="mt-2 w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm"
                  />
                )}
              </div>

              {/* Attachments — links + uploads */}
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Attachments</p>
                <AttachmentsField
                  attachments={sig.attachments ?? []}
                  onChange={(next) => setSignalAttachments(sig.id, next)}
                  currentUserId={currentUserId}
                  compact
                />
              </div>
            </>
          ) : (
            <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Edit details</p>
              <EditField label="Title">
                <input
                  value={draft.title ?? ""}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm"
                />
              </EditField>
              <EditField label="Description">
                <textarea
                  value={draft.description ?? ""}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={4}
                  className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm"
                />
              </EditField>
              <div className="grid grid-cols-2 gap-3">
                <EditField label="Source">
                  <SelectInput
                    value={draft.source ?? sig.source}
                    options={ALL_SOURCES}
                    onChange={(v) => setDraft({ ...draft, source: v as Source })}
                  />
                </EditField>
                <EditField label="Product">
                  <SelectInput
                    value={draft.product ?? sig.product}
                    options={ALL_PRODUCTS}
                    onChange={(v) => setDraft({ ...draft, product: v as Product })}
                  />
                </EditField>
                <EditField label="Priority tier" hint="Changing priority resets SLA">
                  <SelectInput
                    value={draft.tier ?? sig.tier}
                    options={ALL_TIERS}
                    onChange={(v) => setDraft({ ...draft, tier: v as Tier })}
                  />
                </EditField>
                <EditField label="Status" hint="Bypasses normal triage flow">
                  <SelectInput
                    value={draft.status ?? sig.status}
                    options={ALL_STATUSES}
                    onChange={(v) => setDraft({ ...draft, status: v as SignalStatus })}
                  />
                </EditField>
                <EditField label="Owner">
                  <select
                    value={draft.owner_id ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, owner_id: e.target.value === "" ? null : e.target.value })
                    }
                    className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm"
                  >
                    <option value="">— Unassigned —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </EditField>
              </div>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Detail label="Logged by" value={owner?.name ?? "—"} />
            <Detail label="Logged" value={fmtDateTime(sig.created_at)} />
            <Detail label="SLA due" value={fmtDateTime(sig.sla_due_at)} />
            <Detail label="Days in stage" value={`${daysSince(sig.created_at)} days`} />
            {sig.displacement_flag && (
              <Detail label="Displacement" value={sig.displacement_note ?? "Flagged"} />
            )}
            {sig.triage_reason && <Detail label="Reason" value={sig.triage_reason} />}
            {sig.hold_until && (
              <Detail
                label="Review on"
                value={fmtDateTime(sig.hold_until)}
              />
            )}
          </dl>

          {!editing && (sig.status === "New" || sig.status === "In Review") ? (
            <div className="rounded-lg border border-border bg-surface-2 p-4">
              <p className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                Review decision
              </p>

              <label className="mb-3 block text-xs text-muted-foreground">
                Commitment type
                <select
                  value={commitmentType}
                  onChange={(e) => {
                    const next = e.target.value as CommitmentType | "";
                    setCommitmentType(next);
                    if (next === "Incident") tryUpdateInPanel({ tier: "P1" });
                  }}
                  className="mt-1 w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm text-foreground"
                >
                  <option value="">— Select commitment type —</option>
                  {COMMITMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>

              {mode === "none" && (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => onProceed(commitmentType || null)}
                    disabled={!commitmentType}
                    className="rounded-md bg-[var(--color-status-proceed)] px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    Proceed → Shaping
                  </button>
                  <button
                    onClick={() => openMode("hold")}
                    className="rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-accent/40"
                  >
                    Hold
                  </button>
                  <button
                    onClick={() => openMode("reject")}
                    className="rounded-md border border-destructive/30 bg-surface px-3 py-2 text-sm text-destructive hover:bg-destructive/5"
                  >
                    Reject
                  </button>
                </div>
              )}

              {mode === "hold" && (
                <div className="space-y-3">
                  <label className="block text-xs text-muted-foreground">Review on
                    <input type="date" value={holdDate} min={minReviewDate} onChange={(e) => setHoldDate(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
                  </label>
                  <label className="block text-xs text-muted-foreground">Reason
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                      placeholder="Why are we holding this?"
                      className="mt-1 block w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
                  </label>
                  {formError && <p className="text-xs text-destructive">{formError}</p>}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openMode("none")} className="rounded-md px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
                    <button
                      disabled={!reason.trim()}
                      onClick={() => {
                        if (!holdDate || holdDate < minReviewDate) {
                          setFormError("Review date must be in the future");
                          return;
                        }
                        onHold(reason, new Date(holdDate).toISOString());
                      }}
                      className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
                    >
                      Place on hold
                    </button>
                  </div>
                </div>
              )}

              {mode === "reject" && (
                <div className="space-y-3">
                  <label className="block text-xs text-muted-foreground">Reason
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                      placeholder="Why are we rejecting this?"
                      className="mt-1 block w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openMode("none")} className="rounded-md px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
                    <button
                      disabled={!reason.trim()}
                      onClick={() => onReject(reason)}
                      className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground disabled:opacity-40"
                    >
                      Reject signal
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : !editing ? (
            <div className="rounded-md border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
              <p>Decision recorded: <span className="font-medium text-foreground">{sig.status}</span>. Use Edit to change details or status.</p>
              {sig.status === "Rejected" && mode === "none" && (
                <button
                  onClick={() => openMode("reopen")}
                  className="mt-3 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-accent/40"
                >
                  Reopen signal
                </button>
              )}
              {sig.status === "Rejected" && mode === "reopen" && (
                <div className="mt-3 space-y-3">
                  <label className="block text-xs text-muted-foreground">Reason for reopening
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={3}
                      placeholder="Explain what changed and why this should be reviewed again."
                      className="mt-1 block w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm text-foreground"
                    />
                  </label>
                  {formError && <p className="text-xs text-destructive">{formError}</p>}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openMode("none")} className="rounded-md px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
                    <button
                      disabled={reason.trim().length < 20}
                      onClick={() => {
                        const res = reopenSignal(sig.id, reason);
                        if (res.ok) {
                          toast.success("Signal reopened and back in review");
                          openMode("none");
                        } else {
                          setFormError(res.error ?? "Couldn't reopen signal");
                        }
                      }}
                      className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40"
                    >
                      Confirm reopen
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function EditField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground/70">{hint}</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function SelectInput({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm"
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{value}</dd>
    </>
  );
}
