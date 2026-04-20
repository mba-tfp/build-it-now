import { formatDistanceToNowStrict, isPast, isToday } from "date-fns";

export function relativeTime(iso: string) {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

export function slaState(iso: string): "breach" | "today" | "ok" {
  const d = new Date(iso);
  if (isPast(d)) return "breach";
  if (isToday(d)) return "ok";
  return "ok";
}

// Stable date formatters that produce identical output on server and client
// (no host-locale or timezone variance) to avoid SSR hydration mismatches.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/** "Apr 13, 09:00" — UTC, deterministic across server/client. */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "Apr 13" — UTC, deterministic. */
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
