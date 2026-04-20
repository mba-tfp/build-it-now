import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Complexity,
  RoadmapBucket,
  ShapingItem,
  Signal,
  Sprint,
  User,
} from "./types";
import { classifySignal, slaDueAt } from "./classify";

const uid = () => Math.random().toString(36).slice(2, 10);

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
  start_date: new Date(Date.now() - 4 * 86400000).toISOString(),
  end_date: new Date(Date.now() + 10 * 86400000).toISOString(),
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
  const created = new Date(Date.now() - args.daysAgo * 86400000);
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
    hold_until: new Date(Date.now() + 5 * 86400000).toISOString(),
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

const seedShaping: ShapingItem[] = [
  {
    id: "sh-" + uid(),
    signal_id: seedSignals[1].id,
    shaping_status: "In Shaping",
    pm_owner_id: "u-bazil",
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
    displacement: "",
    solution_complexity: null,
    solution_approach: "",
    solution_criteria: "",
    solution_effort: "",
    solution_decisions: "",
    solution_questions: "",
    solution_risks: "",
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

// Link seed shaping back into the source signal
seedSignals[1].status = "Proceed";
seedSignals[1].shaping_item_id = seedShaping[0].id;

type State = {
  currentUserId: string;
  users: User[];
  sprint: Sprint;
  signals: Signal[];
  shaping: ShapingItem[];
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
};

export const useTfpStore = create<State>()(
  persist(
    (set, get) => ({
      currentUserId: "u-bazil",
      users: USERS,
      sprint: seedSprint,
      signals: seedSignals,
      shaping: seedShaping,
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
        let newShapingId: string | null = null;
        const signals = get().signals.map((s) => {
          if (s.id !== signalId) return s;
          if (decision === "Proceed") {
            const sh: ShapingItem = {
              id: "sh-" + uid(),
              signal_id: s.id,
              shaping_status: "Unshaped",
              pm_owner_id: me,
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
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            set({ shaping: [sh, ...get().shaping] });
            newShapingId = sh.id;
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
        return newShapingId;
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
    }),
    { name: "tfp-os-v1" },
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
