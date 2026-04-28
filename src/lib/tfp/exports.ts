import type { AuditEntry, GoLiveChecklist, Override, Review, ShapingItem, Signal, Sprint, User } from "./types";
import { fmtDate, fmtDateTime } from "./format";
import { usableCapacity } from "./store";

// ============= CSV =============

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function signalsToCsv(
  signals: Signal[],
  shaping: ShapingItem[],
  users: User[],
): string {
  const headers = [
    "id",
    "title",
    "source",
    "product",
    "issue_type",
    "tier",
    "status",
    "owner",
    "created_at",
    "sla_due_at",
    "delivery_status",
    "jira_key",
    "tech_estimate_pts",
    "displacement_flag",
  ];
  const rows = signals.map((s) => {
    const sh = shaping.find((x) => x.signal_id === s.id);
    const owner = users.find((u) => u.id === s.owner_id)?.name ?? "";
    return [
      s.id,
      s.title,
      s.source,
      s.product,
      s.issue_type,
      s.tier,
      s.status,
      owner,
      s.created_at,
      s.sla_due_at,
      sh?.delivery_status ?? "",
      sh?.jira_key ?? "",
      sh?.tech_estimate_pts ?? "",
      s.displacement_flag ? "yes" : "no",
    ];
  });
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============= Sprint Update (Teams-formatted markdown) =============

export function buildSprintUpdate(args: {
  sprint: Sprint;
  signals: Signal[];
  shaping: ShapingItem[];
  reviews: Review[];
  overrides: Override[];
  users: User[];
  now: Date;
}): string {
  const { sprint, signals, shaping, reviews, overrides, users, now } = args;
  const usable = usableCapacity(sprint);
  const allocPct = Math.round((sprint.allocated_pts / Math.max(1, usable)) * 100);

  const inSprint = shaping.filter((s) => s.jira_key && s.delivery_status);
  const done = inSprint.filter((s) => s.delivery_status === "Done");
  const inProg = inSprint.filter((s) => s.delivery_status === "In Progress");
  const inQA = inSprint.filter((s) => s.delivery_status === "In QA");
  const blocked = inSprint.filter((s) => s.delivery_status === "Blocked");
  const todo = inSprint.filter((s) => s.delivery_status === "To Do");

  const donePts = done.reduce((a, b) => a + (b.tech_estimate_pts ?? 0), 0);

  const breached = signals.filter(
    (s) => (s.status === "New" || s.status === "In Review") && new Date(s.sla_due_at).getTime() < now.getTime(),
  );

  const completedReviews = reviews.filter((r) => r.status === "Completed");
  const met = completedReviews.filter((r) => r.outcome_rating === "Met").length;

  const recentOverrides = overrides
    .filter((o) => new Date(o.raised_at).getTime() > now.getTime() - 14 * 86400000)
    .slice(0, 5);

  const titleFor = (sigId: string) => signals.find((s) => s.id === sigId)?.title ?? "(untitled)";

  const lines: string[] = [];
  lines.push(`# 🚀 ${sprint.name} update — ${fmtDate(now.toISOString())}`);
  lines.push("");
  lines.push(`**Window:** ${fmtDate(sprint.start_date)} → ${fmtDate(sprint.end_date)} · **Status:** ${sprint.status}`);
  lines.push(`**Capacity:** ${sprint.allocated_pts} / ${usable} pts allocated (${allocPct}%)`);
  lines.push(`**Throughput:** ${donePts} pts shipped · ${done.length} items done`);
  lines.push("");
  lines.push("## ✅ Shipped this sprint");
  if (done.length === 0) lines.push("_None yet._");
  else
    done.forEach((d) =>
      lines.push(`- **${d.jira_key}** · ${titleFor(d.signal_id)} _(${d.tech_estimate_pts ?? "?"} pts)_`),
    );
  lines.push("");
  lines.push(`## 🛠 In progress (${inProg.length})`);
  if (inProg.length === 0) lines.push("_Nothing in active dev._");
  else
    inProg.forEach((d) =>
      lines.push(`- **${d.jira_key}** · ${titleFor(d.signal_id)} _(${d.tech_estimate_pts ?? "?"} pts)_`),
    );
  lines.push("");
  lines.push(`## 🧪 In QA (${inQA.length})`);
  if (inQA.length === 0) lines.push("_Nothing awaiting QA._");
  else inQA.forEach((d) => lines.push(`- **${d.jira_key}** · ${titleFor(d.signal_id)}`));
  lines.push("");
  if (todo.length > 0) {
    lines.push(`## 📋 Up next (${todo.length})`);
    todo.forEach((d) => lines.push(`- **${d.jira_key}** · ${titleFor(d.signal_id)} _(${d.tech_estimate_pts ?? "?"} pts)_`));
    lines.push("");
  }
  if (blocked.length > 0) {
    lines.push(`## 🚧 Blocked (${blocked.length}) — needs help`);
    blocked.forEach((d) => {
      const days = d.blocked_since
        ? Math.floor((now.getTime() - new Date(d.blocked_since).getTime()) / 86400000)
        : 0;
      lines.push(`- **${d.jira_key}** · ${titleFor(d.signal_id)} _(blocked ${days}d)_`);
    });
    lines.push("");
  }
  if (breached.length > 0) {
    lines.push(`## ⚠️ SLA breaches (${breached.length})`);
    breached.forEach((s) =>
      lines.push(`- ${s.tier} · **${s.title}** _(due ${fmtDateTime(s.sla_due_at)})_`),
    );
    lines.push("");
  }
  if (recentOverrides.length > 0) {
    lines.push(`## 🔁 Overrides logged (last 14d)`);
    recentOverrides.forEach((o) => {
      const raiser = users.find((u) => u.id === o.raised_by)?.name ?? "—";
      lines.push(`- **${o.id}** · ${o.kind} — ${o.reason} _(by ${raiser}, ${o.displaced_pts}pts displaced)_`);
    });
    lines.push("");
  }
  if (completedReviews.length > 0) {
    lines.push(`## 📈 Outcomes`);
    lines.push(`- ${met}/${completedReviews.length} reviews rated **Met** (${Math.round((met / completedReviews.length) * 100)}%)`);
    lines.push("");
  }
  lines.push("---");
  lines.push(`_Generated from TFP Workflow · ${fmtDateTime(now.toISOString())}_`);
  return lines.join("\n");
}

// ============= Audit timeline filter =============

export function auditFor(audit: AuditEntry[], opts: { signalId?: string; shapingId?: string }): AuditEntry[] {
  return audit.filter((a) => {
    if (opts.signalId && a.entity_type === "signal" && a.entity_id === opts.signalId) return true;
    if (opts.shapingId && a.entity_type === "shaping" && a.entity_id === opts.shapingId) return true;
    return false;
  });
}

// ============= Quarterly Summary =============

export function buildQuarterlySummary(args: {
  now: Date;
  sprints: Sprint[];
  shaping: ShapingItem[];
  signals: Signal[];
  overrides: Override[];
  goLives: GoLiveChecklist[];
}): string {
  const { now, sprints, shaping, signals, overrides, goLives } = args;
  const q = Math.floor(now.getMonth() / 3) + 1;
  const year = now.getFullYear();
  const qStart = new Date(year, (q - 1) * 3, 1);
  const qEnd = new Date(year, q * 3, 0, 23, 59, 59);
  const inQ = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= qStart.getTime() && t <= qEnd.getTime();
  };
  const qSprints = sprints.filter((s) => inQ(s.start_date));
  const done = shaping.filter((s) => s.delivery_status === "Done");
  const doneByProduct = new Map<string, ShapingItem[]>();
  done.forEach((s) => {
    const sig = signals.find((x) => x.id === s.signal_id);
    const p = sig?.product ?? "Unknown";
    if (!doneByProduct.has(p)) doneByProduct.set(p, []);
    doneByProduct.get(p)!.push(s);
  });
  const golivesQ = goLives.filter((g) => g.status === "Live" && inQ(g.scheduled_for));
  const ovrQ = overrides.filter((o) => inQ(o.raised_at));
  const incidents = signals.filter((s) => s.issue_type === "Incident" && inQ(s.created_at));
  const upcoming = shaping.filter((s) => (s.roadmap_bucket === "Committed" || s.roadmap_bucket === "Backlog") && (s.shaping_status === "Ready for Sprint" || s.shaping_status === "Approved"));
  const upcomingByProduct = new Map<string, ShapingItem[]>();
  upcoming.forEach((s) => {
    const sig = signals.find((x) => x.id === s.signal_id);
    const p = sig?.product ?? "Unknown";
    if (!upcomingByProduct.has(p)) upcomingByProduct.set(p, []);
    upcomingByProduct.get(p)!.push(s);
  });

  const lines: string[] = [];
  lines.push(`# 📊 Q${q} ${year} — TFP Product Quarterly Summary`);
  lines.push(`**Period:** ${fmtDate(qStart.toISOString())} → ${fmtDate(qEnd.toISOString())} · **Sprints:** ${qSprints.length}`);
  lines.push("");
  lines.push("## ✅ Delivery");
  if (doneByProduct.size === 0) lines.push("_No items completed this quarter._");
  doneByProduct.forEach((items, product) => {
    lines.push(`### ${product} (${items.length})`);
    items.forEach((it) => lines.push(`- ${it.jira_key ?? "—"} · ${signals.find((s) => s.id === it.signal_id)?.title ?? "(untitled)"}`));
  });
  lines.push("");
  lines.push("## 🚀 Go-lives completed");
  if (golivesQ.length === 0) lines.push("_None._");
  else golivesQ.forEach((g) => lines.push(`- ${g.release_name} (${g.product})`));
  lines.push("");
  lines.push("## 🧪 Quality");
  const avgCarryFwd = qSprints.length === 0 ? 0 : Math.round(qSprints.reduce((a, s) => a + s.carryforward_estimate_pts, 0) / qSprints.length);
  lines.push(`- Avg carry-forward: ${avgCarryFwd} pts/sprint`);
  lines.push(`- P1 incidents: ${incidents.filter((s) => s.tier === "P1").length}`);
  lines.push("");
  lines.push("## 🔁 Overrides");
  lines.push(`- ${ovrQ.length} logged this quarter`);
  ovrQ.slice(0, 5).forEach((o) => lines.push(`  - ${o.id} · ${o.kind} — ${o.reason.slice(0, 80)}`));
  lines.push("");
  lines.push("## 🔭 Next quarter preview");
  if (upcomingByProduct.size === 0) lines.push("_No approved items in Committed/Backlog._");
  upcomingByProduct.forEach((items, product) => {
    lines.push(`### ${product}`);
    items.forEach((it) => lines.push(`- ${signals.find((s) => s.id === it.signal_id)?.title ?? "(untitled)"} (${it.roadmap_bucket})`));
  });
  lines.push("");
  lines.push("---");
  lines.push(`_Generated from TFP Workflow · ${fmtDateTime(now.toISOString())}_`);
  return lines.join("\n");
}
