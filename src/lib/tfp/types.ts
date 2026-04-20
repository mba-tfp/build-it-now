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

export type DevCompleteGate = {
  tests_pass: boolean;
  docs_updated: boolean;
  qa_signed_off: boolean;
  signed_off_by: string | null;
  signed_off_at: string | null;
};

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
  blocked_since: string | null;
  dev_complete: DevCompleteGate;
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
  outcome_rating: OutcomeRating | null;
  what_worked: string;
  what_didnt: string;
  follow_on_signals_created: string[];
  notes: string;
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
  status: "Planning" | "Active" | "Completed" | "Locked";
  scope_locked_at: string | null;
  scope_locked_by: string | null;
  gross_capacity_pts: number;
  leave_deduction_pts: number;
  interrupt_buffer_pts: number;
  qa_buffer_pts: number;
  uncertainty_buffer_pts: number;
  golive_deduction_pts: number;
  carryforward_estimate_pts: number;
  allocated_pts: number;
};

// ============ Wave 4 additions ============

export type AuditEntityType = "signal" | "shaping" | "review" | "sprint" | "override" | "comms" | "checklist" | "decision" | "retro";

export type AuditEntry = {
  id: string;
  ts: string;
  actor_id: string;
  entity_type: AuditEntityType;
  entity_id: string;
  action: string; // human-readable: "moved to In Progress", "approved", "logged override OVR-007"
  before?: string | null;
  after?: string | null;
  meta?: Record<string, unknown>;
};

export type OverrideKind = "Capacity exceeded" | "Scope added mid-sprint" | "Tier escalation" | "Bypass tech review" | "Other";
export type OverrideAckStatus = "Pending" | "Acknowledged";

export type Override = {
  id: string; // OVR-NNN
  kind: OverrideKind;
  reason: string;
  signal_id: string | null;
  shaping_id: string | null;
  sprint_id: string | null;
  displaced_shaping_ids: string[];
  displaced_pts: number;
  raised_by: string;
  raised_at: string;
  ack_status: OverrideAckStatus;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  shahid_visible: boolean;
};

export type GoLiveCriterion =
  | "Code merged & deployed to staging"
  | "QA sign-off complete"
  | "Clinic comms sent"
  | "Rollback plan documented"
  | "On-call coverage confirmed";

export type GoLiveStatus = "Not Started" | "In Progress" | "Ready" | "Live" | "Rolled Back";

export type GoLiveChecklist = {
  id: string;
  shaping_id: string;
  product: Product;
  release_name: string;
  scheduled_for: string;
  status: GoLiveStatus;
  war_room: boolean;
  criteria: Record<GoLiveCriterion, { done: boolean; note: string; checked_by: string | null; checked_at: string | null }>;
  go_no_go_decision: "Go" | "No-Go" | null;
  go_no_go_by: string | null;
  go_no_go_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommsStatus = "Draft" | "Pending Approval" | "Approved" | "Sent" | "Rejected";
export type CommsChannel = "Email" | "In-app banner" | "Teams" | "Phone";

export type CommsItem = {
  id: string;
  product: Product;
  channel: CommsChannel;
  audience: string; // "All clinics", "Pilot clinics", "Clinic A"
  subject: string;
  body: string;
  drafted_by: string;
  drafted_at: string;
  status: CommsStatus;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  rejected_reason: string | null;
  linked_shaping_id: string | null;
};

export type DecisionType = "Architectural" | "Product" | "Process" | "Vendor";
export type DecisionStatus = "Open" | "Decided" | "Superseded";

export type Decision = {
  id: string; // DEC-NNN
  title: string;
  type: DecisionType;
  status: DecisionStatus;
  context: string;
  options_considered: string;
  decision: string;
  consequences: string;
  decided_by: string;
  decided_at: string;
  linked_signal_id: string | null;
  linked_shaping_id: string | null;
  superseded_by_id: string | null;
};

export type RetroTheme = "Process" | "Tools" | "Communication" | "Quality" | "Capacity" | "Other";

export type SprintRetro = {
  id: string;
  sprint_id: string;
  what_worked: string;
  what_didnt: string;
  one_change: string;
  primary_theme: RetroTheme;
  created_by: string;
  created_at: string;
  escalated: boolean; // true if 3 consecutive sprints share primary_theme
};

export type NotificationPriority = "P1" | "P2" | "P3" | "P4";
export type NotificationTrigger =
  | "leadership_signal"
  | "incident"
  | "tech_review_ready"
  | "blocker_signoff"
  | "blocked_over_1d"
  | "comms_approval"
  | "golive_unconfirmed"
  | "review_overdue"
  | "sla_breach"
  | "scope_change"
  | "retro_escalation"
  | "override_logged"
  | "shaping_stuck";

export type Notification = {
  id: string;
  ts: string;
  trigger: NotificationTrigger;
  priority: NotificationPriority;
  title: string;
  body: string;
  for_user_id: string | null; // null = all
  link_to: string | null; // route path
  read: boolean;
  entity_id: string | null;
};
