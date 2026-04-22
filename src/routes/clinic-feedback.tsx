import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTfpStore } from "@/lib/tfp/store";
import { Activity, Check } from "lucide-react";

export const Route = createFileRoute("/clinic-feedback")({
  component: ClinicFeedbackPage,
});

function ClinicFeedbackPage() {
  const clinics = useTfpStore((s) => s.clinics.filter((c) => c.status === "Active"));
  const submit = useTfpStore((s) => s.submitClinicFeedback);
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [done, setDone] = useState<null | { rateLimited: boolean }>(null);

  const valid = clinicId && name.trim() && description.trim().length >= 20;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const clinic = clinics.find((c) => c.id === clinicId);
    if (!clinic) return;
    const result = submit({
      clinic_id: clinicId,
      clinic_name: clinic.name,
      reporter_name: name.trim(),
      description: description.trim(),
      urgent,
    });
    setDone({ rateLimited: !result.ok });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-surface/85">
        <div className="mx-auto max-w-2xl px-6 py-4 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="leading-tight">
            <div className="font-display text-[15px] tracking-tight">TFP OS</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Clinic Feedback</div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-6 py-12 flex-1">
        {done ? (
          <div className="tfp-card p-8 text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]">
              <Check className="h-6 w-6" />
            </div>
            <h2 className="font-display text-2xl">Thank you</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {done.rateLimited
                ? "Your feedback has been received — please allow the team time to review before submitting again."
                : "Your feedback has been received. The TFP product team will review it shortly."}
            </p>
            <button
              onClick={() => {
                setDone(null);
                setName("");
                setDescription("");
                setUrgent(false);
              }}
              className="mt-6 text-sm text-primary hover:underline"
            >
              Submit another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="tfp-card p-8 space-y-5">
            <div>
              <h1 className="font-display text-2xl">Clinic feedback</h1>
              <p className="mt-1 text-sm text-muted-foreground">Tell the TFP product team what's working — or what isn't.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Clinic</label>
              <select value={clinicId} onChange={(e) => setClinicId(e.target.value)} className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm">
                {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Your name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Description (min 20 chars)</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} required minLength={20} className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm" />
              <div className="mt-1 text-right text-xs text-muted-foreground">{description.length}/20</div>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Urgency</label>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" name="urgency" checked={!urgent} onChange={() => setUrgent(false)} className="mt-1" />
                  <span><strong>Routine</strong> — something to improve</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" name="urgency" checked={urgent} onChange={() => setUrgent(true)} className="mt-1" />
                  <span><strong>Urgent</strong> — something is broken</span>
                </label>
              </div>
            </div>
            <button
              type="submit"
              disabled={!valid}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              Submit to TFP Product Team
            </button>
          </form>
        )}
      </main>

      <footer className="border-t border-border bg-surface/40 py-4 text-center text-[11px] text-muted-foreground">
        The Fertility Partners · Internal Product Team
      </footer>
    </div>
  );
}
