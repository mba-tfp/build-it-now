import type { IssueType, Source, Tier } from "./types";

const BUG_KEYWORDS = ["broken", "not working", "error", "fails", "cannot", "doesn't work", "reset"];
const ENHANCE_KEYWORDS = ["request", "would like", "can we", "add ", "new ", "feature"];
const INCIDENT_KEYWORDS = [
  "patient cannot",
  "data loss",
  "system down",
  "cannot access",
  "blocked",
  "urgent",
  "critical",
];
const TECH_DEBT_KEYWORDS = ["debt", "refactor", "slow", "performance", "cleanup"];
const DEPENDENCY_KEYWORDS = [
  "api change",
  "deprecat",
  "breaking change",
  "endpoint removed",
  "version upgrade",
  "api version",
  "sunset",
  "migration required",
];
const T1_KEYWORDS = ["patient", "data integrity", "cannot treat", "system down"];
const LEADERSHIP_URGENT = ["urgent", "board", "presentation", "today", "tomorrow"];

const matches = (text: string, words: string[]) => {
  const lc = text.toLowerCase();
  return words.some((w) => lc.includes(w));
};

export type Classification = {
  issue_type: IssueType;
  tier: Tier;
  labels: string[];
  reason: string;
};

export function classifySignal(input: { source: Source; description: string }): Classification {
  const { source, description } = input;
  const text = description || "";
  const labels: string[] = [];

  // Issue type
  let issue_type: IssueType;
  let reason = "";

  if (matches(text, INCIDENT_KEYWORDS)) {
    issue_type = "Incident";
    reason = "Incident keyword detected — overrides other type rules.";
  } else if (source === "Leadership") {
    issue_type = "Leadership Input";
    reason = "Source is Leadership.";
  } else if ((source === "Clinic" || source === "Internal") && matches(text, BUG_KEYWORDS)) {
    issue_type = "Bug";
    reason = "Clinic/Internal report with bug language.";
  } else if ((source === "Clinic" || source === "Internal") && matches(text, ENHANCE_KEYWORDS)) {
    issue_type = "Enhancement";
    reason = "Clinic/Internal request language.";
  } else if (
    (source === "Internal" || source === "Dev Team") &&
    matches(text, DEPENDENCY_KEYWORDS)
  ) {
    issue_type = "Dependency Change";
    reason = "Dependency change keywords detected.";
  } else if (source === "Dev Team" && matches(text, TECH_DEBT_KEYWORDS)) {
    issue_type = "Enhancement";
    labels.push("Tech-Debt");
    reason = "Dev Team raised tech-debt themed item.";
  } else {
    issue_type = "Enhancement";
    reason = "Fallback — defaulted to Enhancement.";
  }

  // Tier
  let tier: Tier;
  if (issue_type === "Incident" || matches(text, T1_KEYWORDS)) {
    tier = "T1";
  } else if (issue_type === "Bug") {
    tier = "T2";
  } else if (issue_type === "Dependency Change") {
    tier = "T2";
  } else if (source === "Leadership" && matches(text, LEADERSHIP_URGENT)) {
    tier = "T2";
  } else if (source === "Dev Team" || labels.includes("Tech-Debt")) {
    tier = "T4";
  } else {
    tier = "T3";
  }

  return { issue_type, tier, labels, reason };
}

export function slaDueAt(tier: Tier, from: Date = new Date()): Date {
  const d = new Date(from);
  switch (tier) {
    case "T1":
      d.setHours(d.getHours() + 8);
      return d;
    case "T2":
      d.setHours(d.getHours() + 48);
      return d;
    case "T3":
      d.setDate(d.getDate() + 7);
      return d;
    case "T4":
      d.setDate(d.getDate() + 30);
      return d;
  }
}
