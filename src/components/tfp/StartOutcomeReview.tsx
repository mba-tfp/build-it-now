import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { useTfpStore, USERS } from "@/lib/tfp/store";
import { fmtDate } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import type { OutcomeRating } from "@/lib/tfp/types";

const RATING_TONE: Record<OutcomeRating, string> = {
  Met: "bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]",
  "Partially Met": "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]",
  Missed: "bg-destructive/10 text-destructive",
};

const HOURS_NUDGE = 48;
const HOURS_OVERDUE = 168;

function hoursSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

export function StartOutcomeReview({
  shapingId,
}: {
  shapingId: string;
  signalId?: string;
}) {
  const item = useTfpStore((s) => s.shaping.find((x) => x.id === shapingId));
  const review = useTfpStore((s) =>
    s.reviews.find((r) => r.shaping_id === shapingId) ?? null,
  );
  const demoMode = useTfpStore((s) => s.flags.demoModeEnabled);
  const ensureOutcomeReview = useTfpStore((s) => s.ensureOutcomeReview);
  const completeReview = useTfpStore((s) => s.completeReview);

  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<OutcomeRating | null>(null);
  const [worked, setWorked] = useState("");
  const [didnt, setDidnt] = useState("");

  // Don't render anything unless the item is Done.
  if (!item || item.delivery_status !== "Done") return null;

  // Completed → render summary line.
  if (review && review.status === "Completed" && review.outcome_rating) {
    const reviewer = USERS.find((u) => u.id === review.pm_owner_id);
    return (
      <div
        data-testid="outcome-review-summary"
        className="mb-5 flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-status-proceed)]/30 bg-[var(--color-status-proceed)]/5 px-4 py-3 text-sm"
      >
        <CheckCircle2 className="h-4 w-4 text-[var(--color-status-proceed)]" />
        <span>
          Outcome review completed{" "}
          {review.completed_at ? fmtDate(review.completed_at) : fmtDate(review.updated_at)} by{" "}
          {reviewer?.name ?? "—"}:{" "}
        </span>
        <span
          data-testid="outcome-review-rating"
          className={cn("rounded-full px-2 py-0.5 text-xs font-medium", RATING_TONE[review.outcome_rating])}
        >
          {review.outcome_rating}
        </span>
        <Link
          to="/governance"
          search={{ tab: "lookback" }}
          className="ml-auto text-xs text-primary hover:underline"
        >
          View / edit review
        </Link>
      </div>
    );
  }

  // No completed review yet → render the prominent button.
  // "Done since" timestamp: prefer review.created_at (set when item moved to Done),
  // otherwise fall back to the shaping item's updated_at.
  const doneSinceIso = review?.created_at ?? item.updated_at;
  const hrs = hoursSince(doneSinceIso);
  const days = Math.max(0, Math.floor(hrs / 24));
  const showDot = hrs >= HOURS_NUDGE;
  const overdue = hrs >= HOURS_OVERDUE;

  function handleClick() {
    if (demoMode) {
      const r = ensureOutcomeReview(shapingId);
      if (!r) {
        toast.error("Could not start outcome review.");
        return;
      }
      completeReview(r.id, {
        outcome_rating: "Met",
        what_worked: "Auto-completed in demo mode.",
        what_didnt: "Auto-completed in demo mode.",
        notes: "Auto-completed in demo mode.",
      });
      toast.success("Outcome review confirmed (demo mode).");
      return;
    }
    ensureOutcomeReview(shapingId);
    setOpen((o) => !o);
  }

  const ready = !!rating && worked.trim().length > 0 && didnt.trim().length > 0;

  function handleSubmit() {
    if (!ready || !rating) return;
    const r = ensureOutcomeReview(shapingId);
    if (!r) return;
    completeReview(r.id, {
      outcome_rating: rating,
      what_worked: worked.trim(),
      what_didnt: didnt.trim(),
      notes: `${worked.trim()} ${didnt.trim()}`,
    });
    toast.success("Outcome review submitted.");
    setOpen(false);
    setRating(null);
    setWorked("");
    setDidnt("");
  }

  return (
    <div className="mb-5">
      <button
        type="button"
        data-testid="start-outcome-review-button"
        data-overdue-dot={showDot ? "true" : "false"}
        onClick={handleClick}
        className={cn(
          "relative flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90",
        )}
      >
        <ClipboardList className="h-4 w-4" />
        Start outcome review
        {showDot && (
          <span
            data-testid="start-outcome-review-dot"
            aria-label="Overdue indicator"
            className="absolute right-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[var(--color-status-hold)] ring-2 ring-primary-foreground/40"
          />
        )}
      </button>
      {showDot && (
        <p
          data-testid="start-outcome-review-caption"
          className={cn(
            "mt-1.5 text-xs",
            overdue ? "text-destructive font-medium" : "text-muted-foreground",
          )}
        >
          {overdue
            ? "Outcome review overdue. Reviewing now keeps the sprint closeable."
            : `This item has been Done for ${days} day${days === 1 ? "" : "s"}. Review when ready.`}
        </p>
      )}
      {open && !demoMode && (
        <div
          data-testid="start-outcome-review-form"
          className="mt-3 rounded-md border border-border bg-surface-2 p-3"
        >
          <div className="flex flex-wrap gap-2">
            {(["Met", "Partially Met", "Missed"] as OutcomeRating[]).map((option) => (
              <button
                key={option}
                onClick={() => setRating(option)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium",
                  rating === option
                    ? option === "Met"
                      ? "border-[var(--color-status-proceed)] bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]"
                      : option === "Partially Met"
                        ? "border-[var(--color-status-hold)] bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]"
                        : "border-destructive bg-destructive/10 text-destructive"
                    : "border-input hover:bg-accent/40",
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <input
            value={worked}
            onChange={(e) => setWorked(e.target.value)}
            placeholder="What worked"
            className="mt-3 w-full rounded-md border border-input bg-surface px-3 py-2 text-xs"
          />
          <input
            value={didnt}
            onChange={(e) => setDidnt(e.target.value)}
            placeholder="What did not work"
            className="mt-2 w-full rounded-md border border-input bg-surface px-3 py-2 text-xs"
          />
          <button
            disabled={!ready}
            onClick={handleSubmit}
            className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            Submit review
          </button>
        </div>
      )}
    </div>
  );
}
