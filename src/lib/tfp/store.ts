import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
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
  GoLiveChecklist,
  GoLiveCriterion,
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
  Source,
  Sprint,
  SprintRetro,
  TechDebtReview,
  User,
} from "./types";
import { classifySignal, slaDueAt } from "./classify";
import { buildNotification } from "./notify";

let _uidCounter = 0;
const uid = () => {
  _uidCounter += 1;
  return _uidCounter.toString(36).padStart(4, "0");
};

// Stable epoch for seed data so SSR and client render identical timestamps.
const SEED_EPOCH = new Date("2026-04-15T09:00:00.000Z").getTime();

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
  name: "Sprint 6",
  start_date: new Date(SEED_EPOCH - 4 * 86400000).toISOString(),
  end_date: new Date(SEED_EPOCH + 10 * 86400000).toISOString(),
  status: "Active",
  scope_locked_at: new Date(SEED_EPOCH - 3 * 86400000).toISOString(),
  scope_locked_by: "u-alizar",
  gross_capacity_pts: 60,
  leave_deduction_pts: 5,
  interrupt_buffer_pts: 6,
  qa_buffer_pts: 4,
  uncertainty_buffer_pts: 3,
  golive_deduction_pts: 0,
  carryforward_estimate_pts: 5,
  allocated_pts: 34,
};

function blankShaping(signalId: string, ownerId: string, opts?: { fastTrack?: boolean }): ShapingItem {
  const now = new Date().toISOString();
  return {
    id: "sh-" + uid(),
    signal_id: signalId,
    shaping_status: "Unshaped",
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
  owner?: string;
  hold_until?: string | null;
  triage_reason?: string | null;
}): Signal {
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
    labels: c.labels,
    displacement_flag: false,
    displacement_note: null,
  };
}

const seedSignals: Signal[] = [
  buildSeedSignal({
    title: "Patients cannot complete intake on Safari",
    description:
      "Multiple clinics report patients cannot access the intake form on Safari iOS — the submit button does nothing. Urgent, blocking onboarding.",
    source: "Clinic",
    product: "Otto-Onboard",
    daysAgo: 1,
    owner: "u-bazil",
  }),
  buildSeedSignal({
    title: "Add bulk export to clinic dashboard",
    description:
      "Clinic ops would like to export the weekly cohort report as CSV. Would save them 2 hours per week. Can we add a download button?",
    source: "Clinic",
    product: "Otto Pulse",
    daysAgo: 3,
    status: "In Review",
    owner: "u-bazil",
  }),
  buildSeedSignal({
    title: "Refactor Notes sync queue",
    description:
      "The Notes sync worker is slow when more than 200 items are queued — needs refactor and performance cleanup before next clinic onboarding.",
    source: "Dev Team",
    product: "Otto Notes",
    daysAgo: 6,
  }),
  buildSeedSignal({
    title: "Board wants headline KPIs on FertiWise",
    description:
      "Leadership ask: surface conversion KPIs on the FertiWise homepage for the board presentation tomorrow.",
    source: "Leadership",
    product: "FertiWise",
    daysAgo: 2,
    owner: "u-bazil",
  }),
  buildSeedSignal({
    title: "Reset password flow broken in StimSmart",
    description:
      "Clinic reports the password reset email never arrives — error in the logs after submit.",
    source: "Clinic",
    product: "StimSmart",
    daysAgo: 4,
    status: "Hold",
    owner: "u-bazil",
    hold_until: new Date(SEED_EPOCH + 5 * 86400000).toISOString(),
    triage_reason: "Waiting on SMTP provider investigation",
  }),
  buildSeedSignal({
    title: "Concurrent edit collisions in Otto-Onboard",
    description:
      "Two coordinators editing the same patient record cause data integrity issues — one overwrites the other silently.",
    source: "Internal",
    product: "Otto-Onboard",
    daysAgo: 0,
    owner: "u-alizar",
  }),
];

const shapingInProgress: ShapingItem = {
  ...blankShaping(seedSignals[1].id, "u-bazil"),
  shaping_status: "In Shaping",
  current_step: 2,
  problem_what:
    "Clinic ops teams need a way to export weekly cohort metrics so they can share with their leadership without screenshotting dashboards.",
  problem_why:
    "Clinics currently spend ~2h per week manually copying figures. Without exports they can't share trended views with their own boards or referrers.",
  problem_who: "Clinic operations leads at all 14 clinics, weekly.",
  problem_where: "Otto Pulse > Cohort Reports > Weekly view",
  problem_evidence:
    "Three clinics raised this in the November ops call; Sami logged 6 separate signals in the past 4 weeks.",
  problem_out_of_scope: "PDF export, scheduled email delivery, custom date ranges (Phase 2).",
  roadmap_bucket: "Next",
  created_at: new Date(SEED_EPOCH - 2 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 86400000).toISOString(),
};
seedSignals[1].status = "Proceed";
seedSignals[1].shaping_item_id = shapingInProgress.id;

const sigForTechReview: Signal = {
  ...buildSeedSignal({
    title: "SSO for clinic admins via Microsoft Entra",
    description:
      "Clinic IT teams want their admins to log into Otto with their existing Microsoft accounts to reduce password sprawl.",
    source: "Clinic",
    product: "Platform",
    daysAgo: 8,
    owner: "u-bazil",
  }),
  status: "Proceed",
};

const shapingInTechReview: ShapingItem = {
  ...blankShaping(sigForTechReview.id, "u-bazil"),
  shaping_status: "In Tech Review",
  current_step: 4,
  problem_what:
    "Clinic admins maintain a separate Otto password, leading to lockouts and ~15 reset tickets per week from IT teams who already provision Microsoft accounts.",
  problem_why:
    "Reduces support burden, improves security posture, and is a precondition for two clinics to roll Otto to all coordinators.",
  problem_who: "Clinic IT admins (14 clinics) and ~120 coordinator users.",
  problem_where: "Otto login screen and admin user management.",
  problem_evidence:
    "15 weekly tickets, two clinics gating expansion on this, raised in three ops calls.",
  problem_out_of_scope: "SCIM provisioning, Google Workspace SSO (later).",
  roadmap_bucket: "Now",
  displacement: "Defer the inline-comment polish on Notes",
  solution_complexity: "Medium",
  solution_approach:
    "Add an OIDC provider integration using Entra; map email-domain → tenant; keep password fallback for non-SSO users.",
  solution_criteria:
    "Admins from the two pilot clinics can sign in with Entra and land on their tenant; password reset tickets drop by 50% in 30 days.",
  solution_effort: "13 points (1.5 sprints).",
  solution_decisions: "Email-domain mapping vs. tenant claim — going with domain.",
  solution_questions: "Which clinics first? Confirm Entra app registration owner.",
  solution_risks:
    "Multi-tenant edge cases; need a fallback for users with personal Microsoft accounts.",
  created_at: new Date(SEED_EPOCH - 7 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 86400000).toISOString(),
};
sigForTechReview.shaping_item_id = shapingInTechReview.id;

const sigForApproval: Signal = {
  ...buildSeedSignal({
    title: "Bulk patient import for new clinic onboarding",
    description:
      "When a new clinic onboards we need to import their existing patient list rather than re-keying.",
    source: "Internal",
    product: "Otto-Onboard",
    daysAgo: 10,
    owner: "u-bazil",
  }),
  status: "Proceed",
};

const shapingForApproval: ShapingItem = {
  ...blankShaping(sigForApproval.id, "u-bazil"),
  shaping_status: "Tech Approved",
  current_step: 5,
  problem_what:
    "Clinics joining Otto have to re-enter every existing patient record manually, which delays go-live by 2–3 weeks.",
  problem_why:
    "We have three clinics onboarding next quarter. Without an import path each takes ~80 hours of coordinator time.",
  problem_who: "Onboarding coordinators across 3 incoming clinics.",
  problem_where: "Otto-Onboard > Admin > Patients.",
  problem_evidence:
    "Two of the three clinics named this as a blocker in their onboarding kickoff.",
  problem_out_of_scope: "Historical appointment / treatment history import (Phase 2).",
  roadmap_bucket: "Now",
  displacement: "Push the cycle-summary export to Sprint 7",
  solution_complexity: "Medium",
  solution_approach:
    "CSV upload with column mapping UI, dry-run preview, then committed insert with per-row validation log.",
  solution_criteria:
    "A clinic can import 1,000 patients in under 10 minutes with a clear error report on failed rows.",
  solution_effort: "8 points",
  solution_decisions: "CSV format, max 5,000 rows per upload.",
  solution_questions: "How do we deduplicate against existing records?",
  solution_risks: "Bad data in CSVs; mitigated by dry-run preview.",
  tech_reviewer_id: "u-waseem",
  tech_review_notes:
    "Approach is sound. Use the existing CSV parser. Add a queue worker for >500 rows.",
  tech_estimate_pts: 8,
  tech_concerns: "None blocking — flag dedup strategy decision back to PM.",
  tech_signed_off_at: new Date(SEED_EPOCH - 86400000).toISOString(),
  created_at: new Date(SEED_EPOCH - 9 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 86400000).toISOString(),
};
sigForApproval.shaping_item_id = shapingForApproval.id;

const sigInDelivery: Signal = {
  ...buildSeedSignal({
    title: "Two-factor auth for clinic admin accounts",
    description: "Add TOTP-based 2FA for admin accounts to meet new clinic security policy.",
    source: "Internal",
    product: "Platform",
    daysAgo: 14,
    owner: "u-bazil",
  }),
  status: "Proceed",
};

const shapingInDelivery: ShapingItem = {
  ...blankShaping(sigInDelivery.id, "u-bazil"),
  shaping_status: "In Delivery",
  current_step: 5,
  problem_what:
    "Admin accounts only require a password — new clinic security policy mandates 2FA for any account that can edit patient records.",
  problem_why:
    "Compliance deadline in Q2; one clinic has flagged this as a gating item for renewal.",
  problem_who: "All 60 admin users across clinics.",
  problem_where: "Otto login + admin profile settings.",
  problem_evidence: "Compliance email from clinic IT, escalated by leadership.",
  problem_out_of_scope: "WebAuthn / hardware key support (Phase 2).",
  roadmap_bucket: "Now",
  displacement: "",
  solution_complexity: "Simple",
  solution_approach: "TOTP enrollment flow + recovery codes; enforce on next login.",
  solution_criteria: "100% of admins enrolled within 30 days; no lockouts beyond recovery flow.",
  solution_effort: "5 points",
  solution_decisions: "TOTP first; WebAuthn later.",
  solution_questions: "",
  solution_risks: "Lockouts — mitigated by recovery codes.",
  tech_reviewer_id: "u-ahmed",
  tech_review_notes: "Use otplib. Standard pattern, low risk.",
  tech_estimate_pts: 5,
  tech_concerns: "",
  tech_signed_off_at: new Date(SEED_EPOCH - 6 * 86400000).toISOString(),
  approver_id: "u-alizar",
  approval_decision: "Approved",
  approval_notes: "Approved for Sprint 6. Push to Jira.",
  approved_at: new Date(SEED_EPOCH - 5 * 86400000).toISOString(),
  jira_key: "TFP-1042",
  delivery_status: "In Progress",
  delivery_assignee_id: "u-farooq",
  created_at: new Date(SEED_EPOCH - 13 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 2 * 86400000).toISOString(),
};
sigInDelivery.shaping_item_id = shapingInDelivery.id;

const sigInQA: Signal = {
  ...buildSeedSignal({
    title: "Notes auto-save indicator",
    description: "Add a save-status indicator so coordinators know their notes have synced.",
    source: "Clinic",
    product: "Otto Notes",
    daysAgo: 12,
    owner: "u-bazil",
  }),
  status: "Proceed",
};

const shapingInQA: ShapingItem = {
  ...blankShaping(sigInQA.id, "u-bazil"),
  shaping_status: "In Delivery",
  current_step: 5,
  problem_what:
    "Coordinators don't know if their notes saved — leading to duplicate entries and uncertainty in patient handoffs.",
  problem_why: "Reduces data integrity risk and coordinator anxiety.",
  problem_who: "All coordinators using Otto Notes.",
  problem_where: "Otto Notes > patient note editor.",
  problem_evidence: "12 signals in two months from coordinators.",
  problem_out_of_scope: "Offline editing (Phase 2).",
  roadmap_bucket: "Now",
  displacement: "",
  solution_complexity: "Simple",
  solution_approach: "Add a status indicator: Saved · Saving… · Failed (retry).",
  solution_criteria: "Visible at all times; tested across slow networks.",
  solution_effort: "3 points",
  solution_decisions: "",
  solution_questions: "",
  solution_risks: "",
  tech_reviewer_id: "u-waseem",
  tech_review_notes: "Trivial — wire to existing autosave hook.",
  tech_estimate_pts: 3,
  tech_concerns: "",
  tech_signed_off_at: new Date(SEED_EPOCH - 8 * 86400000).toISOString(),
  approver_id: "u-alizar",
  approval_decision: "Approved",
  approval_notes: "Approved.",
  approved_at: new Date(SEED_EPOCH - 7 * 86400000).toISOString(),
  jira_key: "TFP-1038",
  delivery_status: "In QA",
  delivery_assignee_id: "u-zeeshan",
  created_at: new Date(SEED_EPOCH - 11 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 86400000).toISOString(),
};
sigInQA.shaping_item_id = shapingInQA.id;

// A blocked item (>1 day) — gives notifications work to do.
const sigBlocked: Signal = {
  ...buildSeedSignal({
    title: "FertiWise lead capture form errors",
    description: "Lead form intermittently 500s after submit — losing inbound leads.",
    source: "Internal",
    product: "FertiWise",
    daysAgo: 9,
    owner: "u-bazil",
  }),
  status: "Proceed",
};

const shapingBlocked: ShapingItem = {
  ...blankShaping(sigBlocked.id, "u-bazil"),
  shaping_status: "In Delivery",
  current_step: 5,
  problem_what: "Lead form fails ~8% of submissions, no error shown to user.",
  problem_why: "Each lost lead is ~£600 LTV; visible to marketing leadership.",
  problem_who: "Marketing ops + FertiWise prospects.",
  problem_where: "FertiWise > Get in touch form.",
  problem_evidence: "APM 500-rate spike since deploy 2026-04-08.",
  problem_out_of_scope: "Form redesign.",
  roadmap_bucket: "Now",
  displacement: "",
  solution_complexity: "Simple",
  solution_approach: "Patch validator handling for blank phone fields, add observability.",
  solution_criteria: "500-rate < 0.5% over 7 days.",
  solution_effort: "3 points",
  solution_decisions: "",
  solution_questions: "",
  solution_risks: "",
  tech_reviewer_id: "u-waseem",
  tech_review_notes: "Confirmed root cause. Quick fix.",
  tech_estimate_pts: 3,
  tech_concerns: "",
  tech_signed_off_at: new Date(SEED_EPOCH - 7 * 86400000).toISOString(),
  approver_id: "u-alizar",
  approval_decision: "Approved",
  approval_notes: "Ship.",
  approved_at: new Date(SEED_EPOCH - 6 * 86400000).toISOString(),
  jira_key: "TFP-1045",
  delivery_status: "Blocked",
  blocked_since: new Date(SEED_EPOCH - 2 * 86400000).toISOString(),
  blocker_description: "Awaiting SMTP provider response — needed before we can validate retry path.",
  delivery_assignee_id: "u-ahmed",
  created_at: new Date(SEED_EPOCH - 8 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 2 * 86400000).toISOString(),
};
sigBlocked.shaping_item_id = shapingBlocked.id;

const sigDone: Signal = {
  ...buildSeedSignal({
    title: "Coordinator dashboard load time",
    description:
      "Coordinator dashboard takes 6+ seconds to load on slow clinic networks. Needs performance work.",
    source: "Clinic",
    product: "Otto Pulse",
    daysAgo: 22,
    owner: "u-bazil",
  }),
  status: "Proceed",
};

const shapingDone: ShapingItem = {
  ...blankShaping(sigDone.id, "u-bazil"),
  shaping_status: "In Delivery",
  current_step: 5,
  problem_what: "Coordinator dashboard takes 6+ seconds to first paint on clinic Wi-Fi.",
  problem_why: "Coordinators check this 20+ times a day; latency wastes ~25min/day per user.",
  problem_who: "All ~120 coordinator users.",
  problem_where: "Otto Pulse > Coordinator Dashboard.",
  problem_evidence: "Five clinics complained; APM shows p95 6.4s on 4G.",
  problem_out_of_scope: "Native mobile rewrite (Phase 2).",
  roadmap_bucket: "Now",
  displacement: "",
  solution_complexity: "Simple",
  solution_approach: "Cache aggregations, defer non-critical widgets, add skeleton states.",
  solution_criteria: "p95 first paint < 2.0s on 4G in 30 days.",
  solution_effort: "5 points",
  solution_decisions: "Server cache TTL = 60s.",
  solution_questions: "",
  solution_risks: "Stale data perception — mitigated by visible refresh time.",
  tech_reviewer_id: "u-waseem",
  tech_review_notes: "Standard caching pattern.",
  tech_estimate_pts: 5,
  tech_concerns: "",
  tech_signed_off_at: new Date(SEED_EPOCH - 18 * 86400000).toISOString(),
  approver_id: "u-alizar",
  approval_decision: "Approved",
  approval_notes: "Ship.",
  approved_at: new Date(SEED_EPOCH - 17 * 86400000).toISOString(),
  jira_key: "TFP-1031",
  delivery_status: "Done",
  delivery_assignee_id: "u-farooq",
  dev_complete: {
    merged_to_main: true,
    deployed_to_staging: true,
    smoke_test_passed: true,
    signed_off_by: "u-karim",
    signed_off_at: new Date(SEED_EPOCH - 4 * 86400000).toISOString(),
  },
  created_at: new Date(SEED_EPOCH - 21 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 4 * 86400000).toISOString(),
};
sigDone.shaping_item_id = shapingDone.id;

seedSignals.push(sigForTechReview, sigForApproval, sigInDelivery, sigInQA, sigBlocked, sigDone);

const seedShaping: ShapingItem[] = [
  shapingInProgress,
  shapingInTechReview,
  shapingForApproval,
  shapingInDelivery,
  shapingInQA,
  shapingBlocked,
  shapingDone,
];

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
    ts: new Date(SEED_EPOCH - 5 * 86400000).toISOString(),
    direction: "outbound",
    type: "issue.created",
    jira_key: "TFP-1042",
    shaping_id: shapingInDelivery.id,
    payload: { summary: shapingInDelivery.problem_what.slice(0, 60), points: 5 },
  },
  {
    id: "je-" + uid(),
    ts: new Date(SEED_EPOCH - 3 * 86400000).toISOString(),
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
    jira_key: "TFP-1038",
    shaping_id: shapingInQA.id,
    payload: { summary: shapingInQA.problem_what.slice(0, 60), points: 3 },
  },
  {
    id: "je-" + uid(),
    ts: new Date(SEED_EPOCH - 86400000).toISOString(),
    direction: "inbound",
    type: "issue.transitioned",
    jira_key: "TFP-1038",
    shaping_id: shapingInQA.id,
    payload: { from: "In Progress", to: "In QA" },
  },
];

// ============ Wave 4 seed data ============

let _ovrCounter = 5;
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
    id: "OVR-003",
    kind: "Capacity exceeded",
    reason: "2FA pulled forward for compliance deadline; carried 87% allocation.",
    signal_id: sigInDelivery.id,
    shaping_id: shapingInDelivery.id,
    sprint_id: seedSprint.id,
    displaced_shaping_ids: [shapingInProgress.id],
    displaced_pts: 5,
    raised_by: "u-alizar",
    raised_at: new Date(SEED_EPOCH - 5 * 86400000).toISOString(),
    ack_status: "Acknowledged",
    acknowledged_by: "u-shahid",
    acknowledged_at: new Date(SEED_EPOCH - 4 * 86400000).toISOString(),
    shahid_visible: true,
  },
  {
    id: "OVR-004",
    kind: "Bypass tech review",
    reason: "FertiWise lead form 500s — patched live with Waseem on call.",
    signal_id: sigBlocked.id,
    shaping_id: shapingBlocked.id,
    sprint_id: seedSprint.id,
    displaced_shaping_ids: [],
    displaced_pts: 0,
    raised_by: "u-bazil",
    raised_at: new Date(SEED_EPOCH - 6 * 86400000).toISOString(),
    ack_status: "Acknowledged",
    acknowledged_by: "u-shahid",
    acknowledged_at: new Date(SEED_EPOCH - 5 * 86400000).toISOString(),
    shahid_visible: true,
  },
  {
    id: "OVR-005",
    kind: "Scope added mid-sprint",
    reason: "Board KPI dashboard added for Friday board pack.",
    signal_id: seedSignals[3].id,
    shaping_id: null,
    sprint_id: seedSprint.id,
    displaced_shaping_ids: [],
    displaced_pts: 0,
    raised_by: "u-alizar",
    raised_at: new Date(SEED_EPOCH - 86400000).toISOString(),
    ack_status: "Pending",
    acknowledged_by: null,
    acknowledged_at: null,
    shahid_visible: true,
  },
];

const seedGoLive: GoLiveChecklist[] = [
  {
    id: "gl-" + uid(),
    shaping_id: shapingInQA.id,
    product: "Otto Notes",
    release_name: "Notes autosave indicator v1",
    scheduled_for: new Date(SEED_EPOCH + 2 * 86400000).toISOString(),
    status: "In Progress",
    war_room: false,
    criteria: {
      "Clinic staff trained": {
        done: true,
        note: "Trained 2026-04-13.",
        checked_by: "u-sami",
        checked_at: new Date(SEED_EPOCH - 2 * 86400000).toISOString(),
      },
      "Data migrated and verified": { done: false, note: "Verifying notes backfill.", checked_by: null, checked_at: null },
      "UAT completed by clinic contact": { done: false, note: "Awaiting clinic sign-off.", checked_by: null, checked_at: null },
      "Rollback plan confirmed and tested": {
        done: true,
        note: "Feature flag toggle in admin.",
        checked_by: "u-waseem",
        checked_at: new Date(SEED_EPOCH - 86400000).toISOString(),
      },
      "Go-live comms sent to clinic staff": { done: false, note: "", checked_by: null, checked_at: null },
    },
    go_no_go_decision: null,
    go_no_go_by: null,
    go_no_go_at: null,
    created_at: new Date(SEED_EPOCH - 3 * 86400000).toISOString(),
    updated_at: new Date(SEED_EPOCH - 86400000).toISOString(),
  },
  {
    id: "gl-" + uid(),
    shaping_id: shapingInDelivery.id,
    product: "Platform",
    release_name: "2FA for clinic admins",
    scheduled_for: new Date(SEED_EPOCH + 6 * 86400000).toISOString(),
    status: "Not Started",
    war_room: true,
    criteria: {
      "Clinic staff trained": { done: false, note: "", checked_by: null, checked_at: null },
      "Data migrated and verified": { done: false, note: "", checked_by: null, checked_at: null },
      "UAT completed by clinic contact": { done: false, note: "Pilot clinic scheduled.", checked_by: null, checked_at: null },
      "Rollback plan confirmed and tested": { done: false, note: "", checked_by: null, checked_at: null },
      "Go-live comms sent to clinic staff": { done: false, note: "Sami drafting.", checked_by: null, checked_at: null },
    },
    go_no_go_decision: null,
    go_no_go_by: null,
    go_no_go_at: null,
    created_at: new Date(SEED_EPOCH - 86400000).toISOString(),
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
    one_change: "Stop accepting Now-bucket items in week 2 of sprint.",
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
    trigger: "sla_breach",
    title: "SLA breach: Patients cannot complete intake on Safari",
    body: "T1 signal past SLA. Owner: Bazil.",
    link_to: "/triage",
    entity_id: seedSignals[0].id,
    ts: new Date(SEED_EPOCH - 3600000).toISOString(),
  }),
  buildNotification({
    trigger: "blocked_over_1d",
    title: "TFP-1045 blocked > 1 day",
    body: "FertiWise lead form fix has been blocked since 13 Apr.",
    link_to: "/delivery",
    entity_id: shapingBlocked.id,
    ts: new Date(SEED_EPOCH - 7200000).toISOString(),
  }),
  buildNotification({
    trigger: "comms_approval",
    title: "Sami needs approval: Notes autosave email",
    body: "Draft sitting in comms log awaiting PM sign-off.",
    link_to: "/comms",
    ts: new Date(SEED_EPOCH - 1800000).toISOString(),
  }),
  buildNotification({
    trigger: "override_logged",
    title: "OVR-005 awaiting Shahid acknowledgement",
    body: "Scope added mid-sprint: board KPI dashboard.",
    link_to: "/overrides",
    entity_id: "OVR-005",
    ts: new Date(SEED_EPOCH - 86400000).toISOString(),
  }),
  buildNotification({
    trigger: "review_overdue",
    title: "Outcome review pending: Coordinator dashboard load time",
    body: "Item shipped 4 days ago — review still in Pending.",
    link_to: "/review",
    ts: new Date(SEED_EPOCH - 14400000).toISOString(),
  }),
  buildNotification({
    trigger: "retro_escalation",
    title: "Capacity theme escalated (3 sprints)",
    body: "Sprints 3, 4, 5 all flagged Capacity as primary theme.",
    link_to: "/retros",
    ts: new Date(SEED_EPOCH - 10 * 86400000).toISOString(),
  }),
];
seedNotifications[5].read = true;

// ============ Store ============

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
  }) => Signal;
  triageDecision: (
    signalId: string,
    decision: "Proceed" | "Hold" | "Reject",
    reason?: string,
    holdUntil?: string,
  ) => void;
  updateSignal: (signalId: string, patch: Partial<Signal>) => void;
  updateShaping: (id: string, patch: Partial<ShapingItem>) => void;
  setRoadmapBucket: (id: string, bucket: RoadmapBucket, displacement: string) => void;
  setComplexity: (id: string, c: Complexity) => void;
  signOffTechReview: (id: string, reviewerId: string) => void;
  approveShaping: (id: string, approverId: string, notes: string) => void;
  requestChanges: (id: string, approverId: string, notes: string) => void;
  approveFastTrack: (id: string, approverId: string) => void;
  pushToJira: (id: string) => string;
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
  upsertGoLive: (data: Partial<GoLiveChecklist> & { id?: string; shaping_id: string; product: Product; release_name: string; scheduled_for: string }) => GoLiveChecklist;
  toggleGoLiveCriterion: (id: string, criterion: GoLiveCriterion, done: boolean, note?: string) => void;
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
        set({ notifications: [note, ...get().notifications] });
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
          title: data.title || data.description.slice(0, 60),
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
          labels: c.labels,
          displacement_flag: data.displacement_flag,
          displacement_note: data.displacement_note,
        };
        set({ signals: [sig, ...get().signals] });
        get().audit_log({ entity_type: "signal", entity_id: sig.id, action: "Signal created" });
        // Notification triggers
        if (sig.source === "Leadership") {
          get().pushNotification({
            trigger: "leadership_signal",
            title: "Leadership signal logged",
            body: sig.title,
            link_to: "/triage",
            entity_id: sig.id,
          });
        }
        if (sig.issue_type === "Incident" || sig.tier === "T1") {
          get().pushNotification({
            trigger: "incident",
            title: "Incident raised: " + sig.title,
            body: `${sig.tier} · ${sig.product}`,
            link_to: "/triage",
            entity_id: sig.id,
          });
        }
        return sig;
      },

      triageDecision: (signalId, decision, reason, holdUntil) => {
        const me = get().currentUserId;
        const signals = get().signals.map((s) => {
          if (s.id !== signalId) return s;
          if (decision === "Proceed") {
            const isFastTrack = s.issue_type === "Bug" && (s.tier === "T1" || s.tier === "T2");
            // Default fast-track owner to a Tech Lead if available
            const ownerId = isFastTrack ? "u-waseem" : me;
            const sh = blankShaping(s.id, ownerId, { fastTrack: isFastTrack });
            set({ shaping: [sh, ...get().shaping] });
            get().audit_log({ entity_type: "signal", entity_id: signalId, action: isFastTrack ? "Triaged → Proceed (Fast-track)" : "Triaged → Proceed" });
            if (isFastTrack) {
              get().pushNotification({
                trigger: "fast_track_review",
                title: `Fast-track: ${s.title}`,
                body: `${s.tier} ${s.issue_type} — root cause required.`,
                link_to: "/shaping",
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

      updateSignal: (signalId, patch) => {
        const prev = get().signals.find((s) => s.id === signalId);
        if (!prev) return;
        const next: Signal = { ...prev, ...patch };
        // Recompute SLA if tier changed
        if (patch.tier && patch.tier !== prev.tier) {
          next.sla_due_at = slaDueAt(patch.tier, new Date(prev.created_at)).toISOString();
        }
        set({ signals: get().signals.map((s) => (s.id === signalId ? next : s)) });
        // Audit per changed field
        const fields: (keyof Signal)[] = [
          "title", "description", "source", "product", "issue_type", "tier", "status", "owner_id",
        ];
        for (const f of fields) {
          if (patch[f] !== undefined && prev[f] !== next[f]) {
            get().audit_log({
              entity_type: "signal",
              entity_id: signalId,
              action: `${String(f)} changed`,
              before: String(prev[f] ?? ""),
              after: String(next[f] ?? ""),
            });
          }
        }
        if (patch.tier && patch.tier !== prev.tier) {
          get().audit_log({
            entity_type: "signal",
            entity_id: signalId,
            action: "SLA recalculated for new tier",
            after: next.sla_due_at,
          });
        }
      },


        set({
          shaping: get().shaping.map((s) => (s.id === id ? { ...s, ...patch, updated_at: new Date().toISOString() } : s)),
        });
      },

      setRoadmapBucket: (id, bucket, displacement) => {
        set({
          shaping: get().shaping.map((s) =>
            s.id === id ? { ...s, roadmap_bucket: bucket, displacement, updated_at: new Date().toISOString() } : s,
          ),
        });
        get().audit_log({ entity_type: "shaping", entity_id: id, action: `Roadmap bucket set to ${bucket}` });
      },

      setComplexity: (id, c) => {
        set({
          shaping: get().shaping.map((s) =>
            s.id === id ? { ...s, solution_complexity: c, updated_at: new Date().toISOString() } : s,
          ),
        });
      },

      signOffTechReview: (id, reviewerId) => {
        set({
          shaping: get().shaping.map((s) =>
            s.id === id
              ? {
                  ...s,
                  tech_reviewer_id: reviewerId,
                  tech_signed_off_at: new Date().toISOString(),
                  shaping_status: "Tech Approved",
                  current_step: 5,
                  updated_at: new Date().toISOString(),
                }
              : s,
          ),
        });
        get().audit_log({ entity_type: "shaping", entity_id: id, action: "Tech review signed off" });
        get().pushNotification({
          trigger: "tech_review_ready",
          title: "Ready for approval",
          body: "Tech review signed off — awaiting Senior PM.",
          link_to: "/shaping",
          entity_id: id,
        });
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
                  current_step: 4,
                  updated_at: new Date().toISOString(),
                }
              : s,
          ),
        });
        get().audit_log({ entity_type: "shaping", entity_id: id, action: "Changes requested" });
      },

      pushToJira: (id) => {
        const item = get().shaping.find((s) => s.id === id);
        if (!item || item.shaping_status !== "Approved" || item.jira_key) return item?.jira_key ?? "";
        const key = nextJiraKey();
        const event: JiraEvent = {
          id: "je-" + uid(),
          ts: new Date().toISOString(),
          direction: "outbound",
          type: "issue.created",
          jira_key: key,
          shaping_id: id,
          payload: { summary: item.problem_what.slice(0, 80), points: item.tech_estimate_pts ?? 0, sprint: get().sprint.name },
        };
        set({
          shaping: get().shaping.map((s) =>
            s.id === id
              ? { ...s, jira_key: key, delivery_status: "To Do", shaping_status: "In Delivery", updated_at: new Date().toISOString() }
              : s,
          ),
          jiraEvents: [event, ...get().jiraEvents],
        });
        get().audit_log({ entity_type: "shaping", entity_id: id, action: `Pushed to Jira as ${key}` });
        // Soft-warn: capacity check
        const sp = get().sprint;
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
        if (sp.status === "Locked" || newAlloc / Math.max(1, usable) > 0.85) {
          get().pushNotification({
            trigger: "scope_change",
            title: "Sprint capacity > 85%",
            body: `${key} added — sprint now at ${Math.round((newAlloc / Math.max(1, usable)) * 100)}% allocation. Consider logging an override.`,
            link_to: "/overrides",
            entity_id: id,
          });
        }
        set({ sprint: { ...sp, allocated_pts: newAlloc } });
        return key;
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
          get().pushNotification({
            trigger: "blocker_signoff",
            title: `${item.jira_key} marked Blocked`,
            body: "Investigate and clear blocker; auto-escalates after 24h.",
            link_to: "/delivery",
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
        get().pushNotification({
          trigger: "blocker_signoff",
          title: `${item.jira_key} marked Blocked`,
          body: description.slice(0, 120),
          link_to: "/delivery",
          entity_id: id,
        });
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

      syncFromJira: () => {
        const items = get().shaping.filter(
          (s) => s.jira_key && s.delivery_status && s.delivery_status !== "Done" && s.delivery_status !== "Blocked",
        );
        const events: JiraEvent[] = [];
        const updates = new Map<string, DeliveryStatus>();
        items.forEach((s, i) => {
          if (i % 2 !== 0) return;
          const idx = JIRA_FLOW.indexOf(s.delivery_status as DeliveryStatus);
          if (idx < 0 || idx >= JIRA_FLOW.length - 1) return;
          const next = JIRA_FLOW[idx + 1];
          updates.set(s.id, next);
          events.push({
            id: "je-" + uid(),
            ts: new Date().toISOString(),
            direction: "inbound",
            type: "issue.transitioned",
            jira_key: s.jira_key!,
            shaping_id: s.id,
            payload: { from: s.delivery_status, to: next },
          });
        });
        if (updates.size === 0) return 0;
        set({
          shaping: get().shaping.map((s) =>
            updates.has(s.id) ? { ...s, delivery_status: updates.get(s.id)!, updated_at: new Date().toISOString() } : s,
          ),
          jiraEvents: [...events, ...get().jiraEvents],
        });
        return updates.size;
      },

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
        const sig = get().createSignal({
          title: data.title,
          description: data.description,
          source: data.source,
          product: data.product,
          displacement_flag: false,
          displacement_note: null,
        });
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
        set({
          shaping: get().shaping.map((s) =>
            s.id === id
              ? {
                  ...s,
                  dev_complete: { ...s.dev_complete, signed_off_by: me, signed_off_at: new Date().toISOString() },
                  updated_at: new Date().toISOString(),
                }
              : s,
          ),
        });
        get().audit_log({ entity_type: "shaping", entity_id: id, action: "Dev-complete gate signed off" });
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
          link_to: "/overrides",
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
        const fresh: GoLiveChecklist = {
          id: "gl-" + uid(),
          shaping_id: data.shaping_id,
          product: data.product,
          release_name: data.release_name,
          scheduled_for: data.scheduled_for,
          status: data.status ?? "Not Started",
          war_room: data.war_room ?? false,
          criteria: data.criteria ?? {
            "Clinic staff trained": { done: false, note: "", checked_by: null, checked_at: null },
            "Data migrated and verified": { done: false, note: "", checked_by: null, checked_at: null },
            "UAT completed by clinic contact": { done: false, note: "", checked_by: null, checked_at: null },
            "Rollback plan confirmed and tested": { done: false, note: "", checked_by: null, checked_at: null },
            "Go-live comms sent to clinic staff": { done: false, note: "", checked_by: null, checked_at: null },
          },
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
          link_to: "/comms",
          entity_id: id,
        });
      },

      approveComms: (id) => {
        const me = get().currentUserId;
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
            link_to: "/retros",
            entity_id: retro.id,
          });
        }
        return retro;
      },

      // ============ Wave 5: stubs (full implementations pending follow-up) ============
      approveFastTrack: (id, approverId) => {
        get().approveShaping(id, approverId, "Fast-track approved");
        get().pushToJira(id);
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
            tier_override: "T1",
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
          link_to: "/health",
          entity_id: alert.id,
        });
        return alert;
      },
      submitClinicFeedback: (data) => {
        const oneHourAgo = Date.now() - 3600000;
        const recent = get().clinicFeedbackLog.filter(
          (r) => r.clinic_id === data.clinic_id && r.ts > oneHourAgo,
        );
        if (recent.length >= 5) {
          return { ok: false, reason: "rate_limited" };
        }
        const sig = get().createSignal({
          title: `[Clinic Form] ${data.reporter_name}: ${data.description.slice(0, 60)}`,
          description: `[Clinic Form] [${data.reporter_name}] [${data.clinic_name}]\n\n${data.description}`,
          source: "Clinic",
          product: "Platform",
          issue_type_override: data.urgent ? "Bug" : "Enhancement",
          tier_override: data.urgent ? "T2" : "T3",
          displacement_flag: false,
          displacement_note: null,
        });
        set({ clinicFeedbackLog: [...get().clinicFeedbackLog, { clinic_id: data.clinic_id, ts: Date.now() }] });
        get().pushNotification({
          trigger: "clinic_feedback",
          title: `Clinic feedback from ${data.clinic_name}`,
          body: data.description.slice(0, 100),
          link_to: "/triage",
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
    }),
    { name: "tfp-os-v5" },
  ),
);

export function completenessScore(s: ShapingItem): number {
  const fields: Array<{ key: keyof ShapingItem; min: number }> = [
    { key: "problem_what", min: 50 },
    { key: "problem_why", min: 50 },
    { key: "problem_who", min: 30 },
    { key: "problem_where", min: 30 },
    { key: "problem_evidence", min: 30 },
    { key: "problem_out_of_scope", min: 1 },
  ];
  return fields.reduce((acc, f) => {
    const v = String(s[f.key] ?? "");
    return acc + (v.trim().length >= f.min ? 1 : 0);
  }, 0);
}

export function solutionComplete(s: ShapingItem): boolean {
  if (!s.solution_complexity) return false;
  const required: Array<keyof ShapingItem> =
    s.solution_complexity === "Simple"
      ? ["solution_approach", "solution_criteria", "solution_effort"]
      : ["solution_approach", "solution_criteria", "solution_effort", "solution_decisions", "solution_risks"];
  return required.every((k) => String(s[k] ?? "").trim().length > 0);
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
    completenessScore(s) >= 5 &&
    !!s.roadmap_bucket &&
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
