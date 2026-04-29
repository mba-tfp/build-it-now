import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { USERS, useTfpStore } from "@/lib/tfp/store";
import type { CommsChannel, CommsStatus, CommsType, Product } from "@/lib/tfp/types";
import { fmtDateTime } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import { Check, Mail, MessageSquare, Phone, Plus, Radio, Send, X } from "lucide-react";
import { SortMenu, useSortMenu } from "@/components/tfp/SortMenu";
import { sortRows } from "@/components/tfp/SortableHeader";
import { ScrollTable } from "@/components/tfp/ScrollTable";


export const Route = createFileRoute("/_app/comms")({
  component: () => <Navigate to="/governance" search={{ tab: "comms" }} />,
});

const CHANNELS: CommsChannel[] = ["Email", "In-app banner", "Teams", "Phone"];
const PRODUCTS: Product[] = ["Otto-Onboard", "Otto Notes", "Otto Pulse", "FertiWise", "StimSmart", "Platform"];

const STATUS_TONE: Record<CommsStatus, string> = {
  Draft: "bg-muted text-muted-foreground",
  "Pending Approval": "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]",
  Approved: "bg-[var(--color-status-new)]/10 text-[var(--color-status-new)]",
  Sent: "bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]",
  Rejected: "bg-destructive/10 text-destructive",
};

const CHANNEL_ICON: Record<CommsChannel, typeof Mail> = {
  Email: Mail,
  "In-app banner": Radio,
  Teams: MessageSquare,
  Phone: Phone,
};

export function CommsPage() {
  const comms = useTfpStore((s) => s.comms);
  const me = useTfpStore((s) => s.currentUserId);
  const meUser = USERS.find((u) => u.id === me)!;
  const create = useTfpStore((s) => s.createComms);
  const submit = useTfpStore((s) => s.submitCommsForApproval);
  const approve = useTfpStore((s) => s.approveComms);
  const reject = useTfpStore((s) => s.rejectComms);
  const send = useTfpStore((s) => s.sendComms);
  const demoModeEnabled = useTfpStore((s) => s.flags.demoModeEnabled);
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);

  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState<CommsStatus | "All">("All");

  type SortKey = "drafted_at" | "status" | "product" | "channel";
  const { sort, setSort } = useSortMenu<SortKey>("comms", { key: "drafted_at", dir: "desc" });

  const filtered = useMemo(() => {
    const base = comms.filter((c) => filter === "All" || c.status === filter);
    return sortRows(base, sort, (c, k) => {
      if (k === "drafted_at") return new Date(c.drafted_at).getTime();
      if (k === "status") return c.status;
      if (k === "product") return c.product;
      if (k === "channel") return c.channel;
      return null;
    });
  }, [comms, filter, sort]);

  const counts: Record<CommsStatus | "All", number> = {
    All: comms.length,
    Draft: comms.filter((c) => c.status === "Draft").length,
    "Pending Approval": comms.filter((c) => c.status === "Pending Approval").length,
    Approved: comms.filter((c) => c.status === "Approved").length,
    Sent: comms.filter((c) => c.status === "Sent").length,
    Rejected: comms.filter((c) => c.status === "Rejected").length,
  };

  const canApprove = ["PM", "Senior PM"].includes(meUser.role);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Support</p>
          <h1 className="mt-1 font-display text-3xl">Clinic Comms Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sami drafts → PM approval → sent. Every external clinic message tracked.
          </p>
        </div>
        <button
          onClick={() => setComposing((c) => !c)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
        >
          {composing ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {composing ? "Cancel" : "Draft comms"}
        </button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["All", "Draft", "Pending Approval", "Approved", "Sent", "Rejected"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s as CommsStatus | "All")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              filter === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface hover:border-primary/40",
            )}
          >
            {s} ({counts[s]})
          </button>
        ))}
        <SortMenu
          className="ml-auto"
          tableId="comms"
          sort={sort}
          onChange={setSort}
          options={[
            { key: "drafted_at", label: "Drafted" },
            { key: "status", label: "Status" },
            { key: "product", label: "Product" },
            { key: "channel", label: "Channel" },
          ]}
        />
      </div>

      {composing && <Compose create={create} onDone={() => setComposing(false)} />}

      <ScrollTable className="border border-border bg-surface/40">
        <div className="space-y-3 p-3">
        {filtered.length === 0 && (
          <div className="tfp-card p-12 text-center text-sm text-muted-foreground">No comms in this state.</div>
        )}
        {filtered.map((c) => {
          const Icon = CHANNEL_ICON[c.channel];
          const drafter = USERS.find((u) => u.id === c.drafted_by);
          const approver = c.approved_by ? USERS.find((u) => u.id === c.approved_by) : null;
          const linkedSh = c.linked_shaping_id ? shaping.find((s) => s.id === c.linked_shaping_id) : null;
          const linkedSig = linkedSh ? signals.find((s) => s.id === linkedSh.signal_id) : null;
          return (
            <div key={c.id} className="tfp-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-[300px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium">{c.subject}</h3>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[c.status])}>
                      {c.status}
                    </span>
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {c.comms_type}
                    </span>
                    {!c.requires_pm_approval && c.status === "Draft" && (
                      <span className="rounded-full bg-[var(--color-status-proceed)]/10 px-2 py-0.5 text-[11px] text-[var(--color-status-proceed)]">
                        No approval required
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.product} · {c.channel} · {c.audience}
                  </p>
                  <pre className="mt-3 whitespace-pre-wrap rounded-md bg-surface-2 p-3 font-sans text-sm">{c.body}</pre>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Drafted by {drafter?.name} · {fmtDateTime(c.drafted_at)}
                    {approver && ` · Approved by ${approver.name} · ${fmtDateTime(c.approved_at!)}`}
                    {c.sent_at && ` · Sent ${fmtDateTime(c.sent_at)}`}
                    {linkedSig && ` · Linked: ${linkedSig.title}`}
                  </p>
                  {c.rejected_reason && (
                    <p className="mt-1 text-xs text-destructive">Rejected: {c.rejected_reason}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  {c.status === "Draft" && c.drafted_by === me && c.requires_pm_approval && (
                    <button onClick={() => submit(c.id)} className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground">
                      Submit for approval
                    </button>
                  )}
                  {c.status === "Draft" && c.drafted_by === me && !c.requires_pm_approval && (
                    <button onClick={() => send(c.id)} className="inline-flex items-center gap-1 rounded-md bg-[var(--color-status-proceed)] px-2.5 py-1 text-xs text-primary-foreground hover:opacity-90">
                      <Send className="h-3 w-3" /> Send directly
                    </button>
                  )}
                  {c.status === "Pending Approval" && demoModeEnabled && c.drafted_by === me && (
                    <button onClick={() => approve(c.id)} className="inline-flex items-center gap-1 rounded-md bg-[var(--color-status-hold)] px-2.5 py-1 text-xs text-primary-foreground hover:opacity-90">
                      <Check className="h-3 w-3" /> Approve (demo mode)
                    </button>
                  )}
                  {c.status === "Pending Approval" && canApprove && (!demoModeEnabled || c.drafted_by !== me) && (
                    <>
                      <button onClick={() => approve(c.id)} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-primary/90">
                        <Check className="h-3 w-3" /> Approve
                      </button>
                      <button
                        onClick={() => {
                          const r = window.prompt("Reason for rejection?");
                          if (r) reject(c.id, r);
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <X className="h-3 w-3" /> Reject
                      </button>
                    </>
                  )}
                  {c.status === "Approved" && (
                    <button onClick={() => send(c.id)} className="inline-flex items-center gap-1 rounded-md bg-[var(--color-status-proceed)] px-2.5 py-1 text-xs text-primary-foreground hover:opacity-90">
                      <Send className="h-3 w-3" /> Mark sent
                    </button>
                  )}
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

function Compose({
  create,
  onDone,
}: {
  create: ReturnType<typeof useTfpStore.getState>["createComms"];
  onDone: () => void;
}) {
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const [product, setProduct] = useState<Product>("Otto Notes");
  const [channel, setChannel] = useState<CommsChannel>("Email");
  const [audience, setAudience] = useState("All clinics");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [linkedShaping, setLinkedShaping] = useState("");
  const [commsType, setCommsType] = useState<CommsType>("Go-live update");

  const COMMS_TYPES: CommsType[] = [
    "Delay notification",
    "Incident update",
    "Incident all-clear",
    "Go-live update",
    "Postponement",
    "Scope change",
  ];

  return (
    <div className="mb-6 tfp-card p-5">
      <h3 className="font-display text-lg">Draft new comms</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Product">
          <select value={product} onChange={(e) => setProduct(e.target.value as Product)} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm">
            {PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Channel">
          <select value={channel} onChange={(e) => setChannel(e.target.value as CommsChannel)} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm">
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Comms type">
          <select value={commsType} onChange={(e) => setCommsType(e.target.value as CommsType)} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm">
            {COMMS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Audience">
          <input value={audience} onChange={(e) => setAudience(e.target.value)} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
        </Field>
        <Field label="Linked delivery item (optional)">
          <select value={linkedShaping} onChange={(e) => setLinkedShaping(e.target.value)} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm">
            <option value="">—</option>
            {shaping.filter((s) => s.delivery_status).map((s) => {
              const sig = signals.find((x) => x.id === s.signal_id);
              return <option key={s.id} value={s.id}>{sig?.title ?? s.id}</option>;
            })}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Subject">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Body">
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm" />
          </Field>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onDone} className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm">Cancel</button>
        <button
          disabled={!subject.trim() || !body.trim()}
          onClick={() => {
            create({
              product,
              channel,
              audience,
              subject,
              body,
              linked_shaping_id: linkedShaping || null,
              comms_type: commsType,
            });
            onDone();
          }}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Save draft
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
