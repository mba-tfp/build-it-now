import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { USERS, useTfpStore, daysSince } from "@/lib/tfp/store";
import type { DeliveryStatus, ShapingItem, User } from "@/lib/tfp/types";
import { fmtDate, fmtDateTime } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import { AlertTriangle, Inbox, Lock, Pause, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { SortMenu, useSortMenu } from "@/components/tfp/SortMenu";
import { sortRows } from "@/components/tfp/SortableHeader";

export const Route = createFileRoute("/_app/delivery")({
  component: DeliveryPage,
});

const COLUMNS: DeliveryStatus[] = ["To Do", "In Progress", "In QA", "Done"];

type Row = { sh: ShapingItem; sig: { title: string; product: string } | undefined };

const STATUS_TONE: Record<DeliveryStatus, string> = {
  "To Do": "bg-muted text-muted-foreground",
  "In Progress": "bg-[var(--color-status-new)]/10 text-[var(--color-status-new)]",
  "In QA": "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]",
  Blocked: "bg-destructive/10 text-destructive",
  Done: "bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]",
};

// Role permission matrix
function canMove(user: User, sh: ShapingItem, target: DeliveryStatus): boolean {
  const role = user.role;
  const isAssignee = sh.delivery_assignee_id === user.id;
  if (target === "Blocked") return true; // anyone can flag a blocker (with reason)
  if (role === "Developer" || role === "Tech Lead") {
    if (!isAssignee) return false;
    if (sh.delivery_status === "To Do" && target === "In Progress") return true;
    if (sh.delivery_status === "In Progress" && target === "Done") return true; // gate-enforced separately
    return false;
  }
  if (role === "QA Scrum Master") {
    if (sh.delivery_status === "Done" && target === "In QA") return false;
    if (target === "In QA" && sh.delivery_status === "In Progress") return true;
    if (sh.delivery_status === "In QA" && (target === "Done" || target === "In Progress")) return true;
    return false;
  }
  if (role === "PM" || role === "Senior PM" || role === "Associate PM") {
    return false; // PMs can flag blockers / hold but not move QA items
  }
  return false;
}

export function DeliveryPage() {
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const sprint = useTfpStore((s) => s.sprint);
  const users = useTfpStore((s) => s.users);
  const currentUserId = useTfpStore((s) => s.currentUserId);
  const syncFromJira = useTfpStore((s) => s.syncFromJira);
  const setStatus = useTfpStore((s) => s.setDeliveryStatus);
  const setBlocked = useTfpStore((s) => s.setBlocked);
  const unblock = useTfpStore((s) => s.unblock);
  const toggleGate = useTfpStore((s) => s.toggleDevCompleteGate);
  const signOff = useTfpStore((s) => s.signOffDevComplete);
  const addToSprint = useTfpStore((s) => s.addToSprint);
  const removeFromSprint = useTfpStore((s) => s.removeFromSprint);
  const me = (users.find((u) => u.id === currentUserId) ?? USERS.find((u) => u.id === currentUserId))!;

  const [assigneeFilter, setAssigneeFilter] = useState<string>("All");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [devCompleteFor, setDevCompleteFor] = useState<ShapingItem | null>(null);
  const [blockerFor, setBlockerFor] = useState<ShapingItem | null>(null);

  // All shaping with a Jira key (backlog + in-sprint)
  const allRows: Row[] = useMemo(
    () =>
      shaping
        .filter((s) => s.jira_key)
        .map((s) => ({
          sh: s,
          sig: signals.find((sig) => sig.id === s.signal_id),
        }))
        .filter((x) => !!x.sig),
    [shaping, signals],
  );

  const filteredAll = assigneeFilter === "All" ? allRows : allRows.filter((r) => r.sh.delivery_assignee_id === assigneeFilter);

  type SortKey = "updated" | "status" | "assignee" | "stale";
  const { sort, setSort } = useSortMenu<SortKey>("delivery", { key: "updated", dir: "desc" });

  const sortedRows = useMemo(
    () =>
      sortRows(filteredAll, sort, (r, k) => {
        if (k === "updated") return new Date(r.sh.updated_at ?? r.sh.created_at).getTime();
        if (k === "status") return r.sh.delivery_status ?? "";
        if (k === "assignee") {
          const u = USERS.find((x) => x.id === r.sh.delivery_assignee_id);
          return u?.name ?? "";
        }
        if (k === "stale") return -1 * daysSince(r.sh.updated_at ?? r.sh.created_at);
        return null;
      }),
    [filteredAll, sort],
  );

  // Split: backlog (jira_key but not yet in sprint) vs in-sprint (kanban)
  const backlogRows = sortedRows.filter((r) => !r.sh.in_sprint);
  const sprintRows = sortedRows.filter((r) => r.sh.in_sprint && r.sh.delivery_status);

  const blocked = sprintRows.filter((r) => r.sh.delivery_status === "Blocked");
  const grouped: Record<DeliveryStatus, Row[]> = {
    "To Do": [],
    "In Progress": [],
    "In QA": [],
    Blocked: [],
    Done: [],
  };
  sprintRows.forEach((r) => {
    if (r.sh.delivery_status) grouped[r.sh.delivery_status].push(r);
  });

  const sprintLocked = !!sprint.scope_locked_at;
  const teamMembers = USERS.filter((u) => ["Developer", "Tech Lead", "QA Scrum Master"].includes(u.role));

  function handleMove(sh: ShapingItem, next: DeliveryStatus) {
    if (next === "Blocked") {
      setBlockerFor(sh);
      return;
    }
    if (!canMove(me, sh, next)) {
      toast.error("Not allowed", {
        description: `${me.role} cannot move this item to ${next}.`,
      });
      return;
    }
    if (sh.delivery_status === "In Progress" && next === "Done" && me.role !== "QA Scrum Master") {
      // Dev wants to mark Dev Complete (mapped to In QA via gate)
      setDevCompleteFor(sh);
      return;
    }
    setStatus(sh.id, next);
  }

  function handleSync() {
    const n = syncFromJira();
    if (n === 0) toast.info("No changes from Jira.");
    else toast.success(`Pulled ${n} status update${n === 1 ? "" : "s"}.`);
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">View 4</p>
          <h1 className="mt-1 font-display text-3xl">Delivery Board</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sprint.name} · {sprintRows.length} in sprint · {backlogRows.length} in backlog · viewing as {me.name} ({me.role})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SortMenu
            tableId="delivery"
            sort={sort}
            onChange={setSort}
            options={[
              { key: "updated", label: "Updated" },
              { key: "status", label: "Status" },
              { key: "assignee", label: "Assignee" },
              { key: "stale", label: "Days since update" },
            ]}
          />
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="All">All items ({allRows.length})</option>
            {teamMembers.map((u) => {
              const n = allRows.filter((r) => r.sh.delivery_assignee_id === u.id).length;
              return (
                <option key={u.id} value={u.id}>
                  {u.name} ({n})
                </option>
              );
            })}
          </select>
          <button
            onClick={handleSync}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-1.5 text-sm hover:bg-accent/40"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Sync from Jira
          </button>
          <button
            disabled={sprintLocked}
            title={sprintLocked ? "Sprint is locked — items can only be added via an override" : ""}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Add item
          </button>
        </div>
      </header>

      {sprintLocked && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
          <Lock className="h-3.5 w-3.5 text-amber-600" />
          <span>
            Sprint scope locked on {fmtDate(sprint.scope_locked_at!)}. Use the Override log to add new items.
          </span>
        </div>
      )}

      {/* Backlog rail (jira_key but not yet in sprint) */}
      {backlogRows.length > 0 && (
        <section className="mb-5 rounded-lg border border-border bg-surface-2 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            Backlog ({backlogRows.length})
            <span className="text-[11px] font-normal text-muted-foreground">
              · Pushed to Jira, not yet in {sprint.name}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {backlogRows.map(({ sh, sig }) => (
              <div key={sh.id} className="rounded-md border border-border bg-surface p-3 text-sm">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="font-mono">{sh.jira_key}</span>
                  <span className="font-mono">{sh.tech_estimate_pts ?? "—"}p</span>
                </div>
                <p className="mt-1 line-clamp-2 font-medium leading-snug">{sig?.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{sig?.product}</p>
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => addToSprint(sh.id)}
                    disabled={sprintLocked}
                    title={sprintLocked ? "Sprint locked — use Override log" : `Add ${sh.jira_key} to ${sprint.name}`}
                    className="flex-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    + Add to Sprint
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Blocked rail */}
      {blocked.length > 0 && (
        <section className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Blocked ({blocked.length})
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {blocked.map(({ sh, sig }) => {
              const days = sh.blocked_since ? Math.abs(daysSince(sh.blocked_since)) : 0;
              const escalated = days >= 1;
              return (
                <div key={sh.id} className="rounded-md border border-border bg-surface p-3 text-sm">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="font-mono">{sh.jira_key}</span>
                    <span className={escalated ? "font-medium text-destructive" : ""}>
                      {days}d blocked {escalated && "· P2"}
                    </span>
                  </div>
                  <p className="mt-1 font-medium leading-snug">{sig?.title}</p>
                  {sh.blocker_description && (
                    <p className="mt-1 text-[11px] italic text-muted-foreground">"{sh.blocker_description}"</p>
                  )}
                  <button
                    onClick={() => unblock(sh.id, "In Progress")}
                    className="mt-2 inline-flex items-center gap-1 rounded-md border border-input bg-surface px-2 py-1 text-[11px] hover:bg-muted"
                  >
                    Unblock → In Progress
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Kanban */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((status) => (
          <div key={status} className="rounded-lg border border-border bg-muted/20 p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[status])}>
                {status}
              </span>
              <span className="text-[11px] text-muted-foreground">{grouped[status].length}</span>
            </div>
            <div className="space-y-2">
              {grouped[status].map(({ sh, sig }) => {
                const assignee = USERS.find((u) => u.id === sh.delivery_assignee_id);
                const initials = assignee?.name.split(" ").map((p) => p[0]).join("") ?? "—";
                const days = Math.abs(daysSince(sh.updated_at));
                const isOpen = expanded === sh.id;
                const gateReady =
                  sh.dev_complete.merged_to_main &&
                  sh.dev_complete.deployed_to_staging &&
                  sh.dev_complete.smoke_test_passed;
                return (
                  <div
                    key={sh.id}
                    className={cn(
                      "rounded-md border bg-surface p-2.5 text-sm shadow-sm transition",
                      isOpen ? "border-primary/40" : "border-border",
                    )}
                  >
                    <button
                      onClick={() => setExpanded(isOpen ? null : sh.id)}
                      className="block w-full text-left"
                    >
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="font-mono">{sh.jira_key}</span>
                        <span className="font-mono">{sh.tech_estimate_pts ?? "—"}p</span>
                      </div>
                      <p className="mt-1 line-clamp-2 font-medium leading-snug">{sig?.title}</p>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 font-mono text-primary">
                          {initials}
                        </span>
                        <span>{days}d in status</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
                        <p className="text-[11px] text-muted-foreground">{sig?.product}</p>
                        {status === "In Progress" && (
                          <div className="rounded-md border border-border bg-muted/20 p-2">
                            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                              Dev Complete gate
                            </p>
                            <ul className="space-y-0.5 text-[11px]">
                              <li>
                                {sh.dev_complete.merged_to_main ? "✓" : "○"} Merged to main
                              </li>
                              <li>
                                {sh.dev_complete.deployed_to_staging ? "✓" : "○"} Deployed to staging
                              </li>
                              <li>
                                {sh.dev_complete.smoke_test_passed ? "✓" : "○"} Smoke test passed
                              </li>
                            </ul>
                            {sh.dev_complete.signed_off_at && (
                              <p className="mt-1 text-[10px] text-[var(--color-status-proceed)]">
                                Gate signed off {fmtDateTime(sh.dev_complete.signed_off_at)}
                              </p>
                            )}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                          {COLUMNS.filter((s) => s !== status).map((target) => {
                            const allowed = canMove(me, sh, target);
                            const needsGate =
                              status === "In Progress" && target === "Done" && !gateReady && me.role !== "QA Scrum Master";
                            return (
                              <button
                                key={target}
                                disabled={!allowed && me.role !== "QA Scrum Master" ? !allowed : false}
                                onClick={() => handleMove(sh, target)}
                                className={cn(
                                  "rounded-md border px-2 py-1 text-[11px]",
                                  allowed
                                    ? "border-input bg-surface hover:bg-muted"
                                    : "cursor-not-allowed border-border/50 bg-muted/30 text-muted-foreground/60",
                                )}
                                title={
                                  !allowed
                                    ? `${me.role} cannot move to ${target}`
                                    : needsGate
                                      ? "Dev Complete gate required"
                                      : ""
                                }
                              >
                                → {target}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => setBlockerFor(sh)}
                            className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"
                          >
                            <Pause className="mr-1 inline h-3 w-3" /> Block
                          </button>
                          {status !== "Done" && (
                            <button
                              onClick={() => removeFromSprint(sh.id)}
                              disabled={sprintLocked}
                              title={sprintLocked ? "Sprint locked" : "Move back to backlog"}
                              className="rounded-md border border-input bg-surface px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-40"
                            >
                              ← Backlog
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {grouped[status].length === 0 && (
                <p className="px-1 py-4 text-center text-[11px] text-muted-foreground">—</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Dev Complete gate modal */}
      {devCompleteFor && (
        <DevCompleteModal
          item={devCompleteFor}
          onToggle={(key, v) => toggleGate(devCompleteFor.id, key, v)}
          onConfirm={() => {
            signOff(devCompleteFor.id);
            setStatus(devCompleteFor.id, "In QA");
            toast.success("Gate signed off · Abdul Karim notified");
            setDevCompleteFor(null);
          }}
          onClose={() => setDevCompleteFor(null)}
        />
      )}

      {/* Blocker reason modal */}
      {blockerFor && (
        <BlockerModal
          item={blockerFor}
          onConfirm={(desc) => {
            setBlocked(blockerFor.id, desc);
            toast.success("Item flagged as blocked");
            setBlockerFor(null);
          }}
          onClose={() => setBlockerFor(null)}
        />
      )}
    </div>
  );
}

function DevCompleteModal({
  item,
  onToggle,
  onConfirm,
  onClose,
}: {
  item: ShapingItem;
  onToggle: (key: "merged_to_main" | "deployed_to_staging" | "smoke_test_passed", v: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const g = item.dev_complete;
  const allChecked = g.merged_to_main && g.deployed_to_staging && g.smoke_test_passed;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg">Confirm Dev Complete</h3>
          <button onClick={onClose}>
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          {item.jira_key} · all three checks must pass before Abdul Karim can pick it up for QA.
        </p>
        <div className="space-y-2 text-sm">
          {[
            { key: "merged_to_main" as const, label: "Code merged to main branch" },
            { key: "deployed_to_staging" as const, label: "Deployed to staging environment" },
            { key: "smoke_test_passed" as const, label: "Basic smoke test passed — core happy path verified" },
          ].map((row) => (
            <label key={row.key} className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
              <input type="checkbox" checked={g[row.key]} onChange={(e) => onToggle(row.key, e.target.checked)} />
              <span>{row.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            disabled={!allChecked}
            onClick={onConfirm}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            Confirm Dev Complete
          </button>
        </div>
      </div>
    </div>
  );
}

function BlockerModal({
  item,
  onConfirm,
  onClose,
}: {
  item: ShapingItem;
  onConfirm: (description: string) => void;
  onClose: () => void;
}) {
  const [desc, setDesc] = useState(item.blocker_description ?? "");
  const valid = desc.trim().length >= 20;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg">Mark blocked</h3>
          <button onClick={onClose}>
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{item.jira_key} · describe the blocker (min 20 chars).</p>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={4}
          placeholder="What's blocking this item? Who do we need to unblock it?"
          className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-1 text-[11px] text-muted-foreground">{desc.trim().length}/20 chars minimum</div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            disabled={!valid}
            onClick={() => onConfirm(desc.trim())}
            className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground disabled:opacity-40"
          >
            Mark blocked
          </button>
        </div>
      </div>
    </div>
  );
}
