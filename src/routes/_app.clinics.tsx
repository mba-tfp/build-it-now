import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Flag,
  GripVertical,
  Lock,
  Pencil,
  Plus,
  Radio,
  RotateCcw,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { daysSince, useTfpStore } from "@/lib/tfp/store";
import { fmtDate } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import type {
  ChecklistPhase,
  GoLiveChecklist,
  IntegrationTrack,
  IntegrationType,
  Product,
} from "@/lib/tfp/types";

export const Route = createFileRoute("/_app/clinics")({
  component: ClinicsPage,
});

type ClinicsTab = "onboarding" | "integrations";
type Integration = "eIVF" | "EngagedMD" | "Google Analytics" | "Accuro/IDEAS/Oscar";

// Module-level so the active tab persists across mounts within the same session.
let lastActiveTab: ClinicsTab = "onboarding";

const DEFAULT_PHASES: ChecklistPhase[] = [
  {
    id: "phase-1",
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
    id: "phase-2",
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
    id: "phase-3",
    title: "Clinic Launch Preparation",
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
    id: "phase-4",
    title: "Clinic Launch Execution",
    items: [
      "17. Final testing in production",
      "18. Define go-live plan (roles, timing, rollback criteria)",
      "19. Go-live execution",
      "20. Post-launch follow-up with clinic within 48 hours",
    ],
  },
];

const DEFAULT_ITEMS = DEFAULT_PHASES.flatMap((p) => p.items);
const INTEGRATION_ITEM: Record<Integration, string> = {
  eIVF: "16a. Complete eIVF integration",
  EngagedMD: "16b. Complete EngagedMD integration",
  "Google Analytics": "16c. Complete Google Analytics integration",
  "Accuro/IDEAS/Oscar": "16d. Complete Accuro / IDEAS / Oscar / other EMR integration",
};

/** Phases for a given clinic (custom or default). */
function clinicPhases(clinic: GoLiveChecklist): ChecklistPhase[] {
  return clinic.custom_phases ?? DEFAULT_PHASES;
}

const INTEGRATION_TYPES: IntegrationType[] = [
  "eIVF",
  "EngagedMD",
  "Accuro",
  "Oscar",
  "IDEAs",
  "Google Analytics",
  "Other",
];

/** Default phase template for new integration tracks. */
export function defaultIntegrationPhases(type: IntegrationType): ChecklistPhase[] {
  switch (type) {
    case "eIVF":
      return [
        { id: "ip-1", title: "Setup", items: [
          "1. Obtain eIVF API credentials",
          "2. Configure eIVF environment in CNP",
          "3. Map patient fields between CNP and eIVF",
        ]},
        { id: "ip-2", title: "Validation", items: [
          "4. Test patient record sync in pre-production",
          "5. Validate document transfer (consents, health forms)",
          "6. Confirm deletion/update behavior",
        ]},
        { id: "ip-3", title: "Launch", items: [
          "7. Enable in production",
          "8. Post-launch verification with clinic",
        ]},
      ];
    case "EngagedMD":
      return [
        { id: "ip-1", title: "Setup", items: [
          "1. Obtain EngagedMD SFTP credentials",
          "2. Configure SFTP connection in CNP",
          "3. Map module assignments to patient workflows",
        ]},
        { id: "ip-2", title: "Validation", items: [
          "4. Test module assignment trigger in pre-production",
          "5. Confirm completion status sync back to CNP",
        ]},
        { id: "ip-3", title: "Launch", items: [
          "6. Enable in production",
          "7. Post-launch verification with clinic",
        ]},
      ];
    case "Accuro":
    case "IDEAs":
    case "Oscar":
      return [
        { id: "ip-1", title: "Setup", items: [
          "1. Obtain API credentials",
          "2. Review API documentation and confirm supported endpoints",
          "3. Map fields between CNP and EMR",
        ]},
        { id: "ip-2", title: "Validation", items: [
          "4. Build and test integration in pre-production",
          "5. Clinic UAT on integration flows",
        ]},
        { id: "ip-3", title: "Launch", items: [
          "6. Enable in production",
          "7. Post-launch verification",
        ]},
      ];
    case "Google Analytics":
      return [
        { id: "ip-1", title: "Setup", items: [
          "1. Obtain GA4 measurement ID from clinic",
          "2. Configure in CNP tenant settings",
        ]},
        { id: "ip-2", title: "Validation", items: [
          "3. Verify events are firing correctly in GA4 debug view",
        ]},
        { id: "ip-3", title: "Launch", items: [
          "4. Confirm with clinic that data is visible in their GA4 dashboard",
        ]},
      ];
    case "Other":
    default:
      return [{ id: "ip-1", title: "Phase 1", items: [] }];
  }
}

function ClinicsPage() {
  const [tab, setTab] = useState<ClinicsTab>(lastActiveTab);
  useEffect(() => { lastActiveTab = tab; }, [tab]);
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Operations</p>
          <h1 className="mt-1 font-display text-3xl">Operations</h1>
          <p className="mt-1 text-sm text-muted-foreground">Clinic onboarding and integration tracking.</p>
        </div>
      </header>

      <div data-testid="clinics-tabs" className="flex gap-2 border-b border-border">
        <TabButton id="onboarding" active={tab === "onboarding"} onClick={() => setTab("onboarding")}>Onboarding</TabButton>
        <TabButton id="integrations" active={tab === "integrations"} onClick={() => setTab("integrations")}>Integrations</TabButton>
      </div>

      {tab === "onboarding" ? <OnboardingTab /> : <IntegrationsTab />}
    </div>
  );
}

function TabButton({ id, active, onClick, children }: { id: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      data-testid={`clinics-tab-${id}`}
      data-active={active ? "true" : "false"}
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition",
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// =====================================================================================
// Tab 1 — Onboarding (clinic checklists with per-clinic edit mode)
// =====================================================================================

function OnboardingTab() {
  const goLives = useTfpStore((s) => s.goLives);
  const integrations = useTfpStore((s) => s.integrations);
  const toggleCriterion = useTfpStore((s) => s.toggleGoLiveCriterion);
  const toggleWarRoom = useTfpStore((s) => s.toggleGoLiveWarRoom);
  const setDecision = useTfpStore((s) => s.setGoLiveDecision);
  const upsertGoLive = useTfpStore((s) => s.upsertGoLive);
  const setClinicChecklistPhases = useTfpStore((s) => s.setClinicChecklistPhases);
  const resetClinicChecklistToDefault = useTfpStore((s) => s.resetClinicChecklistToDefault);
  const pushNotification = useTfpStore((s) => s.pushNotification);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pushed, setPushed] = useState<Record<string, boolean>>({});
  const [nogoFor, setNogoFor] = useState<string | null>(null);
  const [nogoReason, setNogoReason] = useState("");
  const [complianceErrors, setComplianceErrors] = useState<Record<string, string>>({});
  const noteRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const selected = selectedId ? goLives.find((c) => c.id === selectedId) ?? null : null;
  const clinics = useMemo(() => [...goLives].sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()), [goLives]);
  const phases = selected ? clinicPhases(selected) : [];
  const allComplete = selected ? clinicAllComplete(selected) : false;

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
    const noteKey = `${clinic.id}:${item}`;
    const required = isComplianceRequired(clinic, item);
    const stored = clinic.criteria[item]?.note ?? "";
    const draft = notes[noteKey] ?? "";
    const effectiveNote = (draft.trim() ? draft : stored).trim();
    if (done && required && !effectiveNote) {
      setComplianceErrors((c) => ({ ...c, [noteKey]: "Compliance note required before marking this item complete. (PHIPA + French requirements.)" }));
      setTimeout(() => noteRefs.current[noteKey]?.focus(), 0);
      return;
    }
    setComplianceErrors((c) => { if (!c[noteKey]) return c; const n = { ...c }; delete n[noteKey]; return n; });
    toggleCriterion(clinic.id, item, done, draft.trim() || undefined);
    setNotes((c) => ({ ...c, [noteKey]: "" }));
  }

  function pushPhase(clinic: GoLiveChecklist, phase: ChecklistPhase) {
    phase.items.forEach(() => toast.success(`${nextJiraKey()} created`));
    setPushed((c) => ({ ...c, [`${clinic.id}:${phase.id}`]: true }));
  }

  function reopenDecision(clinic: GoLiveChecklist) {
    useTfpStore.setState((state) => ({
      goLives: state.goLives.map((it) => it.id === clinic.id ? { ...it, go_no_go_decision: null, go_no_go_by: null, go_no_go_at: null, status: "In Progress", updated_at: new Date().toISOString() } : it),
    }));
    toast.success("Decision reopened");
  }

  function recordNoGo() {
    if (!nogoFor || !nogoReason.trim()) return;
    setDecision(nogoFor, "No-Go");
    useTfpStore.setState((state) => ({
      goLives: state.goLives.map((it) => it.id === nogoFor ? { ...it, status: "In Progress", updated_at: new Date().toISOString() } : it),
    }));
    toast.error("No-Go recorded", { description: nogoReason.trim() });
    setNogoFor(null);
    setNogoReason("");
  }

  // Phase 3 progress — used to gate Go/No-Go.
  const phase3 = phases.find((p) => p.id === "phase-3") ?? phases[2] ?? phases[0];

  return (
    <div className="space-y-5">
      {!selected && (
        <>
          <div className="flex justify-end">
            <button onClick={() => setNewOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-3.5 w-3.5" /> New clinic
            </button>
          </div>
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
                    <Row label="Current phase" value={phase ? phase.title : "Live"} />
                    <Row label="Phase progress" value={progress ? `${progress.done} of ${progress.total}` : "Complete"} />
                    <Row label="Days in phase" value={`${daysSince(phaseStart)}d`} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {clinic.go_no_go_decision && <DecisionBadge decision={clinic.go_no_go_decision} />}
                    {!clinic.go_no_go_decision && <Badge tone="muted">No decision</Badge>}
                  </div>
                  <button onClick={() => { setSelectedId(clinic.id); setEditMode(false); }} className="mt-4 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">View checklist</button>
                </section>
              );
            })}
          </div>
        </>
      )}

      {selected && (
        <section className={cn("tfp-card p-5", selected.war_room && "border-destructive/60 ring-2 ring-destructive/10")}>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <button onClick={() => { setSelectedId(null); setEditMode(false); }} className="mb-3 text-xs text-muted-foreground hover:text-foreground">← Back to clinics</button>
              <h2 className="font-display text-2xl">{clinicName(selected)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Scheduled for {fmtDate(selected.scheduled_for)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!editMode && !allComplete && (
                <button
                  data-testid="edit-checklist-button"
                  onClick={() => setEditMode(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit checklist
                </button>
              )}
              {editMode && (
                <>
                  <button
                    onClick={() => {
                      if (!window.confirm("Reset this clinic's checklist to the default 4-phase template? Custom phases and items will be lost.")) return;
                      resetClinicChecklistToDefault(selected.id);
                      toast.success("Checklist reset to default template");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset to default
                  </button>
                  <button
                    data-testid="done-editing-button"
                    onClick={() => setEditMode(false)}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Done editing
                  </button>
                </>
              )}
              <button onClick={() => handleWarRoom(selected)} className={cn("inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium", selected.war_room ? "border-destructive bg-destructive/10 text-destructive" : "border-input bg-surface hover:bg-muted")}><Radio className="h-3.5 w-3.5" /> War room</button>
              {selected.go_no_go_decision && <button onClick={() => reopenDecision(selected)} className="rounded-md border border-input bg-surface px-3 py-1.5 text-xs font-medium hover:bg-muted">Reopen</button>}
            </div>
          </div>

          {editMode ? (
            <ChecklistEditor
              phases={phases}
              criteria={selected.criteria}
              onChange={(next) => setClinicChecklistPhases(selected.id, next)}
            />
          ) : (
            <div className="space-y-5">
              {phases.map((phase) => {
                const locked = isPhaseLocked(selected, phase.id, pushed, phases);
                const progress = phaseProgress(selected, phase);
                const complete = progress.total > 0 && progress.done === progress.total;
                const pushKey = `${selected.id}:${phase.id}`;
                return (
                  <section key={phase.id} className={cn("rounded-md border border-border bg-surface p-4", locked && "bg-muted/30")}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-display text-lg">{phase.title}</h3>
                        <p className="text-xs text-muted-foreground">{progress.done} of {progress.total} complete</p>
                      </div>
                      {locked ? <Badge tone="muted"><Lock className="mr-1 h-3 w-3" /> Earlier phases incomplete</Badge> : complete && <Badge tone="good"><CheckCircle2 className="mr-1 h-3 w-3" /> Complete</Badge>}
                    </div>

                    <div className="space-y-2">
                      {phase.items.map((item) => {
                        const state = selected.criteria[item] ?? { done: false, note: "", checked_by: null, checked_at: null };
                        const disabled = isNotApplicable(state.note);
                        const flag = procreaFlag(selected, item);
                        const required = isComplianceRequired(selected, item);
                        const noteKey = `${selected.id}:${item}`;
                        const draftNote = notes[noteKey] ?? "";
                        const storedNote = state.note ?? "";
                        const clearedAfterCheck = state.done && required && !storedNote.trim() && !draftNote.trim();
                        const inlineError = complianceErrors[noteKey];
                        return (
                          <div
                            key={item}
                            data-testid={required ? `phipa-item-${item}` : undefined}
                            className={cn("rounded-md border border-border bg-background p-3", disabled && "opacity-55")}
                          >
                            <label className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={state.done}
                                disabled={locked || disabled}
                                onChange={(e) => toggleItem(selected, item, e.target.checked)}
                                data-testid={required ? `phipa-checkbox-${item}` : undefined}
                                className="mt-1 h-4 w-4"
                              />
                              <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className={cn("text-sm font-medium", state.done && "line-through text-muted-foreground")}>{item}</p>
                                  {required && (
                                    <span data-testid="phipa-badge" className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                                      <ShieldAlert className="h-3 w-3" />
                                      PHIPA
                                    </span>
                                  )}
                                </div>
                                {disabled && <p className="mt-1 text-xs text-muted-foreground">Not applicable for this clinic.</p>}
                                {flag && <p className="mt-2 rounded-md border border-[var(--color-status-hold)]/30 bg-[var(--color-status-hold)]/10 px-2 py-1 text-xs text-[var(--color-status-hold)]"><Flag className="mr-1 inline h-3 w-3" />{flag}</p>}
                                {inlineError && (
                                  <p data-testid={`compliance-error-${item}`} className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                                    {inlineError}
                                  </p>
                                )}
                                {clearedAfterCheck && !inlineError && (
                                  <p data-testid={`compliance-cleared-${item}`} className="mt-2 inline-flex items-center gap-1 rounded-md border border-[var(--color-status-hold)]/40 bg-[var(--color-status-hold)]/10 px-2 py-1 text-xs font-medium text-[var(--color-status-hold)]">
                                    <AlertTriangle className="h-3 w-3" />
                                    Compliance note was cleared. Re-add a note or uncheck this item before sprint close.
                                  </p>
                                )}
                                {(flag || required || state.note) && !disabled && (
                                  <>
                                    {required && <p className="mt-2 text-[11px] font-medium text-muted-foreground">Compliance note (required)</p>}
                                    <input
                                      ref={(el) => { noteRefs.current[noteKey] = el; }}
                                      value={draftNote}
                                      lang="fr"
                                      onChange={(e) => setNotes((c) => ({ ...c, [noteKey]: e.target.value }))}
                                      placeholder={storedNote || (required ? "Compliance note (required)…" : "Compliance note…")}
                                      data-testid={required ? `compliance-input-${item}` : undefined}
                                      className="mt-1 w-full rounded-md border border-input bg-surface px-2 py-1.5 text-xs"
                                    />
                                  </>
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
          )}

          {!editMode && (
            <>
              <div className="mt-5 rounded-md border border-border bg-surface p-4">
                <h3 className="font-display text-lg">Go/No-Go decision</h3>
                {selected.go_no_go_decision ? (
                  <div className="mt-3 flex items-center gap-3"><DecisionBadge decision={selected.go_no_go_decision} /><span className="text-xs text-muted-foreground">Recorded {selected.go_no_go_at ? fmtDate(selected.go_no_go_at) : "today"}</span></div>
                ) : phase3 && phaseProgress(selected, phase3).done === phaseProgress(selected, phase3).total && phaseProgress(selected, phase3).total > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => setDecision(selected.id, "Go")} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Go</button><button onClick={() => setNogoFor(selected.id)} className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10">No-Go</button></div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Complete the launch-preparation phase before recording Go/No-Go.</p>
                )}
              </div>

              <ClinicLinkedIntegrations
                clinicId={selected.id}
                integrations={integrations.filter((t) => t.linked_clinic_id === selected.id)}
              />
            </>
          )}
        </section>
      )}

      {newOpen && <NewClinicModal onClose={() => setNewOpen(false)} onCreate={(data) => { const created = upsertGoLive(data); setSelectedId(created.id); setNewOpen(false); }} />}
      {nogoFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl">
            <h3 className="font-display text-lg">Record No-Go</h3>
            <textarea value={nogoReason} onChange={(e) => setNogoReason(e.target.value)} placeholder="Reason required…" className="mt-3 min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <div className="mt-4 flex justify-end gap-2"><button onClick={() => setNogoFor(null)} className="rounded-md border border-input px-3 py-1.5 text-sm">Cancel</button><button disabled={!nogoReason.trim()} onClick={recordNoGo} className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground disabled:opacity-50">Record No-Go</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClinicLinkedIntegrations({ clinicId, integrations }: { clinicId: string; integrations: IntegrationTrack[] }) {
  if (integrations.length === 0) return null;
  return (
    <div className="mt-5 rounded-md border border-border bg-surface p-4">
      <h3 className="font-display text-lg">Integrations</h3>
      <p className="text-xs text-muted-foreground">Linked integration tracks for this clinic.</p>
      <ul className="mt-3 space-y-2">
        {integrations.map((t) => {
          const totals = trackProgress(t);
          return (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.type} · {totals.done} / {totals.total} items</p>
              </div>
              <button
                onClick={() => {
                  lastActiveTab = "integrations";
                  // Stash a hint and reload the in-page tab via custom event.
                  window.dispatchEvent(new CustomEvent("clinics-open-integration", { detail: { id: t.id, fromClinic: clinicId } }));
                }}
                className="text-xs text-primary hover:underline"
              >
                View →
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// =====================================================================================
// Editor (shared by clinic onboarding and integrations)
// =====================================================================================

function ChecklistEditor({
  phases,
  criteria,
  onChange,
}: {
  phases: ChecklistPhase[];
  criteria: Record<string, { done: boolean }>;
  onChange: (next: ChecklistPhase[]) => void;
}) {
  const [drag, setDrag] = useState<{ kind: "phase" | "item"; phaseId: string; itemId?: string } | null>(null);
  const isItemLocked = (item: string) => Boolean(criteria[item]?.done);

  function update(mut: (p: ChecklistPhase[]) => ChecklistPhase[]) {
    onChange(mut(phases));
  }

  function addPhase() {
    update((cur) => [...cur, { id: "phase-" + Math.random().toString(36).slice(2, 8), title: "New Phase", items: [] }]);
  }
  function renamePhase(phaseId: string, title: string) {
    update((cur) => cur.map((p) => (p.id === phaseId ? { ...p, title } : p)));
  }
  function deletePhase(phaseId: string) {
    const phase = phases.find((p) => p.id === phaseId);
    if (!phase) return;
    if (phase.items.length > 0 && !window.confirm(`Delete "${phase.title}" and its ${phase.items.length} item(s)?`)) return;
    if (phase.items.some(isItemLocked)) {
      toast.error("Cannot delete phase: it contains completed items.");
      return;
    }
    update((cur) => cur.filter((p) => p.id !== phaseId));
  }
  function addItem(phaseId: string) {
    update((cur) => cur.map((p) => (p.id === phaseId ? { ...p, items: [...p.items, "New item — click to edit"] } : p)));
  }
  function renameItem(phaseId: string, idx: number, text: string) {
    update((cur) => cur.map((p) => (p.id === phaseId ? { ...p, items: p.items.map((it, i) => (i === idx ? text : it)) } : p)));
  }
  function deleteItem(phaseId: string, idx: number) {
    const target = phases.find((p) => p.id === phaseId)?.items[idx];
    if (target && isItemLocked(target)) {
      toast.error("Cannot delete a completed item.");
      return;
    }
    update((cur) => cur.map((p) => (p.id === phaseId ? { ...p, items: p.items.filter((_, i) => i !== idx) } : p)));
  }
  function reorderPhase(srcId: string, dstId: string) {
    update((cur) => {
      const next = [...cur];
      const from = next.findIndex((p) => p.id === srcId);
      const to = next.findIndex((p) => p.id === dstId);
      if (from < 0 || to < 0) return next;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }
  function reorderOrMoveItem(srcPhaseId: string, srcIdx: number, dstPhaseId: string, dstIdx: number) {
    update((cur) => {
      const next = cur.map((p) => ({ ...p, items: [...p.items] }));
      const src = next.find((p) => p.id === srcPhaseId)!;
      const dst = next.find((p) => p.id === dstPhaseId)!;
      const item = src.items[srcIdx];
      if (isItemLocked(item)) {
        toast.error("Cannot reorder a completed item.");
        return cur;
      }
      src.items.splice(srcIdx, 1);
      const insertAt = src === dst && dstIdx > srcIdx ? dstIdx - 1 : dstIdx;
      dst.items.splice(insertAt, 0, item);
      return next;
    });
  }

  return (
    <div className="space-y-4" data-testid="checklist-editor">
      {phases.map((phase) => (
        <section
          key={phase.id}
          data-testid={`editor-phase-${phase.id}`}
          className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-4"
          onDragOver={(e) => { if (drag?.kind === "phase") e.preventDefault(); }}
          onDrop={(e) => {
            if (drag?.kind === "phase" && drag.phaseId !== phase.id) {
              e.preventDefault();
              reorderPhase(drag.phaseId, phase.id);
              setDrag(null);
            }
          }}
        >
          <div className="mb-3 flex items-center gap-2">
            <span
              draggable
              onDragStart={() => setDrag({ kind: "phase", phaseId: phase.id })}
              onDragEnd={() => setDrag(null)}
              className="cursor-grab text-muted-foreground"
              title="Drag to reorder phase"
            >
              <GripVertical className="h-4 w-4" />
            </span>
            <input
              defaultValue={phase.title}
              onBlur={(e) => renamePhase(phase.id, e.target.value || "Untitled phase")}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="flex-1 rounded-md border border-input bg-surface px-2 py-1 text-sm font-display"
            />
            <button
              onClick={() => deletePhase(phase.id)}
              className="rounded-md border border-input bg-surface p-1.5 text-destructive hover:bg-destructive/10"
              title="Delete phase"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <ul
            className="space-y-2"
            onDragOver={(e) => { if (drag?.kind === "item") e.preventDefault(); }}
            onDrop={(e) => {
              if (drag?.kind === "item") {
                e.preventDefault();
                reorderOrMoveItem(drag.phaseId, Number(drag.itemId), phase.id, phase.items.length);
                setDrag(null);
              }
            }}
          >
            {phase.items.map((item, idx) => {
              const locked = isItemLocked(item);
              return (
                <li
                  key={`${item}-${idx}`}
                  data-testid={`editor-item-${phase.id}-${idx}`}
                  className={cn("flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5", locked && "opacity-60")}
                  onDragOver={(e) => { if (drag?.kind === "item") e.preventDefault(); }}
                  onDrop={(e) => {
                    if (drag?.kind === "item") {
                      e.preventDefault();
                      e.stopPropagation();
                      reorderOrMoveItem(drag.phaseId, Number(drag.itemId), phase.id, idx);
                      setDrag(null);
                    }
                  }}
                >
                  <span
                    draggable={!locked}
                    onDragStart={() => !locked && setDrag({ kind: "item", phaseId: phase.id, itemId: String(idx) })}
                    onDragEnd={() => setDrag(null)}
                    className={cn("text-muted-foreground", locked ? "cursor-not-allowed" : "cursor-grab")}
                    title={locked ? "Completed items are locked" : "Drag to reorder"}
                  >
                    {locked ? <Lock className="h-3.5 w-3.5" /> : <GripVertical className="h-3.5 w-3.5" />}
                  </span>
                  <input
                    defaultValue={item}
                    disabled={locked}
                    onBlur={(e) => renameItem(phase.id, idx, e.target.value || "Untitled item")}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    className="flex-1 rounded-md border border-input bg-surface px-2 py-1 text-sm disabled:opacity-60"
                  />
                  <button
                    disabled={locked}
                    onClick={() => deleteItem(phase.id, idx)}
                    className="rounded-md border border-input bg-surface p-1 text-destructive hover:bg-destructive/10 disabled:opacity-40"
                    title={locked ? "Locked" : "Delete item"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            data-testid={`editor-add-item-${phase.id}`}
            onClick={() => addItem(phase.id)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-2 py-1 text-xs hover:bg-muted"
          >
            <Plus className="h-3 w-3" /> Add item
          </button>
        </section>
      ))}

      <button
        data-testid="editor-add-phase"
        onClick={addPhase}
        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-1.5 text-sm hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" /> Add phase
      </button>
    </div>
  );
}

// =====================================================================================
// Tab 2 — Integrations
// =====================================================================================

function IntegrationsTab() {
  const integrations = useTfpStore((s) => s.integrations);
  const goLives = useTfpStore((s) => s.goLives);
  const createTrack = useTfpStore((s) => s.createIntegrationTrack);
  const setIntegrationPhases = useTfpStore((s) => s.setIntegrationPhases);
  const toggleIntegrationItem = useTfpStore((s) => s.toggleIntegrationItem);
  const updateTrack = useTfpStore((s) => s.updateIntegrationTrack);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [filterType, setFilterType] = useState<"All" | IntegrationType>("All");
  const [filterClinic, setFilterClinic] = useState<string>("All");

  useEffect(() => {
    function onOpen(e: Event) {
      const id = (e as CustomEvent).detail?.id as string | undefined;
      if (id) { setSelectedId(id); setEditMode(false); }
    }
    window.addEventListener("clinics-open-integration", onOpen);
    return () => window.removeEventListener("clinics-open-integration", onOpen);
  }, []);

  const selected = selectedId ? integrations.find((t) => t.id === selectedId) ?? null : null;

  const filtered = useMemo(() => integrations.filter((t) => {
    if (filterType !== "All" && t.type !== filterType) return false;
    if (filterClinic === "Standalone" && t.linked_clinic_id) return false;
    if (filterClinic !== "All" && filterClinic !== "Standalone" && t.linked_clinic_id !== filterClinic) return false;
    return true;
  }), [integrations, filterType, filterClinic]);

  if (selected) {
    const linkedClinic = goLives.find((c) => c.id === selected.linked_clinic_id) ?? null;
    const totals = trackProgress(selected);
    return (
      <section className="tfp-card p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <button onClick={() => { setSelectedId(null); setEditMode(false); }} className="mb-3 text-xs text-muted-foreground hover:text-foreground">← Back to integrations</button>
            <h2 className="font-display text-2xl">{selected.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {selected.type} · {selected.target_date ? `Target ${fmtDate(selected.target_date)}` : "No target date"} · {totals.done} / {totals.total} items
            </p>
            {linkedClinic && (
              <p className="mt-2 text-xs">
                Linked to{" "}
                <button
                  onClick={() => {
                    lastActiveTab = "onboarding";
                    window.dispatchEvent(new CustomEvent("clinics-open-clinic", { detail: { id: linkedClinic.id } }));
                  }}
                  className="text-primary hover:underline"
                >
                  {clinicName(linkedClinic)}
                </button>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!editMode ? (
              <button
                onClick={() => setEditMode(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit checklist
              </button>
            ) : (
              <button
                onClick={() => setEditMode(false)}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Done editing
              </button>
            )}
          </div>
        </div>

        {editMode ? (
          <ChecklistEditor
            phases={selected.phases}
            criteria={selected.criteria}
            onChange={(next) => setIntegrationPhases(selected.id, next)}
          />
        ) : (
          <div className="space-y-5">
            {selected.phases.map((phase) => {
              const items = phase.items;
              const done = items.filter((i) => selected.criteria[i]?.done).length;
              return (
                <section key={phase.id} className="rounded-md border border-border bg-surface p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-display text-lg">{phase.title}</h3>
                    <span className="text-xs text-muted-foreground">{done} of {items.length} complete</span>
                  </div>
                  <ul className="space-y-2">
                    {items.map((item) => {
                      const state = selected.criteria[item] ?? { done: false, checked_at: null };
                      return (
                        <li key={item} className="flex items-start gap-3 rounded-md border border-border bg-background p-3">
                          <input
                            type="checkbox"
                            checked={state.done}
                            onChange={(e) => toggleIntegrationItem(selected.id, item, e.target.checked)}
                            className="mt-1 h-4 w-4"
                          />
                          <span className={cn("text-sm", state.done && "line-through text-muted-foreground")}>{item}</span>
                        </li>
                      );
                    })}
                    {items.length === 0 && <li className="text-xs text-muted-foreground italic">No items in this phase yet.</li>}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            Linked clinic
            <select
              value={selected.linked_clinic_id ?? ""}
              onChange={(e) => updateTrack(selected.id, { linked_clinic_id: e.target.value || null })}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Standalone</option>
              {goLives.map((c) => <option key={c.id} value={c.id}>{clinicName(c)}</option>)}
            </select>
          </label>
          <label className="text-xs">
            Target date
            <input
              type="date"
              value={selected.target_date ? selected.target_date.slice(0, 10) : ""}
              onChange={(e) => updateTrack(selected.id, { target_date: e.target.value ? new Date(`${e.target.value}T12:00:00.000Z`).toISOString() : null })}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <label className="text-xs">
            Type
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as "All" | IntegrationType)} className="ml-1 rounded-md border border-input bg-surface px-2 py-1 text-sm">
              <option value="All">All</option>
              {INTEGRATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-xs">
            Clinic
            <select value={filterClinic} onChange={(e) => setFilterClinic(e.target.value)} className="ml-1 rounded-md border border-input bg-surface px-2 py-1 text-sm">
              <option value="All">All</option>
              <option value="Standalone">Standalone</option>
              {goLives.map((c) => <option key={c.id} value={c.id}>{clinicName(c)}</option>)}
            </select>
          </label>
        </div>
        <button
          data-testid="new-integration-button"
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" /> New integration
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-surface/50 p-8 text-center text-sm text-muted-foreground">
          No integrations yet. Use “New integration” to add one.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((t) => {
            const totals = trackProgress(t);
            const status = totals.total === 0 ? "Not started" : totals.done === 0 ? "Not started" : totals.done === totals.total ? "Complete" : "In progress";
            const linked = goLives.find((c) => c.id === t.linked_clinic_id);
            const currentPhase = t.phases.find((p) => p.items.some((i) => !t.criteria[i]?.done)) ?? t.phases[t.phases.length - 1];
            return (
              <section key={t.id} data-testid={`integration-card-${t.id}`} className="tfp-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl">{t.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{linked ? `Linked to ${clinicName(linked)}` : "Standalone"}</p>
                  </div>
                  <Badge tone={status === "Complete" ? "good" : status === "In progress" ? "warn" : "muted"}>{status}</Badge>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <Row label="Type" value={t.type} />
                  <Row label="Current phase" value={currentPhase?.title ?? "—"} />
                  <Row label="Progress" value={`${totals.done} of ${totals.total}`} />
                  <Row label="Days in phase" value={`${daysSince(t.updated_at)}d`} />
                  {t.target_date && <Row label="Target" value={fmtDate(t.target_date)} />}
                </div>
                <button onClick={() => { setSelectedId(t.id); setEditMode(false); }} className="mt-4 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">View checklist</button>
              </section>
            );
          })}
        </div>
      )}

      {newOpen && (
        <NewIntegrationModal
          onClose={() => setNewOpen(false)}
          onCreate={(data) => {
            const created = createTrack(data);
            setNewOpen(false);
            setSelectedId(created.id);
          }}
        />
      )}
    </div>
  );
}

function NewIntegrationModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (data: { name: string; type: IntegrationType; linked_clinic_id: string | null; target_date: string | null; phases: ChecklistPhase[] }) => void;
}) {
  const goLives = useTfpStore((s) => s.goLives);
  const [name, setName] = useState("");
  const [type, setType] = useState<IntegrationType>("eIVF");
  const [linkedClinicId, setLinkedClinicId] = useState<string>("");
  const [targetDate, setTargetDate] = useState<string>("");
  const valid = name.trim().length > 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-lg border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-center justify-between"><h3 className="font-display text-lg">New integration</h3><button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Name<input data-testid="new-integration-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" /></label>
          <label className="text-sm">Integration type
            <select data-testid="new-integration-type" value={type} onChange={(e) => setType(e.target.value as IntegrationType)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2">
              {INTEGRATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-sm">Linked clinic
            <select data-testid="new-integration-clinic" value={linkedClinicId} onChange={(e) => setLinkedClinicId(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2">
              <option value="">Standalone</option>
              {goLives.map((c) => <option key={c.id} value={c.id}>{clinicName(c)}</option>)}
            </select>
          </label>
          <label className="text-sm">Target date (optional)<input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" /></label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-input px-3 py-1.5 text-sm">Cancel</button>
          <button
            data-testid="new-integration-create"
            disabled={!valid}
            onClick={() => onCreate({
              name: name.trim(),
              type,
              linked_clinic_id: linkedClinicId || null,
              target_date: targetDate ? new Date(`${targetDate}T12:00:00.000Z`).toISOString() : null,
              phases: defaultIntegrationPhases(type),
            })}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================================
// Helpers (compatibility-preserving)
// =====================================================================================

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
          <label className="text-sm">Clinic name<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" /></label>
          <label className="text-sm">Go-live target date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" /></label>
        </div>
        <div className="mt-4"><p className="mb-2 text-sm font-medium">Applicable integrations</p><div className="grid gap-2 sm:grid-cols-2">{(Object.keys(INTEGRATION_ITEM) as Integration[]).map((item) => <label key={item} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"><input type="checkbox" checked={integrations.includes(item)} onChange={() => toggleIntegration(item)} />{item}</label>)}</div></div>
        <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-md border border-input px-3 py-1.5 text-sm">Cancel</button><button disabled={!valid} onClick={save} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">Create clinic</button></div>
      </div>
    </div>
  );
}

function buildCriteria(applicable: Set<Integration>) {
  const criteria: GoLiveChecklist["criteria"] = {};
  DEFAULT_ITEMS.forEach((item) => {
    const integration = (Object.entries(INTEGRATION_ITEM) as Array<[Integration, string]>).find(([, label]) => label === item)?.[0];
    criteria[item] = { done: false, note: integration && !applicable.has(integration) ? "[Not applicable]" : "", checked_by: null, checked_at: null };
  });
  return criteria;
}

function clinicAllComplete(clinic: GoLiveChecklist) {
  const phases = clinicPhases(clinic);
  return phases.flatMap((p) => p.items).every((it) => clinic.criteria[it]?.done || isNotApplicable(clinic.criteria[it]?.note));
}

function currentPhase(clinic: GoLiveChecklist) {
  const phases = clinicPhases(clinic);
  if (clinic.status === "Live" || clinicAllComplete(clinic)) return null;
  return phases.find((phase) => phase.items.some((item) => !clinic.criteria[item]?.done && !isNotApplicable(clinic.criteria[item]?.note))) ?? phases[0];
}

function phaseProgress(clinic: GoLiveChecklist, phase: ChecklistPhase) {
  const applicable = phase.items.filter((item) => !isNotApplicable(clinic.criteria[item]?.note));
  return { done: applicable.filter((item) => clinic.criteria[item]?.done).length, total: applicable.length };
}

function isPhaseLocked(clinic: GoLiveChecklist, phaseId: string, pushed: Record<string, boolean>, phases: ChecklistPhase[]) {
  const idx = phases.findIndex((p) => p.id === phaseId);
  if (idx <= 0) return false;
  return phases.slice(0, idx).some((earlier) => {
    const progress = phaseProgress(clinic, earlier);
    const targetPhase = phases[idx];
    const targetAlreadyStarted = targetPhase?.items.some((item) => clinic.criteria[item]?.done) ?? false;
    return progress.done < progress.total || (!pushed[`${clinic.id}:${earlier.id}`] && !targetAlreadyStarted);
  });
}

function phaseStartDate(clinic: GoLiveChecklist, phase: ChecklistPhase) {
  const phases = clinicPhases(clinic);
  const idx = phases.findIndex((p) => p.id === phase.id);
  const previous = phases.slice(0, Math.max(0, idx)).flatMap((p) => p.items).map((item) => clinic.criteria[item]?.checked_at).filter((d): d is string => Boolean(d)).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  return previous ?? clinic.created_at;
}

function trackProgress(t: IntegrationTrack) {
  const all = t.phases.flatMap((p) => p.items);
  return { done: all.filter((i) => t.criteria[i]?.done).length, total: all.length };
}

export function procreaFlag(clinic: GoLiveChecklist, item: string) {
  if (!clinicName(clinic).toLowerCase().includes("procrea qc")) return null;
  if (item.startsWith("12.")) return "French language review required + Law 25 (Quebec) compliance sign-off needed before closing.";
  if (item.startsWith("16")) return "French language review required for all integration documentation.";
  return null;
}

export function complianceRequiredItems(clinic: GoLiveChecklist): Set<string> {
  const out = new Set<string>();
  if (clinicName(clinic).toLowerCase().includes("procrea qc")) {
    clinicPhases(clinic).flatMap((p) => p.items)
      .filter((item) => item.startsWith("12."))
      .forEach((item) => out.add(item));
  }
  return out;
}

export function isComplianceRequired(clinic: GoLiveChecklist, item: string): boolean {
  return complianceRequiredItems(clinic).has(item);
}

export function complianceMissingRows(goLives: GoLiveChecklist[]): Array<{ clinicId: string; clinicName: string; item: string }> {
  const rows: Array<{ clinicId: string; clinicName: string; item: string }> = [];
  for (const clinic of goLives) {
    const required = complianceRequiredItems(clinic);
    for (const item of required) {
      const state = clinic.criteria[item];
      if (state?.done && !(state.note ?? "").trim()) {
        rows.push({ clinicId: clinic.id, clinicName: clinicName(clinic), item });
      }
    }
  }
  return rows;
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
