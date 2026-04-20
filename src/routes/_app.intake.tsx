import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTfpStore } from "@/lib/tfp/store";
import { classifySignal, slaDueAt } from "@/lib/tfp/classify";
import type { IssueType, Product, Source, Tier } from "@/lib/tfp/types";
import { Pill, StatusBadge, TierBadge } from "@/components/tfp/Badge";
import { CheckCircle2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_app/intake")({
  component: SignalIntakePage,
});

const SOURCES: Source[] = ["Leadership", "Clinic", "Internal", "Dev Team"];
const PRODUCTS: Product[] = [
  "Otto-Onboard",
  "Otto Notes",
  "Otto Pulse",
  "FertiWise",
  "StimSmart",
  "Platform",
];
const ISSUE_TYPES: IssueType[] = [
  "Feature",
  "Bug",
  "Enhancement",
  "Leadership Input",
  "Support",
  "Incident",
];
const TIERS: Tier[] = ["T1", "T2", "T3", "T4"];

function defaultSourceForRole(role: string): Source {
  if (role === "Leadership") return "Leadership";
  if (role === "Developer" || role === "Tech Lead") return "Dev Team";
  return "Internal";
}

function SignalIntakePage() {
  const navigate = useNavigate();
  const me = useTfpStore((s) => s.users.find((u) => u.id === s.currentUserId)!);
  const createSignal = useTfpStore((s) => s.createSignal);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<Source>(defaultSourceForRole(me.role));
  const [product, setProduct] = useState<Product | null>(null);
  const [displacementFlag, setDisplacementFlag] = useState(false);
  const [displacementNote, setDisplacementNote] = useState("");
  const [overrideType, setOverrideType] = useState<IssueType | null>(null);
  const [overrideTier, setOverrideTier] = useState<Tier | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const classification = useMemo(
    () => classifySignal({ source, description }),
    [source, description],
  );
  const finalType = overrideType ?? classification.issue_type;
  const finalTier = overrideTier ?? classification.tier;
  const sla = slaDueAt(finalTier);

  const canSubmit =
    description.trim().length >= 20 && !!product && (!displacementFlag || displacementNote.trim().length > 0);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !product) return;
    const sig = createSignal({
      title: title || description.slice(0, 80),
      description,
      source,
      product,
      issue_type_override: overrideType ?? undefined,
      tier_override: overrideTier ?? undefined,
      displacement_flag: displacementFlag,
      displacement_note: displacementFlag ? displacementNote : null,
    });
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
          <div className="mt-4 flex items-center justify-center gap-2">
            {sig && <TierBadge tier={sig.tier} />}
            {sig && <StatusBadge status={sig.status} />}
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{sig?.issue_type}</span>
          </div>
          {sig?.issue_type === "Incident" && (
            <div className="mt-5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-left text-sm text-destructive">
              <strong>Incident triggered.</strong> Bazil and Waseem will receive an immediate notification.
            </div>
          )}
          <div className="mt-6 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSubmitted(null);
                setDescription("");
                setTitle("");
                setProduct(null);
                setOverrideType(null);
                setOverrideTier(null);
                setDisplacementFlag(false);
                setDisplacementNote("");
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
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        <header className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">View 1</p>
          <h1 className="mt-1 font-display text-3xl">Signal Intake</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            The single entry point for all work. Frictionless submission. No signal is ignored.
          </p>
        </header>

        <form onSubmit={onSubmit} className="tfp-card divide-y divide-border">
          <Field
            label="Title"
            hint="A short headline. Optional — we'll use the first line of your description if blank."
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="e.g. Patients can't reset password in StimSmart"
              className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>

          <Field
            label="Description"
            required
            hint={`Min 20 chars · ${description.trim().length} so far`}
            error={
              description.length > 0 && description.trim().length < 20
                ? "Add a little more detail."
                : undefined
            }
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Describe what you heard, observed, or what was asked..."
              className="w-full resize-y rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>

          <Field label="Source" required>
            <div className="flex flex-wrap gap-2">
              {SOURCES.map((s) => (
                <Pill key={s} active={source === s} onClick={() => setSource(s)}>
                  {s}
                </Pill>
              ))}
            </div>
          </Field>

          <Field label="Product" required>
            <div className="flex flex-wrap gap-2">
              {PRODUCTS.map((p) => (
                <Pill key={p} active={product === p} onClick={() => setProduct(p)}>
                  {p}
                </Pill>
              ))}
            </div>
          </Field>

          <Field
            label="Conflicts with a committed item?"
            hint="Tick if this signal would displace something already in this sprint."
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={displacementFlag}
                onChange={(e) => setDisplacementFlag(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              This signal conflicts with a currently committed item.
            </label>
            {displacementFlag && (
              <input
                value={displacementNote}
                onChange={(e) => setDisplacementNote(e.target.value)}
                placeholder="Which item?"
                className="mt-2 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            )}
          </Field>

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

      {/* Live classification */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="tfp-card p-5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Auto-classification
          </div>

          {!description || description.trim().length < 5 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Pick a source and start typing — the type and SLA tier will appear here.
            </p>
          ) : (
            <>
              <div className="mt-4 space-y-3">
                <Row label="Issue type">
                  <select
                    value={finalType}
                    onChange={(e) => setOverrideType(e.target.value as IssueType)}
                    className="rounded-md border border-input bg-surface px-2 py-1 text-sm"
                  >
                    {ISSUE_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Row>
                <Row label="SLA tier">
                  <div className="flex items-center gap-2">
                    <TierBadge tier={finalTier} />
                    <select
                      value={finalTier}
                      onChange={(e) => setOverrideTier(e.target.value as Tier)}
                      className="rounded-md border border-input bg-surface px-2 py-1 text-xs"
                    >
                      {TIERS.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </Row>
                <Row label="Due by">
                  <span className="text-sm text-foreground">{fmtDateTime(sla.toISOString())}</span>
                </Row>
                {classification.labels.length > 0 && (
                  <Row label="Labels">
                    <div className="flex gap-1">
                      {classification.labels.map((l) => (
                        <span key={l} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {l}
                        </span>
                      ))}
                    </div>
                  </Row>
                )}
              </div>
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                <strong className="text-foreground">Why:</strong> {classification.reason}
              </p>
              {(overrideType || overrideTier) && (
                <button
                  type="button"
                  onClick={() => {
                    setOverrideType(null);
                    setOverrideTier(null);
                  }}
                  className="mt-3 text-xs text-primary hover:underline"
                >
                  Reset to auto-classification
                </button>
              )}
            </>
          )}
        </div>
      </aside>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
