import type { Notification, NotificationPriority, NotificationTrigger, Role, Tier } from "./types";

let _nidCounter = 0;
const nid = () => {
  _nidCounter += 1;
  return "n-" + _nidCounter.toString(36).padStart(4, "0");
};

export function slaHoursForTier(tier: Tier): number {
  const hours: Record<Tier, number> = {
    P0: 48,
    P1: 168,
    P2: 336,
    P3: 720,
  };
  return hours[tier];
}

const PRIORITY_BY_TRIGGER: Record<NotificationTrigger, NotificationPriority> = {
  leadership_signal: "P2",
  incident: "P1",
  tech_review_ready: "P3",
  blocker_signoff: "P2",
  blocked_over_1d: "P2",
  comms_approval: "P3",
  golive_unconfirmed: "P1",
  review_overdue: "P3",
  sla_breach: "P1",
  scope_change: "P2",
  retro_escalation: "P2",
  override_logged: "P2",
  shaping_stuck: "P3",
  monitoring_alert: "P1",
  fast_track_review: "P2",
  timebox_breach: "P2",
  clinic_feedback: "P3",
};

export function buildNotification(args: {
  trigger: NotificationTrigger;
  title: string;
  body: string;
  link_to?: string | null;
  for_user_id?: string | null;
  entity_id?: string | null;
  ts?: string;
}): Notification {
  return {
    id: nid(),
    ts: args.ts ?? new Date().toISOString(),
    trigger: args.trigger,
    priority: PRIORITY_BY_TRIGGER[args.trigger],
    title: args.title,
    body: args.body,
    for_user_id: args.for_user_id ?? null,
    link_to: args.link_to ?? null,
    read: false,
    entity_id: args.entity_id ?? null,
  };
}

export const PRIORITY_TONE: Record<NotificationPriority, string> = {
  P0: "bg-destructive/15 text-destructive border-destructive/40",
  P1: "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)] border-[var(--color-status-hold)]/30",
  P2: "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)] border-[var(--color-status-hold)]/30",
  P3: "bg-[var(--color-status-new)]/10 text-[var(--color-status-new)] border-[var(--color-status-new)]/30",
  P4: "bg-muted text-muted-foreground border-border",
};

export const TRIGGER_LABEL: Record<NotificationTrigger, string> = {
  leadership_signal: "Leadership signal",
  incident: "Incident",
  tech_review_ready: "Tech review ready",
  blocker_signoff: "Blocker sign-off",
  blocked_over_1d: "Blocked > 1 day",
  comms_approval: "Comms approval",
  golive_unconfirmed: "Go-live unconfirmed",
  review_overdue: "Review overdue",
  sla_breach: "SLA breach",
  scope_change: "Scope change",
  retro_escalation: "Retro escalation",
  override_logged: "Override logged",
  shaping_stuck: "Shaping stuck",
  monitoring_alert: "Monitoring alert",
  fast_track_review: "Fast-track review",
  timebox_breach: "Timebox breach",
  clinic_feedback: "Clinic feedback",
};

// ============= Role-based notification filtering =============
//
// The bell tray must show only notifications relevant to the current
// "Viewing as" role. We infer a small set of categories from the existing
// trigger + priority + title payload, then map each role to the categories
// it cares about. To extend the system, add a new category to
// `NotificationCategory` and update `categorizeNotification` and
// `ROLE_VISIBLE_CATEGORIES` together.

export type NotificationCategory =
  | "signal_new_p0"           // P0 signal raised (any source)
  | "signal_new"              // non-P0 new signal / triage event
  | "signal_triage"           // triage / SLA / hold events on existing signal
  | "shaping_update"          // shaping field updates, stuck shaping
  | "tech_review_request"     // tech review requested / reassigned
  | "tech_review_complete"    // tech review signed off (ready for sprint)
  | "sprint_item_movement"    // item moved between delivery columns / blocked
  | "sprint_health_red"       // sprint goal at risk / red health
  | "sprint_health_yellow"    // capacity over 90% / yellow
  | "sprint_close"            // sprint closed / retro escalation
  | "outcome_review_due"      // outcome review needed
  | "outcome_review_done"     // outcome review completed
  | "decision_logged"         // override / decision logged
  | "clinic_escalation"       // clinic feedback / go-live unconfirmed
  | "comms"                   // comms approval
  | "custom_label"            // custom label added by other user
  | "other";

const TITLE_INCLUDES = (n: Notification, ...needles: string[]) => {
  const t = (n.title + " " + n.body).toLowerCase();
  return needles.some((needle) => t.includes(needle.toLowerCase()));
};

export function categorizeNotification(n: Notification): NotificationCategory {
  // P0 signals — highest precedence regardless of trigger
  if (n.priority === "P0" && (n.trigger === "monitoring_alert" || n.trigger === "incident" || n.trigger === "fast_track_review" || TITLE_INCLUDES(n, "p0 signal", "signal captured", "new signal"))) {
    return "signal_new_p0";
  }

  switch (n.trigger) {
    case "fast_track_review":
      return n.priority === "P0" ? "signal_new_p0" : "signal_triage";
    case "monitoring_alert":
    case "incident":
      return n.priority === "P0" ? "signal_new_p0" : "signal_new";
    case "leadership_signal":
      return "signal_new";
    case "sla_breach":
      return "signal_triage";
    case "shaping_stuck":
      return "shaping_update";
    case "tech_review_ready":
      // Title "ready for tech review" = request; "Tech review complete" = sign-off
      if (TITLE_INCLUDES(n, "complete", "signed off", "ready for sprint")) return "tech_review_complete";
      return "tech_review_request";
    case "blocked_over_1d":
    case "blocker_signoff":
      return "sprint_item_movement";
    case "scope_change":
      if (TITLE_INCLUDES(n, "at risk", "red")) return "sprint_health_red";
      return "sprint_health_yellow";
    case "retro_escalation":
      if (TITLE_INCLUDES(n, "closed")) return "sprint_close";
      return "sprint_close";
    case "review_overdue":
      if (TITLE_INCLUDES(n, "completed", "rated")) return "outcome_review_done";
      return "outcome_review_due";
    case "override_logged":
      return "decision_logged";
    case "clinic_feedback":
    case "golive_unconfirmed":
      return "clinic_escalation";
    case "comms_approval":
      return "comms";
    case "timebox_breach":
      return "sprint_item_movement";
    default:
      return "other";
  }
}

const ROLE_VISIBLE_CATEGORIES: Record<Role, ReadonlySet<NotificationCategory>> = {
  // Bazil & other PMs see everything except pure internal noise.
  PM: new Set<NotificationCategory>([
    "signal_new_p0", "signal_new", "signal_triage", "shaping_update",
    "tech_review_request", "tech_review_complete", "sprint_item_movement",
    "sprint_health_red", "sprint_health_yellow", "sprint_close",
    "outcome_review_due", "outcome_review_done", "decision_logged",
    "clinic_escalation", "comms", "custom_label", "other",
  ]),
  "Senior PM": new Set<NotificationCategory>([
    "signal_new_p0", "signal_new", "signal_triage", "shaping_update",
    "tech_review_request", "tech_review_complete", "sprint_item_movement",
    "sprint_health_red", "sprint_health_yellow", "sprint_close",
    "outcome_review_due", "outcome_review_done", "decision_logged",
    "clinic_escalation", "comms", "custom_label", "other",
  ]),
  "Associate PM": new Set<NotificationCategory>([
    "signal_new_p0", "signal_new", "signal_triage", "shaping_update",
    "tech_review_request", "tech_review_complete", "sprint_item_movement",
    "sprint_health_red", "sprint_health_yellow", "sprint_close",
    "outcome_review_due", "outcome_review_done", "decision_logged",
    "clinic_escalation", "comms", "custom_label", "other",
  ]),
  // Waseem (Tech Lead) — narrow surface focused on technical work.
  "Tech Lead": new Set<NotificationCategory>([
    "signal_new_p0",
    "tech_review_request",
    "tech_review_complete",
    "sprint_health_red",
    "clinic_escalation",
  ]),
  // Developers see what Tech Leads see, by default.
  Developer: new Set<NotificationCategory>([
    "signal_new_p0",
    "tech_review_request",
    "tech_review_complete",
    "sprint_health_red",
    "clinic_escalation",
  ]),
  // QA Scrum Master — keeps eyes on movement + sprint close.
  "QA Scrum Master": new Set<NotificationCategory>([
    "signal_new_p0", "sprint_item_movement", "sprint_health_red",
    "sprint_health_yellow", "sprint_close", "outcome_review_due",
    "clinic_escalation",
  ]),
  // Shahid (Leadership) — leadership-only surface.
  Leadership: new Set<NotificationCategory>([
    "signal_new_p0",
    "sprint_health_red",
    "sprint_close",
    "outcome_review_done",
    "decision_logged",
    "clinic_escalation",
  ]),
};

export function isNotificationVisibleToRole(n: Notification, role: Role): boolean {
  const categories = ROLE_VISIBLE_CATEGORIES[role];
  if (!categories) return true;
  return categories.has(categorizeNotification(n));
}

export function filterNotificationsForRole(list: Notification[], role: Role): Notification[] {
  return list.filter((n) => isNotificationVisibleToRole(n, role));
}

export const ROLE_EMPTY_BELL_MESSAGE: Record<Role, string> = {
  PM: "No new updates. Check sprint health on home.",
  "Senior PM": "No new updates. Check sprint health on home.",
  "Associate PM": "No new updates. Check sprint health on home.",
  "Tech Lead": "No tech reviews waiting. Open delivery to see your items in flight.",
  Developer: "No tech reviews waiting. Open delivery to see your items in flight.",
  "QA Scrum Master": "No new updates. Check sprint health on home.",
  Leadership: "No leadership-level updates. All sprints healthy.",
};
