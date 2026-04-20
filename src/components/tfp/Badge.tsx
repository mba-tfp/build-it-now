import { cn } from "@/lib/utils";
import type { SignalStatus, Tier } from "@/lib/tfp/types";

export function TierBadge({ tier }: { tier: Tier }) {
  const map: Record<Tier, { label: string; cls: string }> = {
    T1: { label: "T1 · Same day", cls: "bg-[var(--color-tier-t1)]/10 text-[var(--color-tier-t1)] ring-[var(--color-tier-t1)]/20" },
    T2: { label: "T2 · 48h", cls: "bg-[var(--color-tier-t2)]/10 text-[var(--color-tier-t2)] ring-[var(--color-tier-t2)]/20" },
    T3: { label: "T3 · 1 week", cls: "bg-[var(--color-tier-t3)]/10 text-[var(--color-tier-t3)] ring-[var(--color-tier-t3)]/25" },
    T4: { label: "T4 · Monthly", cls: "bg-[var(--color-tier-t4)]/10 text-[var(--color-tier-t4)] ring-[var(--color-tier-t4)]/25" },
  };
  const m = map[tier];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", m.cls)}>
      {m.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: SignalStatus }) {
  const map: Record<SignalStatus, string> = {
    "New": "bg-[var(--color-status-new)]/10 text-[var(--color-status-new)] ring-[var(--color-status-new)]/25",
    "In Review": "bg-muted text-muted-foreground ring-border",
    "Proceed": "bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)] ring-[var(--color-status-proceed)]/25",
    "Hold": "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)] ring-[var(--color-status-hold)]/30",
    "Rejected": "bg-[var(--color-status-reject)]/10 text-[var(--color-status-reject)] ring-[var(--color-status-reject)]/25",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", map[status])}>
      {status}
    </span>
  );
}

export function Pill({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-surface text-foreground hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      {children}
    </button>
  );
}
