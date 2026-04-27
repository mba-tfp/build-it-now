export type StaleLevel = "fresh" | "aging" | "stale";

export function getStaleLevel(iso: string | null | undefined, opts?: { agingDays?: number; staleDays?: number }): StaleLevel {
  if (!iso) return "stale";
  const agingDays = opts?.agingDays ?? 3;
  const staleDays = opts?.staleDays ?? 7;
  const ageMs = Date.now() - new Date(iso).getTime();
  const days = ageMs / 86400000;
  if (days >= staleDays) return "stale";
  if (days >= agingDays) return "aging";
  return "fresh";
}

export function staleLabel(level: StaleLevel): string {
  if (level === "stale") return "Stale";
  if (level === "aging") return "Aging";
  return "Fresh";
}
