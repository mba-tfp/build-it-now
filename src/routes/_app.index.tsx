import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { USERS, capacityState, daysSince, sprintItemCapacity, useTfpStore } from "@/lib/tfp/store";
import { cn } from "@/lib/utils";
import type { LastVisitEntry, Signal } from "@/lib/tfp/types";
import { CapacityMeter } from "@/components/tfp/CapacityMeter";
import { SinceLastVisitModal } from "@/components/tfp/SinceLastVisitModal";
import { YourQueueStrip } from "@/components/tfp/YourQueueStrip";

export const Route = createFileRoute("/_app/")({
  component: HomePage,
});

const TOP_STRIP_TEXT =
  "TFP Operating Model. Capture signals from clinics, ship outcomes to production.";

const RESUME_KEY = "tfp-last-visit-v1";
type ResumeEntry = { ts: number; title: string; stage: string; href: string };

function readResume(): ResumeEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeEntry;
    if (!parsed || typeof parsed.ts !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ageLabel(iso: string): string {
  const d = daysSince(iso);
  if (d <= 0) {
    const h = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000));
    return `${h}h`;
  }
  return `${d}d`;
}

export function HomePage() {
  const signals = useTfpStore((s) => s.signals);
  const shaping = useTfpStore((s) => s.shaping);
  const reviews = useTfpStore((s) => s.reviews);
  const sprint = useTfpStore((s) => s.sprint);
  const currentUserId = useTfpStore((s) => s.currentUserId);
  const demoMode = useTfpStore((s) => s.flags.demoModeEnabled);
  const me = USERS.find((u) => u.id === currentUserId) ?? USERS[0];

  const isBazil = currentUserId === "u-bazil";
  const isWaseem = currentUserId === "u-waseem";
  const isShahid = currentUserId === "u-shahid";

  const [resume, setResume] = useState<ResumeEntry | null>(null);
  useEffect(() => {
    setResume(readResume());
  }, [currentUserId]);

  // Session-entry "Since your last visit" modal
  const [sinceModalPrev, setSinceModalPrev] = useState<LastVisitEntry | null>(null);
  useEffect(() => {
    const state = useTfpStore.getState();
    if (state.sessionEntryShown[currentUserId]) return;
    const prev = state.recordHomeVisit();
    state.markSessionEntryShown(currentUserId);
    if (prev) setSinceModalPrev(prev);
  }, [currentUserId]);

  // ============ Sprint Health ============
  const sprintItems = shaping.filter((i) => i.in_sprint && i.delivery_status);
  const blocked = sprintItems.filter((i) => i.delivery_status === "Blocked").length;
  const atRisk = sprintItems.filter(
    (i) => i.delivery_status !== "Blocked" && i.delivery_status !== "Done" && daysSince(i.updated_at) >= 2,
  ).length;
  const onTrack = sprintItems.length - blocked - atRisk;

  const sprintCapacity = sprintItemCapacity(sprint);
  const cap = capacityState(sprintItems.length, sprintCapacity);

  const sprintStart = new Date(sprint.start_date).getTime();
  const sprintEnd = new Date(sprint.end_date).getTime();
  const totalDays = Math.max(1, Math.round((sprintEnd - sprintStart) / 86400000));
  const dayOf = Math.min(totalDays, Math.max(1, Math.round((Date.now() - sprintStart) / 86400000) + 1));
  const sprintNumber = (sprint.id.match(/\d+/)?.[0]) ?? sprint.name;

  // ============ Decisions Needed (Bazil) ============
  const decisionItems = useMemo(() => {
    const out: { stage: string; title: string; age: string; href: string; key: string }[] = [];
    // Shaping items where Bazil is PM owner and item is in active shaping stages
    shaping
      .filter(
        (i) =>
          i.pm_owner_id === currentUserId &&
          (i.shaping_status === "Unshaped" || i.shaping_status === "In Shaping"),
      )
      .forEach((i) => {
        const sig = signals.find((s) => s.id === i.signal_id);
        out.push({
          stage: "Shaping",
          title: sig?.title ?? i.id,
          age: ageLabel(i.updated_at),
          href: "/shaping",
          key: `sh-${i.id}`,
        });
      });
    // Outcome reviews pending owned by current user
    reviews
      .filter((r) => r.status === "Pending" && r.pm_owner_id === currentUserId)
      .forEach((r) => {
        const item = shaping.find((i) => i.id === r.shaping_id);
        const sig = item ? signals.find((s) => s.id === item.signal_id) : null;
        out.push({
          stage: "Outcome Review",
          title: sig?.title ?? r.id,
          age: ageLabel(r.created_at),
          href: "/delivery",
          key: `rv-${r.id}`,
        });
      });
    return out;
  }, [shaping, signals, reviews, currentUserId]);

  // ============ Tech Reviews Waiting (Waseem) ============
  const techReviewItems = useMemo(() => {
    return shaping
      .filter((i) => i.tech_reviewer_id === currentUserId && i.shaping_status === "In Tech Review")
      .map((i) => {
        const sig = signals.find((s) => s.id === i.signal_id);
        return {
          stage: "Tech Review",
          title: sig?.title ?? i.id,
          age: ageLabel(i.updated_at),
          href: "/shaping",
          key: `tr-${i.id}`,
        };
      });
  }, [shaping, signals, currentUserId]);

  // ============ Outcomes Shipped This Sprint (Shahid) ============
  const outcomesShipped = useMemo(() => {
    return reviews
      .filter((r) => r.status === "Completed" && r.completed_at && new Date(r.completed_at).getTime() >= sprintStart)
      .map((r) => {
        const item = shaping.find((i) => i.id === r.shaping_id);
        const sig = item ? signals.find((s) => s.id === item.signal_id) : null;
        return {
          stage: r.outcome_rating ?? "—",
          title: sig?.title ?? r.id,
          age: r.completed_at ? ageLabel(r.completed_at) : "",
          href: "/governance",
          key: `out-${r.id}`,
        };
      });
  }, [reviews, shaping, signals, sprintStart]);

  // ============ Throughput ============
  const weekAgo = Date.now() - 7 * 86400000;
  const weekly = {
    captured: signals.filter((s) => new Date(s.created_at).getTime() >= weekAgo).length,
    shaped: shaping.filter(
      (i) =>
        new Date(i.updated_at).getTime() >= weekAgo &&
        (i.shaping_status === "Ready for Sprint" ||
          i.shaping_status === "Approved" ||
          i.shaping_status === "In Delivery"),
    ).length,
    inDelivery: shaping.filter((i) => i.in_sprint && i.delivery_status && i.delivery_status !== "Done").length,
    shipped: shaping.filter((i) => i.delivery_status === "Done" && new Date(i.updated_at).getTime() >= weekAgo).length,
  };
  const sprintCounts = {
    captured: signals.filter((s) => new Date(s.created_at).getTime() >= sprintStart).length,
    shaped: shaping.filter(
      (i) =>
        new Date(i.updated_at).getTime() >= sprintStart &&
        (i.shaping_status === "Ready for Sprint" ||
          i.shaping_status === "Approved" ||
          i.shaping_status === "In Delivery"),
    ).length,
    inDelivery: sprintItems.filter((i) => i.delivery_status !== "Done").length,
    shipped: sprintItems.filter((i) => i.delivery_status === "Done").length,
  };
  const throughput = isShahid ? sprintCounts : weekly;
  const throughputLabel = isShahid ? "This sprint" : "This week";

  // ============ Recent intake (Bazil) ============
  const recentIntake = useMemo(() => {
    return [...signals]
      .filter((s) => (s.priority ?? s.tier) === "P0" || (s.priority ?? s.tier) === "P1")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [signals]);

  // ============ Right tile selection ============
  let rightTile: { variant: "decisions" | "tech-reviews" | "outcomes-shipped"; title: string; count: number; items: typeof decisionItems; emptyText: string; footerHref: string; footerLabel: string };
  if (isWaseem) {
    rightTile = {
      variant: "tech-reviews",
      title: "Tech Reviews Waiting",
      count: techReviewItems.length,
      items: techReviewItems.slice(0, 3),
      emptyText: "No tech reviews assigned.",
      footerHref: "/shaping",
      footerLabel: "View all →",
    };
  } else if (isShahid) {
    rightTile = {
      variant: "outcomes-shipped",
      title: "Outcomes Shipped This Sprint",
      count: outcomesShipped.length,
      items: outcomesShipped.slice(0, 3),
      emptyText: "No outcomes shipped yet this sprint.",
      footerHref: "/governance",
      footerLabel: "View all →",
    };
  } else {
    rightTile = {
      variant: "decisions",
      title: "Decisions Needed",
      count: decisionItems.length,
      items: decisionItems.slice(0, 3),
      emptyText: "Nothing waiting. Sprint health below.",
      footerHref: "/shaping",
      footerLabel: "View all →",
    };
  }

  const showResume =
    !demoMode &&
    !isShahid &&
    resume &&
    Date.now() - resume.ts > 5 * 60 * 1000 &&
    Date.now() - resume.ts < 7 * 86400000;

  return (
    <div className="space-y-6">
      {/* 1. Top strip */}
      <div
        data-testid="top-strip"
        className="-mx-6 -mt-6 mb-2 border-b border-border bg-muted/40 px-6 py-3 text-sm text-foreground/90"
      >
        {TOP_STRIP_TEXT}
      </div>

      {/* 2. Resume bar */}
      {showResume && resume && (
        <div
          data-testid="resume-bar"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-2 text-sm"
        >
          <p className="text-muted-foreground">
            Last visit: <span className="text-foreground">{relativeTime(resume.ts)}</span>. You were on:{" "}
            <span className="font-medium text-foreground">{resume.title}</span> in{" "}
            <span className="text-foreground">{resume.stage}</span>.
          </p>
          <Link
            to={resume.href as "/shaping"}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Resume
          </Link>
        </div>
      )}

      <header>
        <h1 className="font-display text-2xl">Good morning, {me.name}.</h1>
      </header>

      {/* 3. Two-tile primary surface */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sprint Health */}
        <section
          data-testid="sprint-health-tile"
          data-capacity-color={cap.color}
          className="tfp-card relative p-5"
        >
          {demoMode && (
            <span className="absolute right-3 top-3 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              Demo data
            </span>
          )}
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Sprint Health</p>
          <p className="mt-2 font-display text-3xl">
            Sprint {sprintNumber}, Day {dayOf} of {totalDays}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <HealthCount color="green" count={Math.max(0, onTrack)} label="on track" />
            <HealthCount color="yellow" count={atRisk} label="at risk" />
            <HealthCount color="red" count={blocked} label="blocked" />
          </div>
          <CapacityMeter
            used={cap.used}
            capacity={cap.capacity}
            pct={cap.pct}
            color={cap.color}
          />
          <Link
            to="/delivery"
            search={{ tab: "board" }}
            className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View sprint board →
          </Link>
        </section>

        {/* Right tile (Decisions / Tech Reviews / Outcomes) */}
        <section
          data-testid="decisions-tile"
          data-variant={rightTile.variant}
          className="tfp-card p-5"
        >
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{rightTile.title}</p>
          <p className="mt-2 font-display text-3xl">
            {rightTile.variant === "outcomes-shipped"
              ? `${rightTile.count} shipped`
              : rightTile.variant === "tech-reviews"
                ? `${rightTile.count} waiting for you`
                : `${rightTile.count} waiting on you`}
          </p>

          {rightTile.items.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{rightTile.emptyText}</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {rightTile.items.map((it) => (
                <li key={it.key} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {it.stage}
                    </span>
                    <span className="truncate">{it.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{it.age}</span>
                </li>
              ))}
            </ul>
          )}

          <Link
            to={rightTile.footerHref as "/shaping"}
            className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {rightTile.footerLabel}
          </Link>
        </section>
      </div>

      {/* 4. Throughput strip */}
      <ThroughputStrip
        label={throughputLabel}
        captured={throughput.captured}
        shaped={throughput.shaped}
        inDelivery={throughput.inDelivery}
        shipped={throughput.shipped}
      />

      {/* 5. Recent intake (Bazil only) */}
      {isBazil && (
        <section className="tfp-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Recent signals (P0 + P1)
          </p>
          {recentIntake.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No P0 or P1 signals.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {recentIntake.map((s) => (
                <li key={s.id}>
                  <Link
                    to="/inbox"
                    search={{ tab: "triage", signal: s.id }}
                    className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-muted/30 -mx-2 px-2 rounded"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <PriorityBadge priority={(s.priority ?? s.tier) as string} />
                      <span className="truncate">{s.title}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="hidden sm:inline">{clinicFromSignal(s)}</span>
                      <span>{ageLabel(s.created_at)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function HealthCount({ color, count, label }: { color: "green" | "yellow" | "red"; count: number; label: string }) {
  const dotClass =
    color === "green"
      ? "bg-[var(--color-status-proceed)]"
      : color === "yellow"
        ? "bg-[var(--color-status-hold)]"
        : "bg-destructive";
  return (
    <span className="inline-flex items-center gap-2">
      <span
        data-testid="sprint-health-dot"
        data-color={color}
        className={cn("inline-block h-2.5 w-2.5 rounded-full", dotClass)}
      />
      <span className="font-medium">{count}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function ThroughputStrip({
  label,
  captured,
  shaped,
  inDelivery,
  shipped,
}: {
  label: string;
  captured: number;
  shaped: number;
  inDelivery: number;
  shipped: number;
}) {
  const segments: { count: number; label: string; href: string; search?: Record<string, string> }[] = [
    { count: captured, label: "signals captured", href: "/inbox" },
    { count: shaped, label: "shaped", href: "/shaping" },
    { count: inDelivery, label: "in delivery", href: "/delivery" },
    { count: shipped, label: "shipped", href: "/delivery" },
  ];
  return (
    <section data-testid="throughput-strip" className="tfp-card p-4">
      <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
        {segments.map((seg, i) => (
          <span key={seg.label} className="contents">
            <Link
              to={seg.href as "/inbox"}
              data-testid="throughput-segment"
              className="rounded px-1 hover:bg-muted/40"
            >
              <span className="font-semibold">{seg.count}</span>{" "}
              <span className="text-muted-foreground">{seg.label}</span>
            </Link>
            {i < segments.length - 1 && (
              <ArrowRight
                data-testid="throughput-arrow"
                className="h-3.5 w-3.5 text-muted-foreground"
              />
            )}
          </span>
        ))}
      </div>
    </section>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const tone =
    priority === "P0"
      ? "bg-destructive/15 text-destructive border-destructive/40"
      : priority === "P1"
        ? "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)] border-[var(--color-status-hold)]/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold", tone)}>
      {priority}
    </span>
  );
}

function clinicFromSignal(s: Signal): string {
  // Best-effort clinic name extraction from labels or description.
  const knownClinics = ["Generation Fertility", "Procrea QC", "Heartland", "RCC", "Olive"];
  const haystack = `${s.title} ${s.description} ${s.labels.join(" ")}`;
  return knownClinics.find((c) => haystack.toLowerCase().includes(c.toLowerCase())) ?? s.source;
}
