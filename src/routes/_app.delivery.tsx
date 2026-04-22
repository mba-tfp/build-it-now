import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { USERS, useTfpStore, usableCapacity } from "@/lib/tfp/store";
import type { DeliveryStatus, ShapingItem } from "@/lib/tfp/types";
import { fmtDateTime } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, LayoutGrid, RefreshCw, Table as TableIcon } from "lucide-react";

export const Route = createFileRoute("/_app/delivery")({
  component: DeliveryPage,
});

const STATUSES: DeliveryStatus[] = ["To Do", "In Progress", "In QA", "Blocked", "Done"];

const STATUS_TONE: Record<DeliveryStatus, string> = {
  "To Do": "bg-muted text-muted-foreground",
  "In Progress": "bg-[var(--color-status-new)]/10 text-[var(--color-status-new)]",
  "In QA": "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]",
  Blocked: "bg-destructive/10 text-destructive",
  Done: "bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]",
};

type SortKey = "jira" | "title" | "status" | "pts" | "updated";

function DeliveryPage() {
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const sprint = useTfpStore((s) => s.sprint);
  const syncFromJira = useTfpStore((s) => s.syncFromJira);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | "All">("All");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const items = useMemo(
    () =>
      shaping
        .filter((s) => s.jira_key && s.delivery_status)
        .map((s) => ({
          sh: s,
          sig: signals.find((sig) => sig.id === s.signal_id),
        }))
        .filter((x) => !!x.sig),
    [shaping, signals],
  );

  const filtered = useMemo(() => {
    const list = statusFilter === "All" ? items : items.filter((x) => x.sh.delivery_status === statusFilter);
    const sorted = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "jira":
          return a.sh.jira_key!.localeCompare(b.sh.jira_key!) * dir;
        case "title":
          return a.sig!.title.localeCompare(b.sig!.title) * dir;
        case "status":
          return STATUSES.indexOf(a.sh.delivery_status!) - STATUSES.indexOf(b.sh.delivery_status!) * dir;
        case "pts":
          return ((a.sh.tech_estimate_pts ?? 0) - (b.sh.tech_estimate_pts ?? 0)) * dir;
        case "updated":
        default:
          return (new Date(a.sh.updated_at).getTime() - new Date(b.sh.updated_at).getTime()) * dir;
      }
    });
    return sorted;
  }, [items, statusFilter, sortKey, sortDir]);

  const usable = usableCapacity(sprint);
  const totals = useMemo(() => {
    const counts: Record<DeliveryStatus, number> = {
      "To Do": 0,
      "In Progress": 0,
      "In QA": 0,
      Blocked: 0,
      Done: 0,
    };
    let pts = 0;
    let donePts = 0;
    items.forEach(({ sh }) => {
      counts[sh.delivery_status!]++;
      pts += sh.tech_estimate_pts ?? 0;
      if (sh.delivery_status === "Done") donePts += sh.tech_estimate_pts ?? 0;
    });
    return { counts, pts, donePts };
  }, [items]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  function handleSync() {
    const n = syncFromJira();
    setSyncMsg(n === 0 ? "No changes from Jira." : `Pulled ${n} status update${n === 1 ? "" : "s"} from Jira.`);
    window.setTimeout(() => setSyncMsg(null), 3500);
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">View 4</p>
          <h1 className="mt-1 font-display text-3xl">Delivery Board</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sprint.name} · {totals.donePts} / {totals.pts} pts complete · {usable} pts usable capacity
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-1.5 text-sm hover:bg-accent/40"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Sync from Jira
          </button>
          <div className="flex rounded-md border border-input bg-surface p-0.5">
            <button
              onClick={() => setView("table")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs",
                view === "table" ? "bg-accent text-accent-foreground" : "text-muted-foreground",
              )}
            >
              <TableIcon className="h-3.5 w-3.5" /> Table
            </button>
            <button
              onClick={() => setView("kanban")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs",
                view === "kanban" ? "bg-accent text-accent-foreground" : "text-muted-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </button>
          </div>
        </div>
      </header>

      {syncMsg && (
        <div className="mb-4 rounded-md border border-[var(--color-status-proceed)]/30 bg-[var(--color-status-proceed)]/5 px-3 py-2 text-sm text-[var(--color-status-proceed)]">
          {syncMsg}
        </div>
      )}

      {/* Status pills / filter */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterPill
          active={statusFilter === "All"}
          label={`All (${items.length})`}
          onClick={() => setStatusFilter("All")}
        />
        {STATUSES.map((s) => (
          <FilterPill
            key={s}
            active={statusFilter === s}
            label={`${s} (${totals.counts[s]})`}
            tone={STATUS_TONE[s]}
            onClick={() => setStatusFilter(s)}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {items.length === 0 ? (
            <div className="tfp-card p-12 text-center text-sm text-muted-foreground">
              Nothing in delivery yet. Approve a shaping item to push it to Jira.
            </div>
          ) : view === "table" ? (
            <BoardTable
              rows={filtered}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
          ) : (
            <Kanban items={items} />
          )}
        </div>

        <JiraEventLog />
      </div>
    </div>
  );
}

function FilterPill({
  active,
  label,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : cn("border-border bg-surface hover:border-primary/40", tone),
      )}
    >
      {label}
    </button>
  );
}

function BoardTable({
  rows,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: Array<{ sh: ShapingItem; sig: { title: string; product: string } | undefined }>;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const setStatus = useTfpStore((s) => s.setDeliveryStatus);

  return (
    <div className="tfp-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <Th onClick={() => onSort("jira")} active={sortKey === "jira"} dir={sortDir}>Key</Th>
            <Th onClick={() => onSort("title")} active={sortKey === "title"} dir={sortDir}>Title</Th>
            <th className="px-3 py-2 text-left font-medium">Owner</th>
            <Th onClick={() => onSort("status")} active={sortKey === "status"} dir={sortDir}>Status</Th>
            <Th onClick={() => onSort("pts")} active={sortKey === "pts"} dir={sortDir}>Pts</Th>
            <Th onClick={() => onSort("updated")} active={sortKey === "updated"} dir={sortDir}>Updated</Th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ sh, sig }) => {
            const reviewer = USERS.find((u) => u.id === sh.tech_reviewer_id);
            return (
              <tr key={sh.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                <td className="px-3 py-2.5 font-mono text-xs text-foreground">{sh.jira_key}</td>
                <td className="px-3 py-2.5">
                  <div className="font-medium leading-tight">{sig?.title}</div>
                  <div className="text-[11px] text-muted-foreground">{sig?.product}</div>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{reviewer?.name ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                      STATUS_TONE[sh.delivery_status!],
                    )}
                  >
                    {sh.delivery_status}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs">{sh.tech_estimate_pts ?? "—"}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{fmtDateTime(sh.updated_at)}</td>
                <td className="px-3 py-2.5 text-right">
                  <select
                    value={sh.delivery_status!}
                    onChange={(e) => setStatus(sh.id, e.target.value as DeliveryStatus)}
                    className="rounded-md border border-input bg-surface px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        Move to {s}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <DevCompleteRail rows={rows} />
    </div>
  );
}

function DevCompleteRail({ rows }: { rows: Array<{ sh: ShapingItem; sig: { title: string; product: string } | undefined }> }) {
  const inFlight = rows.filter((r) => r.sh.delivery_status && r.sh.delivery_status !== "Done" && r.sh.delivery_status !== "To Do");
  const toggleGate = useTfpStore((s) => s.toggleDevCompleteGate);
  const signOff = useTfpStore((s) => s.signOffDevComplete);

  if (inFlight.length === 0) return null;

  return (
    <div className="border-t border-border bg-muted/10 p-4">
      <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Dev Complete gate</p>
      <p className="mb-3 text-xs text-muted-foreground">
        All three boxes must be checked before an item can transition to Done.
      </p>
      <div className="space-y-2">
        {inFlight.map(({ sh, sig }) => {
          const g = sh.dev_complete;
          const allChecked = g.merged_to_main && g.deployed_to_staging && g.smoke_test_passed;
          return (
            <div key={sh.id} className="rounded-md border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-mono">{sh.jira_key}</span>
                <span className="text-muted-foreground">{sig?.title}</span>
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={g.merged_to_main} onChange={(e) => toggleGate(sh.id, "merged_to_main", e.target.checked)} />
                  Code merged to main branch
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={g.deployed_to_staging} onChange={(e) => toggleGate(sh.id, "deployed_to_staging", e.target.checked)} />
                  Deployed to staging environment
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={g.smoke_test_passed} onChange={(e) => toggleGate(sh.id, "smoke_test_passed", e.target.checked)} />
                  Basic smoke test passed by dev
                </label>
                {!g.signed_off_at ? (
                  <button
                    disabled={!allChecked}
                    onClick={() => signOff(sh.id)}
                    className="ml-auto rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-40"
                  >
                    Sign off gate
                  </button>
                ) : (
                  <span className="ml-auto text-[var(--color-status-proceed)]">✓ Gate signed off</span>
                )}
              </div>
              {!allChecked && (
                <p className="mt-2 text-[11px] text-muted-foreground">All three checkboxes required to move to Done.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
}) {
  return (
    <th className="px-3 py-2 text-left font-medium">
      <button
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {children}
        {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}

function Kanban({
  items,
}: {
  items: Array<{ sh: ShapingItem; sig: { title: string; product: string } | undefined }>;
}) {
  const setStatus = useTfpStore((s) => s.setDeliveryStatus);
  const grouped: Record<DeliveryStatus, typeof items> = {
    "To Do": [],
    "In Progress": [],
    "In QA": [],
    Blocked: [],
    Done: [],
  };
  items.forEach((x) => grouped[x.sh.delivery_status!].push(x));

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {STATUSES.map((status) => (
        <div key={status} className="rounded-lg border border-border bg-muted/20 p-2">
          <div className="mb-2 flex items-center justify-between px-1">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                STATUS_TONE[status],
              )}
            >
              {status}
            </span>
            <span className="text-[11px] text-muted-foreground">{grouped[status].length}</span>
          </div>
          <div className="space-y-2">
            {grouped[status].map(({ sh, sig }) => (
              <div key={sh.id} className="rounded-md border border-border bg-surface p-3 shadow-sm">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="font-mono">{sh.jira_key}</span>
                  <span className="font-mono">{sh.tech_estimate_pts ?? "—"} pts</span>
                </div>
                <p className="mt-1 line-clamp-3 text-sm font-medium leading-snug">{sig?.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{sig?.product}</p>
                <select
                  value={sh.delivery_status!}
                  onChange={(e) => setStatus(sh.id, e.target.value as DeliveryStatus)}
                  className="mt-2 w-full rounded-md border border-input bg-surface px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {grouped[status].length === 0 && (
              <p className="px-1 py-4 text-center text-[11px] text-muted-foreground">—</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function JiraEventLog() {
  const events = useTfpStore((s) => s.jiraEvents);
  const [limit, setLimit] = useState(15);
  const visible = events.slice(0, limit);

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="tfp-card flex max-h-[70vh] flex-col">
        <div className="border-b border-border p-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Jira event log</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mocked webhook stream. Each push or status change generates an event.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {visible.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">No events yet.</p>
          ) : (
            <ul className="space-y-2">
              {visible.map((e) => (
                <li
                  key={e.id}
                  className="rounded-md border border-border bg-muted/20 p-2.5 text-xs"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={cn(
                        "rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                        e.direction === "outbound"
                          ? "bg-primary/10 text-primary"
                          : "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]",
                      )}
                    >
                      {e.direction === "outbound" ? "→ push" : "← pull"}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {fmtDateTime(e.ts)}
                    </span>
                  </div>
                  <div className="font-mono text-foreground">{e.jira_key}</div>
                  <div className="text-muted-foreground">{e.type}</div>
                  <pre className="mt-1 overflow-x-auto rounded bg-background p-1.5 font-mono text-[10px] text-muted-foreground">
                    {JSON.stringify(e.payload, null, 0)}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </div>
        {events.length > limit && (
          <div className="border-t border-border p-2 text-center">
            <button
              onClick={() => setLimit((l) => l + 25)}
              className="text-xs text-primary hover:underline"
            >
              Show more ({events.length - limit} hidden)
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
