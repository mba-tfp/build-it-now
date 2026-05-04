import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { daysSince, useTfpStore } from "@/lib/tfp/store";

type QueueItem = {
  key: string;
  title: string;
  source: string;
  actionLabel: string;
  href: string;
};

export type QueueResult = { items: QueueItem[]; total: number; seeAllHref: string | null };

const HOURS_48 = 48 * 3600 * 1000;

export function computeQueueForUser(userId: string): QueueResult | null {
  const state = useTfpStore.getState();
  if (userId === "u-shahid") return null;

  const out: QueueItem[] = [];
  if (userId === "u-bazil") {
    // Untriaged signals (oldest first)
    const untriaged = [...state.signals]
      .filter((s) => s.status === "New")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    untriaged.forEach((s) =>
      out.push({
        key: `untri-${s.id}`,
        title: s.title,
        source: "Untriaged signal",
        actionLabel: "Triage",
        href: "/inbox",
      }),
    );
    // Awaiting PM decision
    const now = Date.now();
    const awaiting = state.shaping.filter((i) => {
      if (i.shaping_status !== "In Shaping" && i.shaping_status !== "Unshaped") return false;
      if (i.pm_owner_id !== userId) return false;
      const recent = state.decisions.find(
        (d) => d.linked_shaping_id === i.id && now - new Date(d.decided_at).getTime() < HOURS_48,
      );
      return !recent;
    });
    awaiting.forEach((i) => {
      const sig = state.signals.find((s) => s.id === i.signal_id);
      out.push({
        key: `dec-${i.id}`,
        title: sig?.title ?? i.id,
        source: "Awaiting decision",
        actionLabel: "Decide",
        href: "/shaping",
      });
    });
    // Outcome reviews overdue
    state.reviews
      .filter((r) => r.status === "Pending" && r.pm_owner_id === userId && now - new Date(r.created_at).getTime() > HOURS_48)
      .forEach((r) => {
        const item = state.shaping.find((s) => s.id === r.shaping_id);
        const sig = item ? state.signals.find((s) => s.id === item.signal_id) : null;
        out.push({
          key: `rev-${r.id}`,
          title: sig?.title ?? r.id,
          source: "Outcome overdue",
          actionLabel: "Review",
          href: "/delivery",
        });
      });
  } else if (userId === "u-waseem") {
    // Blocked sprint items assigned to Waseem
    state.shaping
      .filter((i) => i.in_sprint && i.delivery_assignee_id === userId && i.delivery_status === "Blocked")
      .forEach((i) => {
        const sig = state.signals.find((s) => s.id === i.signal_id);
        out.push({
          key: `blk-${i.id}`,
          title: sig?.title ?? i.id,
          source: "Blocked",
          actionLabel: "Unblock",
          href: "/delivery",
        });
      });
    // Stale sprint items (no update 48h)
    state.shaping
      .filter(
        (i) =>
          i.in_sprint &&
          i.delivery_assignee_id === userId &&
          i.delivery_status &&
          i.delivery_status !== "Done" &&
          i.delivery_status !== "Blocked" &&
          daysSince(i.updated_at) >= 2,
      )
      .forEach((i) => {
        const sig = state.signals.find((s) => s.id === i.signal_id);
        out.push({
          key: `stale-${i.id}`,
          title: sig?.title ?? i.id,
          source: "No update",
          actionLabel: "Update",
          href: "/delivery",
        });
      });
  }
  const total = out.length;
  const seeAllHref =
    total > 5
      ? userId === "u-bazil"
        ? out[0]?.source === "Untriaged signal"
          ? "/inbox"
          : "/shaping"
        : "/delivery"
      : null;
  return { items: out.slice(0, 5), total, seeAllHref };
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function YourQueueStrip() {
  const userId = useTfpStore((s) => s.currentUserId);
  // subscribe to relevant slices for re-renders
  useTfpStore((s) => s.signals);
  useTfpStore((s) => s.shaping);
  useTfpStore((s) => s.reviews);
  useTfpStore((s) => s.decisions);
  const result = useMemo(() => computeQueueForUser(userId), [userId]);
  if (!result) return null;
  const { items, total, seeAllHref } = result;
  return (
    <section
      data-testid="your-queue-strip"
      className="tfp-card border-l-4 border-l-primary p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Your Queue</p>
          <span
            data-testid="your-queue-count"
            className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
          >
            {total}
          </span>
        </div>
        {seeAllHref && (
          <Link to={seeAllHref as "/inbox"} className="text-xs text-primary hover:underline">
            See all →
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <p
          data-testid="your-queue-empty"
          data-empty-variant="queue"
          className="text-center text-sm text-muted-foreground"
        >
          You're clear.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.key}
              data-testid="your-queue-item"
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface/40 px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {it.source}
                </span>
                <span className="truncate">{truncate(it.title, 50)}</span>
              </div>
              <Link to={it.href as "/inbox"} className="text-xs font-medium text-primary hover:underline">
                {it.actionLabel}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
