import type { Notification, NotificationPriority, NotificationTrigger } from "./types";

let _nidCounter = 0;
const nid = () => {
  _nidCounter += 1;
  return "n-" + _nidCounter.toString(36).padStart(4, "0");
};

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
  P1: "bg-destructive/10 text-destructive border-destructive/30",
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
