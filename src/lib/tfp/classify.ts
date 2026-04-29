import type { IssueType, Source, Tier } from "./types";
import { slaHoursForTier } from "./notify";

const INCIDENT_KEYWORDS = [
  "patient cannot",
  "system down",
  "data loss",
  "cannot access",
  "cannot treat",
  "production down",
  "urgent patient",
];

const matches = (text: string, words: string[]) => {
  const lc = text.toLowerCase();
  return words.some((w) => lc.includes(w));
};

export type Classification = {
  origin: IssueType;
  /** @deprecated Use origin instead. */
  issue_type: IssueType;
  tier: Tier;
  labels: string[];
  reason: string;
};

export function classifySignal(input: { source: Source | "Monitoring"; description: string }): Classification {
  // P0 is reserved for explicit human selection at intake; the classifier never returns it.
  if (matches(input.description || "", INCIDENT_KEYWORDS)) {
    return { origin: "Incident", issue_type: "Incident", tier: "P1", labels: [], reason: "Incident language detected; uses P1 SLA (7 days)." };
  }

  if (input.source === "Leadership") {
    return { origin: "Leadership Input", issue_type: "Leadership Input", tier: "P1", labels: [], reason: "Leadership origin uses P1 SLA (7 days)." };
  }
  if (input.source === "Clinic") {
    return { origin: "Enhancement", issue_type: "Enhancement", tier: "P2", labels: [], reason: "Clinic origin uses P2 SLA (14 days)." };
  }
  if (input.source === "Monitoring") {
    return { origin: "Incident", issue_type: "Incident", tier: "P1", labels: [], reason: "Monitoring origin uses P1 SLA (7 days)." };
  }
  return { origin: "Enhancement", issue_type: "Enhancement", tier: "P3", labels: [], reason: `${input.source} origin uses P3 SLA (30 days).` };
}

export function slaDueAt(tier: Tier, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setHours(d.getHours() + slaHoursForTier(tier));
  return d;
}