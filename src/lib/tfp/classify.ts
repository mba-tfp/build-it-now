import type { IssueType, Source, Tier } from "./types";

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
  if (matches(input.description || "", INCIDENT_KEYWORDS)) {
    return { origin: "Incident", issue_type: "Incident", tier: "P1", labels: [], reason: "Incident language detected." };
  }

  if (input.source === "Leadership") {
    return { origin: "Leadership Input", issue_type: "Leadership Input", tier: "P1", labels: [], reason: "Leadership origin uses P1 SLA." };
  }
  if (input.source === "Clinic") {
    return { origin: "Enhancement", issue_type: "Enhancement", tier: "P2", labels: [], reason: "Clinic origin uses P2 SLA." };
  }
  if (input.source === "Monitoring") {
    return { origin: "Incident", issue_type: "Incident", tier: "P1", labels: [], reason: "Monitoring origin uses P1 SLA." };
  }
  return { origin: "Enhancement", issue_type: "Enhancement", tier: "P3", labels: [], reason: `${input.source} origin uses P3 SLA.` };
}

export function slaDueAt(tier: Tier, from: Date = new Date()): Date {
  const d = new Date(from);
  switch (tier) {
    case "P1":
      d.setHours(d.getHours() + 24);
      return d;
    case "P2":
      d.setDate(d.getDate() + 7);
      return d;
    case "P3":
      d.setDate(d.getDate() + 30);
      return d;
  }
}