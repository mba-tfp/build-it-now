import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { AlertTriangle, CheckCircle2, Eye, GripVertical, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { USERS, daysSince, usableCapacity, useTfpStore } from "@/lib/tfp/store";
import type { DeliveryStatus, OutcomeRating, RetroTheme, Review, ShapingItem, Signal, User } from "@/lib/tfp/types";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  tab: fallback(z.enum(["backlog", "planning", "board", "golive", "clinics"]), "backlog").default("backlog"),
});

export const Route = createFileRoute("/_app/delivery")({
  validateSearch: zodValidator(searchSchema),
  component: DeliveryPage,
});

type DeliveryTab = "backlog" | "planning" | "board";
type Row = { sh: ShapingItem; sig: Signal };

const BOARD_COLUMNS: Array<Exclude<DeliveryStatus, "Blocked">> = [
  "To Do",
  "In Progress",
  "In QA",
  "Done",
];

function DeliveryPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const sprint = useTfpStore((s) => s.sprint);
  const reviews = useTfpStore((s) => s.reviews);
  const users = useTfpStore((s) => s.users);
  const syncFromJira = useTfpStore((s) => s.syncFromJira);
  const pushToJira = useTfpStore((s) => s.pushToJira);
  const addToSprint = useTfpStore((s) => s.addToSprint);
  const removeFromSprint = useTfpStore((s) => s.removeFromSprint);
  const toggleSprintLock = useTfpStore((s) => s.toggleSprintLock);
  const updateShaping = useTfpStore((s) => s.updateShaping);
  const pushNotification = useTfpStore((s) => s.pushNotification);
  const startReview = useTfpStore((s) => s.startReview);
  const completeReview = useTfpStore((s) => s.completeReview);
  const logFollowOnSignal = useTfpStore((s) => s.logFollowOnSignal);
  const closeSprint = useTfpStore((s) => s.closeSprint);

  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [planningIds, setPlanningIds] = useState<string[]>([]);
  const [sprintGoal, setSprintGoal] = useState(sprint.notes ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [briefFor, setBriefFor] = useState<Row | null>(null);
  const [blockerFor, setBlockerFor] = useState<Row | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [expandedCriteria, setExpandedCriteria] = useState<Record<string, boolean>>({});

  const readyRows = useMemo<Row[]>(() => {
    return shaping
      .filter((sh) => sh.shaping_status === "Ready for Sprint" && !sh.in_sprint)
      .map((sh) => ({ sh, sig: signals.find((sig) => sig.id === sh.signal_id) }))
      .filter((row): row is Row => !!row.sig);
  }, [shaping, signals]);

  const orderedBacklog = useMemo(() => {
    const ids = orderedIds.filter((id) => readyRows.some((row) => row.sh.id === id));
    const missing = readyRows.filter((row) => !ids.includes(row.sh.id)).map((row) => row.sh.id);
    const finalIds = [...ids, ...missing];
    return finalIds
      .map((id) => readyRows.find((row) => row.sh.id === id))
      .filter((row): row is Row => !!row);
  }, [orderedIds, readyRows]);

  const planningRows = planningIds
    .map((id) => readyRows.find((row) => row.sh.id === id))
    .filter((row): row is Row => !!row);
  const planningBacklog = orderedBacklog.filter((row) => !planningIds.includes(row.sh.id));
  const sprintRows = shaping
    .filter((sh) => sh.in_sprint && sh.jira_key && sh.delivery_status)
    .map((sh) => ({ sh, sig: signals.find((sig) => sig.id === sh.signal_id) }))
    .filter((row): row is Row => !!row.sig);
  const usedPoints = planningRows.reduce((sum, row) => sum + (row.sh.tech_estimate_pts ?? 0), 0);
  const usable = usableCapacity(sprint);
  const sprintEnded = new Date(sprint.end_date).getTime() < Date.now();
  const unresolvedCount = sprintRows.filter(({ sh }) => sh.delivery_status !== "Done" && !sh.carry_forwarded_at).length;
  const missingReviewCount = sprintRows.filter(({ sh }) => sh.delivery_status === "Done" && !completedReview(reviews, sh.id)).length;
  const closeBlocker = !sprintEnded ? "Sprint end date has not passed" : missingReviewCount > 0 ? `${missingReviewCount} items need outcome reviews` : unresolvedCount > 0 ? `${unresolvedCount} items not yet resolved` : "";

  if (tab === "golive" || tab === "clinics") return <Navigate to="/clinics" />;

  function handleSync() {
    syncFromJira();
    toast.info("Synced — no changes from Jira.");
  }

  function movePriority(dragId: string, targetId: string) {
    if (dragId === targetId) return;
    const ids = orderedBacklog.map((row) => row.sh.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrderedIds(next);
  }

  function addPlanning(id: string) {
    setPlanningIds((current) => (current.includes(id) ? current : [...current, id]));
    navigate({ search: { tab: "planning" } });
  }

  function confirmSprint() {
    planningRows.forEach(({ sh }) => {
      const key = pushToJira(sh.id);
      addToSprint(sh.id);
      toast.success(`${key || sh.jira_key || "TFP ticket"} created in Jira`);
    });
    updateSprintGoal(sprintGoal);
    if (!sprint.scope_locked_at) toggleSprintLock();
    setConfirmed(true);
  }

  function updateSprintGoal(goal: string) {
    useTfpStore.setState((state) => ({ sprint: { ...state.sprint, notes: goal } }));
  }

  function logProductBlocker(data: { description: string; ownerId: string; expectedDate: string }) {
    if (!blockerFor) return;
    const now = new Date().toISOString();
    const text = `${data.description}${data.expectedDate ? ` Expected resolution: ${data.expectedDate}.` : ""}`;
    updateShaping(blockerFor.sh.id, {
      delivery_status: "Blocked",
      blocker_description: text,
      blocked_since: blockerFor.sh.blocked_since ?? now,
      delivery_assignee_id: data.ownerId,
    });
    const blockedDays = blockerFor.sh.blocked_since ? daysSince(blockerFor.sh.blocked_since) : 0;
    if (blockedDays >= 2) {
      [blockerFor.sh.pm_owner_id, "u-shahid", "u-karim"].forEach((userId) => pushNotification({
          trigger: "blocked_over_1d",
          title: `${blockerFor.sh.jira_key} escalated to Leadership`,
          body: text,
          link_to: "/delivery",
          for_user_id: userId,
          entity_id: blockerFor.sh.id,
        }));
    }
    toast.success("Product blocker logged");
    setBlockerFor(null);
  }

  function ensureReview(shapingId: string) {
    return reviews.find((review) => review.shaping_id === shapingId) ?? startReview(shapingId);
  }

  function logFollowOn(row: Row, text: string) {
    const review = ensureReview(row.sh.id);
    if (!review) return;
    logFollowOnSignal(review.id, { title: text, description: text, source: "Internal", product: row.sig.product });
    toast.success("Follow-on signal logged in Inbox");
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Delivery</p>
          <h1 className="mt-1 font-display text-3xl">Delivery</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Backlog, sprint planning, and read-only Jira visibility.
          </p>
        </div>
        <button
          onClick={handleSync}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-1.5 text-sm hover:bg-accent/40"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Sync from Jira
        </button>
      </header>

      <div className="mb-5 flex flex-wrap gap-2 border-b border-border">
        {(
          [
            ["backlog", "Backlog"],
            ["planning", "Sprint Planning"],
            ["board", "Sprint Board"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => navigate({ search: { tab: value } })}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition",
              tab === value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "backlog" && (
        <BacklogTab rows={orderedBacklog} onMove={movePriority} onAdd={addPlanning} />
      )}
      {tab === "planning" && (
        <PlanningTab
          backlogRows={planningBacklog}
          planningRows={planningRows}
          sprintGoal={sprintGoal}
          setSprintGoal={setSprintGoal}
          usedPoints={usedPoints}
          usable={usable}
          onPick={(id) => setPlanningIds((current) => [...current, id])}
          onRemove={(id) => setPlanningIds((current) => current.filter((x) => x !== id))}
          onConfirm={confirmSprint}
          confirmed={confirmed}
          sprint={sprint}
        />
      )}
      {tab === "board" && (
        <SprintBoard
          rows={sprintRows}
          reviews={reviews}
          sprintName={sprint.name}
          closeBlocker={closeBlocker}
          users={users}
          expandedCriteria={expandedCriteria}
          setExpandedCriteria={setExpandedCriteria}
          onViewBrief={setBriefFor}
          onLogBlocker={setBlockerFor}
          onEnsureReview={ensureReview}
          onCompleteReview={completeReview}
          onLogFollowOn={logFollowOn}
          onCarryForward={(row) => {
            updateShaping(row.sh.id, { carry_forwarded_at: new Date().toISOString(), carry_forwarded_by: useTfpStore.getState().currentUserId });
            toast.success("Marked carry-forward");
          }}
          onCloseSprint={() => setCloseOpen(true)}
        />
      )}

      {briefFor && <BriefSlideover row={briefFor} onClose={() => setBriefFor(null)} />}
      {blockerFor && (
        <BlockerModal
          row={blockerFor}
          users={users}
          onCancel={() => setBlockerFor(null)}
          onSave={logProductBlocker}
        />
      )}
      {closeOpen && (
        <SprintCloseModal
          sprintName={sprint.name}
          onCancel={() => setCloseOpen(false)}
          onConfirm={(data) => {
            closeSprint(data);
            setCloseOpen(false);
            toast.success("Sprint closed");
          }}
        />
      )}
    </div>
  );
}

function BacklogTab({
  rows,
  onMove,
  onAdd,
}: {
  rows: Row[];
  onMove: (dragId: string, targetId: string) => void;
  onAdd: (id: string) => void;
}) {
  return (
    <section className="rounded-md border border-border bg-surface/50">
      <BacklogTable
        rows={rows}
        onMove={onMove}
        action={(row) => (
          <button
            onClick={() => onAdd(row.sh.id)}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add to Sprint Planning
          </button>
        )}
      />
    </section>
  );
}

function BacklogTable({
  rows,
  onMove,
  action,
  onRowClick,
}: {
  rows: Row[];
  onMove?: (dragId: string, targetId: string) => void;
  action?: (row: Row) => ReactNode;
  onRowClick?: (row: Row) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="w-24 px-3 py-3">Priority</th>
            <th className="px-3 py-3">Title</th>
            <th className="px-3 py-3">Product</th>
            <th className="px-3 py-3">Commitment type</th>
            <th className="px-3 py-3">Estimate</th>
            <th className="px-3 py-3">Tech Lead</th>
            <th className="px-3 py-3">Days waiting</th>
            {action && <th className="px-3 py-3">Action</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, index) => {
            const reviewer = USERS.find((u) => u.id === row.sh.tech_reviewer_id);
            return (
              <tr
                key={row.sh.id}
                draggable={!!onMove}
                onDragStart={(event) => event.dataTransfer.setData("text/plain", row.sh.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onMove?.(event.dataTransfer.getData("text/plain"), row.sh.id)}
                onClick={() => onRowClick?.(row)}
                className={cn("bg-surface/40 hover:bg-accent/20", onRowClick && "cursor-pointer")}
              >
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <GripVertical className="h-4 w-4" /> {index + 1}
                  </span>
                </td>
                <td className="max-w-md px-3 py-3 font-medium">{row.sig.title}</td>
                <td className="px-3 py-3 text-muted-foreground">{row.sig.product}</td>
                <td className="px-3 py-3">{row.sh.commitment_type ?? "—"}</td>
                <td className="px-3 py-3 font-mono">{row.sh.tech_estimate_pts ?? "—"} pts</td>
                <td className="px-3 py-3">{reviewer?.name ?? "—"}</td>
                <td className="px-3 py-3">{daysSince(row.sh.updated_at)}d</td>
                {action && <td className="px-3 py-3">{action(row)}</td>}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={action ? 8 : 7} className="px-3 py-10 text-center text-muted-foreground">
                No ready backlog items.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PlanningTab(props: {
  backlogRows: Row[];
  planningRows: Row[];
  sprintGoal: string;
  setSprintGoal: (value: string) => void;
  usedPoints: number;
  usable: number;
  onPick: (id: string) => void;
  onRemove: (id: string) => void;
  onConfirm: () => void;
  confirmed: boolean;
  sprint: {
    name: string;
    gross_capacity_pts: number;
    leave_deduction_pts: number;
    interrupt_buffer_pts: number;
    qa_buffer_pts: number;
    uncertainty_buffer_pts: number;
    carryforward_estimate_pts: number;
  };
}) {
  const usedPct = props.usable > 0 ? (props.usedPoints / props.usable) * 100 : 0;
  const canConfirm = props.planningRows.length > 0 && props.sprintGoal.trim().length > 0;
  if (props.confirmed) {
    return (
      <div className="rounded-md border border-[var(--color-status-proceed)]/30 bg-[var(--color-status-proceed)]/5 p-8 text-[var(--color-status-proceed)]">
        <CheckCircle2 className="mb-3 h-8 w-8" />
        <h2 className="font-display text-2xl">Sprint confirmed and pushed to Jira</h2>
        <p className="mt-2 text-sm">Committed items are now visible on the Sprint Board.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-md border border-border bg-surface/50">
        <div className="border-b border-border p-4">
          <h2 className="font-display text-lg">Prioritized backlog</h2>
        </div>
        <BacklogTable
          rows={props.backlogRows}
          onRowClick={(row) => props.onPick(row.sh.id)}
          action={undefined}
        />
        <div className="border-t border-border p-3 text-xs text-muted-foreground">
          Click a row to move it into sprint planning.
        </div>
      </section>

      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="font-display text-lg">Active Sprint</h2>
        <label className="mt-4 block text-sm font-medium">Sprint Goal</label>
        <input
          value={props.sprintGoal}
          onChange={(e) => props.setSprintGoal(e.target.value)}
          placeholder="One sentence describing what this sprint achieves"
          className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <CapacityBar
          used={props.usedPoints}
          usable={props.usable}
          usedPct={usedPct}
          sprint={props.sprint}
        />
        <div className="mt-5 space-y-2">
          {props.planningRows.map((row) => (
            <div
              key={row.sh.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 p-3 text-sm"
            >
              <div>
                <p className="font-medium">{row.sig.title}</p>
                <p className="text-xs text-muted-foreground">{row.sh.tech_estimate_pts ?? 0} pts</p>
              </div>
              <button
                onClick={() => props.onRemove(row.sh.id)}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/40"
              >
                Remove
              </button>
            </div>
          ))}
          {props.planningRows.length === 0 && (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Select backlog items from the left panel.
            </p>
          )}
        </div>
        <button
          disabled={!canConfirm}
          onClick={props.onConfirm}
          className="mt-5 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          Confirm Sprint & Push to Jira
        </button>
      </section>
    </div>
  );
}

function CapacityBar({
  used,
  usable,
  usedPct,
  sprint,
}: {
  used: number;
  usable: number;
  usedPct: number;
  sprint: {
    gross_capacity_pts: number;
    leave_deduction_pts: number;
    interrupt_buffer_pts: number;
    qa_buffer_pts: number;
    uncertainty_buffer_pts: number;
    carryforward_estimate_pts: number;
  };
}) {
  return (
    <div className="mt-4 rounded-md border border-border bg-surface-2 p-3">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>Gross {sprint.gross_capacity_pts}</span>
        <span>- Leave {sprint.leave_deduction_pts}</span>
        <span>- Interrupts {sprint.interrupt_buffer_pts}</span>
        <span>- QA {sprint.qa_buffer_pts}</span>
        <span>- Uncertainty {sprint.uncertainty_buffer_pts}</span>
        <span>- Carryforward {sprint.carryforward_estimate_pts}</span>
        <span>= Usable {usable}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full",
            usedPct >= 100
              ? "bg-destructive"
              : usedPct >= 80
                ? "bg-[var(--color-status-hold)]"
                : "bg-primary",
          )}
          style={{ width: `${Math.min(100, usedPct)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {used} / {usable} pts committed
      </p>
    </div>
  );
}

function SprintBoard({
  rows,
  reviews,
  sprintName,
  closeBlocker,
  users,
  expandedCriteria,
  setExpandedCriteria,
  onViewBrief,
  onLogBlocker,
  onEnsureReview,
  onCompleteReview,
  onLogFollowOn,
  onCarryForward,
  onCloseSprint,
}: {
  rows: Row[];
  reviews: Review[];
  sprintName: string;
  closeBlocker: string;
  users: User[];
  expandedCriteria: Record<string, boolean>;
  setExpandedCriteria: Dispatch<SetStateAction<Record<string, boolean>>>;
  onViewBrief: (row: Row) => void;
  onLogBlocker: (row: Row) => void;
  onEnsureReview: (shapingId: string) => Review | null;
  onCompleteReview: (id: string, data: { outcome_rating: OutcomeRating; what_worked: string; what_didnt: string; notes: string }) => void;
  onLogFollowOn: (row: Row, text: string) => void;
  onCarryForward: (row: Row) => void;
  onCloseSprint: () => void;
}) {
  const blocked = rows.filter((row) => row.sh.delivery_status === "Blocked");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-3">
        <div>
          <h2 className="font-display text-lg">{sprintName}</h2>
          <p className="text-xs text-muted-foreground">Close is gated by resolved work and completed outcome reviews.</p>
        </div>
        <button
          disabled={!!closeBlocker}
          title={closeBlocker || "Ready to close sprint"}
          onClick={onCloseSprint}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Close sprint
        </button>
      </div>
      <BlockedRail rows={blocked} onLogBlocker={onLogBlocker} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_COLUMNS.map((status) => {
          const columnRows = rows.filter((row) => row.sh.delivery_status === status);
          return (
            <section key={status} className="rounded-md border border-border bg-muted/20 p-3">
              <div className="mb-3 flex justify-between text-sm font-medium">
                <span>{status}</span>
                <span className="text-muted-foreground">{columnRows.length}</span>
              </div>
              <div className="space-y-3">
                {columnRows.map((row) => (
                  <BoardCard
                    key={row.sh.id}
                    row={row}
                    review={completedReview(reviews, row.sh.id)}
                    users={users}
                    expanded={!!expandedCriteria[row.sh.id]}
                    onToggleMore={() =>
                      setExpandedCriteria((current) => ({
                        ...current,
                        [row.sh.id]: !current[row.sh.id],
                      }))
                    }
                    onViewBrief={() => onViewBrief(row)}
                    onEnsureReview={() => onEnsureReview(row.sh.id)}
                    onCompleteReview={onCompleteReview}
                    onLogFollowOn={(text) => onLogFollowOn(row, text)}
                    onCarryForward={() => onCarryForward(row)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({
  row,
  users,
  expanded,
  onToggleMore,
  onViewBrief,
}: {
  row: Row;
  users: User[];
  expanded: boolean;
  onToggleMore: () => void;
  onViewBrief: () => void;
}) {
  const assignee = users.find((u) => u.id === row.sh.delivery_assignee_id);
  const staleDays = daysSince(row.sh.updated_at);
  return (
    <article className="rounded-md border border-border bg-surface p-3 text-sm shadow-sm">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="font-mono">{row.sh.jira_key}</span>
        <span>{row.sh.tech_estimate_pts ?? "—"} pts</span>
      </div>
      <h3 className="mt-1 line-clamp-2 font-medium leading-snug">{row.sig.title}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary/10 px-1.5 font-mono text-primary">
          {initials(assignee?.name)}
        </span>
        <span>{row.sh.delivery_status}</span>
        <span>{staleDays}d in status</span>
        {staleDays >= 2 && (
          <span className="rounded-full bg-[var(--color-status-hold)]/15 px-2 py-0.5 font-medium text-[var(--color-status-hold)]">
            {staleDays}d stale
          </span>
        )}
      </div>
      <div className="mt-3 rounded-md bg-surface-2 p-2 text-xs text-muted-foreground">
        <p className={expanded ? "" : "line-clamp-2"}>
          {row.sh.solution_criteria || "No success criteria recorded."}
        </p>
        {row.sh.solution_criteria.length > 90 && (
          <button onClick={onToggleMore} className="mt-1 text-primary hover:underline">
            {expanded ? "less" : "more"}
          </button>
        )}
      </div>
      <button
        onClick={onViewBrief}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent/40"
      >
        <Eye className="h-3.5 w-3.5" /> View brief
      </button>
    </article>
  );
}

function BlockedRail({ rows, onLogBlocker }: { rows: Row[]; onLogBlocker: (row: Row) => void }) {
  return (
    <section className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangle className="h-4 w-4" /> Blocked rail ({rows.length})
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const days = row.sh.blocked_since ? daysSince(row.sh.blocked_since) : 0;
          return (
            <div key={row.sh.id} className="rounded-md border border-border bg-surface p-3 text-sm">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span className="font-mono">{row.sh.jira_key}</span>
                <span>{days}d blocked</span>
              </div>
              <p className="mt-1 font-medium">{row.sig.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.sh.blocker_description || "No blocker description logged."}
              </p>
              {days >= 2 && (
                <span className="mt-2 inline-flex rounded-full bg-[var(--color-status-hold)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--color-status-hold)]">
                  Escalated to Leadership
                </span>
              )}
              <button
                onClick={() => onLogBlocker(row)}
                className="mt-3 block rounded-md border border-input px-2 py-1 text-xs hover:bg-accent/40"
              >
                Log product blocker
              </button>
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No blocked items.</p>}
      </div>
    </section>
  );
}

function BriefSlideover({ row, onClose }: { row: Row; onClose: () => void }) {
  const reviewer = USERS.find((u) => u.id === row.sh.tech_reviewer_id);
  return (
    <div className="fixed inset-0 z-50 bg-background/50" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="ml-auto h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface p-6 shadow-xl"
      >
        <button onClick={onClose} className="float-right rounded-md p-1 hover:bg-accent/40">
          <X className="h-4 w-4" />
        </button>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Shaping brief
        </p>
        <h2 className="mt-1 font-display text-2xl">{row.sig.title}</h2>
        <dl className="mt-6 space-y-4">
          {briefField("Problem", row.sh.problem_what)}
          {briefField("Why now", row.sh.problem_why)}
          {briefField("Who is affected", row.sh.problem_who)}
          {briefField("Success criteria", row.sh.solution_criteria)}
          {briefField("Proposed approach", row.sh.solution_approach)}
          {briefField("Open questions", row.sh.solution_questions || "—")}
          {briefField("Out of scope", row.sh.problem_out_of_scope || "—")}
          <div className="border-t border-border pt-4">
            {briefField("Reviewer", reviewer?.name ?? "—")}
            {briefField("Estimate", `${row.sh.tech_estimate_pts ?? "—"} pts`)}
            {briefField("Review notes", row.sh.tech_review_notes || "—")}
            {briefField("Concerns", row.sh.tech_concerns || "—")}
          </div>
        </dl>
      </aside>
    </div>
  );
}

function BlockerModal({
  row,
  users,
  onCancel,
  onSave,
}: {
  row: Row;
  users: User[];
  onCancel: () => void;
  onSave: (data: { description: string; ownerId: string; expectedDate: string }) => void;
}) {
  const [description, setDescription] = useState(row.sh.blocker_description);
  const [ownerId, setOwnerId] = useState(row.sh.delivery_assignee_id ?? users[0]?.id ?? "");
  const [expectedDate, setExpectedDate] = useState("");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/60 p-4">
      <div className="w-full max-w-md rounded-md border border-border bg-surface p-5 shadow-xl">
        <h2 className="font-display text-lg">Log product blocker</h2>
        <label className="mt-4 block text-sm font-medium">Blocker description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
        />
        <label className="mt-3 block text-sm font-medium">Owner</label>
        <select
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <label className="mt-3 block text-sm font-medium">Expected resolution date</label>
        <input
          type="date"
          value={expectedDate}
          onChange={(e) => setExpectedDate(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent/40"
          >
            Cancel
          </button>
          <button
            disabled={description.trim().length === 0}
            onClick={() => onSave({ description, ownerId, expectedDate })}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function initials(name?: string) {
  return (
    name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2) ?? "—"
  );
}

function briefField(label: string, value: string) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm">{value}</dd>
    </div>
  );
}
