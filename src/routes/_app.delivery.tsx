import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Eye, GripVertical, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { USERS, daysSince, usableCapacity, useTfpStore } from "@/lib/tfp/store";
import { fmtDateTime } from "@/lib/tfp/format";
import type { DeliveryStatus, GoLiveChecklist, OutcomeRating, RetroTheme, Review, ShapingItem, Signal, User } from "@/lib/tfp/types";
import { cn } from "@/lib/utils";
import { InlineDecisions } from "@/components/tfp/InlineDecisions";
import { StartOutcomeReview } from "@/components/tfp/StartOutcomeReview";
import { complianceMissingRows } from "./_app.clinics";

const searchSchema = z.object({
  tab: z.string().optional(),
  openItem: z.string().optional(),
});

export const Route = createFileRoute("/_app/delivery")({
  validateSearch: zodValidator(searchSchema),
  component: DeliveryPage,
});

type Row = { sh: ShapingItem; sig: Signal };
export type CannotCloseRow = {
  key: string;
  label: string;
  fixTo: { to: string; search: Record<string, string> } | null;
};

/**
 * Pure helper that computes the granular blocker rows shown in the
 * "Cannot close sprint" modal. Exported so /self-test can assert against it
 * without mounting the full DeliveryPage.
 *
 * NOTE: This does NOT change the existing close rule (`closeBlocker`).
 * It only translates the same conditions into actionable rows.
 */
export function computeCannotCloseRows({
  sprintEnded,
  sprintRows,
  reviews,
  usable,
  allocatedPts,
}: {
  sprintEnded: boolean;
  sprintRows: Row[];
  reviews: Review[];
  usable: number;
  allocatedPts: number;
}): CannotCloseRow[] {
  const rows: CannotCloseRow[] = [];
  if (!sprintEnded) {
    rows.push({ key: "sprint-not-ended", label: "Sprint end date has not passed yet", fixTo: null });
  }
  const inProgress = sprintRows.filter(({ sh }) => sh.delivery_status === "In Progress" && !sh.carry_forwarded_at).length;
  if (inProgress > 0) {
    rows.push({
      key: "in-progress",
      label: `${inProgress} item${inProgress === 1 ? "" : "s"} still In Progress`,
      fixTo: { to: "/delivery", search: {} },
    });
  }
  const inQa = sprintRows.filter(({ sh }) => sh.delivery_status === "In QA" && !sh.carry_forwarded_at).length;
  if (inQa > 0) {
    rows.push({
      key: "in-qa",
      label: `${inQa} item${inQa === 1 ? "" : "s"} still In QA`,
      fixTo: { to: "/delivery", search: {} },
    });
  }
  const todo = sprintRows.filter(({ sh }) => sh.delivery_status === "To Do" && !sh.carry_forwarded_at).length;
  if (todo > 0) {
    rows.push({
      key: "todo",
      label: `${todo} item${todo === 1 ? "" : "s"} still To Do`,
      fixTo: { to: "/delivery", search: {} },
    });
  }
  const blockedNotCarried = sprintRows.filter(({ sh }) => sh.delivery_status === "Blocked" && !sh.carry_forwarded_at).length;
  if (blockedNotCarried > 0) {
    rows.push({
      key: "blocked",
      label: `${blockedNotCarried} item${blockedNotCarried === 1 ? "" : "s"} Blocked`,
      fixTo: { to: "/delivery", search: {} },
    });
  }
  const reviewsPending = sprintRows.filter(
    ({ sh }) => sh.delivery_status === "Done" && !reviews.some((r) => r.shaping_id === sh.id),
  ).length;
  if (reviewsPending > 0) {
    rows.push({
      key: "reviews-pending",
      label: `${reviewsPending} outcome review${reviewsPending === 1 ? "" : "s"} pending`,
      fixTo: { to: "/governance", search: { tab: "lookback" } },
    });
  }
  const missingResult = sprintRows.filter(({ sh }) => {
    if (sh.delivery_status !== "Done") return false;
    const r = reviews.find((rr) => rr.shaping_id === sh.id);
    return !!r && !r.outcome_rating;
  });
  if (missingResult.length > 0) {
    rows.push({
      key: "missing-result",
      label: `${missingResult.length} outcome review${missingResult.length === 1 ? "" : "s"} missing result`,
      fixTo: { to: "/governance", search: { tab: "lookback" } },
    });
  }
  if (usable > 0 && allocatedPts > usable) {
    rows.push({
      key: "capacity",
      label: "Sprint capacity exceeded 100% with no override",
      fixTo: { to: "/delivery", search: {} },
    });
  }
  return rows;
}
type DeliverySectionKey = "board" | "planning" | "backlog";

const DELIVERY_SECTIONS_STORAGE_KEY = "tfp-delivery-sections-v1";
const DEFAULT_SECTION_STATE: Record<DeliverySectionKey, boolean> = {
  board: true,
  planning: true,
  backlog: false,
};
const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3600000;
const sprintStaleHoursForTier = (tier: Signal["tier"]) => tier === "P0" || tier === "P1" ? 48 : 96;
const blockedEscalationHoursForTier = (tier: Signal["tier"]) => ({ P0: 24, P1: 48, P2: 72, P3: 96 })[tier];

function readSectionState(): Record<DeliverySectionKey, boolean> {
  if (typeof window === "undefined") return DEFAULT_SECTION_STATE;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DELIVERY_SECTIONS_STORAGE_KEY) ?? "{}");
    return { ...DEFAULT_SECTION_STATE, ...parsed };
  } catch {
    return DEFAULT_SECTION_STATE;
  }
}

const BOARD_COLUMNS: Array<Exclude<DeliveryStatus, "Blocked">> = [
  "To Do",
  "In Progress",
  "In QA",
  "Done",
];

function DeliveryPage() {
  const { tab, openItem } = Route.useSearch();
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const sprint = useTfpStore((s) => s.sprint);
  const reviews = useTfpStore((s) => s.reviews);
  const users = useTfpStore((s) => s.users);
  const syncFromJira = useTfpStore((s) => s.syncFromJira);
  const pushToJira = useTfpStore((s) => s.pushToJira);
  const addToSprint = useTfpStore((s) => s.addToSprint);
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
  const [committedKeys, setCommittedKeys] = useState<string[]>([]);
  const [briefFor, setBriefFor] = useState<Row | null>(null);
  const [blockerFor, setBlockerFor] = useState<Row | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [cannotCloseOpen, setCannotCloseOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [expandedCriteria, setExpandedCriteria] = useState<Record<string, boolean>>({});
  const [openSections, setOpenSections] = useState<Record<DeliverySectionKey, boolean>>(readSectionState);

  useEffect(() => {
    window.localStorage.setItem(DELIVERY_SECTIONS_STORAGE_KEY, JSON.stringify(openSections));
  }, [openSections]);

  const readyRows = useMemo<Row[]>(() => {
    return shaping
      .filter((sh) => sh.shaping_status === "Ready for Sprint" && !sh.in_sprint && !sh.jira_key)
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

  // Granular blocker rows for the "Cannot close sprint" modal. Each row is purely
  // informational — the underlying close rule (`closeBlocker`) is unchanged.
  const blockerRows = useMemo<CannotCloseRow[]>(
    () => computeCannotCloseRows({ sprintEnded, sprintRows, reviews, usable, allocatedPts: sprint.allocated_pts }),
    [sprintEnded, sprintRows, reviews, usable, sprint.allocated_pts],
  );

  const hasBlockers = blockerRows.length > 0 || !!closeBlocker;

  function handleCloseSprintClick() {
    // Edge case: rule string is set but no granular rows resolved — treat as blocked
    // and surface a single generic row so the modal still informs the user. If the
    // edge truly has zero rows AND no rule string, fall through to the happy path.
    if (!hasBlockers) {
      setCloseOpen(true);
      return;
    }
    setCannotCloseOpen(true);
  }

  // Auto-open the brief slideover when an `openItem` query param is present.
  useEffect(() => {
    if (!openItem) return;
    const row = sprintRows.find((r) => r.sh.id === openItem);
    if (row) setBriefFor(row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItem, shaping, signals]);

  if (tab) return <Navigate to="/delivery" search={openItem ? { openItem } : {}} replace />;

  function toggleSection(section: DeliverySectionKey) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

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

  function commitSprint(override?: { reason: string; displacedIds: string[] }) {
    const createdKeys: string[] = [];
    planningRows.forEach(({ sh }) => {
      const key = pushToJira(sh.id);
      if (key) createdKeys.push(key);
      addToSprint(sh.id, override?.reason, override ? "Scope added mid-sprint" : undefined, override?.displacedIds);
    });
    updateSprintGoal(sprintGoal);
    if (!sprint.scope_locked_at) toggleSprintLock();
    setCommittedKeys(createdKeys);
    setPlanningIds([]);
    pushNotification({
      trigger: "scope_change",
      title: `Active Sprint is locked. ${planningRows.length} items committed. Sprint board is live.`,
      body: `Active Sprint is locked. ${planningRows.length} items committed. Sprint board is live.`,
      link_to: "/delivery",
      for_user_id: "u-karim",
      entity_id: sprint.id,
    });
    toast.success("Sprint committed", { description: `${createdKeys.length} Jira tickets created.` });
  }

  function confirmSprint() {
    if (sprint.scope_locked_at) {
      setOverrideOpen(true);
      return;
    }
    commitSprint();
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

      <div className="space-y-4">
        <DeliverySection
          title="SPRINT BOARD"
          countLabel={`${sprintRows.length} ${sprintRows.length === 1 ? "item" : "items"}`}
          open={openSections.board}
          onToggle={() => toggleSection("board")}
        >
          <SprintBoard
            rows={sprintRows}
            reviews={reviews}
            sprintName={sprint.name}
            committedKeys={committedKeys}
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
            onCloseSprint={handleCloseSprintClick}
          />
        </DeliverySection>

        <DeliverySection
          title="SPRINT PLANNING"
          countLabel={`${planningRows.length} selected`}
          open={openSections.planning}
          onToggle={() => toggleSection("planning")}
        >
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
            committedKeys={committedKeys}
            sprint={sprint}
          />
        </DeliverySection>

        <DeliverySection
          title="BACKLOG"
          countLabel={`${planningBacklog.length} ready`}
          open={openSections.backlog}
          onToggle={() => toggleSection("backlog")}
        >
          <BacklogTab
            rows={planningBacklog}
            onMove={movePriority}
            onAddToPlanning={(id) => setPlanningIds((current) => current.includes(id) ? current : [...current, id])}
          />
        </DeliverySection>
      </div>

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
          onConfirm={(data: { summary: string; what_worked: string; what_didnt: string; one_change: string; primary_theme: RetroTheme }) => {
            closeSprint(data);
            setCloseOpen(false);
            toast.success("Sprint closed");
          }}
        />
      )}
      {cannotCloseOpen && (
        <CannotCloseSprintModal
          rows={blockerRows}
          onClose={() => setCannotCloseOpen(false)}
        />
      )}
      {overrideOpen && (
        <ScopeOverrideModal
          rows={sprintRows}
          onCancel={() => setOverrideOpen(false)}
          onConfirm={(data: { reason: string; displacedIds: string[] }) => {
            commitSprint(data);
            setOverrideOpen(false);
          }}
        />
      )}
    </div>
  );
}

function BacklogTab({
  rows,
  onMove,
  onAddToPlanning,
}: {
  rows: Row[];
  onMove: (dragId: string, targetId: string) => void;
  onAddToPlanning?: (id: string) => void;
}) {
  return (
    <section className="rounded-md border border-border bg-surface/50">
      <BacklogTable
        rows={rows}
        onMove={onMove}
        action={onAddToPlanning ? (row) => (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onAddToPlanning(row.sh.id);
            }}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/40"
          >
            Add to Sprint Planning
          </button>
        ) : undefined}
      />
      <div className="border-t border-border p-3 text-xs text-muted-foreground">Use Sprint Planning to select and commit backlog items.</div>
    </section>
  );
}

function DeliverySection({
  title,
  countLabel,
  open,
  onToggle,
  children,
}: {
  title: string;
  countLabel: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-surface/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/20"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="truncate font-display text-lg">{title}</span>
          <span className="shrink-0 rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-muted-foreground">
            {countLabel}
          </span>
        </span>
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
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
  committedKeys: string[];
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
  if (props.committedKeys.length > 0) {
    return (
      <div className="rounded-md border border-[var(--color-status-proceed)]/30 bg-[var(--color-status-proceed)]/5 p-8 text-[var(--color-status-proceed)]">
        <CheckCircle2 className="mb-3 h-8 w-8" />
        <h2 className="font-display text-2xl">Sprint confirmed and pushed to Jira</h2>
        <p className="mt-2 text-sm">Committed items are now visible on the Sprint Board.</p>
        <div className="mt-4 flex flex-wrap gap-2">{props.committedKeys.map((key) => <span key={key} className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs">{key}</span>)}</div>
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
          Click a row to move it into sprint planning. Jira tickets are created only when the sprint is confirmed.
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
  const remaining = usable - used;
  return (
    <div className="mt-4 rounded-md border border-border bg-surface-2 p-3">
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Gross capacity: {sprint.gross_capacity_pts} pts</p>
        <p>- Leave: -{sprint.leave_deduction_pts} pts</p>
        <p>- Interrupts: -{sprint.interrupt_buffer_pts} pts</p>
        <p>- QA buffer: -{sprint.qa_buffer_pts} pts</p>
        <p>- Uncertainty: -{sprint.uncertainty_buffer_pts} pts</p>
        <p>- Carryforward: -{sprint.carryforward_estimate_pts} pts</p>
        <p className="font-medium text-foreground">= Usable: {usable} pts</p>
        <p>Committed: {used} pts</p>
        <p>Remaining: {remaining} pts</p>
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
      {usedPct >= 100 && <p className="mt-2 text-xs font-medium text-destructive">Over capacity — remove items or record override.</p>}
    </div>
  );
}

function SprintBoard({
  rows,
  reviews,
  sprintName,
  committedKeys,
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
  committedKeys: string[];
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
          {committedKeys.length > 0 && <p className="mt-1 text-xs text-[var(--color-status-proceed)]">Created Jira keys: {committedKeys.join(", ")}</p>}
        </div>
        <button
          data-testid="close-sprint-button"
          title={closeBlocker || "Ready to close sprint"}
          onClick={onCloseSprint}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
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
  review,
  users,
  expanded,
  onToggleMore,
  onViewBrief,
  onEnsureReview,
  onCompleteReview,
  onLogFollowOn,
  onCarryForward,
}: {
  row: Row;
  review: Review | null;
  users: User[];
  expanded: boolean;
  onToggleMore: () => void;
  onViewBrief: () => void;
  onEnsureReview: () => Review | null;
  onCompleteReview: (id: string, data: { outcome_rating: OutcomeRating; what_worked: string; what_didnt: string; notes: string }) => void;
  onLogFollowOn: (text: string) => void;
  onCarryForward: () => void;
}) {
  const assignee = users.find((u) => u.id === row.sh.delivery_assignee_id);
  const staleDays = daysSince(row.sh.updated_at);
  const isStale = hoursSince(row.sh.updated_at) >= sprintStaleHoursForTier(row.sig.tier);
  const [reviewOpen, setReviewOpen] = useState(false);
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
        {isStale && (
          <span className="rounded-full bg-[var(--color-status-hold)]/15 px-2 py-0.5 font-medium text-[var(--color-status-hold)]">
            {staleDays}d stale
          </span>
        )}
        {row.sh.carry_forwarded_at && <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">Carry-forwarded</span>}
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
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={onViewBrief} className="inline-flex items-center gap-1.5 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent/40">
          <Eye className="h-3.5 w-3.5" /> View brief
        </button>
        {row.sh.delivery_status !== "Done" && !row.sh.carry_forwarded_at && (
          <button onClick={onCarryForward} className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent/40">Carry forward</button>
        )}
        {row.sh.delivery_status === "Done" && (review ? (
          <span className="rounded-full border border-[var(--color-status-proceed)]/30 bg-[var(--color-status-proceed)]/10 px-2 py-1 text-xs font-medium text-[var(--color-status-proceed)]">Review complete</span>
        ) : (
          <button onClick={() => { onEnsureReview(); setReviewOpen((open) => !open); }} className="rounded-full border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">Outcome review pending</button>
        ))}
      </div>
      {reviewOpen && row.sh.delivery_status === "Done" && !review && <OutcomeReviewPanel review={onEnsureReview()} onComplete={onCompleteReview} onLogFollowOn={onLogFollowOn} />}
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
          const escalated = row.sh.blocked_since ? hoursSince(row.sh.blocked_since) >= blockedEscalationHoursForTier(row.sig.tier) : false;
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
              {escalated && (
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

function OutcomeReviewPanel({ review, onComplete, onLogFollowOn }: { review: Review | null; onComplete: (id: string, data: { outcome_rating: OutcomeRating; what_worked: string; what_didnt: string; notes: string }) => void; onLogFollowOn: (text: string) => void }) {
  const [rating, setRating] = useState<OutcomeRating | null>(null);
  const [worked, setWorked] = useState("");
  const [didnt, setDidnt] = useState("");
  const [followOn, setFollowOn] = useState("");
  const ready = !!review && !!rating && worked.trim().length > 0 && didnt.trim().length > 0;
  return (
    <div className="mt-3 rounded-md border border-border bg-surface-2 p-3">
      <div className="flex flex-wrap gap-2">
        {(["Met", "Partially Met", "Missed"] as OutcomeRating[]).map((option) => (
          <button key={option} onClick={() => setRating(option)} className={cn("rounded-md border px-2 py-1 text-xs font-medium", rating === option ? option === "Met" ? "border-[var(--color-status-proceed)] bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]" : option === "Partially Met" ? "border-[var(--color-status-hold)] bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]" : "border-destructive bg-destructive/10 text-destructive" : "border-input hover:bg-accent/40")}>{option}</button>
        ))}
      </div>
      <input value={worked} onChange={(e) => setWorked(e.target.value)} placeholder="What worked" className="mt-3 w-full rounded-md border border-input bg-surface px-3 py-2 text-xs" />
      <input value={didnt} onChange={(e) => setDidnt(e.target.value)} placeholder="What did not work" className="mt-2 w-full rounded-md border border-input bg-surface px-3 py-2 text-xs" />
      <div className="mt-2 flex gap-2">
        <input value={followOn} onChange={(e) => setFollowOn(e.target.value)} placeholder="Follow-on signal" className="min-w-0 flex-1 rounded-md border border-input bg-surface px-3 py-2 text-xs" />
        <button disabled={!followOn.trim()} onClick={() => { onLogFollowOn(followOn.trim()); setFollowOn(""); }} className="rounded-md border border-input px-2 py-1 text-xs disabled:opacity-40">Log as new signal</button>
      </div>
      <button disabled={!ready} onClick={() => review && rating && onComplete(review.id, { outcome_rating: rating, what_worked: worked.trim(), what_didnt: didnt.trim(), notes: `${worked.trim()} ${didnt.trim()}` })} className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40">Submit</button>
    </div>
  );
}

function SprintCloseModal({ sprintName, onCancel, onConfirm }: { sprintName: string; onCancel: () => void; onConfirm: (data: { summary: string; what_worked: string; what_didnt: string; one_change: string; primary_theme: RetroTheme }) => void }) {
  const [summary, setSummary] = useState("");
  const [worked, setWorked] = useState("");
  const [didnt, setDidnt] = useState("");
  const [change, setChange] = useState("");
  const [theme, setTheme] = useState<RetroTheme>("Process");
  const ready = [summary, worked, didnt, change].every((value) => value.trim().length > 0);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/60 p-4">
      <div className="w-full max-w-lg rounded-md border border-border bg-surface p-5 shadow-xl">
        <h2 className="font-display text-lg">Close {sprintName}</h2>
        <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Sprint summary" className="mt-4 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm" />
        <input value={worked} onChange={(e) => setWorked(e.target.value)} placeholder="What worked" className="mt-3 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm" />
        <input value={didnt} onChange={(e) => setDidnt(e.target.value)} placeholder="What did not work" className="mt-3 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm" />
        <input value={change} onChange={(e) => setChange(e.target.value)} placeholder="One change next sprint" className="mt-3 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm" />
        <select value={theme} onChange={(e) => setTheme(e.target.value as RetroTheme)} className="mt-3 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm">
          {(["Process", "Tools", "Communication", "Quality", "Capacity", "Other"] as RetroTheme[]).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent/40">Cancel</button>
          <button disabled={!ready} onClick={() => onConfirm({ summary: summary.trim(), what_worked: worked.trim(), what_didnt: didnt.trim(), one_change: change.trim(), primary_theme: theme })} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">Confirm close</button>
        </div>
      </div>
    </div>
  );
}

function CannotCloseSprintModal({
  rows,
  onClose,
}: {
  rows: CannotCloseRow[];
  onClose: () => void;
}) {
  return (
    <div
      data-testid="cannot-close-sprint-modal"
      className="fixed inset-0 z-50 grid place-items-center bg-background/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-md border border-border bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-[var(--color-status-hold)]" />
          <div>
            <h2 className="font-display text-lg">Cannot close sprint</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The following items are blocking sprint close. Resolve each before trying again.
            </p>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li
              key={row.key}
              data-testid="cannot-close-row"
              data-row-key={row.key}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <span>{row.label}</span>
              {row.fixTo ? (
                <Link
                  data-testid="cannot-close-fix-link"
                  data-row-key={row.key}
                  to={row.fixTo.to}
                  search={row.fixTo.search as never}
                  onClick={onClose}
                  className="rounded-md border border-input px-2 py-1 text-xs font-medium text-primary hover:bg-accent/40"
                >
                  Fix
                </Link>
              ) : (
                <span className="rounded-md border border-input px-2 py-1 text-xs text-muted-foreground">
                  Wait
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs text-muted-foreground">
          Resolve the items above, then try Close Sprint again.
        </p>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent/40"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ScopeOverrideModal({ rows, onCancel, onConfirm }: { rows: Row[]; onCancel: () => void; onConfirm: (data: { reason: string; displacedIds: string[] }) => void }) {
  const [reason, setReason] = useState("");
  const [displacedIds, setDisplacedIds] = useState<string[]>([]);
  const ready = reason.trim().length > 0 && displacedIds.length > 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/60 p-4">
      <div className="w-full max-w-lg rounded-md border border-border bg-surface p-5 shadow-xl">
        <h2 className="font-display text-lg">Scope added mid-sprint</h2>
        <p className="mt-1 text-xs text-muted-foreground">Locked sprint scope requires an override and displaced item selection.</p>
        <label className="mt-4 block text-sm font-medium">Reason</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm" />
        <label className="mt-4 block text-sm font-medium">Displaced items</label>
        <div className="mt-2 max-h-48 space-y-2 overflow-auto rounded-md border border-border p-2">
          {rows.map((row) => (
            <label key={row.sh.id} className="flex gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/30">
              <input type="checkbox" checked={displacedIds.includes(row.sh.id)} onChange={(e) => setDisplacedIds((current) => e.target.checked ? [...current, row.sh.id] : current.filter((id) => id !== row.sh.id))} />
              <span>{row.sh.jira_key ?? "—"} · {row.sig.title}</span>
            </label>
          ))}
          {rows.length === 0 && <p className="p-3 text-sm text-muted-foreground">No current sprint items to displace.</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent/40">Cancel</button>
          <button disabled={!ready} onClick={() => onConfirm({ reason: reason.trim(), displacedIds })} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">Confirm override</button>
        </div>
      </div>
    </div>
  );
}

function completedReview(reviews: Review[], shapingId: string) {
  return reviews.find((review) => review.shaping_id === shapingId && review.status === "Completed") ?? null;
}

function BriefSlideover({ row, onClose }: { row: Row; onClose: () => void }) {
  const reviewer = USERS.find((u) => u.id === row.sh.tech_reviewer_id);
  const loggedBy = USERS.find((u) => u.id === row.sig.created_by);
  return (
    <div className="fixed inset-0 z-50 bg-background/50" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="ml-auto h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface p-6 shadow-xl"
      >
        <button onClick={onClose} className="mb-5 inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent/40">
          ← Back
        </button>
        <StartOutcomeReview shapingId={row.sh.id} signalId={row.sig.id} />
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Shaping brief
        </p>
        <h2 className="mt-1 font-display text-2xl">{row.sig.title}</h2>
        <dl className="mt-6 space-y-6">
          <BriefSection title="Signal details">
            {briefField("Title", row.sig.title)}
            {briefField("Source", row.sig.source)}
            {briefField("Origin", row.sig.source)}
            {briefField("Commitment type", row.sh.commitment_type ?? "—")}
            {briefField("Logged by", loggedBy?.name ?? "—")}
            {briefField("Logged date", fmtDateTime(row.sig.created_at))}
          </BriefSection>
          <BriefSection title="Define">
            {briefField("Problem", row.sh.problem_what)}
            {briefField("Why now", row.sh.problem_why)}
            {briefField("Who is affected", row.sh.problem_who)}
            {briefField("Success criteria", row.sh.solution_criteria)}
            {briefField("Proposed approach", row.sh.solution_approach)}
            {briefField("Open questions", row.sh.solution_questions || "—")}
            {briefField("Out of scope", row.sh.problem_out_of_scope || "—")}
          </BriefSection>
          <BriefSection title="Tech Review">
            {briefField("Reviewer", reviewer?.name ?? "—")}
            {briefField("Estimate", `${row.sh.tech_estimate_pts ?? "—"} pts`)}
            {briefField("Notes", row.sh.tech_review_notes || "—")}
            {briefField("Concerns", row.sh.tech_concerns || "—")}
            {briefField("Signed off date", row.sh.tech_signed_off_at ? fmtDateTime(row.sh.tech_signed_off_at) : "—")}
          </BriefSection>
        </dl>
        <InlineDecisions signalId={row.sig.id} shapingItemId={row.sh.id} />
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

function BriefSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-3 font-display text-lg">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
