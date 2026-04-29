import { cn } from "@/lib/utils";
import type { CommitmentType, SignalStatus, Tier } from "@/lib/tfp/types";

export function TierBadge({ tier }: { tier: Tier }) {
  const map: Record<Tier, { label: string; cls: string }> = {
    P0: { label: "P0 · Critical", cls: "bg-destructive/10 text-destructive ring-destructive/25" },
    P1: { label: "P1 · Urgent", cls: "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)] ring-[var(--color-status-hold)]/20" },
    P2: { label: "P2 · Important", cls: "bg-[var(--color-tier-p2)]/10 text-[var(--color-tier-p2)] ring-[var(--color-tier-p2)]/20" },
    P3: { label: "P3 · Standard", cls: "bg-[var(--color-tier-p3)]/10 text-[var(--color-tier-p3)] ring-[var(--color-tier-p3)]/25" },
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

export function CommitmentBadge({ type }: { type: CommitmentType | null }) {
  if (!type) return <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Unassigned</span>;
  const map: Record<CommitmentType, string> = {
    Feature: "bg-primary/10 text-primary ring-primary/25",
    Fix: "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)] ring-[var(--color-status-hold)]/25",
    Research: "bg-[var(--color-tier-p1)]/10 text-[var(--color-tier-p1)] ring-[var(--color-tier-p1)]/20",
    Dependency: "bg-[var(--color-tier-p2)]/10 text-[var(--color-tier-p2)] ring-[var(--color-tier-p2)]/25",
    Incident: "bg-destructive/10 text-destructive ring-destructive/25",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", map[type])}>{type}</span>;
}

export function LabelsList({ labels }: { labels?: string[] }) {
  if (!labels?.length) return null;
  return <span className="flex flex-wrap gap-1">{labels.map((label) => <span key={label} className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground">{label}</span>)}</span>;
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
