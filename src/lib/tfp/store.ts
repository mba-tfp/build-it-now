import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Complexity,
  DeliveryStatus,
  JiraEvent,
  OutcomeRating,
  Review,
  ReviewSize,
  RoadmapBucket,
  ShapingItem,
  Signal,
  Sprint,
  User,
} from "./types";
import { classifySignal, slaDueAt } from "./classify";

let _uidCounter = 0;
const uid = () => {
  _uidCounter += 1;
  return _uidCounter.toString(36).padStart(4, "0");
};

// Stable epoch for seed data so SSR and client render identical timestamps.
const SEED_EPOCH = new Date("2026-04-15T09:00:00.000Z").getTime();

export const USERS: User[] = [
  { id: "u-bazil", name: "Bazil", role: "PM" },
  { id: "u-alizar", name: "Alizar", role: "Senior PM" },
  { id: "u-sami", name: "Sami", role: "Associate PM" },
  { id: "u-karim", name: "Abdul Karim", role: "QA Scrum Master" },
  { id: "u-waseem", name: "Waseem", role: "Tech Lead" },
  { id: "u-ahmed", name: "M. Ahmed", role: "Tech Lead" },
  { id: "u-farooq", name: "Farooq", role: "Developer" },
  { id: "u-zeeshan", name: "Zeeshan", role: "Developer" },
  { id: "u-shahid", name: "Shahid", role: "Leadership" },
];

const seedSprint: Sprint = {
  id: "s-6",
  name: "Sprint 6",
  start_date: new Date(SEED_EPOCH - 4 * 86400000).toISOString(),
  end_date: new Date(SEED_EPOCH + 10 * 86400000).toISOString(),
  status: "Active",
  gross_capacity_pts: 60,
  leave_deduction_pts: 5,
  interrupt_buffer_pts: 6,
  qa_buffer_pts: 4,
  uncertainty_buffer_pts: 3,
  golive_deduction_pts: 0,
  carryforward_estimate_pts: 5,
  allocated_pts: 34,
};

function blankShaping(signalId: string, ownerId: string): ShapingItem {
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
    approver_id: null,
    approval_decision: null,
    approval_notes: "",
    approved_at: null,
    jira_key: null,
    delivery_status: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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

// In-shaping seed (Step 3 ready to go)
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
  problem_out_of_scope:
    "PDF export, scheduled email delivery, custom date ranges (Phase 2).",
  roadmap_bucket: "Next",
  created_at: new Date(SEED_EPOCH - 2 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 86400000).toISOString(),
};
seedSignals[1].status = "Proceed";
seedSignals[1].shaping_item_id = shapingInProgress.id;

// Tech Review seed — fully shaped, awaiting Tech Lead sign-off
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

// Approval seed — Tech Lead has signed off, waiting for Senior PM approval
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
} as ShapingItem;
sigForApproval.shaping_item_id = shapingForApproval.id;

// Delivery seed — already approved & pushed to Jira
const sigInDelivery: Signal = {
  ...buildSeedSignal({
    title: "Two-factor auth for clinic admin accounts",
    description:
      "Add TOTP-based 2FA for admin accounts to meet new clinic security policy.",
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
  created_at: new Date(SEED_EPOCH - 13 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 2 * 86400000).toISOString(),
} as ShapingItem;
sigInDelivery.shaping_item_id = shapingInDelivery.id;

// A second delivery item, in QA
const sigInQA: Signal = {
  ...buildSeedSignal({
    title: "Notes auto-save indicator",
    description:
      "Add a save-status indicator so coordinators know their notes have synced.",
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
  created_at: new Date(SEED_EPOCH - 11 * 86400000).toISOString(),
  updated_at: new Date(SEED_EPOCH - 86400000).toISOString(),
} as ShapingItem;
sigInQA.shaping_item_id = shapingInQA.id;

// Push the wave-2 seed signals into the signals list so they appear in triage history
seedSignals.push(sigForTechReview, sigForApproval, sigInDelivery, sigInQA);

const seedShaping: ShapingItem[] = [
  shapingInProgress,
  shapingInTechReview,
  shapingForApproval,
  shapingInDelivery,
  shapingInQA,
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

type State = {
  currentUserId: string;
  users: User[];
  sprint: Sprint;
  signals: Signal[];
  shaping: ShapingItem[];
  jiraEvents: JiraEvent[];
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
  updateShaping: (id: string, patch: Partial<ShapingItem>) => void;
  setRoadmapBucket: (id: string, bucket: RoadmapBucket, displacement: string) => void;
  setComplexity: (id: string, c: Complexity) => void;
  // Wave 2
  signOffTechReview: (id: string, reviewerId: string) => void;
  approveShaping: (id: string, approverId: string, notes: string) => void;
  requestChanges: (id: string, approverId: string, notes: string) => void;
  pushToJira: (id: string) => string; // returns jira key
  setDeliveryStatus: (id: string, next: DeliveryStatus) => void;
  syncFromJira: () => number; // returns number of changes
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
      signals: seedSignals,
      shaping: seedShaping,
      jiraEvents: seedJiraEvents,
      setCurrentUser: (id) => set({ currentUserId: id }),

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
        return sig;
      },

      triageDecision: (signalId, decision, reason, holdUntil) => {
        const me = get().currentUserId;
        const signals = get().signals.map((s) => {
          if (s.id !== signalId) return s;
          if (decision === "Proceed") {
            const sh = blankShaping(s.id, me);
            set({ shaping: [sh, ...get().shaping] });
            return {
              ...s,
              status: "Proceed" as const,
              owner_id: me,
              shaping_item_id: sh.id,
              triage_reason: null,
              hold_until: null,
            };
          }
          if (decision === "Hold") {
            return {
              ...s,
              status: "Hold" as const,
              owner_id: me,
              triage_reason: reason ?? null,
              hold_until: holdUntil ?? null,
            };
          }
          return {
            ...s,
            status: "Rejected" as const,
            owner_id: me,
            triage_reason: reason ?? null,
          };
        });
        set({ signals });
      },

      updateShaping: (id, patch) => {
        set({
          shaping: get().shaping.map((s) =>
            s.id === id ? { ...s, ...patch, updated_at: new Date().toISOString() } : s,
          ),
        });
      },

      setRoadmapBucket: (id, bucket, displacement) => {
        set({
          shaping: get().shaping.map((s) =>
            s.id === id
              ? { ...s, roadmap_bucket: bucket, displacement, updated_at: new Date().toISOString() }
              : s,
          ),
        });
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
      },

      pushToJira: (id) => {
        const item = get().shaping.find((s) => s.id === id);
        if (!item || item.shaping_status !== "Approved" || item.jira_key) {
          return item?.jira_key ?? "";
        }
        const key = nextJiraKey();
        const event: JiraEvent = {
          id: "je-" + uid(),
          ts: new Date().toISOString(),
          direction: "outbound",
          type: "issue.created",
          jira_key: key,
          shaping_id: id,
          payload: {
            summary: item.problem_what.slice(0, 80),
            points: item.tech_estimate_pts ?? 0,
            sprint: get().sprint.name,
          },
        };
        set({
          shaping: get().shaping.map((s) =>
            s.id === id
              ? {
                  ...s,
                  jira_key: key,
                  delivery_status: "To Do",
                  shaping_status: "In Delivery",
                  updated_at: new Date().toISOString(),
                }
              : s,
          ),
          jiraEvents: [event, ...get().jiraEvents],
        });
        return key;
      },

      setDeliveryStatus: (id, next) => {
        const item = get().shaping.find((s) => s.id === id);
        if (!item || !item.jira_key) return;
        const event: JiraEvent = {
          id: "je-" + uid(),
          ts: new Date().toISOString(),
          direction: "outbound",
          type: "issue.transitioned",
          jira_key: item.jira_key,
          shaping_id: id,
          payload: { from: item.delivery_status ?? "To Do", to: next },
        };
        set({
          shaping: get().shaping.map((s) =>
            s.id === id
              ? { ...s, delivery_status: next, updated_at: new Date().toISOString() }
              : s,
          ),
          jiraEvents: [event, ...get().jiraEvents],
        });
      },

      syncFromJira: () => {
        // Simulate a pull: advance each non-Done, non-Blocked item one step ~50% of the time.
        const items = get().shaping.filter(
          (s) => s.jira_key && s.delivery_status && s.delivery_status !== "Done" && s.delivery_status !== "Blocked",
        );
        const events: JiraEvent[] = [];
        const updates = new Map<string, DeliveryStatus>();
        items.forEach((s, i) => {
          // deterministic-ish: every other item advances
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
            updates.has(s.id)
              ? { ...s, delivery_status: updates.get(s.id)!, updated_at: new Date().toISOString() }
              : s,
          ),
          jiraEvents: [...events, ...get().jiraEvents],
        });
        return updates.size;
      },
    }),
    { name: "tfp-os-v2" },
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
      : [
          "solution_approach",
          "solution_criteria",
          "solution_effort",
          "solution_decisions",
          "solution_risks",
        ];
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
