import { formatDistanceToNowStrict, isPast, isToday } from "date-fns";

export function relativeTime(iso: string) {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

export function slaState(iso: string): "breach" | "today" | "ok" {
  const d = new Date(iso);
  if (isPast(d)) return "breach";
  if (isToday(d)) return "today";
  return "ok";
}
