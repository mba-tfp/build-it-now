import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useTfpStore } from "@/lib/tfp/store";
import { fmtDateTime } from "@/lib/tfp/format";
import type { Attachment, IntakePriority, Product, Source } from "@/lib/tfp/types";
import { StatusBadge, TierBadge } from "@/components/tfp/Badge";
import { MultiSelectPills } from "@/components/tfp/MultiSelectPills";
import { AttachmentsField } from "@/components/tfp/AttachmentsField";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_app/intake")({
  component: SignalIntakePage,
});

const SOURCES: readonly Source[] = ["Leadership", "Clinic", "Internal", "Dev Team"];
const PRODUCTS: readonly Product[] = [
  "Otto-Onboard",
  "Otto Notes",
  "Otto Pulse",
  "FertiWise",
  "StimSmart",
  "Platform",
];
const PRIORITIES: IntakePriority[] = ["Must have", "Nice to have", "Food for thought"];

function defaultSourceForRole(role: string): Source {
  if (role === "Leadership") return "Leadership";
  if (role === "Developer" || role === "Tech Lead") return "Dev Team";
  return "Internal";
}

function SignalIntakePage() {
  const navigate = useNavigate();
  const me = useTfpStore((s) => s.users.find((u) => u.id === s.currentUserId)!);
  const currentUserId = useTfpStore((s) => s.currentUserId);
  const createSignal = useTfpStore((s) => s.createSignal);
  const updateSignal = useTfpStore((s) => s.updateSignal);
  const setSignalAttachments = useTfpStore((s) => s.setSignalAttachments);
  const flags = useTfpStore((s) => s.flags);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sources, setSources] = useState<Source[]>([defaultSourceForRole(me.role)]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priority, setPriority] = useState<IntakePriority>("Nice to have");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const primarySource = sources[0] ?? defaultSourceForRole(me.role);
  const primaryProduct = products[0] ?? null;

  const titleOk = title.trim().length >= 3;
  const descOk = description.trim().length >= 20;

  const canSubmit = titleOk && descOk && sources.length > 0 && !!primaryProduct;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !primaryProduct) return;
    const sig = createSignal({
      title: title.trim(),
      description,
      source: primarySource,
      product: primaryProduct,
      displacement_flag: false,
      displacement_note: null,
      priority,
    });
    const additional_sources = sources.slice(1);
    const additional_products = products.slice(1);
    if (additional_sources.length > 0 || additional_products.length > 0) {
      updateSignal(sig.id, { additional_sources, additional_products });
    }
    if (pendingAttachments.length > 0) {
      setSignalAttachments(sig.id, pendingAttachments);
    }
    toast.success("Signal logged", { description: sig.id });
    setSubmitted(sig.id);
  }

  if (submitted) {
    const sig = useTfpStore.getState().signals.find((s) => s.id === submitted);
    return (
      <div className="mx-auto max-w-2xl">
        <div className="tfp-card p-8 text-center">
          <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="font-display text-2xl">Signal logged</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ID <span className="font-mono text-foreground">{sig?.id}</span> · SLA due{" "}
            {sig && fmtDateTime(sig.sla_due_at)}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {sig && <TierBadge tier={sig.tier} />}
            {sig && <StatusBadge status={sig.status} />}
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{sig?.issue_type}</span>
            {sig?.priority && (
              <span className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs">{sig.priority}</span>
            )}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Type and SLA tier will be confirmed in Triage.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSubmitted(null);
                setDescription("");
                setTitle("");
                setProducts([]);
                setPriority("Nice to have");
                setPendingAttachments([]);
              }}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-accent/40"
            >
              Log another signal
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: "/triage" })}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
            >
              Open Triage Queue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">View 1</p>
        <h1 className="mt-1 font-display text-3xl">Signal Intake</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          The single entry point for all work. Frictionless submission. Type and tier are decided in Triage.
        </p>
      </header>

      <form onSubmit={onSubmit} className="tfp-card divide-y divide-border">
        <Field
          label="Title"
          required
          hint={`Min 3 chars · ${title.trim().length} so far`}
          error={title.length > 0 && !titleOk ? "Title is required." : undefined}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="e.g. Patients can't reset password in StimSmart"
            suppressHydrationWarning
            className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>

        <Field
          label="Description"
          required
          hint={`Min 20 chars · ${description.trim().length} so far`}
          error={
            description.length > 0 && !descOk ? "Add a little more detail." : undefined
          }
        >
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="Describe what you heard, observed, or what was asked..."
            suppressHydrationWarning
            className="w-full resize-y rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>

        <Field
          label="Source"
          required
          hint={
            flags.multiSelectIntake
              ? "Tap to toggle. The first selected source is treated as primary for SLA routing."
              : undefined
          }
        >
          <MultiSelectPills options={SOURCES} selected={sources} onChange={setSources} primaryLabel="Primary" />
        </Field>

        <Field
          label="Product"
          required
          hint={
            flags.multiSelectIntake
              ? "Pick one or more. The first selected product is treated as primary."
              : undefined
          }
        >
          <MultiSelectPills options={PRODUCTS} selected={products} onChange={setProducts} primaryLabel="Primary" />
        </Field>

        <Field
          label="Priority"
          required
          hint="How important does the requester think this is? Triage may adjust."
        >
          <div className="flex flex-wrap gap-2">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm transition",
                  priority === p
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface hover:border-primary/40 hover:bg-accent/40",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </Field>

        {flags.attachmentsEnabled && (
          <Field label="Attachments" hint="Add reference links or upload screenshots, PDFs, docs.">
            <AttachmentsField
              attachments={pendingAttachments}
              onChange={setPendingAttachments}
              currentUserId={currentUserId}
              compact
            />
          </Field>
        )}

        <div className="flex items-center justify-between gap-3 p-5">
          <p className="text-xs text-muted-foreground">
            You're logging this as <span className="font-medium text-foreground">{me.name}</span> ({me.role}).
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Log signal
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-5">
      <label className="mb-2 flex items-baseline justify-between gap-2 text-sm font-medium">
        <span>
          {label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </span>
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}
