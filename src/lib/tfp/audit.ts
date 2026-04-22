// Readable audit-log helpers — produces human-friendly action strings for
// signal/shaping field changes, replacing generic `${field} changed` text.

import type { Signal, ShapingItem, User } from "./types";

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  source: "Source",
  product: "Product",
  additional_sources: "Additional sources",
  additional_products: "Additional products",
  issue_type: "Issue type",
  tier: "Tier",
  status: "Status",
  owner_id: "Owner",
  delivery_assignee_id: "Delivery assignee",
  delivery_status: "Delivery",
  shaping_status: "Shaping stage",
  roadmap_bucket: "Roadmap bucket",
  approver_id: "Approver",
  tech_reviewer_id: "Tech reviewer",
  hold_until: "Hold until",
  triage_reason: "Triage reason",
};

function userName(users: User[], id: string | null | undefined): string {
  if (!id) return "—";
  return users.find((u) => u.id === id)?.name ?? id;
}

function fmtArr(v: unknown): string {
  if (!Array.isArray(v) || v.length === 0) return "—";
  return `[${v.join(", ")}]`;
}

function truncate(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** Format a single field change as a readable audit action string. */
export function formatFieldChange(
  field: keyof Signal | keyof ShapingItem | string,
  before: unknown,
  after: unknown,
  users: User[] = [],
): string {
  const label = FIELD_LABELS[field as string] ?? String(field);

  if (field === "owner_id" || field === "delivery_assignee_id" || field === "approver_id" || field === "tech_reviewer_id") {
    return `${label} ${userName(users, before as string | null)} → ${userName(users, after as string | null)}`;
  }

  if (field === "additional_sources" || field === "additional_products") {
    return `${label} ${fmtArr(before)} → ${fmtArr(after)}`;
  }

  if (field === "description") {
    const a = String(before ?? "").length;
    const b = String(after ?? "").length;
    return `${label} updated (${a} → ${b} chars)`;
  }

  if (field === "title") {
    return `${label} "${truncate(String(before ?? ""))}" → "${truncate(String(after ?? ""))}"`;
  }

  const beforeStr = before === null || before === undefined || before === "" ? "—" : String(before);
  const afterStr = after === null || after === undefined || after === "" ? "—" : String(after);
  return `${label} ${beforeStr} → ${afterStr}`;
}
