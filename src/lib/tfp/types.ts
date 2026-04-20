export type Role =
  | "PM"
  | "Senior PM"
  | "Associate PM"
  | "Tech Lead"
  | "Developer"
  | "QA Scrum Master"
  | "Leadership";

export type User = { id: string; name: string; role: Role };

export type Source = "Leadership" | "Clinic" | "Internal" | "Dev Team";
export type Product =
  | "Otto-Onboard"
  | "Otto Notes"
  | "Otto Pulse"
  | "FertiWise"
  | "StimSmart"
  | "Platform";
export type IssueType =
  | "Feature"
  | "Bug"
  | "Enhancement"
  | "Leadership Input"
  | "Support"
  | "Incident";
export type Tier = "T1" | "T2" | "T3" | "T4";
export type SignalStatus = "New" | "In Review" | "Proceed" | "Hold" | "Rejected";

export type Signal = {
  id: string;
  title: string;
  description: string;
  source: Source;
  product: Product;
  issue_type: IssueType;
  tier: Tier;
  status: SignalStatus;
  owner_id: string | null;
  triage_reason: string | null;
  hold_until: string | null;
  sla_due_at: string;
  created_at: string;
  created_by: string;
  shaping_item_id: string | null;
  labels: string[];
  displacement_flag: boolean;
  displacement_note: string | null;
};

export type ShapingStatus =
  | "Unshaped"
  | "In Shaping"
  | "Shaped"
  | "In Tech Review"
  | "Tech Approved"
  | "Approved"
  | "In Delivery";
export type Complexity = "Simple" | "Medium" | "Complex";
export type RoadmapBucket = "Now" | "Next" | "Later" | "Not Now" | "Override";

export type ShapingItem = {
  id: string;
  signal_id: string;
  shaping_status: ShapingStatus;
  pm_owner_id: string;
  current_step: 1 | 2 | 3 | 4 | 5;
  problem_what: string;
  problem_why: string;
  problem_who: string;
  problem_where: string;
  problem_evidence: string;
  problem_out_of_scope: string;
  roadmap_bucket: RoadmapBucket | null;
  displacement: string;
  solution_complexity: Complexity | null;
  solution_approach: string;
  solution_criteria: string;
  solution_effort: string;
  solution_decisions: string;
  solution_questions: string;
  solution_risks: string;
  // Tech Review (Step 4)
  tech_reviewer_id: string | null;
  tech_review_notes: string;
  tech_estimate_pts: number | null;
  tech_concerns: string;
  tech_signed_off_at: string | null;
  // Approval (Step 5)
  approver_id: string | null;
  approval_decision: "Approved" | "Changes Requested" | null;
  approval_notes: string;
  approved_at: string | null;
  // Delivery
  jira_key: string | null;
  delivery_status: DeliveryStatus | null;
  created_at: string;
  updated_at: string;
};

export type DeliveryStatus = "To Do" | "In Progress" | "In QA" | "Blocked" | "Done";

export type JiraEvent = {
  id: string;
  ts: string;
  direction: "outbound" | "inbound";
  type: "issue.created" | "issue.transitioned" | "issue.updated";
  jira_key: string;
  shaping_id: string;
  payload: Record<string, unknown>;
};

export type ReviewSize = "Small" | "Medium" | "Large";
export type ReviewStatus = "Pending" | "Scheduled" | "Completed";
export type OutcomeRating = "Met" | "Partially Met" | "Missed";

export type Review = {
  id: string;
  shaping_id: string;
  signal_id: string;
  size: ReviewSize;
  status: ReviewStatus;
  pm_owner_id: string;
  scheduled_for: string | null;
  completed_at: string | null;
  // Retro fields (filled at completion)
  outcome_rating: OutcomeRating | null;
  what_worked: string;
  what_didnt: string;
  follow_on_signals_created: string[]; // signal ids
  notes: string;
  // Auto-generated follow-on draft fields (PM edits then logs)
  follow_on_draft_title: string;
  follow_on_draft_description: string;
  created_at: string;
  updated_at: string;
};

export type Sprint = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: "Planning" | "Active" | "Completed";
  gross_capacity_pts: number;
  leave_deduction_pts: number;
  interrupt_buffer_pts: number;
  qa_buffer_pts: number;
  uncertainty_buffer_pts: number;
  golive_deduction_pts: number;
  carryforward_estimate_pts: number;
  allocated_pts: number;
};
