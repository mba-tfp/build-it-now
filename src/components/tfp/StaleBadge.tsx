import { getStaleLevel, staleLabel } from "@/lib/tfp/staleness";
import { cn } from "@/lib/utils";

export function StaleBadge({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const level = getStaleLevel(iso);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        level === "fresh" && "border-[var(--color-status-proceed)]/30 bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]",
        level === "aging" && "border-[var(--color-status-hold)]/30 bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]",
        level === "stale" && "border-destructive/30 bg-destructive/10 text-destructive",
        className,
      )}
    >
      {staleLabel(level)}
    </span>
  );
}
