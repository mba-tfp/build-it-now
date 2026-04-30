import { cn } from "@/lib/utils";
import type { CapacityColor } from "@/lib/tfp/types";

const BAR_COLOR: Record<CapacityColor, string> = {
  green: "bg-[var(--color-status-proceed)]",
  yellow: "bg-[var(--color-status-hold)]",
  red: "bg-destructive",
};

const TEXT_COLOR: Record<CapacityColor, string> = {
  green: "text-[var(--color-status-proceed)]",
  yellow: "text-[var(--color-status-hold)]",
  red: "text-destructive",
};

/**
 * Item-count capacity meter. Renders "X / Y items (Z%)" plus a thin progress bar
 * whose color matches the capacity state (green <80%, yellow 80–99%, red ≥100%).
 *
 * Both the percentage text and the bar fill use the same color state — they're
 * the visible team-on-track signal consumed by the home Sprint Health tile and
 * the Sprint Planning header.
 */
export function CapacityMeter({
  used,
  capacity,
  pct,
  color,
  className,
  compact = false,
}: {
  used: number;
  capacity: number;
  pct: number;
  color: CapacityColor;
  className?: string;
  compact?: boolean;
}) {
  const display = Math.round(pct);
  return (
    <div
      data-testid="capacity-meter"
      data-color={color}
      data-pct={display}
      className={cn("mt-4", className)}
    >
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">Sprint capacity</span>
        <span className="font-medium">
          <span data-testid="capacity-text">
            {used} / {capacity} items
          </span>{" "}
          <span data-testid="capacity-pct" className={cn("font-semibold", TEXT_COLOR[color])}>
            ({display}%)
          </span>
        </span>
      </div>
      <div
        className={cn(
          "mt-2 overflow-hidden rounded-full bg-muted",
          compact ? "h-1.5" : "h-2",
        )}
      >
        <div
          data-testid="capacity-bar-fill"
          data-color={color}
          className={cn("h-full transition-all", BAR_COLOR[color])}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}
