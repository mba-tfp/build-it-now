import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Eye, GripVertical, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { USERS, capacityState, daysSince, sprintItemCapacity, usableCapacity, useTfpStore } from "@/lib/tfp/store";
import { fmtDateTime } from "@/lib/tfp/format";
import type { DeliveryStatus, GoLiveChecklist, OutcomeRating, RetroTheme, Review, ShapingItem, Signal, User } from "@/lib/tfp/types";
import { cn } from "@/lib/utils";
import { InlineDecisions } from "@/components/tfp/InlineDecisions";
import { TierBadge } from "@/components/tfp/Badge";
import { StartOutcomeReview } from "@/components/tfp/StartOutcomeReview";
import { CapacityMeter } from "@/components/tfp/CapacityMeter";
import { PipelineHeader } from "@/components/tfp/PipelineHeader";
import { EmptyZone } from "@/components/tfp/EmptyZone";
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
  goLives,
}: {
  sprintEnded: boolean;
  sprintRows: Row[];
  reviews: Review[];
  usable: number;
  allocatedPts: number;
  goLives?: GoLiveChecklist[];
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
  if (goLives && goLives.length > 0) {
    const missing = complianceMissingRows(goLives);
    if (missing.length > 0) {
      rows.push({
        key: "compliance-missing",
        label: `${missing.length} Procrea QC item${missing.length === 1 ? "" : "s"} have compliance notes missing`,
        fixTo: { to: "/clinics", search: {} },
      });
    }
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

/**
 * Window (ms) during which the carry-forward toast offers Undo.
 * Exposed for self-test.
 */
export const CARRY_FORWARD_UNDO_WINDOW_MS = 6000;

type CarryForwardArgs = {
  rows: Row[];
  sprintName: string;
  updateShaping: (id: string, patch: Partial<ShapingItem>) => void;
};

/**
 * Apply carry-forward to one or more sprint items and surface a sonner toast
 * with an inline Undo link. Manual dismissal of the first toast suppresses
 * the follow-up "Carry forward undone." toast.
 */
export function carryForwardWithUndo({ rows, sprintName, updateShaping }: CarryForwardArgs) {
  if (rows.length === 0) return;
  const ts = new Date().toISOString();
  const userId = useTfpStore.getState().currentUserId;
  const snapshot = rows.map((r) => ({
    id: r.sh.id,
    carry_forwarded_at: r.sh.carry_forwarded_at,
    carry_forwarded_by: r.sh.carry_forwarded_by,
  }));
  rows.forEach((r) => updateShaping(r.sh.id, { carry_forwarded_at: ts, carry_forwarded_by: userId }));

  const n = rows.length;
  const message = `Carried ${n} item${n === 1 ? "" : "s"} to ${sprintName}.`;
  toast(message, {
    duration: CARRY_FORWARD_UNDO_WINDOW_MS,
    closeButton: true,
    action: {
      label: "Undo",
      onClick: () => {
        snapshot.forEach((s) =>
          updateShaping(s.id, {
            carry_forwarded_at: s.carry_forwarded_at,
            carry_forwarded_by: s.carry_forwarded_by,
          }),
        );
        toast("Carry forward undone.", { duration: 3000 });
      },
    },
  });
}

/** How long the "New signal logged" toast stays visible. */
export const FOLLOW_ON_TOAST_DURATION_MS = 5000;

/**
 * Pre-populate and create a follow-on signal from any source item, then surface
 * a sonner toast with a "View signal →" deep link.
 */
export function logFollowOnSignalWithToast(args: {
  sourceTitle: string;
  parentSignalId: string;
  product: import("@/lib/tfp/types").Product;
  reviewId?: string;
}): import("@/lib/tfp/types").Signal {
  const store = useTfpStore.getState();
  const newTitle = `Follow-up: ${args.sourceTitle}`;
  let signal: import("@/lib/tfp/types").Signal;
  if (args.reviewId) {
    signal = store.logFollowOnSignal(args.reviewId, {
      title: newTitle,
      description: newTitle,
      source: "Internal",
      product: args.product,
    });
  } else {
    signal = store.createSignal({
      title: newTitle,
      description: newTitle,
      source: "Internal",
      product: args.product,
      displacement_flag: false,
      displacement_note: null,
    });
    useTfpStore.setState((s) => ({
      signals: s.signals.map((sg) =>
        sg.id === signal.id ? { ...sg, parent_signal_id: args.parentSignalId } : sg,
      ),
    }));
  }
  const href = `/inbox?tab=triage&signal=${encodeURIComponent(signal.id)}`;
  toast("New signal logged.", {
    duration: FOLLOW_ON_TOAST_DURATION_MS,
    description: (
      <a
        data-testid="follow-on-toast-link"
        data-signal-id={signal.id}
        href={href}
        className="text-primary hover:underline"
      >
        View signal →
      </a>
    ),
  });
  return signal;
}

function DeliveryPage() {
  const { tab, openItem } = Route.useSearch();
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const sprint = useTfpStore((s) => s.sprint);
  const reviews = useTfpStore((s) => s.reviews);
  const users = useTfpStore((s) => s.users);
  const goLives = useTfpStore((s) => s.goLives);
  const syncFromJira = useTfpStore((s) => s.syncFromJira);
  const pushToJira = useTfpStore((s) => s.pushToJira);
  const addToSprint = useTfpStore((s) => s.addToSprint);
  const updateShaping = useTfpStore((s) => s.updateShaping);
  const startReview = useTfpStore((s) => s.startReview);
  const closeSprint = useTfpStore((s) => s.closeSprint);

  const [briefFor, setBriefFor] = useState<Row | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [cannotCloseOpen, setCannotCloseOpen] = useState(false);
  const [parkFor, setParkFor] = useState<Row | null>(null);
  const [overrideFor, setOverrideFor] = useState<Row | null>(null);

  // Auto-sync from Jira once per page load.
  useEffect(() => {
    syncFromJira();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allRows = useMemo<Row[]>(
    () =>
      shaping
        .map((sh) => ({ sh, sig: signals.find((sig) => sig.id === sh.signal_id) }))
        .filter((r): r is Row => !!r.sig),
    [shaping, signals],
  );

  const readyRows = allRows.filter(
    ({ sh }) =>
      sh.shaping_status === "Ready for Sprint" &&
      !sh.jira_key &&
      sh.roadmap_bucket !== "Not Now",
  );
  const parkedRows = allRows.filter(
    ({ sh }) => sh.shaping_status === "Ready for Sprint" && !sh.jira_key && sh.roadmap_bucket === "Not Now",
  );
  const inFlightRows = allRows.filter(
    ({ sh }) => sh.in_sprint || !!sh.jira_key || !!sh.delivery_status,
  );

  const sprintRows = inFlightRows;
  const usable = usableCapacity(sprint);
  const sprintEnded = new Date(sprint.end_date).getTime() < Date.now();
  const unresolvedCount = sprintRows.filter(({ sh }) => sh.delivery_status !== "Done" && !sh.carry_forwarded_at).length;
  const missingReviewCount = sprintRows.filter(({ sh }) => sh.delivery_status === "Done" && !completedReview(reviews, sh.id)).length;
  const closeBlocker = !sprintEnded ? "Sprint end date has not passed" : missingReviewCount > 0 ? `${missingReviewCount} items need outcome reviews` : unresolvedCount > 0 ? `${unresolvedCount} items not yet resolved` : "";

  const blockerRows = useMemo<CannotCloseRow[]>(
    () => computeCannotCloseRows({ sprintEnded, sprintRows, reviews, usable, allocatedPts: sprint.allocated_pts, goLives }),
    [sprintEnded, sprintRows, reviews, usable, sprint.allocated_pts, goLives],
  );
  const hasBlockers = blockerRows.length > 0 || !!closeBlocker;

  function handleCloseSprintClick() {
    if (!hasBlockers) setCloseOpen(true);
    else setCannotCloseOpen(true);
  }

  // Auto-open brief slideover for ?openItem=
  useEffect(() => {
    if (!openItem) return;
    const row = allRows.find((r) => r.sh.id === openItem);
    if (row) setBriefFor(row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItem, shaping, signals]);

  if (tab) return <Navigate to="/delivery" search={openItem ? { openItem } : {}} replace />;

  function commitToCurrentSprint(row: Row) {
    const key = pushToJira(row.sh.id);
    addToSprint(row.sh.id);
    updateShaping(row.sh.id, { sprint_target: 1 });
    toast.success(`${key ?? "Item"} committed to ${sprint.name}.`);
  }

  function handleSprintPick(row: Row, target: 1 | 2 | 3) {
    if (target === 1) {
      if (sprint.scope_locked_at) {
        setOverrideFor(row);
        return;
      }
      commitToCurrentSprint(row);
      return;
    }
    updateShaping(row.sh.id, { roadmap_bucket: "Committed", sprint_target: target });
    toast.success(`Committed to ${target === 2 ? "next sprint" : "Sprint +2"}.`);
  }

  function handlePark(row: Row, reason: string) {
    const note = `[Parked: ${reason}]`;
    const existing = row.sh.solution_questions ?? "";
    updateShaping(row.sh.id, {
      roadmap_bucket: "Not Now",
      park_reason: reason,
      solution_questions: existing.includes(note) ? existing : `${note}\n${existing}`.trim(),
    });
    toast.success("Item parked.");
    setParkFor(null);
  }

  function handleUnpark(row: Row) {
    updateShaping(row.sh.id, { roadmap_bucket: null, park_reason: null });
    toast.success("Item un-parked.");
  }

  function ensureReview(shapingId: string) {
    return reviews.find((review) => review.shaping_id === shapingId) ?? startReview(shapingId);
  }

  return (
    <div>
      <PipelineHeader activeStage="delivery" />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Delivery</p>
          <h1 className="mt-1 font-display text-3xl">Shaped Item Tracker</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Auto-syncing from Jira on load. Jira is the source of truth for delivery status; this view tracks commitment decisions and outcome reviews.
          </p>
        </div>
        <button
          data-testid="close-sprint-button"
          title={closeBlocker || "Ready to close sprint"}
          onClick={handleCloseSprintClick}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Close Sprint
        </button>
      </header>

      <div className="space-y-8">
        <ReadyToCommitSection
          rows={readyRows}
          parkedRows={parkedRows}
          users={users}
          sprintLocked={!!sprint.scope_locked_at}
          onPick={handleSprintPick}
          onPark={(row) => setParkFor(row)}
          onUnpark={handleUnpark}
          onViewBrief={setBriefFor}
        />

        <InFlightSection
          rows={inFlightRows}
          reviews={reviews}
          users={users}
          updateShaping={updateShaping}
          ensureReview={ensureReview}
          onViewBrief={setBriefFor}
        />
      </div>

      {briefFor && <BriefSlideover row={briefFor} onClose={() => setBriefFor(null)} />}
      {parkFor && (
        <ParkReasonModal
          row={parkFor}
          onCancel={() => setParkFor(null)}
          onConfirm={(reason) => handlePark(parkFor, reason)}
        />
      )}
      {overrideFor && (
        <ScopeOverrideModal
          rows={sprintRows}
          onCancel={() => setOverrideFor(null)}
          onConfirm={(data) => {
            const r = overrideFor;
            const key = pushToJira(r.sh.id);
            addToSprint(r.sh.id, data.reason, "Scope added mid-sprint", data.displacedIds);
            updateShaping(r.sh.id, { sprint_target: 1 });
            toast.success(`${key ?? "Item"} added to locked sprint with override.`);
            setOverrideFor(null);
          }}
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
      {cannotCloseOpen && (
        <CannotCloseSprintModal rows={blockerRows} onClose={() => setCannotCloseOpen(false)} />
      )}
    </div>
  );
}

// ============== Ready to Commit ==============

function ReadyToCommitSection({
  rows,
  parkedRows,
  users,
  sprintLocked,
  onPick,
  onPark,
  onUnpark,
  onViewBrief,
}: {
  rows: Row[];
  parkedRows: Row[];
  users: User[];
  sprintLocked: boolean;
  onPick: (row: Row, target: 1 | 2 | 3) => void;
  onPark: (row: Row) => void;
  onUnpark: (row: Row) => void;
  onViewBrief: (row: Row) => void;
}) {
  const [parkedOpen, setParkedOpen] = useState(false);
  return (
    <section data-testid="section-ready-to-commit" className="rounded-md border border-border bg-surface/40">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg">Ready to Commit</h2>
          <span data-testid="ready-count" className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-muted-foreground">
            {rows.length}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">Shaped, tech-signed-off, not yet committed.</p>
      </header>
      <div className="space-y-3 p-4">
        {rows.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No items are waiting for a commit decision. When shaping and tech review are complete, items appear here.
          </p>
        )}
        {rows.map((row) => (
          <ReadyCard
            key={row.sh.id}
            row={row}
            users={users}
            sprintLocked={sprintLocked}
            onPick={onPick}
            onPark={onPark}
            onViewBrief={onViewBrief}
          />
        ))}
      </div>
      {parkedRows.length > 0 && (
        <div className="border-t border-border">
          <button
            type="button"
            data-testid="parked-toggle"
            onClick={() => setParkedOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2 text-left text-xs uppercase tracking-wider text-muted-foreground hover:bg-accent/20"
            aria-expanded={parkedOpen}
          >
            <span className="flex items-center gap-2">
              {parkedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Parked ({parkedRows.length})
            </span>
          </button>
          {parkedOpen && (
            <ul className="space-y-2 px-4 pb-3">
              {parkedRows.map((row) => {
                const days = daysSince(row.sh.updated_at);
                return (
                  <li key={row.sh.id} data-testid={`parked-row-${row.sh.id}`} className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.sig.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.sh.park_reason ? `Reason: ${row.sh.park_reason}` : "No reason recorded."} · {days}d parked
                      </p>
                    </div>
                    <button
                      onClick={() => onUnpark(row)}
                      className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent/40"
                    >
                      Unpark
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function ReadyCard({
  row,
  users,
  sprintLocked,
  onPick,
  onPark,
  onViewBrief,
}: {
  row: Row;
  users: User[];
  sprintLocked: boolean;
  onPick: (row: Row, target: 1 | 2 | 3) => void;
  onPark: (row: Row) => void;
  onViewBrief: (row: Row) => void;
}) {
  const reviewer = users.find((u) => u.id === row.sh.tech_reviewer_id);
  const daysSinceSignoff = row.sh.tech_signed_off_at ? daysSince(row.sh.tech_signed_off_at) : null;
  return (
    <article
      data-testid={`ready-card-${row.sh.id}`}
      className="grid gap-4 rounded-md border border-border bg-surface p-4 text-sm md:grid-cols-[1.1fr_1.2fr_0.9fr]"
    >
      <div>
        <h3 className="font-medium leading-snug">{row.sig.title}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <TierBadge tier={row.sig.tier} />
          {row.sh.commitment_type && (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-medium text-muted-foreground">
              {row.sh.commitment_type}
            </span>
          )}
          <span className="rounded-full border border-border bg-surface px-2 py-0.5">
            {row.sig.product}
          </span>
        </div>
        <button
          onClick={() => onViewBrief(row)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Eye className="h-3.5 w-3.5" /> View brief →
        </button>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Commit decision</p>
        <div role="group" aria-label="Sprint target" className="mt-2 inline-flex flex-wrap gap-1 rounded-md border border-border p-1">
          <button
            data-testid={`commit-${row.sh.id}-sprint-1`}
            disabled={sprintLocked}
            title={sprintLocked ? "Current sprint is locked — use override flow" : "Commit to current sprint"}
            onClick={() => onPick(row, 1)}
            className="rounded px-2 py-1 text-xs font-medium hover:bg-accent/40 disabled:opacity-40"
          >
            Sprint 1
          </button>
          <button
            data-testid={`commit-${row.sh.id}-sprint-2`}
            onClick={() => onPick(row, 2)}
            className="rounded px-2 py-1 text-xs font-medium hover:bg-accent/40"
          >
            Sprint 2
          </button>
          <button
            data-testid={`commit-${row.sh.id}-sprint-3`}
            onClick={() => onPick(row, 3)}
            className="rounded px-2 py-1 text-xs font-medium hover:bg-accent/40"
          >
            Sprint +2
          </button>
          <button
            data-testid={`commit-${row.sh.id}-park`}
            onClick={() => onPark(row)}
            className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent/40"
          >
            Park
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Sprint 1 pushes to Jira immediately. Sprint 2 / +2 stores intent without pushing.
        </p>
      </div>

      <div className="text-xs text-muted-foreground">
        <p>
          <span className="text-foreground font-medium">{row.sh.tech_estimate_pts ?? "—"} pts</span>
        </p>
        <p className="mt-1">Reviewer: {reviewer?.name ?? "—"}</p>
        <p className="mt-1">
          {daysSinceSignoff !== null ? `${daysSinceSignoff}d since tech sign-off` : "Tech sign-off pending"}
        </p>
      </div>
    </article>
  );
}

function ParkReasonModal({
  row,
  onCancel,
  onConfirm,
}: {
  row: Row;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const ready = reason.trim().length >= 10;
  return (
    <div data-testid="park-reason-modal" className="fixed inset-0 z-50 grid place-items-center bg-background/60 p-4">
      <div className="w-full max-w-md rounded-md border border-border bg-surface p-5 shadow-xl">
        <h2 className="font-display text-lg">Park item</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Parking <span className="font-medium text-foreground">{row.sig.title}</span>. Add a short reason (min. 10 characters) so it can be revisited later.
        </p>
        <textarea
          data-testid="park-reason-input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Why are we parking this?"
          className="mt-4 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent/40">
            Cancel
          </button>
          <button
            data-testid="park-reason-confirm"
            disabled={!ready}
            onClick={() => onConfirm(reason.trim())}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            Confirm park
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== In Flight ==============

const FLIGHT_GROUP_ORDER: DeliveryStatus[] = ["Blocked", "In Progress", "In QA", "To Do", "Done"];

function InFlightSection({
  rows,
  reviews,
  users,
  updateShaping,
  ensureReview,
  onViewBrief,
}: {
  rows: Row[];
  reviews: Review[];
  users: User[];
  updateShaping: (id: string, patch: Partial<ShapingItem>) => void;
  ensureReview: (id: string) => Review | null;
  onViewBrief: (row: Row) => void;
}) {
  return (
    <section data-testid="section-in-flight" className="rounded-md border border-border bg-surface/40">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg">In Flight</h2>
          <span data-testid="in-flight-count" className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-muted-foreground">
            {rows.length}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">Committed items, tracked to outcome.</p>
      </header>
      <div className="space-y-5 p-4">
        {rows.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No items are committed yet. Use the Ready to Commit section above to start.
          </p>
        )}
        {FLIGHT_GROUP_ORDER.map((status) => {
          const group = rows.filter((r) => (r.sh.delivery_status ?? "To Do") === status);
          if (group.length === 0) return null;
          return (
            <div key={status} data-testid={`flight-group-${status.replace(/\s+/g, "-")}`}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {status} <span className="text-muted-foreground/70">({group.length})</span>
              </h3>
              <div className="space-y-2">
                {group.map((row) => (
                  <FlightCard
                    key={row.sh.id}
                    row={row}
                    review={completedReview(reviews, row.sh.id)}
                    users={users}
                    updateShaping={updateShaping}
                    ensureReview={ensureReview}
                    onViewBrief={onViewBrief}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FlightCard({
  row,
  review,
  users,
  updateShaping,
  ensureReview,
  onViewBrief,
}: {
  row: Row;
  review: Review | null;
  users: User[];
  updateShaping: (id: string, patch: Partial<ShapingItem>) => void;
  ensureReview: (id: string) => Review | null;
  onViewBrief: (row: Row) => void;
}) {
  const status = (row.sh.delivery_status ?? "To Do") as DeliveryStatus;
  const assignee = users.find((u) => u.id === row.sh.delivery_assignee_id);
  const days = daysSince(row.sh.updated_at);
  const stale = hoursSince(row.sh.updated_at) >= sprintStaleHoursForTier(row.sig.tier);
  const isBlocked = status === "Blocked";
  const isDonePendingReview = status === "Done" && !review;
  const borderClass = isBlocked
    ? "border-l-4 border-l-destructive"
    : isDonePendingReview
      ? "border-l-4 border-l-[var(--color-status-hold)]"
      : "";
  const jiraHref = row.sh.jira_key
    ? `https://thefertilitypartners.atlassian.net/browse/${row.sh.jira_key}`
    : null;

  // Next action chooser
  let nextAction: ReactNode = <span className="text-muted-foreground">On track</span>;
  if (isBlocked) {
    const owner = assignee?.name ?? "Owner TBD";
    nextAction = (
      <span className="text-destructive">Unblock: {owner} to resolve</span>
    );
  } else if (status === "Done" && !review) {
    nextAction = (
      <button
        data-testid={`flight-next-review-${row.sh.id}`}
        onClick={() => ensureReview(row.sh.id)}
        className="text-primary hover:underline"
      >
        Outcome review needed →
      </button>
    );
  } else if (status === "Done" && review) {
    nextAction = <span className="text-muted-foreground">Complete ✓</span>;
  } else if (stale) {
    nextAction = (
      <span className="text-[var(--color-status-hold)]">
        No update in {days}d — check with {assignee?.name ?? "assignee"}
      </span>
    );
  } else if (row.sh.carry_forwarded_at) {
    nextAction = <span className="text-muted-foreground">Carried forward from previous sprint</span>;
  }

  return (
    <article
      data-testid={`flight-card-${row.sh.id}`}
      data-status={status}
      className={cn("grid gap-4 rounded-md border border-border bg-surface p-3 text-sm md:grid-cols-[1.1fr_1.1fr_1fr]", borderClass)}
    >
      <div>
        {jiraHref ? (
          <a
            href={jiraHref}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-primary hover:underline"
          >
            {row.sh.jira_key}
          </a>
        ) : (
          <span className="font-mono text-xs text-muted-foreground">No Jira key</span>
        )}
        <h3 className="mt-1 font-medium leading-snug">{row.sig.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {row.sh.commitment_type && (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-medium text-muted-foreground">
              {row.sh.commitment_type}
            </span>
          )}
          <span className="rounded-full border border-border bg-surface px-2 py-0.5">
            {row.sig.product}
          </span>
        </div>
        <button
          onClick={() => onViewBrief(row)}
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Eye className="h-3.5 w-3.5" /> View brief →
        </button>
      </div>

      <div className="text-xs">
        <FlightStatusControl row={row} updateShaping={updateShaping} ensureReview={ensureReview} />
        <p className="mt-2 text-muted-foreground">
          Assignee: <span className="text-foreground">{assignee?.name ?? "Unassigned"}</span>
        </p>
        <p className="mt-1 text-muted-foreground">
          {days}d in {status}
          {stale && (
            <span className="ml-2 rounded-full bg-[var(--color-status-hold)]/15 px-2 py-0.5 font-medium text-[var(--color-status-hold)]">
              stale
            </span>
          )}
        </p>
        {isBlocked && (
          <p className="mt-2 text-destructive">
            {(row.sh.blocker_description ?? "").slice(0, 60) || "No blocker description."}
            {row.sh.blocked_since && ` · ${daysSince(row.sh.blocked_since)}d blocked`}
          </p>
        )}
      </div>

      <div className="text-xs">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">What's next</p>
        <p data-testid={`flight-next-${row.sh.id}`} className="mt-1">{nextAction}</p>
      </div>
    </article>
  );
}

function FlightStatusControl({
  row,
  updateShaping,
  ensureReview,
}: {
  row: Row;
  updateShaping: (id: string, patch: Partial<ShapingItem>) => void;
  ensureReview: (id: string) => Review | null;
}) {
  const [open, setOpen] = useState(false);
  const status = (row.sh.delivery_status ?? "To Do") as DeliveryStatus;
  const tone =
    status === "Blocked"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : status === "Done"
        ? "border-[var(--color-status-proceed)]/30 bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]"
        : status === "In Progress"
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-muted text-muted-foreground";
  return (
    <span className="relative inline-block">
      <button
        type="button"
        data-testid={`flight-status-${row.sh.id}`}
        onClick={() => setOpen((v) => !v)}
        className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", tone)}
      >
        {status}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 min-w-[8rem] rounded-md border border-border bg-surface p-1 shadow-md">
          {(["To Do", "In Progress", "In QA", "Blocked", "Done"] as DeliveryStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setOpen(false);
                if (s === status) return;
                updateShaping(row.sh.id, { delivery_status: s });
                if (s === "Done") ensureReview(row.sh.id);
              }}
              className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent/40"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function SprintAtCapacityModal({
  predictedCount,
  capacity,
  onCancel,
  onConfirm,
}: {
  predictedCount: number;
  capacity: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      data-testid="sprint-at-capacity-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-md border border-border bg-surface p-5 shadow-lg">
        <h2 className="font-display text-lg">Sprint at capacity</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Adding this item puts the sprint at <span className="font-medium text-foreground">{predictedCount}</span> items,
          over the <span className="font-medium text-foreground">{capacity}</span>-item capacity. Proceed?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            data-testid="sprint-at-capacity-cancel"
            onClick={onCancel}
            className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm hover:bg-accent/40"
          >
            Cancel
          </button>
          <button
            data-testid="sprint-at-capacity-confirm"
            onClick={onConfirm}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add anyway
          </button>
        </div>
      </div>
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
                data-testid={`backlog-row-${row.sh.id}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", row.sh.id);
                  event.dataTransfer.setData("application/x-tfp-from-backlog", "1");
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  if (onMove && event.dataTransfer.types.includes("application/x-tfp-from-backlog")) {
                    event.preventDefault();
                  }
                }}
                onDrop={(event) => {
                  if (!onMove) return;
                  if (!event.dataTransfer.types.includes("application/x-tfp-from-backlog")) return;
                  onMove(event.dataTransfer.getData("text/plain"), row.sh.id);
                }}
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
              <td colSpan={action ? 8 : 7} className="px-3 py-6">
                <EmptyZone variant="backlog" />
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
  itemCap: import("@/lib/tfp/types").CapacityState;
}) {
  const usedPct = props.usable > 0 ? (props.usedPoints / props.usable) * 100 : 0;
  const canConfirm = props.planningRows.length > 0 && props.sprintGoal.trim().length > 0;
  const updateSprintItemCapacity = useTfpStore((s) => s.updateSprintItemCapacity);
  const [capDraft, setCapDraft] = useState(String(props.itemCap.capacity));
  useEffect(() => {
    setCapDraft(String(props.itemCap.capacity));
  }, [props.itemCap.capacity]);
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
  const [overBacklog, setOverBacklog] = useState(false);
  const [overPlanning, setOverPlanning] = useState(false);
  return (
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <section
        data-testid="planning-backlog-dropzone"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/x-tfp-from-planning")) {
            e.preventDefault();
            setOverBacklog(true);
          }
        }}
        onDragLeave={() => setOverBacklog(false)}
        onDrop={(e) => {
          setOverBacklog(false);
          if (e.dataTransfer.types.includes("application/x-tfp-from-planning")) {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain");
            if (id) props.onRemove(id);
          }
        }}
        className={cn(
          "rounded-md border bg-surface/50 transition-colors",
          overBacklog ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <div className="border-b border-border p-4">
          <h2 className="font-display text-lg">Prioritized backlog</h2>
        </div>
        <BacklogTable
          rows={props.backlogRows}
          onRowClick={(row) => props.onPick(row.sh.id)}
          action={undefined}
        />
        <div className="border-t border-border p-3 text-xs text-muted-foreground">
          Click a row to move it into sprint planning, or drag a planning item back here to remove it. Jira tickets are created only when the sprint is confirmed.
        </div>
      </section>

      <section
        data-testid="planning-active-dropzone"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/x-tfp-from-backlog")) {
            e.preventDefault();
            setOverPlanning(true);
          }
        }}
        onDragLeave={() => setOverPlanning(false)}
        onDrop={(e) => {
          setOverPlanning(false);
          if (!e.dataTransfer.types.includes("application/x-tfp-from-backlog")) return;
          e.preventDefault();
          const id = e.dataTransfer.getData("text/plain");
          if (id) props.onPick(id);
        }}
        className={cn(
          "rounded-md border bg-surface p-4 transition-colors",
          overPlanning ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <div
          data-testid="sprint-planning-header"
          data-capacity-color={props.itemCap.color}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <h2 className="font-display text-lg">Active Sprint</h2>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Item capacity
            <input
              data-testid="sprint-item-capacity-input"
              type="number"
              min={1}
              value={capDraft}
              onChange={(e) => setCapDraft(e.target.value)}
              onBlur={() => {
                const next = Math.max(1, parseInt(capDraft, 10) || 0);
                if (next !== props.itemCap.capacity) updateSprintItemCapacity(next);
                setCapDraft(String(next));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="w-16 rounded-md border border-input bg-surface px-2 py-1 text-right text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
        <CapacityMeter
          used={props.itemCap.used}
          capacity={props.itemCap.capacity}
          pct={props.itemCap.pct}
          color={props.itemCap.color}
          className="mt-3"
        />
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
              data-testid={`planning-row-${row.sh.id}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", row.sh.id);
                e.dataTransfer.setData("application/x-tfp-from-planning", "1");
                e.dataTransfer.effectAllowed = "move";
              }}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 p-3 text-sm cursor-grab active:cursor-grabbing"
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
  const updateShaping = useTfpStore((s) => s.updateShaping);
  const [overColumn, setOverColumn] = useState<string | null>(null);
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
          const isOver = overColumn === status;
          return (
            <section
              key={status}
              data-testid={`board-column-${status.replace(/\s+/g, "-")}`}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes("application/x-tfp-board-card")) return;
                e.preventDefault();
                setOverColumn(status);
              }}
              onDragLeave={() => setOverColumn((c) => (c === status ? null : c))}
              onDrop={(e) => {
                setOverColumn(null);
                if (!e.dataTransfer.types.includes("application/x-tfp-board-card")) return;
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                const item = useTfpStore.getState().shaping.find((x) => x.id === id);
                if (!item || item.delivery_status === status) return;
                updateShaping(id, { delivery_status: status });
              }}
              className={cn(
                "rounded-md border p-3 transition-colors",
                isOver ? "border-primary bg-primary/10" : "border-border bg-muted/20",
              )}
            >
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

export function BoardCard({
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
  const [statusOpen, setStatusOpen] = useState(false);
  const updateShaping = useTfpStore((s) => s.updateShaping);
  const decisionCount = useTfpStore(
    (s) => s.decisions.filter((d) => d.linked_shaping_id === row.sh.id).length,
  );
  const problemPreview = (row.sh.problem_what ?? "").trim();
  const problemText = problemPreview
    ? problemPreview.length > 80
      ? `${problemPreview.slice(0, 80)}…`
      : problemPreview
    : "No problem statement recorded.";
  function handleStatusChange(next: DeliveryStatus) {
    setStatusOpen(false);
    if (next === row.sh.delivery_status) return;
    updateShaping(row.sh.id, { delivery_status: next });
    if (next === "Done") {
      onEnsureReview();
      setReviewOpen(true);
    }
  }
  return (
    <article
      data-testid={`board-card-${row.sh.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", row.sh.id);
        e.dataTransfer.setData("application/x-tfp-board-card", "1");
        e.dataTransfer.effectAllowed = "move";
      }}
      className="rounded-md border border-border bg-surface p-3 text-sm shadow-sm cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="font-mono">{row.sh.jira_key}</span>
        <span>{row.sh.tech_estimate_pts ?? "—"} pts</span>
      </div>
      <div
        data-testid={`board-card-meta-${row.sh.id}`}
        className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground"
      >
        <TierBadge tier={row.sig.tier} />
        <span data-testid={`board-card-product-${row.sh.id}`}>{row.sig.product}</span>
      </div>
      <h3 className="mt-1 line-clamp-2 font-medium leading-snug">{row.sig.title}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary/10 px-1.5 font-mono text-primary">
          {initials(assignee?.name)}
        </span>
        <span className="relative">
          <button
            type="button"
            data-testid={`board-card-status-${row.sh.id}`}
            onClick={(e) => {
              e.stopPropagation();
              setStatusOpen((v) => !v);
            }}
            className="inline-flex items-center gap-0.5 rounded hover:text-foreground cursor-pointer"
          >
            {row.sh.delivery_status}
            <ChevronDown className="h-3 w-3" />
          </button>
          {statusOpen && (
            <div
              data-testid={`board-card-status-menu-${row.sh.id}`}
              className="absolute left-0 top-full z-10 mt-1 min-w-[7rem] rounded-md border border-border bg-surface p-1 shadow-md"
            >
              {BOARD_COLUMNS.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`board-card-status-option-${row.sh.id}-${s.replace(/\s+/g, "-")}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStatusChange(s);
                  }}
                  className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent/40"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </span>
        <span>{staleDays}d in status</span>
        {isStale && (
          <span className="rounded-full bg-[var(--color-status-hold)]/15 px-2 py-0.5 font-medium text-[var(--color-status-hold)]">
            {staleDays}d stale
          </span>
        )}
        {decisionCount > 0 && (
          <span
            data-testid={`board-card-decisions-${row.sh.id}`}
            className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground"
          >
            {decisionCount} decision{decisionCount === 1 ? "" : "s"}
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
      <div className="mt-2">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Problem</p>
        <p
          data-testid={`board-card-problem-${row.sh.id}`}
          className={cn(
            "mt-0.5 text-xs",
            problemPreview ? "text-foreground/80" : "text-muted-foreground italic",
          )}
        >
          {problemText}
        </p>
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
