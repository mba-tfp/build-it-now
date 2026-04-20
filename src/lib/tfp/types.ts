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

export type ShapingStatus = "Unshaped" | "In Shaping" | "Shaped" | "Approved";
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
