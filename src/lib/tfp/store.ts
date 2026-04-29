import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Attachment,
  AuditEntityType,
  AuditEntry,
  Clinic,
  ClinicFeedbackRecord,
  ClinicStatus,
  CommsItem,
  CommsType,
  Complexity,
  Decision,
  DeliveryStatus,
  FeatureFlags,
  GoLiveChecklist,
  GoLiveCriterion,
  HelpArticle,
  JiraEvent,
  MonitoringAlert,
  MonitoringSeverity,
  MonitoringSystem,
  Notification,
  NotificationTrigger,
  OutcomeRating,
  Override,
  OverrideKind,
  Product,
  RetroTheme,
  Review,
  ReviewSize,
  RoadmapBucket,
  ShapingItem,
  Signal,
  SignalStatus,
  Source,
  Sprint,
  SprintRetro,
  TechDebtReview,
  User,
  Workflow,
} from "./types";
import { classifySignal, slaDueAt } from "./classify";
import { buildNotification } from "./notify";

/** Allowed forward transitions from each signal status. */
export const ALLOWED_STATUS_TRANSITIONS: Record<SignalStatus, SignalStatus[]> = {
  New: ["In Review", "Hold", "Rejected", "Proceed"],
  "In Review": ["Proceed", "Hold", "Rejected"],
  Hold: ["In Review", "Proceed", "Rejected"],
  Rejected: [],
  Proceed: [],
};

export function isAllowedStatusTransition(from: SignalStatus, to: SignalStatus): boolean {
  if (from === to) return true;
  return ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

const DEFAULT_FLAGS: FeatureFlags = {
  attachmentsEnabled: true,
  helpCenterEnabled: true,
  workflowBuilderEnabled: false,
  multiSelectIntake: true,
  auditVerbose: false,
  adminPanelEnabled: true,
};

const SEED_HELP: HelpArticle[] = [
  {
    id: "h-intake",
    slug: "intake",
    title: "Inbox",
    section: "Workflow",
    body_markdown:
      "# Inbox\n\nThe single entry point for all incoming work. Capture customer, leadership, clinic, and internal signals here, then decide whether each item should proceed, wait, or be rejected.\n\n## Tips\n- Add a clear description (≥20 chars).\n- Pick a primary product; secondary products can be added when the signal cuts across multiple areas.\n- Auto-classification suggests type and P1/P2/P3 priority — override only when you have a strong reason.",
    updated_at: "2026-04-22T00:00:00.000Z",
    updated_by: "u-bazil",
  },
  {
    id: "h-triage",
    slug: "triage",
    title: "Review incoming work",
    section: "Workflow",
    body_markdown:
      "# Review incoming work\n\nClick a signal in Inbox to decide: Proceed, Hold, or Reject.\n\n## Inline edits\nStatus, P1/P2/P3 priority, type, and owner can be edited inline.\n\n## Risky changes\nUnusual status changes ask for a reason and record the override in the background.",
    updated_at: "2026-04-22T00:00:00.000Z",
    updated_by: "u-bazil",
  },
  {
    id: "h-shaping",
    slug: "shaping",
    title: "Shaping",
    section: "Workflow",
    body_markdown:
      "# Shaping\n\nApproved signals move through two stages: Define → Tech Review. The Shaping workspace keeps the brief, tech concerns, and open questions in one place.",
    updated_at: "2026-04-22T00:00:00.000Z",
    updated_by: "u-bazil",
  },
  {
    id: "h-attachments",
    slug: "attachments",
    title: "Attachments",
    section: "Features",
    body_markdown:
      "# Attachments\n\nAdd reference links (Figma, Drive, Notion, JIRA) on signals, shaping items, reviews, comms, decisions, retros, go-lives and overrides. Files themselves are not uploaded — only links.",
    updated_at: "2026-04-22T00:00:00.000Z",
    updated_by: "u-bazil",
  },
  {
    id: "h-admin",
    slug: "admin",
    title: "Admin panel",
    section: "Admin",
    body_markdown:
      "# Admin panel\n\nManage users, feature toggles, help articles, and inspect the full audit log.",
    updated_at: "2026-04-22T00:00:00.000Z",
    updated_by: "u-bazil",
  },
  {
    id: "h-workflows",
    slug: "workflows",
    title: "Workflow Builder",
    section: "Features",
    body_markdown:
      "# Workflow Builder\n\nVisualise and tweak the Signal → Inbox → Shaping → Delivery flow. v1 is observational: active workflows emit additional notifications when signals progress.",
    updated_at: "2026-04-22T00:00:00.000Z",
    updated_by: "u-bazil",
  },
];


let _uidCounter = 0;
const uid = () => {
  _uidCounter += 1;
  return _uidCounter.toString(36).padStart(4, "0");
};

const today = new Date();
const SEED_EPOCH = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

const blankUser = (id: string, name: string, role: User["role"]): User => ({
  id,
  name,
  role,
  onboarding_completed: false,
  onboarding_progress: {},
});

export const USERS: User[] = [
  blankUser("u-bazil", "Bazil", "PM"),
  blankUser("u-alizar", "Alizar", "Senior PM"),
  blankUser("u-sami", "Sami", "Associate PM"),
  blankUser("u-karim", "Abdul Karim", "QA Scrum Master"),
  blankUser("u-waseem", "Waseem", "Tech Lead"),
  blankUser("u-ahmed", "M. Ahmed", "Tech Lead"),
  blankUser("u-farooq", "Farooq", "Developer"),
  blankUser("u-zeeshan", "Zeeshan", "Developer"),
  blankUser("u-shahid", "Shahid", "Leadership"),
];

const seedSprint: Sprint = {
  id: "s-6",
  name: "Active Sprint",
  start_date: new Date(SEED_EPOCH - 7 * 86400000).toISOString(),
  end_date: new Date(SEED_EPOCH + 7 * 86400000).toISOString(),
  status: "Active",
  scope_locked_at: null,
  scope_locked_by: null,
  gross_capacity_pts: 60,
  leave_deduction_pts: 4,
  interrupt_buffer_pts: 5,
  qa_buffer_pts: 4,
  uncertainty_buffer_pts: 3,
  golive_deduction_pts: 0,
  carryforward_estimate_pts: 4,
  allocated_pts: 38,
};

function blankShaping(signalId: string, ownerId: string, opts?: { fastTrack?: boolean }): ShapingItem {
  const now = new Date().toISOString();
  return {
    id: "sh-" + uid(),
    signal_id: signalId,
    shaping_status: "Unshaped",
    commitment_type: null,
    pm_owner_id: ownerId,
    current_step: 1,
    problem_what: "",
    problem_why: "",
    problem_who: "",
    problem_where: "",
    problem_evidence: "",
    problem_out_of_scope: "",
    roadmap_bucket: null,
    displacement: "",
    solution_complexity: null,
    solution_approach: "",
    solution_criteria: "",
    solution_effort: "",
    solution_decisions: "",
    solution_questions: "",
    solution_risks: "",
    tech_reviewer_id: null,
    tech_review_notes: "",
    tech_estimate_pts: null,
    tech_concerns: "",
    tech_signed_off_at: null,
    tech_concurrent_access_checked: false,
    approver_id: null,
    approval_decision: null,
    approval_notes: "",
    approved_at: null,
    jira_key: null,
    delivery_status: null,
    carry_forwarded_at: null,
    carry_forwarded_by: null,
    blocked_since: null,
    blocker_description: "",
    delivery_assignee_id: null,
    dev_complete: {
      merged_to_main: false,
      deployed_to_staging: false,
      smoke_test_passed: false,
      signed_off_by: null,
      signed_off_at: null,
    },
    fast_track: opts?.fastTrack ?? false,
    fast_track_root_cause: "",
    shaping_started_at: now,
    timebox_escalated_at: null,
    tech_debt_reviewed_at: null,
    dependency_system: null,
    dependency_what_changed: "",
    dependency_integrations_affected: "",
    dependency_impact: "",
    dependency_deadline: null,
    created_at: now,
    updated_at: now,
  };
}

function buildSeedSignal(args: {
  title: string;
  description: string;
  source: Signal["source"];
  product: Signal["product"];
  daysAgo: number;
  status?: Signal["status"];
  owner?: string | null;
  hold_until?: string | null;
  triage_reason?: string | null;
}) {
  const created = new Date(SEED_EPOCH - args.daysAgo * 86400000);
  const c = classifySignal({ source: args.source, description: args.description });
  return {
    id: "sig-" + uid(),
    title: args.title,
    description: args.description,
    source: args.source,
    product: args.product,
    issue_type: c.issue_type,
    tier: c.tier,
    status: args.status ?? "New",
    owner_id: args.owner ?? null,
    triage_reason: args.triage_reason ?? null,
    hold_until: args.hold_until ?? null,
    sla_due_at: slaDueAt(c.tier, created).toISOString(),
    created_at: created.toISOString(),
    created_by: "u-sami",
    shaping_item_id: null,
    labels: [],
    displacement_flag: false,
    displacement_note: null,
  };
}

const sigDone: Signal = buildSeedSignal({
  title: "OttoNotes autosave indicator — coordinators cannot tell if notes have saved",
  description:
    "Coordinators cannot tell whether OttoNotes content has synced before closing the editor, causing lost notes and rework.",
  source: "Clinic",
  product: "Otto Notes",
  daysAgo: 14,
  status: "Proceed",
  owner: "u-bazil",
});

const sigInDelivery: Signal = buildSeedSignal({
  title: "2FA enforcement for clinic admin accounts — security policy requirement",
  description:
    "Clinic admin accounts require TOTP-based 2FA to satisfy new clinic security policy and onboarding compliance requirements.",
  source: "Internal",
  product: "Platform",
  daysAgo: 21,
  status: "Proceed",
  owner: "u-alizar",
});

const sigInQA: Signal = buildSeedSignal({
  title: "EngagedMD consent assignment not automating for RCC and Olive tenants",
  description:
    "EngagedMD consent and video assignments are not automating for RCC and Olive tenants, forcing staff into manual assignment.",
  source: "Clinic",
  product: "Otto-Onboard",
  daysAgo: 10,
  status: "Proceed",
  owner: "u-bazil",
});

const sigBlocked: Signal = buildSeedSignal({
  title: "Phelix AI webhook latency causing notes sync delays over 30 seconds",
  description:
    "Phelix AI webhook latency is causing OttoNotes sync delays over 30 seconds and creating data reliability concerns.",
  source: "Internal",
  product: "Platform",
  daysAgo: 8,
  status: "Proceed",
  owner: "u-bazil",
});

const sigForApproval: Signal = buildSeedSignal({
  title: "eIVF creating duplicate patient records when CNP sends to EMR at Generation Fertility",
  description:
    "CNP to eIVF patient send flow creates duplicate records at Generation Fertility when returning patients were originally registered outside CNP.",
  source: "Clinic",
  product: "Platform",
  daysAgo: 5,
  status: "Proceed",
  owner: "u-bazil",
});

const sigForTechReview: Signal = buildSeedSignal({
  title: "Heartland pre-production environment needs workflow configuration before go-live",
  description:
    "Heartland pre-production tenant needs workflows, forms, templates, and integration configuration before UAT can start.",
  source: "Internal",
  product: "Otto-Onboard",
  daysAgo: 4,
  status: "Proceed",
  owner: "u-bazil",
});

const sigHelpCenter: Signal = buildSeedSignal({
  title: "No centralized help center for clinic staff — Sami's training videos have no home",
  description:
    "Clinic staff need a single home for Sami's training videos and onboarding materials instead of scattered Teams links.",
  source: "Internal",
  product: "Platform",
  daysAgo: 0,
  status: "New",
  owner: null,
});

const sigUniquePatientId: Signal = buildSeedSignal({
  title:
    "No unique patient identifier across OttoOnboard, OttoNotes, and downstream EMRs — same patient has separate records in every system with no way to link them",
  description:
    "Patients have separate records across OttoOnboard, OttoNotes, OttoPulse, eIVF, Accuro, and Athena with no shared identifier to link them.",
  source: "Internal",
  product: "Platform",
  daysAgo: 6,
  status: "Proceed",
  owner: "u-bazil",
});

sigDone.tier = "P2";
sigInDelivery.tier = "P2";
sigInQA.tier = "P2";
sigBlocked.tier = "P2";
sigForApproval.tier = "P1";
sigForTechReview.tier = "P2";
sigHelpCenter.tier = "P2";
sigUniquePatientId.tier = "P2";
[sigDone, sigInDelivery, sigInQA, sigBlocked, sigForApproval, sigForTechReview, sigHelpCenter, sigUniquePatientId].forEach((signal) => {
  signal.sla_due_at = slaDueAt(signal.tier, new Date(signal.created_at)).toISOString();
});

const seedSignals: Signal[] = [
  sigDone,
  sigInDelivery,
  sigInQA,
  sigBlocked,
  sigForApproval,
  sigForTechReview,
  sigHelpCenter,
  sigUniquePatientId,
];

const shapingDone: ShapingItem = {
  ...blankShaping(sigDone.id, "u-bazil"),
  commitment_type: "Fix",
  shaping_status: "In Delivery",
  current_step: 5,
  problem_what:
    "Coordinators have no visual indicator showing whether their notes have been saved. They frequently close the tab assuming notes saved when they have not.",
  problem_why:
    "Three clinics reported lost notes in the past month. Coordinators lose 20-30 minutes of work when this happens and have to reconstruct from memory.",
  problem_who: "All clinic coordinators across 13 active clinics, used daily.",
  problem_where: "OttoNotes — note editing screen.",
  problem_evidence: "3 clinic support tickets in past 30 days. Raised in ops call November 2025.",
  roadmap_bucket: "Committed",
  solution_complexity: "Simple",
  solution_approach:
    "Add a save-status indicator component to the OttoNotes editing screen. Shows Saving, Saved, or Error states. Pulls from existing autosave event.",
  solution_criteria:
    "A visible save status indicator appears on the note editing screen. Coordinators can see at a glance whether their notes have synced. Indicator updates within 2 seconds of save.",
  solution_effort: "5 points",
  tech_reviewer_id: "u-waseem",
  tech_review_notes: "Small UI addition using existing autosave events.",
  tech_estimate_pts: 5,
  tech_signed_off_at: new Date(SEED_EPOCH - 13 * 86400000).toISOString(),
  approver_id: "u-alizar",
  approval_decision: "Approved",
  approval_notes: "Approved for Active Sprint.",
  approved_at: new Date(SEED_EPOCH - 12 * 86400000).toISOString(),
  jira_key: "TFP-1038",
  in_sprint: true,
  delivery_status: "Done",
  delivery_assignee_id: "u-zeeshan",
  dev_complete: {
    merged_to_main: true,
    deployed_to_staging: true,
    smoke_test_passed: true,
    signed_off_by: "u-karim",
    signed_off_at: new Date(SEED_EPOCH - 3 * 86400000).toISOString(),
  },
  created_at: new Date(SEED_EPOCH - 14 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 3 * 86400000).toISOString(),
};
sigDone.shaping_item_id = shapingDone.id;

const shapingInDelivery: ShapingItem = {
  ...blankShaping(sigInDelivery.id, "u-alizar"),
  commitment_type: "Feature",
  shaping_status: "In Delivery",
  current_step: 5,
  problem_what: "Clinic admin accounts have no second factor. A stolen password gives full admin access.",
  problem_why:
    "New clinic security policy requires 2FA for all admin accounts by Q2 2026. Two clinics have flagged this as a compliance blocker.",
  problem_who: "All clinic admins across 13 clinics, approximately 40 users.",
  problem_where: "Otto platform login screen and admin user management.",
  problem_evidence: "Security policy document received February 2026. Two clinics flagged in onboarding calls.",
  roadmap_bucket: "Committed",
  solution_complexity: "Medium",
  solution_approach:
    "Add TOTP-based 2FA using existing auth infrastructure. Add enrolment UI to admin profile settings. Add enforcement logic with grace period.",
  solution_criteria:
    "Clinic admins can enrol in TOTP-based 2FA. 2FA is enforced on next login after enrolment deadline. Recovery codes provided.",
  solution_effort: "8 points",
  tech_reviewer_id: "u-ahmed",
  tech_review_notes: "Use existing auth infrastructure and recovery code pattern.",
  tech_estimate_pts: 8,
  tech_signed_off_at: new Date(SEED_EPOCH - 18 * 86400000).toISOString(),
  approver_id: "u-alizar",
  approval_decision: "Approved",
  approval_notes: "Compliance deadline requires this in the active sprint.",
  approved_at: new Date(SEED_EPOCH - 17 * 86400000).toISOString(),
  jira_key: "TFP-1042",
  in_sprint: true,
  delivery_status: "In Progress",
  delivery_assignee_id: "u-farooq",
  created_at: new Date(SEED_EPOCH - 21 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 2 * 86400000).toISOString(),
};
sigInDelivery.shaping_item_id = shapingInDelivery.id;

const shapingInQA: ShapingItem = {
  ...blankShaping(sigInQA.id, "u-bazil"),
  commitment_type: "Fix",
  shaping_status: "In Delivery",
  current_step: 5,
  problem_what:
    "EngagedMD consent and video assignments are not automating correctly for RCC and Olive tenants. Staff are manually assigning consents.",
  problem_why:
    "Manual assignment takes 15 minutes per patient. RCC onboards 30 patients per week. This is 7.5 hours of avoidable admin work weekly.",
  problem_who: "RCC and Olive clinic coordinators, weekly.",
  problem_where: "Otto-Onboard EngagedMD integration layer.",
  problem_evidence: "Raised by RCC coordinator in support ticket. Olive confirmed same issue.",
  roadmap_bucket: "Committed",
  solution_complexity: "Medium",
  solution_approach:
    "Fix tenant-specific automation rules in EngagedMD integration. Add RCC and Olive to automated assignment config.",
  solution_criteria:
    "Consent and video assignments trigger automatically when patient reaches the relevant workflow stage for RCC and Olive tenants. Manual override still available.",
  solution_effort: "8 points",
  tech_reviewer_id: "u-waseem",
  tech_review_notes: "Tenant config change with regression coverage for RCC and Olive.",
  tech_estimate_pts: 8,
  tech_signed_off_at: new Date(SEED_EPOCH - 8 * 86400000).toISOString(),
  approver_id: "u-alizar",
  approval_decision: "Approved",
  approval_notes: "Approved for active tenant rollout.",
  approved_at: new Date(SEED_EPOCH - 7 * 86400000).toISOString(),
  jira_key: "TFP-1045",
  in_sprint: true,
  delivery_status: "In Progress",
  delivery_assignee_id: "u-zeeshan",
  created_at: new Date(SEED_EPOCH - 10 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 86400000).toISOString(),
};
sigInQA.shaping_item_id = shapingInQA.id;

const shapingBlocked: ShapingItem = {
  ...blankShaping(sigBlocked.id, "u-bazil"),
  commitment_type: "Fix",
  shaping_status: "In Delivery",
  current_step: 5,
  problem_what: "Phelix AI webhook delivery is taking over 30 seconds for notes sync events causing visible lag in OttoNotes.",
  problem_why:
    "Coordinators see a delay between completing a note in Phelix and it appearing in OttoNotes. Two clinics have reported this as a data reliability concern.",
  problem_who: "All clinics using Phelix AI integration, currently RCC and OFC.",
  problem_where: "Phelix AI to OttoNotes webhook integration.",
  problem_evidence: "Monitoring alert fired 6 hours ago. Taha confirmed in Jira comment.",
  roadmap_bucket: "Committed",
  solution_complexity: "Medium",
  solution_approach:
    "Investigate Phelix webhook retry logic and queue depth. Implement exponential backoff. Add latency monitoring.",
  solution_criteria:
    "Webhook delivery latency under 5 seconds for 95% of events. Alert threshold updated to flag anything over 10 seconds.",
  solution_effort: "5 points",
  tech_reviewer_id: "u-waseem",
  tech_review_notes: "Requires vendor documentation before retry changes are finalized.",
  tech_estimate_pts: 5,
  tech_signed_off_at: new Date(SEED_EPOCH - 6 * 86400000).toISOString(),
  approver_id: "u-alizar",
  approval_decision: "Approved",
  approval_notes: "Approved with vendor-doc dependency noted.",
  approved_at: new Date(SEED_EPOCH - 5 * 86400000).toISOString(),
  jira_key: "TFP-1047",
  in_sprint: true,
  delivery_status: "Blocked",
  blocked_since: new Date(SEED_EPOCH - 2 * 86400000).toISOString(),
  blocker_description:
    "Waiting on Phelix AI to share updated webhook documentation. Hamim confirmed docs are being updated but no ETA given.",
  delivery_assignee_id: "u-waseem",
  created_at: new Date(SEED_EPOCH - 8 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 2 * 86400000).toISOString(),
};
sigBlocked.shaping_item_id = shapingBlocked.id;

const shapingForApproval: ShapingItem = {
  ...blankShaping(sigForApproval.id, "u-bazil"),
  commitment_type: "Fix",
  shaping_status: "In Delivery",
  current_step: 5,
  problem_what:
    "When CNP sends a returning patient to eIVF at Generation Fertility, a duplicate patient record is created if the patient was originally registered outside CNP.",
  problem_why:
    "Duplicate records cause billing errors, treatment history gaps, and confusion for clinic staff. Generation Fertility reported 12 duplicate records in the past 2 weeks.",
  problem_who: "Generation Fertility clinical staff and patients. Affects all returning patients not originally registered via CNP.",
  problem_where: "CNP to eIVF EMR integration — send patient flow.",
  problem_evidence: "Generation Fertility support ticket CNP-12852. 12 confirmed duplicates reported.",
  roadmap_bucket: "Committed",
  solution_complexity: "Medium",
  solution_approach:
    "Add pre-send deduplication check to eIVF integration. Match on email + DOB. If match found, return existing eIVF ID. Log all matches for audit.",
  solution_criteria:
    "CNP checks for existing eIVF record by email and date of birth before creating new record. If match found, links to existing record instead of creating duplicate.",
  solution_effort: "8 points",
  tech_reviewer_id: "u-ahmed",
  tech_review_notes: "Dedup check should be audited and guarded behind integration feature flag.",
  tech_estimate_pts: 8,
  tech_signed_off_at: new Date(SEED_EPOCH - 4 * 86400000).toISOString(),
  approver_id: "u-alizar",
  approval_decision: "Approved",
  approval_notes: "Added for patient care risk at Generation Fertility.",
  approved_at: new Date(SEED_EPOCH - 3 * 86400000).toISOString(),
  jira_key: "TFP-1049",
  in_sprint: true,
  delivery_status: "To Do",
  delivery_assignee_id: "u-farooq",
  created_at: new Date(SEED_EPOCH - 5 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 86400000).toISOString(),
};
sigForApproval.shaping_item_id = shapingForApproval.id;

const shapingInTechReview: ShapingItem = {
  ...blankShaping(sigForTechReview.id, "u-bazil"),
  commitment_type: "Feature",
  shaping_status: "In Tech Review",
  current_step: 4,
  problem_what:
    "Heartland clinic is scheduled for go-live but their pre-production environment has not been configured. Workflows, forms, and templates need to be set up before UAT can begin.",
  problem_why:
    "Heartland go-live is planned for next sprint. Without pre-prod setup this week, UAT cannot start and the go-live date slips.",
  problem_who: "Heartland clinic coordinator team and TFP onboarding team.",
  problem_where: "CNP admin panel — tenant configuration for Heartland.",
  problem_evidence: "CNP-13562 in Jira. Go-live planning ticket.",
  roadmap_bucket: "Committed",
  solution_complexity: "Medium",
  solution_approach:
    "Create Heartland tenant in pre-prod. Configure workflows from requirements doc. Set up email templates. Verify integrations in pre-prod.",
  solution_criteria:
    "Heartland pre-production environment is fully configured. Workflows match clinic requirements document. Sami can begin UAT walkthrough with clinic.",
  solution_effort: "Pending tech review",
  tech_reviewer_id: "u-waseem",
  tech_review_notes: "",
  tech_estimate_pts: null,
  created_at: new Date(SEED_EPOCH - 4 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 86400000).toISOString(),
};
sigForTechReview.shaping_item_id = shapingInTechReview.id;

const shapingInProgress: ShapingItem = {
  ...blankShaping(sigUniquePatientId.id, "u-bazil"),
  commitment_type: "Research",
  shaping_status: "In Shaping",
  current_step: 2,
  problem_what:
    "Patients exist in OttoOnboard, OttoNotes, OttoPulse, and downstream EMRs (eIVF, Accuro, Athena) as completely separate records with no shared identifier. The same patient has a different ID in every system.",
  problem_why:
    "Consent forms cannot route to correct records. Nurses cannot reliably match patients across systems. Duplicate records keep appearing (see CNP-12852, CNP-12662, TPI-113). A unified patient timeline is impossible without a shared key.",
  problem_who: "All clinic staff across 13 clinics. Affects every patient interaction that touches more than one system.",
  problem_where: "Cross-system: OttoOnboard, OttoNotes, OttoPulse, eIVF, Accuro, Athena.",
  problem_evidence:
    "Three live Jira tickets: CNP-12852 (eIVF duplicates at GF), CNP-12662 (Olive duplicate on phone match), TPI-113 (Athena/Illume duplicates). Raised as strategic issue April 28 2026.",
  roadmap_bucket: "Backlog",
  solution_complexity: "Complex",
  solution_questions:
    "Should CNP UUID become the master key or do we create a new TFP-wide patient ID? What changes are needed in OttoNotes and OttoPulse to store a foreign key? How do we handle patients who exist in EMR but were never in CNP? Who owns the master record and what triggers a merge?",
  solution_decisions: "Research commitment.",
  created_at: new Date(SEED_EPOCH - 6 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 86400000).toISOString(),
};
sigUniquePatientId.shaping_item_id = shapingInProgress.id;

const seedShaping: ShapingItem[] = [
  shapingDone,
  shapingInDelivery,
  shapingInQA,
  shapingBlocked,
  shapingForApproval,
  shapingInTechReview,
  shapingInProgress,
];
seedShaping.forEach((item) => {
  item.shaping_started_at = item.created_at;
});

function pickReviewSize(s: ShapingItem): ReviewSize {
  const pts = s.tech_estimate_pts ?? 0;
  if (s.solution_complexity === "Complex" || pts >= 13) return "Large";
  if (s.solution_complexity === "Medium" || pts >= 5) return "Medium";
  return "Small";
}

const seedReviews: Review[] = [
  {
    id: "rv-" + uid(),
    shaping_id: shapingDone.id,
    signal_id: sigDone.id,
    size: pickReviewSize(shapingDone),
    status: "Pending",
    pm_owner_id: shapingDone.pm_owner_id,
    scheduled_for: new Date(SEED_EPOCH + 3 * 86400000).toISOString(),
    completed_at: null,
    outcome_rating: null,
    what_worked: "",
    what_didnt: "",
    follow_on_signals_created: [],
    notes: "",
    follow_on_draft_title: "",
    follow_on_draft_description: "",
    created_at: new Date(SEED_EPOCH - 4 * 86400000).toISOString(),
    updated_at: new Date(SEED_EPOCH - 4 * 86400000).toISOString(),
  },
];

const seedJiraEvents: JiraEvent[] = [
  {
    id: "je-" + uid(),
    ts: new Date(SEED_EPOCH - 17 * 86400000).toISOString(),
    direction: "outbound",
    type: "issue.created",
    jira_key: "TFP-1042",
    shaping_id: shapingInDelivery.id,
    payload: { summary: shapingInDelivery.problem_what.slice(0, 60), points: 8 },
  },
  {
    id: "je-" + uid(),
    ts: new Date(SEED_EPOCH - 2 * 86400000).toISOString(),
    direction: "inbound",
    type: "issue.transitioned",
    jira_key: "TFP-1042",
    shaping_id: shapingInDelivery.id,
    payload: { from: "To Do", to: "In Progress" },
  },
  {
    id: "je-" + uid(),
    ts: new Date(SEED_EPOCH - 7 * 86400000).toISOString(),
    direction: "outbound",
    type: "issue.created",
    jira_key: "TFP-1045",
    shaping_id: shapingInQA.id,
    payload: { summary: shapingInQA.problem_what.slice(0, 60), points: 8 },
  },
  {
    id: "je-" + uid(),
    ts: new Date(SEED_EPOCH - 86400000).toISOString(),
    direction: "inbound",
    type: "issue.transitioned",
    jira_key: "TFP-1045",
    shaping_id: shapingInQA.id,
    payload: { from: "To Do", to: "In Progress" },
  },
  {
    id: "je-" + uid(),
    ts: new Date(SEED_EPOCH - 5 * 86400000).toISOString(),
    direction: "outbound",
    type: "issue.created",
    jira_key: "TFP-1047",
    shaping_id: shapingBlocked.id,
    payload: { summary: shapingBlocked.problem_what.slice(0, 60), points: 5 },
  },
  {
    id: "je-" + uid(),
    ts: new Date(SEED_EPOCH - 2 * 86400000).toISOString(),
    direction: "inbound",
    type: "issue.transitioned",
    jira_key: "TFP-1047",
    shaping_id: shapingBlocked.id,
    payload: { from: "In Progress", to: "Blocked" },
  },
  {
    id: "je-" + uid(),
    ts: new Date(SEED_EPOCH - 3 * 86400000).toISOString(),
    direction: "outbound",
    type: "issue.created",
    jira_key: "TFP-1049",
    shaping_id: shapingForApproval.id,
    payload: { summary: shapingForApproval.problem_what.slice(0, 60), points: 8 },
  },
  {
    id: "je-" + uid(),
    ts: new Date(SEED_EPOCH - 12 * 86400000).toISOString(),
    direction: "outbound",
    type: "issue.created",
    jira_key: "TFP-1038",
    shaping_id: shapingDone.id,
    payload: { summary: shapingDone.problem_what.slice(0, 60), points: 5 },
  },
  {
    id: "je-" + uid(),
    ts: new Date(SEED_EPOCH - 3 * 86400000).toISOString(),
    direction: "inbound",
    type: "issue.transitioned",
    jira_key: "TFP-1038",
    shaping_id: shapingDone.id,
    payload: { from: "In QA", to: "Done" },
  },
];

// ============ Wave 4 seed data ============

let _ovrCounter = 2;
function nextOverrideId() {
  _ovrCounter += 1;
  return "OVR-" + _ovrCounter.toString().padStart(3, "0");
}

let _decCounter = 8;
function nextDecisionId() {
  _decCounter += 1;
  return "DEC-" + _decCounter.toString().padStart(3, "0");
}

const seedOverrides: Override[] = [
  {
    id: "OVR-001",
    kind: "Capacity exceeded",
    reason: "2FA pulled forward for clinic compliance deadline. Sprint at 87% allocation. Accepted risk.",
    signal_id: sigInDelivery.id,
    shaping_id: shapingInDelivery.id,
    sprint_id: seedSprint.id,
    displaced_shaping_ids: [],
    displaced_pts: 0,
    raised_by: "u-alizar",
    raised_at: new Date(SEED_EPOCH - 6 * 86400000).toISOString(),
    ack_status: "Acknowledged",
    acknowledged_by: "u-shahid",
    acknowledged_at: new Date(SEED_EPOCH - 5 * 86400000).toISOString(),
    shahid_visible: true,
  },
  {
    id: "OVR-002",
    kind: "Scope added mid-sprint",
    reason: "eIVF duplicate records causing patient care risk at Generation Fertility. Added to sprint with Shahid approval.",
    signal_id: sigForApproval.id,
    shaping_id: shapingForApproval.id,
    sprint_id: seedSprint.id,
    displaced_shaping_ids: [],
    displaced_pts: 0,
    raised_by: "u-bazil",
    raised_at: new Date(SEED_EPOCH - 2 * 86400000).toISOString(),
    ack_status: "Pending",
    acknowledged_by: null,
    acknowledged_at: null,
    shahid_visible: true,
  },
];

const seedGoLive: GoLiveChecklist[] = [
  {
    id: "gl-" + uid(),
    shaping_id: shapingInTechReview.id,
    product: "Otto-Onboard",
    release_name: "Procrea QC Go-Live",
    scheduled_for: new Date(SEED_EPOCH + 14 * 86400000).toISOString(),
    status: "In Progress",
    war_room: false,
    criteria: {
      "1. Initial workflow discussion with the clinic": {
        done: true,
        note: "Workflow discussion completed with Procrea QC operations and physician stakeholders.",
        checked_by: "u-sami",
        checked_at: new Date(SEED_EPOCH -13 * 86400000).toISOString(),
      },
      "2. Create workflow requirements document": {
        done: true,
        note: "Requirements document approved for Procrea QC onboarding.",
        checked_by: "u-bazil",
        checked_at: new Date(SEED_EPOCH -12 * 86400000).toISOString(),
      },
      "3. Obtain health forms from the clinic": {
        done: true,
        note: "Clinic shared the French and English health form packet.",
        checked_by: "u-sami",
        checked_at: new Date(SEED_EPOCH -11 * 86400000).toISOString(),
      },
      "4. Align with physicians on health form content": {
        done: true,
        note: "Physician review completed with minor wording updates.",
        checked_by: "u-bazil",
        checked_at: new Date(SEED_EPOCH -10 * 86400000).toISOString(),
      },
      "5. Gather all required configuration items": {
        done: true,
        note: "Required configuration items gathered from clinic admin team.",
        checked_by: "u-bazil",
        checked_at: new Date(SEED_EPOCH -9 * 86400000).toISOString(),
      },
      "6. Configure workflows, forms, and templates in CNP": {
        done: true,
        note: "CNP workflows, forms, and templates configured for pre-production.",
        checked_by: "u-waseem",
        checked_at: new Date(SEED_EPOCH -8 * 86400000).toISOString(),
      },
      "7. Prepare pre-production environment with configuration": {
        done: true,
        note: "Pre-production environment prepared with Procrea QC configuration.",
        checked_by: "u-waseem",
        checked_at: new Date(SEED_EPOCH -7 * 86400000).toISOString(),
      },
      "8. Product validation of configurations (internal TFP review)": {
        done: true,
        note: "Internal TFP product validation completed.",
        checked_by: "u-bazil",
        checked_at: new Date(SEED_EPOCH -6 * 86400000).toISOString(),
      },
      "9. Get email content validated (clinic approval)": {
        done: true,
        note: "Clinic approved email content for UAT.",
        checked_by: "u-sami",
        checked_at: new Date(SEED_EPOCH -5 * 86400000).toISOString(),
      },
      "10. Walk through pre-prod workflow with clinic and gather feedback": {
        done: true,
        note: "Walkthrough completed; feedback captured for final updates.",
        checked_by: "u-sami",
        checked_at: new Date(SEED_EPOCH -4 * 86400000).toISOString(),
      },
      "11. Implement clinic feedback": {
        done: false,
        note: "Pending final feedback implementation.",
        checked_by: null,
        checked_at: null,
      },
      "12. Get consents and privacy policy through Legal": {
        done: false,
        note: "Pending French language review and Law 25 compliance sign-off.",
        checked_by: null,
        checked_at: null,
      },
      "13. Clinic UAT — minimum 2-3 scenarios tested by clinic staff": {
        done: false,
        note: "Pending clinic UAT scenarios.",
        checked_by: null,
        checked_at: null,
      },
      "14. Decide on go-live date (confirmed with clinic)": {
        done: false,
        note: "",
        checked_by: null,
        checked_at: null,
      },
      "15. Prepare production environment": {
        done: false,
        note: "",
        checked_by: null,
        checked_at: null,
      },
      "16a. Complete eIVF integration": {
        done: false,
        note: "",
        checked_by: null,
        checked_at: null,
      },
      "16b. Complete EngagedMD integration": {
        done: false,
        note: "[Not applicable]",
        checked_by: null,
        checked_at: null,
      },
      "16c. Complete Google Analytics integration": {
        done: false,
        note: "",
        checked_by: null,
        checked_at: null,
      },
      "16d. Complete Accuro / IDEAS / Oscar / other EMR integration": {
        done: false,
        note: "",
        checked_by: null,
        checked_at: null,
      },
      "17. Final testing in production": {
        done: false,
        note: "",
        checked_by: null,
        checked_at: null,
      },
      "18. Define go-live plan (roles, timing, rollback criteria)": {
        done: false,
        note: "",
        checked_by: null,
        checked_at: null,
      },
      "19. Go-live execution": {
        done: false,
        note: "",
        checked_by: null,
        checked_at: null,
      },
      "20. Post-launch follow-up with clinic within 48 hours": {
        done: false,
        note: "",
        checked_by: null,
        checked_at: null,
      },
    },
    go_no_go_decision: null,
    go_no_go_by: null,
    go_no_go_at: null,
    created_at: new Date(SEED_EPOCH - 14 * 86400000).toISOString(),
    updated_at: new Date(SEED_EPOCH - 86400000).toISOString(),
  },
];

const seedComms: CommsItem[] = [
  {
    id: "cm-" + uid(),
    product: "Otto Notes",
    channel: "Email",
    audience: "All clinics",
    subject: "New: see when your notes have saved",
    body: "Hello team,\n\nWe've added a save-status indicator to Otto Notes so coordinators can see at a glance whether their notes have synced. No action needed — it's live next Tuesday.\n\nWith care,\nSami",
    drafted_by: "u-sami",
    drafted_at: new Date(SEED_EPOCH - 2 * 86400000).toISOString(),
    status: "Pending Approval",
    approved_by: null,
    approved_at: null,
    sent_at: null,
    rejected_reason: null,
    linked_shaping_id: shapingInQA.id,
    comms_type: "Go-live update",
    requires_pm_approval: false,
  },
  {
    id: "cm-" + uid(),
    product: "Platform",
    channel: "In-app banner",
    audience: "Clinic admins",
    subject: "2FA enrollment opens 22 April",
    body: "Admin accounts will require 2FA from 22 April. Enrollment opens this week — set up TOTP in your profile settings. Recovery codes provided.",
    drafted_by: "u-sami",
    drafted_at: new Date(SEED_EPOCH - 4 * 86400000).toISOString(),
    status: "Approved",
    approved_by: "u-bazil",
    approved_at: new Date(SEED_EPOCH - 3 * 86400000).toISOString(),
    sent_at: null,
    rejected_reason: null,
    linked_shaping_id: shapingInDelivery.id,
    comms_type: "Go-live update",
    requires_pm_approval: false,
  },
  {
    id: "cm-" + uid(),
    product: "Otto Pulse",
    channel: "Email",
    audience: "All clinics",
    subject: "Faster coordinator dashboard — now live",
    body: "The coordinator dashboard now loads in under 2 seconds on clinic Wi-Fi. No action needed.",
    drafted_by: "u-sami",
    drafted_at: new Date(SEED_EPOCH - 6 * 86400000).toISOString(),
    status: "Sent",
    approved_by: "u-bazil",
    approved_at: new Date(SEED_EPOCH - 5 * 86400000).toISOString(),
    sent_at: new Date(SEED_EPOCH - 4 * 86400000).toISOString(),
    rejected_reason: null,
    linked_shaping_id: shapingDone.id,
    comms_type: "Go-live update",
    requires_pm_approval: false,
  },
  {
    id: "cm-" + uid(),
    product: "FertiWise",
    channel: "Teams",
    audience: "Marketing ops",
    subject: "Lead form 500s — fix in flight",
    body: "Heads up: the lead form had an 8% 500-rate since the 8 April deploy. Patch is in QA, expect resolution by EOD tomorrow.",
    drafted_by: "u-sami",
    drafted_at: new Date(SEED_EPOCH - 86400000).toISOString(),
    status: "Draft",
    approved_by: null,
    approved_at: null,
    sent_at: null,
    rejected_reason: null,
    linked_shaping_id: shapingBlocked.id,
    comms_type: "Incident update",
    requires_pm_approval: true,
  },
];

// ============ New entity seeds ============

const ACTIVE_CLINIC_NAMES = [
  "OFC", "RCC", "Procrea QC", "GF Waterloo", "GF Vaughan", "GF Newmarket",
  "GF Twin Waters", "Heartland", "Aurora", "Kelowna", "Ovo", "Olive", "Grace",
];

const seedClinics: Clinic[] = ACTIVE_CLINIC_NAMES.map((name, i) => ({
  id: "cl-" + (i + 1).toString().padStart(3, "0"),
  name,
  status: "Active" as ClinicStatus,
  product: (["Otto-Onboard", "Otto Notes", "Otto Pulse"] as Product[])[i % 3],
  clinic_contact_name: `${name} Lead`,
  clinic_contact_email: `lead@${name.toLowerCase().replace(/\s+/g, "")}.example`,
  go_live_date: new Date(SEED_EPOCH - (60 + i * 5) * 86400000).toISOString(),
  offboarded_at: null,
  offboarded_by_id: null,
  offboard_reason: null,
}));

const seedMonitoring: MonitoringAlert[] = [
  {
    id: "mon-" + uid(),
    system: "Phelix AI",
    integration: "Notes sync webhook",
    severity: "P2",
    message: "Webhook delivery latency > 30s on 3 events.",
    detected_at: new Date(SEED_EPOCH - 6 * 3600000).toISOString(),
    signal_id: null,
    deduplicated: false,
  },
  {
    id: "mon-" + uid(),
    system: "Accuro",
    integration: "Patient roster nightly sync",
    severity: "P1",
    message: "Sync failed: connection refused for 4 retries.",
    detected_at: new Date(SEED_EPOCH - 18 * 3600000).toISOString(),
    signal_id: null,
    deduplicated: true,
  },
];

const seedTechDebtReviews: TechDebtReview[] = [
  {
    id: "tdr-" + uid(),
    reviewed_by_id: "u-bazil",
    reviewed_at: new Date(SEED_EPOCH - 80 * 86400000).toISOString(),
    quarter: "Q1 2026",
    items_scheduled: 3,
    items_deferred: 5,
    notes: "Sprint 2-3 absorbed scheduled items; deferred items revisited next quarter.",
  },
];

const seedDecisions: Decision[] = [
  {
    id: "DEC-005",
    title: "Adopt Microsoft Entra (OIDC) over SAML for clinic SSO",
    type: "Architectural",
    status: "Decided",
    context: "Clinics are on Microsoft 365. Two SSO protocols on the table: OIDC vs SAML.",
    options_considered: "1) OIDC via Entra. 2) SAML via Entra. 3) Build our own.",
    decision: "Use OIDC via Microsoft Entra — better DX, native multi-tenant.",
    consequences: "We must keep a password fallback for non-Entra users.",
    decided_by: "u-waseem",
    decided_at: new Date(SEED_EPOCH - 6 * 86400000).toISOString(),
    linked_signal_id: sigForTechReview.id,
    linked_shaping_id: shapingInTechReview.id,
    superseded_by_id: null,
  },
  {
    id: "DEC-006",
    title: "Cap CSV import at 5,000 rows per upload",
    type: "Product",
    status: "Decided",
    context: "Bulk patient import for new clinic onboarding.",
    options_considered: "1) Unlimited streaming. 2) 5,000 cap. 3) 1,000 cap.",
    decision: "5,000 rows per upload, async worker for >500.",
    consequences: "Largest pilot clinic needs 2 uploads. Acceptable.",
    decided_by: "u-bazil",
    decided_at: new Date(SEED_EPOCH - 86400000).toISOString(),
    linked_signal_id: sigForApproval.id,
    linked_shaping_id: shapingForApproval.id,
    superseded_by_id: null,
  },
  {
    id: "DEC-007",
    title: "Lock sprint scope after kickoff (Mondays 10am)",
    type: "Process",
    status: "Decided",
    context: "Mid-sprint scope creep was eroding throughput.",
    options_considered: "1) Hard lock + override flow. 2) Soft warn. 3) No lock.",
    decision: "Soft warn at >85% capacity; OVR-NNN for any mid-sprint addition.",
    consequences: "All overrides Shahid-visible, reviewed at sprint retro.",
    decided_by: "u-alizar",
    decided_at: new Date(SEED_EPOCH - 12 * 86400000).toISOString(),
    linked_signal_id: null,
    linked_shaping_id: null,
    superseded_by_id: null,
  },
  {
    id: "DEC-008",
    title: "QA sign-off mandatory before Done transition",
    type: "Process",
    status: "Decided",
    context: "Two regressions shipped in Sprint 4 from items marked Done without QA.",
    options_considered: "1) Mandatory checkbox. 2) Trust-based. 3) Karim-only gate.",
    decision: "Three-checkbox dev-complete gate (tests / docs / QA) before Done.",
    consequences: "Adds ~10 min per ticket but prevents regressions.",
    decided_by: "u-karim",
    decided_at: new Date(SEED_EPOCH - 18 * 86400000).toISOString(),
    linked_signal_id: null,
    linked_shaping_id: null,
    superseded_by_id: null,
  },
];

const seedRetros: SprintRetro[] = [
  {
    id: "rt-" + uid(),
    sprint_id: "s-3",
    what_worked: "Tighter triage standup kept SLA breaches at zero.",
    what_didnt: "Tech review queue backed up — Waseem doing all of it solo.",
    one_change: "Add Ahmed as second tech reviewer.",
    primary_theme: "Capacity",
    created_by: "u-alizar",
    created_at: new Date(SEED_EPOCH - 56 * 86400000).toISOString(),
    escalated: false,
  },
  {
    id: "rt-" + uid(),
    sprint_id: "s-4",
    what_worked: "Clinic comms approval gate prevented two confused emails.",
    what_didnt: "Tech review still the bottleneck even with Ahmed on board.",
    one_change: "Block work-in-progress: max 2 items per reviewer.",
    primary_theme: "Capacity",
    created_by: "u-alizar",
    created_at: new Date(SEED_EPOCH - 42 * 86400000).toISOString(),
    escalated: false,
  },
  {
    id: "rt-" + uid(),
    sprint_id: "s-5",
    what_worked: "WIP limit kept reviewers focused.",
    what_didnt: "Capacity still tight — 4 mid-sprint adds, all overrides.",
    one_change: "Stop accepting Committed-bucket items in week 2 of sprint.",
    primary_theme: "Capacity",
    created_by: "u-alizar",
    created_at: new Date(SEED_EPOCH - 14 * 86400000).toISOString(),
    escalated: true,
  },
];

const seedAudit: AuditEntry[] = [
  {
    id: "au-" + uid(),
    ts: new Date(SEED_EPOCH - 21 * 86400000).toISOString(),
    actor_id: "u-sami",
    entity_type: "signal",
    entity_id: sigDone.id,
    action: "Signal created",
  },
  {
    id: "au-" + uid(),
    ts: new Date(SEED_EPOCH - 19 * 86400000).toISOString(),
    actor_id: "u-bazil",
    entity_type: "signal",
    entity_id: sigDone.id,
    action: "Triaged → Proceed",
  },
  {
    id: "au-" + uid(),
    ts: new Date(SEED_EPOCH - 18 * 86400000).toISOString(),
    actor_id: "u-waseem",
    entity_type: "shaping",
    entity_id: shapingDone.id,
    action: "Tech review signed off",
    after: "5 pts",
  },
  {
    id: "au-" + uid(),
    ts: new Date(SEED_EPOCH - 17 * 86400000).toISOString(),
    actor_id: "u-alizar",
    entity_type: "shaping",
    entity_id: shapingDone.id,
    action: "Approved",
  },
  {
    id: "au-" + uid(),
    ts: new Date(SEED_EPOCH - 4 * 86400000).toISOString(),
    actor_id: "u-karim",
    entity_type: "shaping",
    entity_id: shapingDone.id,
    action: "Dev-complete gate signed off (tests, docs, QA)",
  },
  {
    id: "au-" + uid(),
    ts: new Date(SEED_EPOCH - 4 * 86400000).toISOString(),
    actor_id: "u-bazil",
    entity_type: "shaping",
    entity_id: shapingDone.id,
    action: "Delivery → Done",
    before: "In QA",
    after: "Done",
  },
  {
    id: "au-" + uid(),
    ts: new Date(SEED_EPOCH - 5 * 86400000).toISOString(),
    actor_id: "u-alizar",
    entity_type: "override",
    entity_id: "OVR-003",
    action: "Override logged: capacity exceeded",
  },
  {
    id: "au-" + uid(),
    ts: new Date(SEED_EPOCH - 6 * 86400000).toISOString(),
    actor_id: "u-bazil",
    entity_type: "override",
    entity_id: "OVR-004",
    action: "Override logged: bypass tech review",
  },
  {
    id: "au-" + uid(),
    ts: new Date(SEED_EPOCH - 86400000).toISOString(),
    actor_id: "u-alizar",
    entity_type: "override",
    entity_id: "OVR-005",
    action: "Override logged: scope added mid-sprint",
  },
  {
    id: "au-" + uid(),
    ts: new Date(SEED_EPOCH - 2 * 86400000).toISOString(),
    actor_id: "u-bazil",
    entity_type: "shaping",
    entity_id: shapingBlocked.id,
    action: "Delivery → Blocked",
    before: "In Progress",
    after: "Blocked",
  },
];

const seedNotifications: Notification[] = [
  buildNotification({
    trigger: "blocked_over_1d",
    title: "TFP-1047 blocked > 1 day",
    body: "Phelix AI webhook latency is waiting on updated vendor documentation.",
    link_to: "/delivery",
    for_user_id: "u-shahid",
    entity_id: shapingBlocked.id,
    ts: new Date(SEED_EPOCH - 7200000).toISOString(),
  }),
  buildNotification({
    trigger: "override_logged",
    title: "OVR-002 awaiting Shahid acknowledgement",
    body: "Scope added mid-sprint for eIVF duplicate records at Generation Fertility.",
    link_to: "/delivery",
    for_user_id: "u-shahid",
    entity_id: "OVR-002",
    ts: new Date(SEED_EPOCH - 86400000).toISOString(),
  }),
  buildNotification({
    trigger: "tech_review_ready",
    title: "Heartland configuration ready for tech review",
    body: "Heartland pre-production setup needs Waseem's estimate before UAT can begin.",
    link_to: "/shaping",
    for_user_id: "u-waseem",
    entity_id: shapingInTechReview.id,
    ts: new Date(SEED_EPOCH - 1800000).toISOString(),
  }),
  buildNotification({
    trigger: "sla_breach",
    title: "SLA breach: eIVF duplicate patient records",
    body: "P1 signal needs close delivery tracking. Owner: Bazil.",
    link_to: "/delivery",
    for_user_id: shapingForApproval.pm_owner_id,
    entity_id: sigForApproval.id,
    ts: new Date(SEED_EPOCH - 3600000).toISOString(),
  }),
  buildNotification({
    trigger: "shaping_stuck",
    title: "Research needed: TFP-wide patient identifier",
    body: "Unique patient ID strategy is in shaping with open architecture questions.",
    link_to: "/shaping",
    for_user_id: shapingInProgress.pm_owner_id,
    entity_id: shapingInProgress.id,
    ts: new Date(SEED_EPOCH - 14400000).toISOString(),
  }),
];

type State = {
  currentUserId: string;
  users: User[];
  sprint: Sprint;
  sprints: Sprint[];
  signals: Signal[];
  shaping: ShapingItem[];
  jiraEvents: JiraEvent[];
  reviews: Review[];
  audit: AuditEntry[];
  overrides: Override[];
  goLives: GoLiveChecklist[];
  comms: CommsItem[];
  decisions: Decision[];
  retros: SprintRetro[];
  notifications: Notification[];
  clinics: Clinic[];
  monitoringAlerts: MonitoringAlert[];
  techDebtReviews: TechDebtReview[];
  clinicFeedbackLog: ClinicFeedbackRecord[];
  // Round 5
  flags: FeatureFlags;
  helpArticles: HelpArticle[];
  workflows: Workflow[];
  setCurrentUser: (id: string) => void;
  createSignal: (data: {
    title: string;
    description: string;
    source: Signal["source"];
    product: Signal["product"];
    issue_type_override?: Signal["issue_type"];
    tier_override?: Signal["tier"];
    displacement_flag: boolean;
    displacement_note: string | null;
    priority?: import("./types").IntakePriority;
    labels?: string[];
    attachments?: Attachment[];
  }) => Signal;
  triageDecision: (
    signalId: string,
    decision: "Proceed" | "Hold" | "Reject",
    reason?: string,
    holdUntil?: string,
    commitmentType?: import("./types").CommitmentType | null,
  ) => void;
  updateSignal: (signalId: string, patch: Partial<Signal>, opts?: { force?: boolean; reason?: string }) => { ok: boolean; error?: string };
  setSignalAttachments: (signalId: string, next: Attachment[]) => void;
  setShapingAttachments: (shapingId: string, next: Attachment[]) => void;
  updateShaping: (id: string, patch: Partial<ShapingItem>) => void;
  setRoadmapBucket: (id: string, bucket: RoadmapBucket, displacement: string) => void;
  setComplexity: (id: string, c: Complexity) => void;
  signOffTechReview: (id: string, reviewerId: string) => void;
  approveShaping: (id: string, approverId: string, notes: string) => void;
  requestChanges: (id: string, approverId: string, notes: string) => void;
  approveFastTrack: (id: string, approverId: string) => void;
  pushToJira: (id: string) => string;
  addToSprint: (id: string, overrideReason?: string, overrideKind?: OverrideKind) => boolean;
  removeFromSprint: (id: string) => boolean;
  setDeliveryStatus: (id: string, next: DeliveryStatus) => void;
  setBlocked: (id: string, description: string) => void;
  unblock: (id: string, next: DeliveryStatus) => void;
  setDeliveryAssignee: (id: string, userId: string | null) => void;
  syncFromJira: () => number;
  startReview: (shapingId: string) => Review | null;
  updateReview: (id: string, patch: Partial<Review>) => void;
  scheduleReview: (id: string, when: string) => void;
  completeReview: (
    id: string,
    data: { outcome_rating: OutcomeRating; what_worked: string; what_didnt: string; notes: string },
  ) => void;
  logFollowOnSignal: (
    reviewId: string,
    data: { title: string; description: string; source: Signal["source"]; product: Signal["product"] },
  ) => Signal;
  closeSprint: (data: { summary: string; what_worked: string; what_didnt: string; one_change: string; primary_theme: RetroTheme }) => void;
  toggleDevCompleteGate: (id: string, key: "merged_to_main" | "deployed_to_staging" | "smoke_test_passed", value: boolean) => void;
  signOffDevComplete: (id: string) => void;
  toggleSprintLock: () => void;
  logOverride: (data: {
    kind: OverrideKind;
    reason: string;
    signal_id?: string | null;
    shaping_id?: string | null;
    displaced_shaping_ids?: string[];
    displaced_pts?: number;
    shahid_visible?: boolean;
  }) => Override;
  ackOverride: (id: string) => void;
  upsertGoLive: (data: Partial<GoLiveChecklist> & { id?: string; shaping_id: string; product: Product; release_name: string; scheduled_for: string; criteria_keys?: string[] }) => GoLiveChecklist;
  toggleGoLiveCriterion: (id: string, criterion: string, done: boolean, note?: string) => void;
  toggleGoLiveWarRoom: (id: string) => void;
  setGoLiveDecision: (id: string, decision: "Go" | "No-Go") => void;
  createComms: (data: Omit<CommsItem, "id" | "drafted_by" | "drafted_at" | "status" | "approved_by" | "approved_at" | "sent_at" | "rejected_reason" | "requires_pm_approval"> & { requires_pm_approval?: boolean }) => CommsItem;
  submitCommsForApproval: (id: string) => void;
  approveComms: (id: string) => void;
  rejectComms: (id: string, reason: string) => void;
  sendComms: (id: string) => void;
  createDecision: (data: Omit<Decision, "id" | "decided_at" | "decided_by" | "status" | "superseded_by_id">) => Decision;
  createRetro: (data: Omit<SprintRetro, "id" | "created_at" | "created_by" | "escalated">) => SprintRetro;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  pushNotification: (n: {
    trigger: NotificationTrigger;
    title: string;
    body: string;
    link_to?: string | null;
    for_user_id?: string | null;
    entity_id?: string | null;
    ts?: string;
  }) => Notification;
  audit_log: (entry: Omit<AuditEntry, "id" | "ts" | "actor_id">) => void;
  // Clinics
  offboardClinic: (clinicId: string, reason: string) => void;
  // Sprints
  createSprint: (data: { name: string; start_date: string; end_date: string; gross_capacity_pts: number; notes?: string }) => Sprint;
  // Tech debt
  markTechDebtReviewed: (shapingId: string) => void;
  recordTechDebtReview: (data: Omit<TechDebtReview, "id" | "reviewed_by_id" | "reviewed_at">) => TechDebtReview;
  // Monitoring
  simulateMonitoringAlert: (data: { system: MonitoringSystem; integration: string; severity: MonitoringSeverity; message: string }) => MonitoringAlert;
  // Public clinic feedback
  submitClinicFeedback: (data: { clinic_id: string; clinic_name: string; reporter_name: string; description: string; urgent: boolean }) => { ok: true; signal_id: string } | { ok: false; reason: string };
  // Onboarding
  completeOnboardingItem: (userId: string, itemId: string) => void;
  completeOnboarding: (userId: string) => void;
  resetOnboarding: (userId: string) => void;
  // Round 5: feature flags / users / help / workflows
  setFlag: (key: keyof FeatureFlags, value: boolean) => void;
  upsertUser: (user: User) => void;
  removeUser: (userId: string) => void;
  upsertHelpArticle: (article: Omit<HelpArticle, "id" | "updated_at" | "updated_by"> & { id?: string }) => HelpArticle;
  removeHelpArticle: (id: string) => void;
  upsertWorkflow: (workflow: Omit<Workflow, "id" | "created_at" | "updated_at"> & { id?: string }) => Workflow;
  removeWorkflow: (id: string) => void;
  toggleWorkflowActive: (id: string) => void;
};

const JIRA_FLOW: DeliveryStatus[] = ["To Do", "In Progress", "In QA", "Done"];

let _jiraCounter = 1050;
function nextJiraKey() {
  _jiraCounter += 1;
  return `TFP-${_jiraCounter}`;
}

export const useTfpStore = create<State>()(
  persist(
    (set, get) => ({
      currentUserId: "u-bazil",
      users: USERS,
      sprint: seedSprint,
      sprints: [seedSprint],
      signals: seedSignals,
      shaping: seedShaping,
      jiraEvents: seedJiraEvents,
      reviews: seedReviews,
      audit: seedAudit,
      overrides: seedOverrides,
      goLives: seedGoLive,
      comms: seedComms,
      decisions: seedDecisions,
      retros: seedRetros,
      notifications: seedNotifications,
      clinics: seedClinics,
      monitoringAlerts: seedMonitoring,
      techDebtReviews: seedTechDebtReviews,
      clinicFeedbackLog: [],
      flags: DEFAULT_FLAGS,
      helpArticles: SEED_HELP,
      workflows: [],

      setCurrentUser: (id) => set({ currentUserId: id }),

      audit_log: (entry) => {
        const a: AuditEntry = {
          id: "au-" + uid(),
          ts: new Date().toISOString(),
          actor_id: get().currentUserId,
          ...entry,
        };
        set({ audit: [a, ...get().audit] });
      },

      pushNotification: (n) => {
        const note = buildNotification({
          trigger: n.trigger,
          title: n.title,
          body: n.body,
          link_to: n.link_to ?? null,
          for_user_id: n.for_user_id ?? null,
          entity_id: n.entity_id ?? null,
          ts: n.ts,
        });
        // B12: cap notifications at 200 most-recent
        const existing = get().notifications;
        const next = [note, ...existing].slice(0, 200);
        set({ notifications: next });
        return note;
      },

      markNotificationRead: (id) => {
        set({ notifications: get().notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) });
      },

      markAllNotificationsRead: () => {
        set({ notifications: get().notifications.map((n) => ({ ...n, read: true })) });
      },

      createSignal: (data) => {
        const c = classifySignal({ source: data.source, description: data.description });
        const issue_type = data.issue_type_override ?? c.issue_type;
        const tier = data.tier_override ?? c.tier;
        const created = new Date();
        const sig: Signal = {
          id: "sig-" + uid(),
          title: (data.title ?? "").trim() || data.description.slice(0, 60),
          description: data.description,
          source: data.source,
          product: data.product,
          issue_type,
          tier,
          status: "New",
          owner_id: null,
          triage_reason: null,
          hold_until: null,
          sla_due_at: slaDueAt(tier, created).toISOString(),
          created_at: created.toISOString(),
          created_by: get().currentUserId,
          shaping_item_id: null,
          labels: data.labels ?? [],
          displacement_flag: data.displacement_flag,
          displacement_note: data.displacement_note,
          priority: data.priority ?? tier,
          attachments: data.attachments,
        };
        set({ signals: [sig, ...get().signals] });
        get().audit_log({ entity_type: "signal", entity_id: sig.id, action: "Signal created" });
        // Notifications intentionally stay high-signal; SLA/blockers/overrides/release/comms only.
        return sig;
      },

      triageDecision: (signalId, decision, reason, holdUntil, commitmentType) => {
        const me = get().currentUserId;
        const signals = get().signals.map((s) => {
          if (s.id !== signalId) return s;
          if (decision === "Proceed") {
            const isFastTrack = s.issue_type === "Incident" || s.tier === "P1";
            const ownerId = isFastTrack ? "u-waseem" : me;
            const sh = blankShaping(s.id, ownerId, { fastTrack: isFastTrack });
            sh.commitment_type = commitmentType ?? (s.issue_type === "Incident" ? "Incident" : null);
            // B1: Leadership signals always have shaping started with a context note prefilled
            // and `current_step` set so the queue treats them as actively shaped.
            sh.shaping_status = "In Shaping";
            sh.current_step = 1;
            if (s.source === "Leadership") {
              sh.problem_evidence =
                `Raised by Leadership on ${new Date(s.created_at).toLocaleDateString()}.\nOriginal ask:\n"${s.description.slice(0, 300)}"`;
            }
            set({ shaping: [sh, ...get().shaping] });
            get().audit_log({ entity_type: "signal", entity_id: signalId, action: isFastTrack ? "Triaged → Proceed (Fast-track)" : "Triaged → Proceed" });
            if (isFastTrack) {
              get().pushNotification({
                trigger: "fast_track_review",
                title: `Fast-track: ${s.title}`,
                body: `${s.tier} incident/fix — root cause required.`,
                link_to: "/shaping",
                for_user_id: ownerId,
                entity_id: sh.id,
              });
            }
            return { ...s, status: "Proceed" as const, owner_id: me, shaping_item_id: sh.id, triage_reason: null, hold_until: null };
          }
          if (decision === "Hold") {
            get().audit_log({ entity_type: "signal", entity_id: signalId, action: "Triaged → Hold", after: reason ?? null });
            return { ...s, status: "Hold" as const, owner_id: me, triage_reason: reason ?? null, hold_until: holdUntil ?? null };
          }
          get().audit_log({ entity_type: "signal", entity_id: signalId, action: "Triaged → Rejected", after: reason ?? null });
          return { ...s, status: "Rejected" as const, owner_id: me, triage_reason: reason ?? null };
        });
        set({ signals });
      },

      updateSignal: (signalId, patch, opts) => {
        const prev = get().signals.find((s) => s.id === signalId);
        if (!prev) return { ok: false, error: "Signal not found" };

        // Status transition guard (Wave A #3)
        if (patch.status && patch.status !== prev.status) {
          const allowed = isAllowedStatusTransition(prev.status, patch.status);
          const isTerminal = ["Proceed", "Hold", "Rejected"].includes(patch.status);
          if (!allowed && isTerminal && !opts?.force) {
            return {
              ok: false,
              error: `Status ${prev.status} → ${patch.status} requires confirmation and a reason.`,
            };
          }
          if (!allowed && opts?.force && (!opts.reason || opts.reason.trim().length < 5)) {
            return { ok: false, error: "Reason is required (min 5 chars) to bypass." };
          }
        }

        const next: Signal = { ...prev, ...patch };
        if (patch.issue_type === "Incident") {
          next.tier = "P1";
          next.sla_due_at = slaDueAt("P1", new Date(prev.created_at)).toISOString();
        }

        // SLA recompute when tier changes
        if (patch.tier && patch.tier !== prev.tier) {
          next.sla_due_at = slaDueAt(patch.tier, new Date(prev.created_at)).toISOString();
        }

        set({ signals: get().signals.map((s) => (s.id === signalId ? next : s)) });

        // B2: status → Proceed should create the ShapingItem (mirror triageDecision)
        if (patch.status === "Proceed" && prev.status !== "Proceed" && !prev.shaping_item_id) {
          const me = get().currentUserId;
          const isFastTrack = next.issue_type === "Incident" || next.tier === "P1";
          const ownerId = isFastTrack ? "u-waseem" : me;
          const sh = blankShaping(signalId, ownerId, { fastTrack: isFastTrack });
          sh.commitment_type = next.issue_type === "Incident" ? "Incident" : null;
          set({
            shaping: [sh, ...get().shaping],
            signals: get().signals.map((s) => (s.id === signalId ? { ...s, shaping_item_id: sh.id } : s)),
          });
        }

        // Audit only meaningful workflow transitions by default; verbose field diffs stay off for adoption.
        if (patch.status && patch.status !== prev.status) {
          get().audit_log({
            entity_type: "signal",
            entity_id: signalId,
            action: `Status changed (${prev.status} → ${patch.status})`,
          });
        }
        if (patch.tier && patch.tier !== prev.tier) {
          get().audit_log({
            entity_type: "signal",
            entity_id: signalId,
            action: `SLA recalculated for ${patch.tier}`,
            after: next.sla_due_at,
          });
          // B3: warn if newly recomputed SLA is already in the past
          if (new Date(next.sla_due_at).getTime() < Date.now()) {
            get().pushNotification({
              trigger: "sla_breach",
              title: `SLA already breached after priority change`,
              body: `${prev.title.slice(0, 80)} — new SLA in the past.`,
              link_to: "/inbox",
              for_user_id: get().currentUserId,
              entity_id: signalId,
            });
          }
        }

        // Bypass audit
        if (patch.status && opts?.force && opts?.reason) {
          get().audit_log({
            entity_type: "signal",
            entity_id: signalId,
            action: `Status bypass (${prev.status} → ${patch.status})`,
            after: opts.reason,
          });
          get().logOverride({
            kind: "Other",
            reason: `Status bypass on ${signalId}: ${opts.reason}`,
            signal_id: signalId,
            shahid_visible: true,
          });
        }

        return { ok: true };
      },

      setSignalAttachments: (signalId, attachments) => {
        set({
          signals: get().signals.map((s) => (s.id === signalId ? { ...s, attachments } : s)),
        });
        get().audit_log({
          entity_type: "signal",
          entity_id: signalId,
          action: `Attachments updated (${attachments.length} link${attachments.length === 1 ? "" : "s"})`,
        });
      },

      setShapingAttachments: (shapingId, attachments) => {
        set({
          shaping: get().shaping.map((s) =>
            s.id === shapingId ? { ...s, attachments, updated_at: new Date().toISOString() } : s,
          ),
        });
        get().audit_log({
          entity_type: "shaping",
          entity_id: shapingId,
          action: `Attachments updated (${attachments.length} link${attachments.length === 1 ? "" : "s"})`,
        });
      },

      updateShaping: (id, patch) => {
        set({
          shaping: get().shaping.map((s) => (s.id === id ? { ...s, ...patch, updated_at: new Date().toISOString() } : s)),
        });
      },

      setRoadmapBucket: (id, bucket, displacement) => {
        const prev = get().shaping.find((s) => s.id === id);
        const sp = get().sprint;
        set({
          shaping: get().shaping.map((s) =>
            s.id === id ? { ...s, roadmap_bucket: bucket, displacement, updated_at: new Date().toISOString() } : s,
          ),
        });
        get().audit_log({ entity_type: "shaping", entity_id: id, action: `Roadmap bucket set to ${bucket}` });
        // B9: if sprint is locked AND we leave "Committed" mid-sprint, log an Override for visibility.
        if (prev && prev.roadmap_bucket === "Committed" && bucket !== "Committed" && sp.status === "Locked") {
          get().logOverride({
            kind: "Scope added mid-sprint",
            reason: `Bucket moved from Committed → ${bucket} mid-sprint. Displacement: ${displacement || "—"}`,
            shaping_id: id,
            shahid_visible: true,
          });
        }
      },

      setComplexity: (id, c) => {
        set({
          shaping: get().shaping.map((s) =>
            s.id === id ? { ...s, solution_complexity: c, updated_at: new Date().toISOString() } : s,
          ),
        });
      },

      signOffTechReview: (id, reviewerId) => {
        const item = get().shaping.find((s) => s.id === id);
        set({
          shaping: get().shaping.map((s) =>
            s.id === id
              ? {
                  ...s,
                  tech_reviewer_id: reviewerId,
                  tech_signed_off_at: new Date().toISOString(),
                  shaping_status: "Ready for Sprint",
                  current_step: 2,
                  updated_at: new Date().toISOString(),
                }
              : s,
          ),
        });
        get().audit_log({ entity_type: "shaping", entity_id: id, action: "Tech review signed off" });
        if (item) {
          get().pushNotification({
            trigger: "tech_review_ready",
            title: "Tech review complete",
            body: "This item is ready for sprint planning.",
            link_to: "/shaping",
            for_user_id: item.pm_owner_id,
            entity_id: id,
          });
        }
      },

      approveShaping: (id, approverId, notes) => {
        set({
          shaping: get().shaping.map((s) =>
            s.id === id
              ? {
                  ...s,
                  approver_id: approverId,
                  approval_decision: "Approved",
                  approval_notes: notes,
                  approved_at: new Date().toISOString(),
                  shaping_status: "Approved",
                  updated_at: new Date().toISOString(),
                }
              : s,
          ),
        });
        get().audit_log({ entity_type: "shaping", entity_id: id, action: "Approved" });
      },

      requestChanges: (id, approverId, notes) => {
        set({
          shaping: get().shaping.map((s) =>
            s.id === id
              ? {
                  ...s,
                  approver_id: approverId,
                  approval_decision: "Changes Requested",
                  approval_notes: notes,
                  shaping_status: "Shaped",
                  current_step: 2,
                  updated_at: new Date().toISOString(),
                }
              : s,
          ),
        });
        get().audit_log({ entity_type: "shaping", entity_id: id, action: "Changes requested" });
      },

      pushToJira: (id) => {
        const item = get().shaping.find((s) => s.id === id);
        // B10: cannot push without Tech Review sign-off.
        if (!item) return "";
        if (item.shaping_status !== "Ready for Sprint" && item.shaping_status !== "Approved") {
          if (typeof window !== "undefined") {
            import("sonner").then(({ toast }) => {
              toast.error(`Cannot push to Jira: shaping is "${item.shaping_status}". Get tech sign-off first.`);
            });
          }
          return item.jira_key ?? "";
        }
        if (item.jira_key) return item.jira_key;
        const key = nextJiraKey();
        const event: JiraEvent = {
          id: "je-" + uid(),
          ts: new Date().toISOString(),
          direction: "outbound",
          type: "issue.created",
          jira_key: key,
          shaping_id: id,
          payload: { summary: item.problem_what.slice(0, 80), points: item.tech_estimate_pts ?? 0, sprint: "backlog" },
        };
        set({
          shaping: get().shaping.map((s) =>
            s.id === id
              ? { ...s, jira_key: key, in_sprint: false, delivery_status: "To Do", shaping_status: "In Delivery", updated_at: new Date().toISOString() }
              : s,
          ),
          jiraEvents: [event, ...get().jiraEvents],
        });
        get().audit_log({ entity_type: "shaping", entity_id: id, action: `Pushed to Jira backlog as ${key}` });
        if (typeof window !== "undefined") {
          import("sonner").then(({ toast }) => {
            toast.success(`Pushed to Jira as ${key} — sitting in Backlog. Use "Add to Sprint" on the Delivery board.`);
          });
        }
        return key;
      },

      addToSprint: (id, overrideReason, overrideKind) => {
        const item = get().shaping.find((s) => s.id === id);
        if (!item || !item.jira_key) return false;
        if (item.in_sprint) return true;
        const sp = get().sprint;
        if ((sp.status === "Locked" || sp.scope_locked_at) && !overrideReason) {
          if (typeof window !== "undefined") {
            import("sonner").then(({ toast }) => {
              toast.error("Sprint is locked. Add new scope only with an inline override reason.");
            });
          }
          return false;
        }
        const usable = Math.max(
          0,
          sp.gross_capacity_pts -
            sp.leave_deduction_pts -
            sp.interrupt_buffer_pts -
            sp.qa_buffer_pts -
            sp.uncertainty_buffer_pts -
            sp.carryforward_estimate_pts -
            sp.golive_deduction_pts,
        );
        const newAlloc = sp.allocated_pts + (item.tech_estimate_pts ?? 0);
        set({
          shaping: get().shaping.map((s) =>
            s.id === id ? { ...s, in_sprint: true, updated_at: new Date().toISOString() } : s,
          ),
          sprint: { ...sp, allocated_pts: newAlloc },
        });
        get().audit_log({ entity_type: "shaping", entity_id: id, action: `Added to ${sp.name}` });
        if (overrideReason) {
          get().logOverride({
            kind: overrideKind ?? "Scope added mid-sprint",
            reason: overrideReason,
            signal_id: item.signal_id,
            shaping_id: item.id,
            displaced_pts: Math.max(0, newAlloc - usable),
            shahid_visible: true,
          });
        }
        if (newAlloc / Math.max(1, usable) >= 0.9) {
          get().pushNotification({
            trigger: "scope_change",
            title: "Sprint capacity over 90%",
            body: `${newAlloc}/${usable} pts allocated after adding ${item.jira_key}.`,
            link_to: "/delivery",
            for_user_id: get().currentUserId,
            entity_id: sp.id,
          });
        }
        if (newAlloc > usable) {
          get().pushNotification({
            trigger: "scope_change",
            title: "Sprint goal at risk",
            body: `${newAlloc}/${usable} pts allocated after adding ${item.jira_key}.`,
            link_to: "/leadership",
            for_user_id: "u-shahid",
            entity_id: sp.id,
          });
        }
        if (typeof window !== "undefined") {
          import("sonner").then(({ toast }) => {
            toast.success(`${item.jira_key} added to ${sp.name}`);
          });
        }
        return true;
      },

      removeFromSprint: (id) => {
        const item = get().shaping.find((s) => s.id === id);
        if (!item || !item.in_sprint) return false;
        const sp = get().sprint;
        if (sp.status === "Locked" || sp.scope_locked_at) {
          if (typeof window !== "undefined") {
            import("sonner").then(({ toast }) => {
              toast.error("Sprint is locked. Cannot remove items.");
            });
          }
          return false;
        }
        set({
          shaping: get().shaping.map((s) =>
            s.id === id ? { ...s, in_sprint: false, updated_at: new Date().toISOString() } : s,
          ),
          sprint: { ...sp, allocated_pts: Math.max(0, sp.allocated_pts - (item.tech_estimate_pts ?? 0)) },
        });
        get().audit_log({ entity_type: "shaping", entity_id: id, action: `Removed from ${sp.name}` });
        return true;
      },

      setDeliveryStatus: (id, next) => {
        const item = get().shaping.find((s) => s.id === id);
        if (!item || !item.jira_key) return;
        // Dev-complete gate enforcement: cannot transition to Done unless gate is signed off.
        if (next === "Done") {
          const g = item.dev_complete;
          if (!g.merged_to_main || !g.deployed_to_staging || !g.smoke_test_passed || !g.signed_off_at) {
            // Fire a P2 notification but block the transition.
            get().pushNotification({
              trigger: "blocker_signoff",
              title: "Dev-complete gate not signed off",
              body: `${item.jira_key} cannot move to Done until tests, docs and QA are checked.`,
              link_to: "/delivery",
              for_user_id: "u-karim",
              entity_id: id,
            });
            return;
          }
        }
        const event: JiraEvent = {
          id: "je-" + uid(),
          ts: new Date().toISOString(),
          direction: "outbound",
          type: "issue.transitioned",
          jira_key: item.jira_key,
          shaping_id: id,
          payload: { from: item.delivery_status ?? "To Do", to: next },
        };
        const wasDone = item.delivery_status === "Done";
        const nowDone = next === "Done";
        const reviews = get().reviews;
        const alreadyHasReview = reviews.some((r) => r.shaping_id === id);
        const newReviews =
          nowDone && !wasDone && !alreadyHasReview
            ? [
                {
                  id: "rv-" + uid(),
                  shaping_id: id,
                  signal_id: item.signal_id,
                  size: pickReviewSize(item),
                  status: "Pending" as const,
                  pm_owner_id: item.pm_owner_id,
                  scheduled_for: null,
                  completed_at: null,
                  outcome_rating: null,
                  what_worked: "",
                  what_didnt: "",
                  follow_on_signals_created: [],
                  notes: "",
                  follow_on_draft_title: "",
                  follow_on_draft_description: "",
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                ...reviews,
              ]
            : reviews;
        set({
          shaping: get().shaping.map((s) =>
            s.id === id
              ? {
                  ...s,
                  delivery_status: next,
                  blocked_since: next === "Blocked" ? new Date().toISOString() : null,
                  updated_at: new Date().toISOString(),
                }
              : s,
          ),
          jiraEvents: [event, ...get().jiraEvents],
          reviews: newReviews,
        });
        get().audit_log({
          entity_type: "shaping",
          entity_id: id,
          action: `Delivery → ${next}`,
          before: item.delivery_status ?? null,
          after: next,
        });
        if (next === "Blocked") {
          [item.pm_owner_id, "u-karim"].forEach((userId) => get().pushNotification({
              trigger: "blocker_signoff",
              title: `${item.jira_key} marked Blocked`,
              body: "Investigate and clear blocker; auto-escalates after 24h.",
              link_to: "/delivery",
              for_user_id: userId,
              entity_id: id,
            }));
        }
        if (nowDone && !wasDone && !alreadyHasReview) {
          get().pushNotification({
            trigger: "review_overdue",
            title: "Outcome review pending",
            body: `${item.jira_key} moved to Done and needs an outcome review.`,
            link_to: "/review",
            for_user_id: item.pm_owner_id,
            entity_id: id,
          });
        }
      },

      setBlocked: (id, description) => {
        const item = get().shaping.find((s) => s.id === id);
        if (!item || !item.jira_key) return;
        const now = new Date().toISOString();
        set({
          shaping: get().shaping.map((s) =>
            s.id === id
              ? {
                  ...s,
                  delivery_status: "Blocked",
                  blocked_since: now,
                  blocker_description: description,
                  updated_at: now,
                }
              : s,
          ),
        });
        get().audit_log({
          entity_type: "shaping",
          entity_id: id,
          action: "Marked Blocked",
          after: description.slice(0, 80),
        });
        [item.pm_owner_id, "u-karim"].forEach((userId) => get().pushNotification({
            trigger: "blocker_signoff",
            title: `${item.jira_key} marked Blocked`,
            body: description.slice(0, 120),
            link_to: "/delivery",
            for_user_id: userId,
            entity_id: id,
          }));
      },

      unblock: (id, next) => {
        const item = get().shaping.find((s) => s.id === id);
        if (!item) return;
        const now = new Date().toISOString();
        set({
          shaping: get().shaping.map((s) =>
            s.id === id
              ? { ...s, delivery_status: next, blocked_since: null, blocker_description: "", updated_at: now }
              : s,
          ),
        });
        get().audit_log({
          entity_type: "shaping",
          entity_id: id,
          action: `Unblocked → ${next}`,
        });
      },

      setDeliveryAssignee: (id, userId) => {
        set({
          shaping: get().shaping.map((s) =>
            s.id === id ? { ...s, delivery_assignee_id: userId, updated_at: new Date().toISOString() } : s,
          ),
        });
      },

      syncFromJira: () => 0,

      startReview: (shapingId) => {
        const item = get().shaping.find((s) => s.id === shapingId);
        if (!item || item.delivery_status !== "Done") return null;
        const existing = get().reviews.find((r) => r.shaping_id === shapingId);
        if (existing) return existing;
        const review: Review = {
          id: "rv-" + uid(),
          shaping_id: shapingId,
          signal_id: item.signal_id,
          size: pickReviewSize(item),
          status: "Pending",
          pm_owner_id: item.pm_owner_id,
          scheduled_for: null,
          completed_at: null,
          outcome_rating: null,
          what_worked: "",
          what_didnt: "",
          follow_on_signals_created: [],
          notes: "",
          follow_on_draft_title: "",
          follow_on_draft_description: "",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        set({ reviews: [review, ...get().reviews] });
        return review;
      },

      updateReview: (id, patch) => {
        set({ reviews: get().reviews.map((r) => (r.id === id ? { ...r, ...patch, updated_at: new Date().toISOString() } : r)) });
      },

      scheduleReview: (id, when) => {
        set({
          reviews: get().reviews.map((r) =>
            r.id === id ? { ...r, scheduled_for: when, status: "Scheduled", updated_at: new Date().toISOString() } : r,
          ),
        });
      },

      completeReview: (id, data) => {
        // B11: enforce outcome_rating is provided
        if (!data.outcome_rating) {
          return;
        }
        set({
          reviews: get().reviews.map((r) =>
            r.id === id
              ? { ...r, ...data, status: "Completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
              : r,
          ),
        });
        get().audit_log({ entity_type: "review", entity_id: id, action: `Review completed: ${data.outcome_rating}` });
      },

      logFollowOnSignal: (reviewId, data) => {
        const review = get().reviews.find((r) => r.id === reviewId);
        const sig = get().createSignal({
          title: data.title,
          description: data.description,
          source: data.source,
          product: data.product,
          displacement_flag: false,
          displacement_note: null,
        });
        // B8: link follow-on signal back to the originating signal.
        if (review) {
          set({
            signals: get().signals.map((s) =>
              s.id === sig.id ? { ...s, parent_signal_id: review.signal_id } : s,
            ),
          });
          get().audit_log({
            entity_type: "signal",
            entity_id: sig.id,
            action: `Linked as follow-on of ${review.signal_id}`,
          });
        }
        set({
          reviews: get().reviews.map((r) =>
            r.id === reviewId
              ? {
                  ...r,
                  follow_on_signals_created: [...r.follow_on_signals_created, sig.id],
                  follow_on_draft_title: "",
                  follow_on_draft_description: "",
                  updated_at: new Date().toISOString(),
                }
              : r,
          ),
        });
        return sig;
      },

      // ============ Wave 4 actions ============

      toggleDevCompleteGate: (id, key, value) => {
        set({
          shaping: get().shaping.map((s) =>
            s.id === id
              ? {
                  ...s,
                  dev_complete: { ...s.dev_complete, [key]: value, signed_off_at: null, signed_off_by: null },
                  updated_at: new Date().toISOString(),
                }
              : s,
          ),
        });
      },

      signOffDevComplete: (id) => {
        const me = get().currentUserId;
        const item = get().shaping.find((s) => s.id === id);
        if (!item) return;
        const g = item.dev_complete;
        if (!g.merged_to_main || !g.deployed_to_staging || !g.smoke_test_passed) return;
        const now = new Date().toISOString();
        // B5: auto-advance to Done when sign-off completes the gate.
        const nextDelivery: DeliveryStatus = "Done";
        set({
          shaping: get().shaping.map((s) =>
            s.id === id
              ? {
                  ...s,
                  dev_complete: { ...s.dev_complete, signed_off_by: me, signed_off_at: now },
                  delivery_status: nextDelivery,
                  updated_at: now,
                }
              : s,
          ),
        });
        get().audit_log({ entity_type: "shaping", entity_id: id, action: "Dev-complete gate signed off · auto-advanced to Done" });
        // Auto-create a Pending review if none exists yet.
        const reviews = get().reviews;
        if (!reviews.some((r) => r.shaping_id === id)) {
          const review: Review = {
            id: "rv-" + uid(),
            shaping_id: id,
            signal_id: item.signal_id,
            size: pickReviewSize(item),
            status: "Pending",
            pm_owner_id: item.pm_owner_id,
            scheduled_for: null,
            completed_at: null,
            outcome_rating: null,
            what_worked: "",
            what_didnt: "",
            follow_on_signals_created: [],
            notes: "",
            follow_on_draft_title: "",
            follow_on_draft_description: "",
            created_at: now,
            updated_at: now,
          };
          set({ reviews: [review, ...reviews] });
        }
      },

      toggleSprintLock: () => {
        const sp = get().sprint;
        const me = get().currentUserId;
        const locked = sp.status === "Locked";
        set({
          sprint: {
            ...sp,
            status: locked ? "Active" : "Locked",
            scope_locked_at: locked ? null : new Date().toISOString(),
            scope_locked_by: locked ? null : me,
          },
        });
        get().audit_log({
          entity_type: "sprint",
          entity_id: sp.id,
          action: locked ? "Sprint scope unlocked" : "Sprint scope locked",
        });
      },

      logOverride: (data) => {
        const ovr: Override = {
          id: nextOverrideId(),
          kind: data.kind,
          reason: data.reason,
          signal_id: data.signal_id ?? null,
          shaping_id: data.shaping_id ?? null,
          sprint_id: get().sprint.id,
          displaced_shaping_ids: data.displaced_shaping_ids ?? [],
          displaced_pts: data.displaced_pts ?? 0,
          raised_by: get().currentUserId,
          raised_at: new Date().toISOString(),
          ack_status: "Pending",
          acknowledged_by: null,
          acknowledged_at: null,
          shahid_visible: data.shahid_visible ?? true,
        };
        set({ overrides: [ovr, ...get().overrides] });
        get().audit_log({ entity_type: "override", entity_id: ovr.id, action: `Override logged: ${ovr.kind.toLowerCase()}` });
        get().pushNotification({
          trigger: "override_logged",
          title: `${ovr.id} awaiting acknowledgement`,
          body: ovr.reason.slice(0, 100),
          link_to: "/delivery",
          for_user_id: "u-shahid",
          entity_id: ovr.id,
        });
        return ovr;
      },

      ackOverride: (id) => {
        const me = get().currentUserId;
        set({
          overrides: get().overrides.map((o) =>
            o.id === id
              ? { ...o, ack_status: "Acknowledged", acknowledged_by: me, acknowledged_at: new Date().toISOString() }
              : o,
          ),
        });
        get().audit_log({ entity_type: "override", entity_id: id, action: "Override acknowledged" });
      },

      upsertGoLive: (data) => {
        const existing = data.id ? get().goLives.find((g) => g.id === data.id) : null;
        if (existing) {
          const updated: GoLiveChecklist = { ...existing, ...data, updated_at: new Date().toISOString() } as GoLiveChecklist;
          set({ goLives: get().goLives.map((g) => (g.id === existing.id ? updated : g)) });
          return updated;
        }
        // Build criteria from explicit keys, an explicit Record, or fall back to defaults.
        let criteria: Record<string, { done: boolean; note: string; checked_by: string | null; checked_at: string | null }>;
        if (data.criteria) {
          criteria = data.criteria;
        } else if (data.criteria_keys && data.criteria_keys.length > 0) {
          criteria = {};
          for (const k of data.criteria_keys) {
            criteria[k] = { done: false, note: "", checked_by: null, checked_at: null };
          }
        } else {
          criteria = {
            "Clinic staff trained": { done: false, note: "", checked_by: null, checked_at: null },
            "Data migrated and verified": { done: false, note: "", checked_by: null, checked_at: null },
            "UAT completed by clinic contact": { done: false, note: "", checked_by: null, checked_at: null },
            "Rollback plan confirmed and tested": { done: false, note: "", checked_by: null, checked_at: null },
            "Go-live comms sent to clinic staff": { done: false, note: "", checked_by: null, checked_at: null },
          };
        }
        const fresh: GoLiveChecklist = {
          id: "gl-" + uid(),
          shaping_id: data.shaping_id,
          product: data.product,
          release_name: data.release_name,
          scheduled_for: data.scheduled_for,
          status: data.status ?? "Not Started",
          war_room: data.war_room ?? false,
          criteria,
          go_no_go_decision: null,
          go_no_go_by: null,
          go_no_go_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        set({ goLives: [fresh, ...get().goLives] });
        get().audit_log({ entity_type: "checklist", entity_id: fresh.id, action: `Go-live created for ${fresh.product}` });
        return fresh;
      },

      toggleGoLiveCriterion: (id, criterion, done, note) => {
        const me = get().currentUserId;
        set({
          goLives: get().goLives.map((g) =>
            g.id === id
              ? {
                  ...g,
                  criteria: {
                    ...g.criteria,
                    [criterion]: {
                      ...g.criteria[criterion],
                      done,
                      note: note ?? g.criteria[criterion].note,
                      checked_by: done ? me : null,
                      checked_at: done ? new Date().toISOString() : null,
                    },
                  },
                  updated_at: new Date().toISOString(),
                }
              : g,
          ),
        });
      },

      toggleGoLiveWarRoom: (id) => {
        set({
          goLives: get().goLives.map((g) =>
            g.id === id ? { ...g, war_room: !g.war_room, updated_at: new Date().toISOString() } : g,
          ),
        });
      },

      setGoLiveDecision: (id, decision) => {
        const me = get().currentUserId;
        set({
          goLives: get().goLives.map((g) =>
            g.id === id
              ? {
                  ...g,
                  go_no_go_decision: decision,
                  go_no_go_by: me,
                  go_no_go_at: new Date().toISOString(),
                  status: decision === "Go" ? "Live" : g.status,
                  updated_at: new Date().toISOString(),
                }
              : g,
          ),
        });
        get().audit_log({ entity_type: "checklist", entity_id: id, action: `Go/No-Go: ${decision}` });
      },

      createComms: (data) => {
        const autoApproval: Record<CommsType, boolean> = {
          "Delay notification": false,
          "Incident update": true,
          "Incident all-clear": true,
          "Go-live update": false,
          Postponement: true,
          "Scope change": true,
        };
        const requires_pm_approval =
          data.requires_pm_approval ?? autoApproval[data.comms_type];
        const item: CommsItem = {
          id: "cm-" + uid(),
          ...data,
          requires_pm_approval,
          drafted_by: get().currentUserId,
          drafted_at: new Date().toISOString(),
          status: "Draft",
          approved_by: null,
          approved_at: null,
          sent_at: null,
          rejected_reason: null,
        };
        set({ comms: [item, ...get().comms] });
        get().audit_log({ entity_type: "comms", entity_id: item.id, action: "Comms drafted" });
        return item;
      },

      submitCommsForApproval: (id) => {
        set({ comms: get().comms.map((c) => (c.id === id ? { ...c, status: "Pending Approval" } : c)) });
        get().pushNotification({
          trigger: "comms_approval",
          title: "Comms awaiting PM approval",
          body: get().comms.find((c) => c.id === id)?.subject ?? "",
          link_to: "/governance",
          for_user_id: get().currentUserId,
          entity_id: id,
        });
      },

      approveComms: (id) => {
        const me = get().currentUserId;
        const item = get().comms.find((c) => c.id === id);
        if (!item) return;
        // B6: separation of duties — drafter cannot self-approve.
        if (item.drafted_by === me) {
          if (typeof window !== "undefined") {
            // Lazy import to avoid bundling toast in pure-state path.
            import("sonner").then(({ toast }) => {
              toast.error("You cannot approve your own comms. Ask another PM to review.");
            });
          }
          return;
        }
        set({
          comms: get().comms.map((c) =>
            c.id === id ? { ...c, status: "Approved", approved_by: me, approved_at: new Date().toISOString() } : c,
          ),
        });
        get().audit_log({ entity_type: "comms", entity_id: id, action: "Comms approved" });
      },

      rejectComms: (id, reason) => {
        set({ comms: get().comms.map((c) => (c.id === id ? { ...c, status: "Rejected", rejected_reason: reason } : c)) });
      },

      sendComms: (id) => {
        const item = get().comms.find((c) => c.id === id);
        if (!item) return;
        // B7: only Approved comms can be sent.
        if (item.status !== "Approved") {
          if (typeof window !== "undefined") {
            import("sonner").then(({ toast }) => {
              toast.error(`Cannot send — current status is ${item.status}. Approve first.`);
            });
          }
          return;
        }
        set({ comms: get().comms.map((c) => (c.id === id ? { ...c, status: "Sent", sent_at: new Date().toISOString() } : c)) });
        get().audit_log({ entity_type: "comms", entity_id: id, action: "Comms sent" });
      },

      createDecision: (data) => {
        const dec: Decision = {
          id: nextDecisionId(),
          ...data,
          status: "Decided",
          decided_by: get().currentUserId,
          decided_at: new Date().toISOString(),
          superseded_by_id: null,
        };
        set({ decisions: [dec, ...get().decisions] });
        get().audit_log({ entity_type: "decision", entity_id: dec.id, action: `Decision: ${dec.title}` });
        return dec;
      },

      createRetro: (data) => {
        const me = get().currentUserId;
        const all = get().retros;
        const recent = all.slice(0, 2);
        const escalated = recent.length === 2 && recent.every((r) => r.primary_theme === data.primary_theme);
        const retro: SprintRetro = {
          id: "rt-" + uid(),
          ...data,
          created_by: me,
          created_at: new Date().toISOString(),
          escalated,
        };
        set({ retros: [retro, ...all] });
        get().audit_log({ entity_type: "retro", entity_id: retro.id, action: `Retro logged (${data.primary_theme})` });
        if (escalated) {
          get().pushNotification({
            trigger: "retro_escalation",
            title: `${data.primary_theme} theme escalated (3 sprints)`,
            body: data.one_change,
            link_to: "/governance",
            for_user_id: "u-shahid",
            entity_id: retro.id,
          });
        }
        return retro;
      },

      // ============ Wave 5: stubs (full implementations pending follow-up) ============
      approveFastTrack: (id, approverId) => {
        get().approveShaping(id, approverId, "Fast-track approved");
        get().pushToJira(id);
        // Fast-track skips backlog by design — auto-add to active sprint (subject to lock).
        get().addToSprint(id);
      },
      offboardClinic: (clinicId, reason) => {
        const me = get().currentUserId;
        const clinic = get().clinics.find((c) => c.id === clinicId);
        if (!clinic) return;
        set({
          clinics: get().clinics.map((c) =>
            c.id === clinicId
              ? { ...c, status: "Offboarded", offboarded_at: new Date().toISOString(), offboarded_by_id: me, offboard_reason: reason }
              : c,
          ),
        });
        get().audit_log({ entity_type: "clinic", entity_id: clinicId, action: `Clinic offboarded: ${clinic.name}` });
      },
      createSprint: (data) => {
        const sp: Sprint = {
          id: "s-" + uid(),
          name: data.name,
          start_date: data.start_date,
          end_date: data.end_date,
          status: "Planning",
          scope_locked_at: null,
          scope_locked_by: null,
          gross_capacity_pts: data.gross_capacity_pts,
          leave_deduction_pts: 0,
          interrupt_buffer_pts: 0,
          qa_buffer_pts: 0,
          uncertainty_buffer_pts: 0,
          golive_deduction_pts: 0,
          carryforward_estimate_pts: 0,
          allocated_pts: 0,
          notes: data.notes,
        };
        set({ sprints: [...get().sprints, sp] });
        get().audit_log({ entity_type: "sprint", entity_id: sp.id, action: `Sprint created: ${sp.name}` });
        return sp;
      },
      markTechDebtReviewed: (shapingId) => {
        set({
          shaping: get().shaping.map((s) =>
            s.id === shapingId ? { ...s, tech_debt_reviewed_at: new Date().toISOString() } : s,
          ),
        });
      },
      recordTechDebtReview: (data) => {
        const tdr: TechDebtReview = {
          id: "tdr-" + uid(),
          reviewed_by_id: get().currentUserId,
          reviewed_at: new Date().toISOString(),
          ...data,
        };
        set({ techDebtReviews: [tdr, ...get().techDebtReviews] });
        return tdr;
      },
      simulateMonitoringAlert: (data) => {
        const alert: MonitoringAlert = {
          id: "mon-" + uid(),
          system: data.system,
          integration: data.integration,
          severity: data.severity,
          message: data.message,
          detected_at: new Date().toISOString(),
          signal_id: null,
          deduplicated: false,
        };
        const existing = get().signals.find(
          (s) => s.issue_type === "Incident" && s.status !== "Rejected" && s.title.includes(data.system),
        );
        if (existing) {
          alert.deduplicated = true;
          alert.signal_id = existing.id;
          set({
            monitoringAlerts: [alert, ...get().monitoringAlerts],
            signals: get().signals.map((s) =>
              s.id === existing.id
                ? { ...s, description: s.description + `\n\nAlert repeated at ${new Date().toISOString()}` }
                : s,
            ),
          });
        } else {
          const sig = get().createSignal({
            title: `[MONITORING] ${data.system} — ${data.integration}`,
            description: `${data.severity}: ${data.message}`,
            source: "Internal",
            product: "Platform",
            issue_type_override: "Incident",
            tier_override: "P1",
            displacement_flag: false,
            displacement_note: null,
          });
          alert.signal_id = sig.id;
          set({ monitoringAlerts: [alert, ...get().monitoringAlerts] });
        }
        get().pushNotification({
          trigger: "monitoring_alert",
          title: `${data.severity} monitoring alert: ${data.system}`,
          body: data.message,
          link_to: "/governance",
          entity_id: alert.id,
        });
        return alert;
      },
      submitClinicFeedback: (data) => {
        const now = Date.now();
        const oneHourAgo = now - 3600000;
        const oneDayAgo = now - 86400000;
        const recent = get().clinicFeedbackLog.filter(
          (r) => r.clinic_id === data.clinic_id && r.ts > oneHourAgo,
        );
        if (recent.length >= 5) {
          return { ok: false, reason: "rate_limited" };
        }
        // B13: detect duplicate within 24h (same clinic + same first 80 chars of description)
        const descKey = data.description.trim().slice(0, 80).toLowerCase();
        const dup = get().clinicFeedbackLog.find(
          (r) => r.clinic_id === data.clinic_id && r.ts > oneDayAgo && r.desc_key === descKey,
        );
        if (dup) {
          return { ok: false, reason: "duplicate within 24h" };
        }
        const sig = get().createSignal({
          title: `[Clinic Form] ${data.reporter_name}: ${data.description.slice(0, 60)}`,
          description: `[Clinic Form] [${data.reporter_name}] [${data.clinic_name}]\n\n${data.description}`,
          source: "Clinic",
          product: "Platform",
          issue_type_override: data.urgent ? "Bug" : "Enhancement",
          tier_override: data.urgent ? "P1" : "P2",
          displacement_flag: false,
          displacement_note: null,
        });
        set({ clinicFeedbackLog: [...get().clinicFeedbackLog, { clinic_id: data.clinic_id, ts: now, desc_key: descKey }] });
        get().pushNotification({
          trigger: "clinic_feedback",
          title: `Clinic feedback from ${data.clinic_name}`,
          body: data.description.slice(0, 100),
          link_to: "/inbox",
          for_user_id: "u-sami",
          entity_id: sig.id,
        });
        return { ok: true, signal_id: sig.id };
      },
      completeOnboardingItem: (userId, itemId) => {
        set({
          users: get().users.map((u) =>
            u.id === userId ? { ...u, onboarding_progress: { ...u.onboarding_progress, [itemId]: true } } : u,
          ),
        });
      },
      completeOnboarding: (userId) => {
        set({
          users: get().users.map((u) => (u.id === userId ? { ...u, onboarding_completed: true } : u)),
        });
      },
      resetOnboarding: (userId) => {
        set({
          users: get().users.map((u) =>
            u.id === userId ? { ...u, onboarding_completed: false, onboarding_progress: {} } : u,
          ),
        });
      },

      setFlag: (key, value) => {
        set({ flags: { ...get().flags, [key]: value } });
      },
      upsertUser: (user) => {
        const exists = get().users.find((u) => u.id === user.id);
        set({ users: exists ? get().users.map((u) => (u.id === user.id ? user : u)) : [...get().users, user] });
      },
      removeUser: (userId) => {
        set({ users: get().users.filter((x) => x.id !== userId) });
      },
      upsertHelpArticle: (article) => {
        const me = get().currentUserId;
        const now = new Date().toISOString();
        const id = article.id ?? "h-" + uid();
        const next: HelpArticle = {
          id,
          slug: article.slug,
          title: article.title,
          section: article.section,
          body_markdown: article.body_markdown,
          updated_at: now,
          updated_by: me,
        };
        const exists = get().helpArticles.find((a) => a.id === id);
        set({
          helpArticles: exists
            ? get().helpArticles.map((a) => (a.id === id ? next : a))
            : [...get().helpArticles, next],
        });
        return next;
      },
      removeHelpArticle: (id) => {
        set({ helpArticles: get().helpArticles.filter((a) => a.id !== id) });
      },
      upsertWorkflow: (wf) => {
        const now = new Date().toISOString();
        const id = wf.id ?? "wf-" + uid();
        const exists = get().workflows.find((w) => w.id === id);
        const next: Workflow = {
          id,
          name: wf.name,
          active: wf.active,
          nodes: wf.nodes,
          edges: wf.edges,
          created_at: exists?.created_at ?? now,
          updated_at: now,
        };
        set({
          workflows: exists
            ? get().workflows.map((w) => (w.id === id ? next : w))
            : [...get().workflows, next],
        });
        return next;
      },
      removeWorkflow: (id) => {
        set({ workflows: get().workflows.filter((w) => w.id !== id) });
      },
      toggleWorkflowActive: (id) => {
        set({
          workflows: get().workflows.map((w) =>
            w.id === id ? { ...w, active: !w.active, updated_at: new Date().toISOString() } : w,
          ),
        });
      },
    }),
    {
      name: "tfp-os-v6",
      version: 7,
      migrate: (persisted: unknown) => {
        const p = (persisted ?? {}) as Partial<State>;
        const shaping = (p.shaping ?? []).map((s) => ({
          ...s,
          // Back-fill: anything already pushed to Jira and in a delivery column is in the sprint.
          in_sprint: typeof s.in_sprint === "boolean" ? s.in_sprint : !!(s.jira_key && s.delivery_status),
        }));
        return {
          ...p,
          shaping,
          flags: p.flags ?? DEFAULT_FLAGS,
          helpArticles: p.helpArticles ?? SEED_HELP,
          workflows: p.workflows ?? [],
        } as State;
      },
    },
  ),
);

export function completenessScore(s: ShapingItem): number {
  const fields: Array<{ key: keyof ShapingItem; min: number }> = [
    { key: "problem_what", min: 30 },
    { key: "problem_why", min: 30 },
    { key: "problem_who", min: 20 },
    { key: "solution_criteria", min: 30 },
    { key: "solution_approach", min: 30 },
  ];
  return fields.reduce((acc, f) => {
    const v = String(s[f.key] ?? "");
    return acc + (v.trim().length >= f.min ? 1 : 0);
  }, 0);
}

export function solutionComplete(s: ShapingItem): boolean {
  return !!s.solution_complexity && s.solution_approach.trim().length >= 20;
}

export function techReviewComplete(s: ShapingItem): boolean {
  return (
    !!s.tech_reviewer_id &&
    !!s.tech_signed_off_at &&
    typeof s.tech_estimate_pts === "number" &&
    s.tech_estimate_pts > 0 &&
    s.tech_review_notes.trim().length > 0
  );
}

export function canApprove(s: ShapingItem): boolean {
  return (
    completenessScore(s) >= 3 &&
    solutionComplete(s) &&
    techReviewComplete(s)
  );
}

export function devCompleteReady(s: ShapingItem): boolean {
  const g = s.dev_complete;
  return g.merged_to_main && g.deployed_to_staging && g.smoke_test_passed && !!g.signed_off_at;
}

export function usableCapacity(sp: Sprint): number {
  return Math.max(
    0,
    sp.gross_capacity_pts -
      sp.leave_deduction_pts -
      sp.interrupt_buffer_pts -
      sp.qa_buffer_pts -
      sp.uncertainty_buffer_pts -
      sp.carryforward_estimate_pts -
      sp.golive_deduction_pts,
  );
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
