export type Role =
  | "PM"
  | "Senior PM"
  | "Associate PM"
  | "Tech Lead"
  | "Developer"
  | "QA Scrum Master"
  | "Leadership";

export type User = {
  id: string;
  name: string;
  role: Role;
  onboarding_completed: boolean;
  onboarding_progress: Record<string, boolean>;
};

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
  | "Incident"
  | "Dependency Change";

export type DependencySystem =
  | "Accuro"
  | "Phelix AI"
  | "Olive EngagedMD"
  | "Tia Health"
  | "EngagedMD";
export type Tier = "P1" | "P2" | "P3";
export type SignalStatus = "New" | "In Review" | "Proceed" | "Hold" | "Rejected";

export type Attachment = {
  id: string;
  label: string;
  url: string;
  added_by: string;
  added_at: string;
  /** "link" = external URL, "file" = inline data URL of an uploaded file. Defaults to "link" when absent. */
  kind?: "link" | "file";
  /** MIME type for uploaded files (e.g. "image/png", "application/pdf"). */
  mime_type?: string;
};

export type IntakePriority = Tier;

export type Signal = {
  id: string;
  title: string;
  description: string;
  source: Source;
  /** Optional secondary sources (multi-select). Primary `source` remains the routing key. */
  additional_sources?: Source[];
  product: Product;
  /** Optional secondary products (multi-select). Primary `product` remains the routing key. */
  additional_products?: Product[];
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
  attachments?: Attachment[];
  parent_signal_id?: string | null;
  /** Intake-stage prioritisation. Defaults to P2 for legacy/seed signals. */
  priority?: IntakePriority;
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
export type RoadmapBucket = "Committed" | "Backlog" | "Not Now" | "Override";

export type DevCompleteGate = {
  merged_to_main: boolean;
  deployed_to_staging: boolean;
  smoke_test_passed: boolean;
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
  // Tech review
  tech_reviewer_id: string | null;
  tech_review_notes: string;
  tech_estimate_pts: number | null;
  tech_concerns: string;
  tech_signed_off_at: string | null;
  tech_concurrent_access_checked: boolean;
  // Approval
  approver_id: string | null;
  approval_decision: "Approved" | "Changes Requested" | null;
  approval_notes: string;
  approved_at: string | null;
  // Delivery
  jira_key: string | null;
  /** True once explicitly added to the active sprint. False = sits in Backlog after Push to Jira. */
  in_sprint?: boolean;
  delivery_status: DeliveryStatus | null;
  blocked_since: string | null;
  blocker_description: string;
  delivery_assignee_id: string | null;
  dev_complete: DevCompleteGate;
  // Bug fast-track + timebox (spec)
  fast_track: boolean;
  fast_track_root_cause: string;
  shaping_started_at: string | null;
  timebox_escalated_at: string | null;
  // Tech debt
  tech_debt_reviewed_at: string | null;
  // Dependency Change fast-track
  dependency_system: DependencySystem | null;
  dependency_what_changed: string;
  dependency_integrations_affected: string;
  dependency_impact: string;
  dependency_deadline: string | null;
  attachments?: Attachment[];
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
  attachments?: Attachment[];
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
  notes?: string;
};

// ============ Wave 4 additions ============

export type AuditEntityType = "signal" | "shaping" | "review" | "sprint" | "override" | "comms" | "checklist" | "decision" | "retro" | "clinic" | "monitoring";

export type AuditEntry = {
  id: string;
  ts: string;
  actor_id: string;
  entity_type: AuditEntityType;
  entity_id: string;
  action: string;
  before?: string | null;
  after?: string | null;
  meta?: Record<string, unknown>;
};

export type OverrideKind = "Capacity exceeded" | "Scope added mid-sprint" | "Priority escalation" | "Bypass tech review" | "Other";
export type OverrideAckStatus = "Pending" | "Acknowledged";

export type Override = {
  id: string;
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
  attachments?: Attachment[];
};

/** Default criteria seeded into every new go-live checklist. Stored as plain strings so each release can customise. */
export const DEFAULT_GOLIVE_CRITERIA: readonly string[] = [
  "Clinic staff trained",
  "Data migrated and verified",
  "UAT completed by clinic contact",
  "Rollback plan confirmed and tested",
  "Go-live comms sent to clinic staff",
];

/** @deprecated Use plain string keys — checklists are now per-release customizable. Kept for legacy seed compatibility. */
export type GoLiveCriterion = string;

export type GoLiveStatus = "Not Started" | "In Progress" | "Ready" | "Live" | "Rolled Back";

export type GoLiveCriterionState = { done: boolean; note: string; checked_by: string | null; checked_at: string | null };

export type GoLiveChecklist = {
  id: string;
  shaping_id: string;
  product: Product;
  release_name: string;
  scheduled_for: string;
  status: GoLiveStatus;
  war_room: boolean;
  criteria: Record<string, GoLiveCriterionState>;
  go_no_go_decision: "Go" | "No-Go" | null;
  go_no_go_by: string | null;
  go_no_go_at: string | null;
  attachments?: Attachment[];
  created_at: string;
  updated_at: string;
};

export type CommsStatus = "Draft" | "Pending Approval" | "Approved" | "Sent" | "Rejected";
export type CommsChannel = "Email" | "In-app banner" | "Teams" | "Phone";
export type CommsType =
  | "Delay notification"
  | "Incident update"
  | "Incident all-clear"
  | "Go-live update"
  | "Postponement"
  | "Scope change";

export type CommsItem = {
  id: string;
  product: Product;
  channel: CommsChannel;
  audience: string;
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
  comms_type: CommsType;
  requires_pm_approval: boolean;
  attachments?: Attachment[];
};

export type DecisionType = "Architectural" | "Product" | "Process" | "Vendor";
export type DecisionStatus = "Open" | "Decided" | "Superseded";

export type Decision = {
  id: string;
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
  attachments?: Attachment[];
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
  escalated: boolean;
  attachments?: Attachment[];
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
  | "shaping_stuck"
  | "monitoring_alert"
  | "fast_track_review"
  | "timebox_breach"
  | "clinic_feedback";

export type Notification = {
  id: string;
  ts: string;
  trigger: NotificationTrigger;
  priority: NotificationPriority;
  title: string;
  body: string;
  for_user_id: string | null;
  link_to: string | null;
  read: boolean;
  entity_id: string | null;
};

// ============ New entity types ============

export type ClinicStatus = "Active" | "Dormant" | "Offboarded";
export type Clinic = {
  id: string;
  name: string;
  status: ClinicStatus;
  product: Product;
  clinic_contact_name: string;
  clinic_contact_email: string;
  go_live_date: string | null;
  offboarded_at: string | null;
  offboarded_by_id: string | null;
  offboard_reason: string | null;
};

export type MonitoringSystem = "Accuro" | "Phelix AI" | "Olive EngagedMD" | "Tia Health" | "EngagedMD";
export type MonitoringSeverity = "P0" | "P1" | "P2";

export type MonitoringAlert = {
  id: string;
  system: MonitoringSystem;
  integration: string;
  severity: MonitoringSeverity;
  message: string;
  detected_at: string;
  signal_id: string | null;
  deduplicated: boolean;
};

export type TechDebtReview = {
  id: string;
  reviewed_by_id: string;
  reviewed_at: string;
  quarter: string;
  items_scheduled: number;
  items_deferred: number;
  notes: string;
};

export type ClinicFeedbackRecord = {
  clinic_id: string;
  ts: number;
  desc_key?: string;
};

// ============ Round 5: feature flags, help center, workflow builder ============

export type FeatureFlags = {
  attachmentsEnabled: boolean;
  helpCenterEnabled: boolean;
  workflowBuilderEnabled: boolean;
  multiSelectIntake: boolean;
  auditVerbose: boolean;
  adminPanelEnabled: boolean;
};

export type HelpArticle = {
  id: string;
  slug: string;
  title: string;
  section: string;
  body_markdown: string;
  updated_at: string;
  updated_by: string;
};

export type WorkflowNodeKind = "trigger" | "decision" | "action" | "stage";

export type WorkflowNode = {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  config: Record<string, string>;
  x: number;
  y: number;
};

export type WorkflowEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

export type Workflow = {
  id: string;
  name: string;
  active: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  created_at: string;
  updated_at: string;
};
