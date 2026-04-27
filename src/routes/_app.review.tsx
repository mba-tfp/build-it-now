import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { USERS, useTfpStore } from "@/lib/tfp/store";
import type {
  OutcomeRating,
  Product,
  Review,
  ReviewStatus,
  ShapingItem,
  Signal,
  Source,
} from "@/lib/tfp/types";
import { fmtDate, fmtDateTime } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  PlayCircle,
  Plus,
  Sparkles,
} from "lucide-react";
import { SortMenu, useSortMenu } from "@/components/tfp/SortMenu";
import { sortRows } from "@/components/tfp/SortableHeader";
import { ScrollTable } from "@/components/tfp/ScrollTable";

export const Route = createFileRoute("/_app/review")({
  component: () => <Navigate to="/governance" search={{ tab: "lookback" }} />,
});

const SIZE_TONE: Record<Review["size"], string> = {
  Small: "bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]",
  Medium: "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]",
  Large: "bg-[var(--color-tier-p1)]/10 text-[var(--color-tier-p1)]",
};

const STATUS_TONE: Record<ReviewStatus, string> = {
  Pending: "bg-muted text-muted-foreground",
  Scheduled: "bg-[var(--color-status-new)]/10 text-[var(--color-status-new)]",
  Completed: "bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]",
};

const RATING_TONE: Record<OutcomeRating, string> = {
  Met: "bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]",
  "Partially Met": "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]",
  Missed: "bg-destructive/10 text-destructive",
};

export function ReviewsPage() {
  const reviews = useTfpStore((s) => s.reviews);
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const startReview = useTfpStore((s) => s.startReview);
  const [filter, setFilter] = useState<ReviewStatus | "All">("All");
  const [activeId, setActiveId] = useState<string | null>(reviews[0]?.id ?? null);

  // Done items in delivery that don't yet have a review
  const eligible = useMemo(
    () =>
      shaping
        .filter(
          (s) =>
            s.delivery_status === "Done" &&
            !reviews.some((r) => r.shaping_id === s.id),
        )
        .map((s) => ({ sh: s, sig: signals.find((sg) => sg.id === s.signal_id) }))
        .filter((x) => !!x.sig),
    [shaping, signals, reviews],
  );

  type SortKey = "created" | "scheduled" | "status" | "outcome";
  const { sort, setSort } = useSortMenu<SortKey>("reviews", { key: "created", dir: "desc" });

  const filtered = useMemo(() => {
    const base = filter === "All" ? reviews : reviews.filter((r) => r.status === filter);
    return sortRows(base, sort, (r, k) => {
      if (k === "created") return new Date(r.created_at).getTime();
      if (k === "scheduled") return r.scheduled_for ? new Date(r.scheduled_for).getTime() : 0;
      if (k === "status") return r.status;
      if (k === "outcome") return r.outcome_rating ?? "";
      return null;
    });
  }, [reviews, filter, sort]);

  const counts = useMemo(() => {
    const c = { Pending: 0, Scheduled: 0, Completed: 0 } as Record<ReviewStatus, number>;
    reviews.forEach((r) => c[r.status]++);
    return c;
  }, [reviews]);

  const active = reviews.find((r) => r.id === activeId) ?? null;

  function handleStart(shapingId: string) {
    const r = startReview(shapingId);
    if (r) setActiveId(r.id);
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Lookback</p>
          <h1 className="mt-1 font-display text-3xl">Outcome Reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            S/M/L reviews on delivered work — capture what worked, what didn't, and log follow-on
            signals back into Inbox.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <KpiPill label="Pending" value={counts.Pending} icon={<CircleDashed className="h-3.5 w-3.5" />} />
          <KpiPill label="Scheduled" value={counts.Scheduled} icon={<CalendarClock className="h-3.5 w-3.5" />} />
          <KpiPill label="Completed" value={counts.Completed} icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
        </div>
      </header>

      {eligible.length > 0 && (
        <div className="tfp-card mb-6 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium">{eligible.length} delivered item{eligible.length === 1 ? "" : "s"} without a review</span>
          </div>
          <div className="space-y-1.5">
            {eligible.map(({ sh, sig }) => (
              <div
                key={sh.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{sh.jira_key}</span>
                    <span className="truncate font-medium">{sig!.title}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {sig!.product} · Done · {sh.tech_estimate_pts ?? "—"} pts
                  </div>
                </div>
                <button
                  onClick={() => handleStart(sh.id)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-95"
                >
                  <PlayCircle className="h-3.5 w-3.5" /> Start review
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterPill active={filter === "All"} label={`All (${reviews.length})`} onClick={() => setFilter("All")} />
        {(["Pending", "Scheduled", "Completed"] as ReviewStatus[]).map((s) => (
          <FilterPill
            key={s}
            active={filter === s}
            label={`${s} (${counts[s]})`}
            tone={STATUS_TONE[s]}
            onClick={() => setFilter(s)}
          />
        ))}
        <SortMenu
          className="ml-auto"
          tableId="reviews"
          sort={sort}
          onChange={setSort}
          options={[
            { key: "created", label: "Created" },
            { key: "scheduled", label: "Scheduled" },
            { key: "status", label: "Status" },
            { key: "outcome", label: "Outcome rating" },
          ]}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <ScrollTable className="border border-border bg-surface/40 p-2">
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="tfp-card p-8 text-center text-sm text-muted-foreground">
                No reviews in this view yet.
              </div>
            ) : (
              filtered.map((r) => {
                const sh = shaping.find((s) => s.id === r.shaping_id);
                const sig = signals.find((s) => s.id === r.signal_id);
                const isActive = activeId === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setActiveId(r.id)}
                    className={cn(
                      "tfp-card w-full p-3 text-left transition hover:border-primary/40",
                      isActive && "border-primary ring-1 ring-primary/30",
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", SIZE_TONE[r.size])}>
                        {r.size}
                      </span>
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_TONE[r.status])}>
                        {r.status}
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {sh?.jira_key}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-medium leading-snug">{sig?.title}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {sig?.product} · {r.scheduled_for ? `Scheduled ${fmtDate(r.scheduled_for)}` : `Created ${fmtDate(r.created_at)}`}
                    </p>
                    {r.outcome_rating && (
                      <span className={cn("mt-2 inline-flex rounded px-1.5 py-0.5 text-[10px]", RATING_TONE[r.outcome_rating])}>
                        Outcome · {r.outcome_rating}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </ScrollTable>

        <div>
          {active ? (
            <ReviewDetail review={active} />
          ) : (
            <div className="tfp-card p-12 text-center text-sm text-muted-foreground">
              Select a review to open the retro form.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiPill({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
      {icon}
      <span className="font-mono text-foreground">{value}</span>
      <span>{label}</span>
    </div>
  );
}

function FilterPill({
  active, label, tone, onClick,
}: { active: boolean; label: string; tone?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition",
        active ? "border-primary bg-primary text-primary-foreground" : cn("border-border bg-surface hover:border-primary/40", tone),
      )}
    >
      {label}
    </button>
  );
}

function ReviewDetail({ review }: { review: Review }) {
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const updateReview = useTfpStore((s) => s.updateReview);
  const scheduleReview = useTfpStore((s) => s.scheduleReview);
  const completeReview = useTfpStore((s) => s.completeReview);
  const logFollowOnSignal = useTfpStore((s) => s.logFollowOnSignal);

  const sh = shaping.find((s) => s.id === review.shaping_id);
  const sig = signals.find((s) => s.id === review.signal_id);
  const owner = USERS.find((u) => u.id === review.pm_owner_id);
  const followOnSignals = signals.filter((s) => review.follow_on_signals_created.includes(s.id));

  const isReadOnly = review.status === "Completed";

  return (
    <div className="space-y-4">
      {/* Context card */}
      <div className="tfp-card p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", SIZE_TONE[review.size])}>
            {review.size} review
          </span>
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[review.status])}>
            {review.status}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">{sh?.jira_key}</span>
          <span className="ml-auto text-[11px] text-muted-foreground">PM owner · {owner?.name}</span>
        </div>
        <h2 className="font-display text-xl leading-tight">{sig?.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{sig?.product} · {sh?.tech_estimate_pts ?? "—"} pts · approved {sh?.approved_at ? fmtDate(sh.approved_at) : "—"}</p>

        {sh && (
          <div className="mt-4 grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm md:grid-cols-2">
            <DetailField label="Original problem" value={sh.problem_what} />
            <DetailField label="Success criteria" value={sh.solution_criteria} />
          </div>
        )}
      </div>

      {/* Schedule */}
      {review.status !== "Completed" && (
        <div className="tfp-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Schedule review
              </label>
              <input
                type="date"
                defaultValue={review.scheduled_for ? review.scheduled_for.slice(0, 10) : ""}
                onChange={(e) => {
                  if (e.target.value) {
                    scheduleReview(review.id, new Date(e.target.value).toISOString());
                  }
                }}
                className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {review.scheduled_for && (
              <p className="text-xs text-muted-foreground">
                <CalendarClock className="mr-1 inline h-3 w-3" />
                Scheduled for {fmtDate(review.scheduled_for)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Retro form */}
      <RetroForm
        review={review}
        readOnly={isReadOnly}
        onSave={(d) => updateReview(review.id, d)}
        onComplete={(d) => completeReview(review.id, d)}
      />

      {/* Follow-on signals */}
      <div className="tfp-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h3 className="font-medium">Follow-on signals</h3>
          <span className="text-[11px] text-muted-foreground">
            ({followOnSignals.length} logged)
          </span>
        </div>

        {followOnSignals.length > 0 && (
          <div className="mb-3 space-y-2">
            {followOnSignals.map((s) => (
              <div key={s.id} className="rounded-md border border-border/60 bg-muted/20 p-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">{s.id}</span>
                  <span className="font-medium">{s.title}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{fmtDateTime(s.created_at)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
              </div>
            ))}
          </div>
        )}

        <FollowOnComposer
          review={review}
          defaultSource={(sig?.source as Source) ?? "Internal"}
          defaultProduct={(sig?.product as Product) ?? "Platform"}
          onLog={(d) => logFollowOnSignal(review.id, d)}
          onDraft={(title, desc) =>
            updateReview(review.id, {
              follow_on_draft_title: title,
              follow_on_draft_description: desc,
            })
          }
        />
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{value || "—"}</p>
    </div>
  );
}

function RetroForm({
  review, readOnly, onSave, onComplete,
}: {
  review: Review;
  readOnly: boolean;
  onSave: (d: Partial<Review>) => void;
  onComplete: (d: { outcome_rating: OutcomeRating; what_worked: string; what_didnt: string; notes: string }) => void;
}) {
  const [rating, setRating] = useState<OutcomeRating | null>(review.outcome_rating);
  const [worked, setWorked] = useState(review.what_worked);
  const [didnt, setDidnt] = useState(review.what_didnt);
  const [notes, setNotes] = useState(review.notes);

  const canComplete =
    !!rating && worked.trim().length > 10 && didnt.trim().length > 0;

  return (
    <div className="tfp-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-medium">Retro</h3>
        {readOnly && (
          <span className="rounded-full bg-[var(--color-status-proceed)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--color-status-proceed)]">
            Completed {review.completed_at ? fmtDate(review.completed_at) : ""}
          </span>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground">
            Outcome vs. success criteria
          </label>
          <div className="flex flex-wrap gap-2">
            {(["Met", "Partially Met", "Missed"] as OutcomeRating[]).map((r) => (
              <button
                key={r}
                disabled={readOnly}
                onClick={() => setRating(r)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-60",
                  rating === r
                    ? cn("border-transparent", RATING_TONE[r])
                    : "border-border bg-surface hover:border-primary/40",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <Field label="What worked" value={worked} onChange={setWorked} readOnly={readOnly} rows={3} />
        <Field label="What didn't" value={didnt} onChange={setDidnt} readOnly={readOnly} rows={3} />
        <Field label="Notes / context" value={notes} onChange={setNotes} readOnly={readOnly} rows={2} />
      </div>

      {!readOnly && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() =>
              onSave({
                outcome_rating: rating,
                what_worked: worked,
                what_didnt: didnt,
                notes,
              })
            }
            className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm hover:bg-accent/40"
          >
            Save draft
          </button>
          <button
            disabled={!canComplete}
            onClick={() =>
              onComplete({
                outcome_rating: rating!,
                what_worked: worked,
                what_didnt: didnt,
                notes,
              })
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-95"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Complete review
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, readOnly, rows = 2,
}: { label: string; value: string; onChange: (v: string) => void; readOnly: boolean; rows?: number }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        rows={rows}
        className="w-full resize-none rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring read-only:bg-muted/30"
      />
    </div>
  );
}

function FollowOnComposer({
  review, defaultSource, defaultProduct, onLog, onDraft,
}: {
  review: Review;
  defaultSource: Source;
  defaultProduct: Product;
  onLog: (d: { title: string; description: string; source: Source; product: Product }) => Signal;
  onDraft: (title: string, desc: string) => void;
}) {
  const [title, setTitle] = useState(review.follow_on_draft_title);
  const [desc, setDesc] = useState(review.follow_on_draft_description);
  const [source, setSource] = useState<Source>(defaultSource);
  const [product, setProduct] = useState<Product>(defaultProduct);
  const [confirm, setConfirm] = useState<string | null>(null);

  const canLog = title.trim().length > 3 && desc.trim().length > 10;

  function handleLog() {
    const s = onLog({ title, description: desc, source, product });
    setTitle("");
    setDesc("");
    setConfirm(`Logged signal ${s.id} into intake.`);
    window.setTimeout(() => setConfirm(null), 3500);
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/10 p-3">
      <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Log a follow-on signal</p>
      <div className="space-y-2">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            onDraft(e.target.value, desc);
          }}
          placeholder="Short title (e.g. Add stale-data tooltip on dashboard)"
          className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <textarea
          value={desc}
          onChange={(e) => {
            setDesc(e.target.value);
            onDraft(title, e.target.value);
          }}
          rows={2}
          placeholder="What surfaced in the review that warrants a new signal?"
          className="w-full resize-none rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as Source)}
            className="rounded-md border border-input bg-surface px-2 py-1 text-xs"
          >
            {(["Leadership", "Clinic", "Internal", "Dev Team"] as Source[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value as Product)}
            className="rounded-md border border-input bg-surface px-2 py-1 text-xs"
          >
            {(["Otto-Onboard", "Otto Notes", "Otto Pulse", "FertiWise", "StimSmart", "Platform"] as Product[]).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button
            disabled={!canLog}
            onClick={handleLog}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-95"
          >
            <Plus className="h-3.5 w-3.5" /> Log to intake
          </button>
        </div>
        {confirm && (
          <p className="text-xs text-[var(--color-status-proceed)]">{confirm}</p>
        )}
      </div>
    </div>
  );
}

// Re-declare here for compactness
const _shapingType: ShapingItem | undefined = undefined;
void _shapingType;
