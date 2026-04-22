import type { TimelineConfig } from "./types";

export type MonthCell = {
  key: string; // "YYYY-MM"
  monthIndex: number; // 0-11
  year: number;
  quarter: number; // 1-4
  monthLabel: string; // "Jan"
};

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function buildMonths(config: TimelineConfig): MonthCell[] {
  const out: MonthCell[] = [];
  for (let i = 0; i < config.month_count; i++) {
    const m = (config.start_month + i) % 12;
    const y = config.start_year + Math.floor((config.start_month + i) / 12);
    out.push({
      key: `${y}-${String(m + 1).padStart(2, "0")}`,
      monthIndex: m,
      year: y,
      quarter: Math.floor(m / 3) + 1,
      monthLabel: MONTH_NAMES[m],
    });
  }
  return out;
}

export function groupByYearQuarter(months: MonthCell[]) {
  const years = new Map<number, Map<number, MonthCell[]>>();
  for (const m of months) {
    if (!years.has(m.year)) years.set(m.year, new Map());
    const qmap = years.get(m.year)!;
    if (!qmap.has(m.quarter)) qmap.set(m.quarter, []);
    qmap.get(m.quarter)!.push(m);
  }
  return Array.from(years.entries()).map(([year, qmap]) => ({
    year,
    quarters: Array.from(qmap.entries()).map(([quarter, ms]) => ({ quarter, months: ms })),
  }));
}

// Given an item's months and the visible months, return the first visible
// month index and the span (number of consecutive visible months it covers
// starting from that index — based on the item's actual months).
export function visibleSpan(itemMonths: string[], visible: MonthCell[]): { startIdx: number; span: number } | null {
  if (itemMonths.length === 0) return null;
  const visibleKeys = visible.map((m) => m.key);
  const itemSet = new Set(itemMonths);
  let startIdx = -1;
  for (let i = 0; i < visibleKeys.length; i++) {
    if (itemSet.has(visibleKeys[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return null;
  let span = 1;
  for (let i = startIdx + 1; i < visibleKeys.length; i++) {
    if (itemSet.has(visibleKeys[i])) span++;
    else break;
  }
  return { startIdx, span };
}

// Convert an end-month key (after resize) into a contiguous months array
// from the original start month to the new end.
export function rangeMonths(startKey: string, endKey: string, visible: MonthCell[]): string[] {
  const keys = visible.map((m) => m.key);
  const i = keys.indexOf(startKey);
  const j = keys.indexOf(endKey);
  if (i < 0 || j < 0) return [startKey];
  const lo = Math.min(i, j);
  const hi = Math.max(i, j);
  return keys.slice(lo, hi + 1);
}

// Now/Next/Later derivation from an item's months relative to today.
export function bucketFor(itemMonths: string[]): "Now" | "Next" | "Later" | "Unscheduled" {
  if (itemMonths.length === 0) return "Unscheduled";
  const now = new Date();
  const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const sorted = [...itemMonths].sort();
  const earliest = sorted[0];
  const latest = sorted[sorted.length - 1];
  if (earliest <= currentKey && latest >= currentKey) return "Now";
  // 3 months ahead = Next
  const next = new Date(now.getUTCFullYear(), now.getUTCMonth() + 3, 1);
  const nextKey = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  if (earliest <= nextKey) return "Next";
  return "Later";
}
