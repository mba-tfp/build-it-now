import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Flag, Lock, Plus, Radio, X } from "lucide-react";
import { toast } from "sonner";
import { USERS, daysSince, useTfpStore } from "@/lib/tfp/store";
import { fmtDate } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import type { GoLiveChecklist, Product } from "@/lib/tfp/types";

export const Route = createFileRoute("/_app/clinics")({
  component: ClinicsPage,
});

type Integration = "eIVF" | "EngagedMD" | "Google Analytics" | "Accuro/IDEAS/Oscar";
type Phase = { id: 1 | 2 | 3 | 4; title: string; items: string[] };

const PHASES: Phase[] = [
  {
    id: 1,
    title: "Discovery and Configuration",
    items: [
      "1. Initial workflow discussion with the clinic",
      "2. Create workflow requirements document",
      "3. Obtain health forms from the clinic",
      "4. Align with physicians on health form content",
      "5. Gather all required configuration items",
      "6. Configure workflows, forms, and templates in CNP",
    ],
  },
  {
    id: 2,
    title: "Pre-Production Validation",
    items: [
      "7. Prepare pre-production environment with configuration",
      "8. Product validation of configurations (internal TFP review)",
      "9. Get email content validated (clinic approval)",
      "10. Walk through pre-prod workflow with clinic and gather feedback",
      "11. Implement clinic feedback",
      "12. Get consents and privacy policy through Legal",
      "13. Clinic UAT — minimum 2-3 scenarios tested by clinic staff",
    ],
  },
  {
    id: 3,
    title: "Go-Live Preparation",
    items: [
      "14. Decide on go-live date (confirmed with clinic)",
      "15. Prepare production environment",
      "16a. Complete eIVF integration",
      "16b. Complete EngagedMD integration",
      "16c. Complete Google Analytics integration",
      "16d. Complete Accuro / IDEAS / Oscar / other EMR integration",
    ],
  },
  {
    id: 4,
    title: "Go-Live Execution",
    items: [
      "17. Final testing in production",
      "18. Define go-live plan (roles, timing, rollback criteria)",
      "19. Go-live execution",
      "20. Post-launch follow-up with clinic within 48 hours",
    ],
  },
];

const ALL_ITEMS = PHASES.flatMap((phase) => phase.items);
const INTEGRATION_ITEM: Record<Integration, string> = {
  eIVF: "16a. Complete eIVF integration",
  EngagedMD: "16b. Complete EngagedMD integration",
  "Google Analytics": "16c. Complete Google Analytics integration",
  "Accuro/IDEAS/Oscar": "16d. Complete Accuro / IDEAS / Oscar / other EMR integration",
};

function ClinicsPage() {
  const goLives = useTfpStore((s) => s.goLives);
  const toggleCriterion = useTfpStore((s) => s.toggleGoLiveCriterion);
  const toggleWarRoom = useTfpStore((s) => s.toggleGoLiveWarRoom);
  const setDecision = useTfpStore((s) => s.setGoLiveDecision);
  const upsertGoLive = useTfpStore((s) => s.upsertGoLive);
  const pushNotification = useTfpStore((s) => s.pushNotification);
  const currentUserId = useTfpStore((s) => s.currentUserId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pushed, setPushed] = useState<Record<string, boolean>>({});
  const [nogoFor, setNogoFor] = useState<string | null>(null);
  const [nogoReason, setNogoReason] = useState("");

  const selected = selectedId ? goLives.find((clinic) => clinic.id === selectedId) ?? null : null;
  const clinics = useMemo(() => [...goLives].sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()), [goLives]);

  function handleWarRoom(clinic: GoLiveChecklist) {
    const activating = !clinic.war_room;
    toggleWarRoom(clinic.id);
    if (activating) {
      ["u-shahid", "u-waseem"].forEach((userId) => {
        pushNotification({
          trigger: "golive_unconfirmed",
          title: `${clinicName(clinic)} war-room mode activated`,
          body: `${clinicName(clinic)}: War-room mode activated.`,
          link_to: "/clinics",
          for_user_id: userId,
          entity_id: clinic.id,
        });
      });
      toast.error("War-room mode activated", { description: `${clinicName(clinic)} notification sent to Shahid bhai and Waseem.` });
    }
  }

  function toggleItem(clinic: GoLiveChecklist, item: string, done: boolean) {
    const flag = procreaFlag(clinic, item);
    const noteKey = `${clinic.id}:${item}`;
    if (done && flag && !notes[noteKey]?.trim() && !clinic.criteria[item]?.note.trim()) {
      toast.error("Compliance note required", { description: flag });
      return;
    }
    toggleCriterion(clinic.id, item, done, notes[noteKey]?.trim());
    setNotes((current) => ({ ...current, [noteKey]: "" }));
  }

  function pushPhase(clinic: GoLiveChecklist, phase: Phase) {
    phase.items.forEach(() => toast.success(`${nextJiraKey()} created`));
    setPushed((current) => ({ ...current, [`${clinic.id}:${phase.id}`]: true }));
  }

  function reopenDecision(clinic: GoLiveChecklist) {
    useTfpStore.setState((state) => ({
      goLives: state.goLives.map((item) => item.id === clinic.id ? { ...item, go_no_go_decision: null, go_no_go_by: null, go_no_go_at: null, status: "In Progress", updated_at: new Date().toISOString() } : item),
    }));
    toast.success("Decision reopened");
  }

  function recordNoGo() {
    if (!nogoFor || !nogoReason.trim()) return;
    setDecision(nogoFor, "No-Go");
    useTfpStore.setState((state) => ({
      goLives: state.goLives.map((item) => item.id === nogoFor ? { ...item, status: "In Progress", updated_at: new Date().toISOString() } : item),
    }));
    toast.error("No-Go recorded", { description: nogoReason.trim() });
    setNogoFor(null);
    setNogoReason("");
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Clinics</p>
          <h1 className="mt-1 font-display text-3xl">Clinic Onboarding</h1>
          <p className="mt-1 text-sm text-muted-foreground">Four-phase clinic readiness checklist from discovery to launch.</p>
        </div>
        <button onClick={() => setNewOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-3.5 w-3.5" /> New clinic
        </button>
      </header>

      {!selected && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clinics.map((clinic) => {
            const phase = currentPhase(clinic);
            const progress = phase ? phaseProgress(clinic, phase) : null;
            const phaseStart = phase ? phaseStartDate(clinic, phase) : clinic.updated_at;
            return (
              <section key={clinic.id} className={cn("tfp-card p-5", clinic.war_room && "border-destructive/60 ring-2 ring-destructive/10")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl">{clinicName(clinic)}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Target {fmtDate(clinic.scheduled_for)}</p>
                  </div>
                  {clinic.war_room && <Badge tone="bad"><Radio className="mr-1 h-3 w-3" /> War room</Badge>}
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <Row label="Current phase" value={phase ? `Phase ${phase.id}` : "Live"} />
                  <Row label="Phase progress" value={progress ? `${progress.done} of ${progress.total}` : "Complete"} />
                  <Row label="Days in phase" value={`${daysSince(phaseStart)}d`} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {clinic.go_no_go_decision && <DecisionBadge decision={clinic.go_no_go_decision} />}
                  {!clinic.go_no_go_decision && <Badge tone="muted">No decision</Badge>}
                </div>
                <button onClick={() => setSelectedId(clinic.id)} className="mt-4 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">View checklist</button>
              </section>
            );
          })}
        </div>
      )}

      {selected && (
        <section className={cn("tfp-card p-5", selected.war_room && "border-destructive/60 ring-2 ring-destructive/10")}>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <button onClick={() => setSelectedId(null)} className="mb-3 text-xs text-muted-foreground hover:text-foreground">← Back to clinics</button>
              <h2 className="font-display text-2xl">{clinicName(selected)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Scheduled for {fmtDate(selected.scheduled_for)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => handleWarRoom(selected)} className={cn("inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium", selected.war_room ? "border-destructive bg-destructive/10 text-destructive" : "border-input bg-surface hover:bg-muted")}><Radio className="h-3.5 w-3.5" /> War room</button>
              {selected.go_no_go_decision && <button onClick={() => reopenDecision(selected)} className="rounded-md border border-input bg-surface px-3 py-1.5 text-xs font-medium hover:bg-muted">Reopen</button>}
            </div>
          </div>

          <div className="space-y-5">
            {PHASES.map((phase) => {
              const locked = isPhaseLocked(selected, phase.id);
              const progress = phaseProgress(selected, phase);
              const complete = progress.done === progress.total;
              const pushKey = `${selected.id}:${phase.id}`;
              return (
                <section key={phase.id} className={cn("rounded-md border border-border bg-surface p-4", locked && "bg-muted/30")}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg">Phase {phase.id} — {phase.title}</h3>
                      <p className="text-xs text-muted-foreground">{progress.done} of {progress.total} complete</p>
                    </div>
                    {locked ? <Badge tone="muted"><Lock className="mr-1 h-3 w-3" /> Complete Phase {phase.id - 1} first</Badge> : complete && <Badge tone="good"><CheckCircle2 className="mr-1 h-3 w-3" /> Complete</Badge>}
                  </div>

                  <div className="space-y-2">
                    {phase.items.map((item) => {
                      const state = selected.criteria[item] ?? { done: false, note: "", checked_by: null, checked_at: null };
                      const disabled = isNotApplicable(state.note);
                      const flag = procreaFlag(selected, item);
                      const noteKey = `${selected.id}:${item}`;
                      return (
                        <div key={item} className={cn("rounded-md border border-border bg-background p-3", disabled && "opacity-55")}>
                          <label className="flex items-start gap-3">
                            <input type="checkbox" checked={state.done} disabled={locked || disabled} onChange={(event) => toggleItem(selected, item, event.target.checked)} className="mt-1 h-4 w-4" />
                            <div className="flex-1">
                              <p className={cn("text-sm font-medium", state.done && "line-through text-muted-foreground")}>{item}</p>
                              {disabled && <p className="mt-1 text-xs text-muted-foreground">Not applicable for this clinic.</p>}
                              {flag && <p className="mt-2 rounded-md border border-[var(--color-status-hold)]/30 bg-[var(--color-status-hold)]/10 px-2 py-1 text-xs text-[var(--color-status-hold)]"><Flag className="mr-1 inline h-3 w-3" />{flag}</p>}
                              {(flag || state.note) && !disabled && (
                                <input value={notes[noteKey] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [noteKey]: event.target.value }))} placeholder={state.note || "Compliance note…"} className="mt-2 w-full rounded-md border border-input bg-surface px-2 py-1.5 text-xs" />
                              )}
                              {state.note && <p className="mt-1 text-xs text-muted-foreground">Note: {state.note}</p>}
                            </div>
                          </label>
                        </div>
                      );
                    })}
                  </div>

                  {!locked && complete && !pushed[pushKey] && (
                    <button onClick={() => pushPhase(selected, phase)} className="mt-3 rounded-md border border-input bg-surface px-3 py-1.5 text-xs font-medium hover:bg-muted">Push phase items to Jira</button>
                  )}
                </section>
              );
            })}
          </div>

          <div className="mt-5 rounded-md border border-border bg-surface p-4">
            <h3 className="font-display text-lg">Go/No-Go decision</h3>
            {selected.go_no_go_decision ? (
              <div className="mt-3 flex items-center gap-3"><DecisionBadge decision={selected.go_no_go_decision} /><span className="text-xs text-muted-foreground">Recorded {selected.go_no_go_at ? fmtDate(selected.go_no_go_at) : "today"}</span></div>
            ) : phaseProgress(selected, PHASES[2]).done === phaseProgress(selected, PHASES[2]).total ? (
              <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => setDecision(selected.id, "Go")} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Go</button><button onClick={() => setNogoFor(selected.id)} className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10">No-Go</button></div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Complete Phase 3 before recording Go/No-Go.</p>
            )}
          </div>
        </section>
      )}

      {newOpen && <NewClinicModal onClose={() => setNewOpen(false)} onCreate={(data) => { const created = upsertGoLive(data); setSelectedId(created.id); setNewOpen(false); }} />}
      {nogoFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl">
            <h3 className="font-display text-lg">Record No-Go</h3>
            <textarea value={nogoReason} onChange={(event) => setNogoReason(event.target.value)} placeholder="Reason required…" className="mt-3 min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <div className="mt-4 flex justify-end gap-2"><button onClick={() => setNogoFor(null)} className="rounded-md border border-input px-3 py-1.5 text-sm">Cancel</button><button disabled={!nogoReason.trim()} onClick={recordNoGo} className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground disabled:opacity-50">Record No-Go</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewClinicModal({ onClose, onCreate }: { onClose: () => void; onCreate: (data: Parameters<ReturnType<typeof useTfpStore.getState>["upsertGoLive"]>[0]) => void }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(() => new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [integrations, setIntegrations] = useState<Integration[]>(["Google Analytics"]);
  const valid = name.trim() && date;

  function toggleIntegration(item: Integration) {
    setIntegrations((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  }

  function save() {
    const criteria = buildCriteria(new Set(integrations));
    onCreate({ shaping_id: "clinic-" + Date.now().toString(36), product: "Otto-Onboard" as Product, release_name: name.trim(), scheduled_for: new Date(`${date}T12:00:00.000Z`).toISOString(), criteria, status: "Not Started", war_room: false });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-lg border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-center justify-between"><h3 className="font-display text-lg">New clinic</h3><button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Clinic name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" /></label>
          <label className="text-sm">Go-live target date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" /></label>
        </div>
        <div className="mt-4"><p className="mb-2 text-sm font-medium">Applicable integrations</p><div className="grid gap-2 sm:grid-cols-2">{(Object.keys(INTEGRATION_ITEM) as Integration[]).map((item) => <label key={item} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"><input type="checkbox" checked={integrations.includes(item)} onChange={() => toggleIntegration(item)} />{item}</label>)}</div></div>
        <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-md border border-input px-3 py-1.5 text-sm">Cancel</button><button disabled={!valid} onClick={save} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">Create clinic</button></div>
      </div>
    </div>
  );
}

function buildCriteria(applicable: Set<Integration>) {
  const criteria: GoLiveChecklist["criteria"] = {};
  ALL_ITEMS.forEach((item) => {
    const integration = (Object.entries(INTEGRATION_ITEM) as Array<[Integration, string]>).find(([, label]) => label === item)?.[0];
    criteria[item] = { done: false, note: integration && !applicable.has(integration) ? "[Not applicable]" : "", checked_by: null, checked_at: null };
  });
  return criteria;
}

function currentPhase(clinic: GoLiveChecklist) {
  if (clinic.status === "Live" || ALL_ITEMS.every((item) => clinic.criteria[item]?.done || isNotApplicable(clinic.criteria[item]?.note))) return null;
  return PHASES.find((phase) => phase.items.some((item) => !clinic.criteria[item]?.done && !isNotApplicable(clinic.criteria[item]?.note))) ?? PHASES[0];
}

function phaseProgress(clinic: GoLiveChecklist, phase: Phase) {
  const applicable = phase.items.filter((item) => !isNotApplicable(clinic.criteria[item]?.note));
  return { done: applicable.filter((item) => clinic.criteria[item]?.done).length, total: applicable.length };
}

function isPhaseLocked(clinic: GoLiveChecklist, phaseId: number) {
  if (phaseId === 1) return false;
  return PHASES.filter((phase) => phase.id < phaseId).some((phase) => {
    const progress = phaseProgress(clinic, phase);
    return progress.done < progress.total;
  });
}

function phaseStartDate(clinic: GoLiveChecklist, phase: Phase) {
  const previous = PHASES.filter((p) => p.id < phase.id).flatMap((p) => p.items).map((item) => clinic.criteria[item]?.checked_at).filter((date): date is string => Boolean(date)).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  return previous ?? clinic.created_at;
}

function procreaFlag(clinic: GoLiveChecklist, item: string) {
  if (!clinicName(clinic).toLowerCase().includes("procrea qc")) return null;
  if (item.startsWith("12.")) return "French language review required + Law 25 (Quebec) compliance sign-off needed before closing.";
  if (item.startsWith("16")) return "French language review required for all integration documentation.";
  return null;
}

function isNotApplicable(note: string | undefined) {
  return Boolean(note?.includes("[Not applicable]"));
}

function clinicName(clinic: GoLiveChecklist) {
  return clinic.release_name.replace(/\s*Go-Live\s*/i, "").trim();
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}

function Badge({ tone, children }: { tone: "good" | "warn" | "bad" | "muted"; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", tone === "good" && "border-[var(--color-status-proceed)]/30 bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]", tone === "warn" && "border-[var(--color-status-hold)]/30 bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]", tone === "bad" && "border-destructive/30 bg-destructive/10 text-destructive", tone === "muted" && "border-border bg-muted text-muted-foreground")}>{children}</span>;
}

function DecisionBadge({ decision }: { decision: "Go" | "No-Go" }) {
  return <Badge tone={decision === "Go" ? "good" : "bad"}>{decision}</Badge>;
}

let jiraCounter = 2100;
function nextJiraKey() {
  jiraCounter += 1;
  return `TFP-${jiraCounter}`;
}
