// DEMO CLICK PATH — Friday April 2026
// 1. Home → review urgent items
// 2. Inbox → New signal tab → log Help Center signal → Proceed
// 3. Shaping → open new item → fill Define form → Send to Tech Review → assign Waseem
// 4. Switch to Waseem → complete Tech Review → sign off → Ready for Sprint
// 5. Delivery → Backlog tab → see Help Center item → Sprint Planning tab → add to sprint → confirm
// 6. Delivery → Sprint Board → show all 7 seed items, blocked eIVF item, stale flag
// 7. Leadership → walk through 4 sections → acknowledge override → show Procrea QC in clinic signals
// 8. Clinics → show Procrea QC Phase 2 checklist → show Heartland Phase 1

import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock, Inbox, ShieldCheck } from "lucide-react";
import { USERS, daysSince, useTfpStore } from "@/lib/tfp/store";
import { fmtDate, fmtDateTime } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import type { ShapingItem, Signal } from "@/lib/tfp/types";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});

type Tone = "good" | "warn" | "bad" | "neutral";

function DashboardPage() {
  const signals = useTfpStore((s) => s.signals);
  const shaping = useTfpStore((s) => s.shaping);
  const goLives = useTfpStore((s) => s.goLives);
  const users = useTfpStore((s) => s.users);
  const currentUserId = useTfpStore((s) => s.currentUserId);
  const me = users.find((u) => u.id === currentUserId) ?? USERS.find((u) => u.id === currentUserId) ?? USERS[0];

  const openSignals = signals.filter((s) => s.status === "New" || s.status === "In Review");
  const waitingOnYou = shaping.filter(
    (item) =>
      item.pm_owner_id === currentUserId &&
      ((item.shaping_status === "In Shaping" && daysSince(item.updated_at) > 5) ||
        (item.shaping_status === "In Tech Review" && item.tech_reviewer_id === currentUserId)),
  );
  const sprintItems = shaping.filter((item) => item.in_sprint && item.delivery_status);
  const healthySprintItems = sprintItems.filter(
    (item) => item.delivery_status !== "Blocked" && daysSince(item.updated_at) < 2,
  );
  const sprintHealth = sprintItems.length === 0 ? 100 : Math.round((healthySprintItems.length / sprintItems.length) * 100);
  const blockers = sprintItems.filter((item) => item.delivery_status === "Blocked");
  const calmState = openSignals.length === 0 && waitingOnYou.length === 0 && sprintHealth === 100 && blockers.length === 0;

  const urgentSignal = [...openSignals].sort(
    (a, b) => new Date(a.sla_due_at).getTime() - new Date(b.sla_due_at).getTime(),
  )[0];
  const stalestSprintItem = [...sprintItems].sort(
    (a, b) => daysSince(b.updated_at) - daysSince(a.updated_at),
  )[0];
  const overdueClinicPhase = goLives
    .map((checklist) => {
      const entries = Object.entries(checklist.criteria);
      const firstOpenIndex = entries.findIndex(([, state]) => !state.done);
      if (firstOpenIndex < 0) return null;
      const [criterion] = entries[firstOpenIndex];
      const previousCompleted = entries
        .slice(0, firstOpenIndex)
        .map(([, state]) => state.checked_at)
        .filter((date): date is string => Boolean(date))
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
      return {
        id: checklist.id,
        clinic: clinicNameFromText(checklist.release_name),
        phase: criterion.includes(":") ? criterion.split(":")[0] : criterion,
        days: daysSince(previousCompleted ?? checklist.created_at),
      };
    })
    .filter((item): item is { id: string; clinic: string; phase: string; days: number } => Boolean(item))
    .sort((a, b) => b.days - a.days)[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl">Good morning, {me.name}.</h1>
        <p className="mt-1 text-sm text-muted-foreground">Here is where things stand.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricTile to="/inbox" icon={<Inbox className="h-4 w-4" />} label="Signals to triage" value={`${openSignals.length}`} detail="New or in review" tone={openSignals.length ? "warn" : "good"} />
        <MetricTile to="/shaping" icon={<Clock className="h-4 w-4" />} label="Waiting on you" value={`${waitingOnYou.length}`} detail="Shaping work needing action" tone={waitingOnYou.length ? "warn" : "good"} />
        <MetricTile to="/delivery" search={{ tab: "board" }} icon={<ShieldCheck className="h-4 w-4" />} label="Sprint health" value={`${sprintHealth}%`} detail="Not blocked and not stale" tone={sprintHealth > 70 ? "good" : sprintHealth >= 50 ? "warn" : "bad"} />
        <MetricTile to="/delivery" search={{ tab: "board" }} icon={<AlertTriangle className="h-4 w-4" />} label="Open blockers" value={`${blockers.length}`} detail="Items currently blocked" tone={blockers.length ? "bad" : "good"} />
      </div>

      {calmState ? (
        <section className="rounded-md border border-[var(--color-status-proceed)]/30 bg-[var(--color-status-proceed)]/10 p-5 text-[var(--color-status-proceed)]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            <p className="font-medium">Everything is on track. Check in again after standup.</p>
          </div>
        </section>
      ) : (
      <div className="grid gap-4 lg:grid-cols-3">
        {urgentSignal ? (
          <UrgentCard title="Most urgent signal" tone="warn">
            <p className="font-medium leading-snug">{urgentSignal.title}</p>
            <p className="mt-2 text-xs text-muted-foreground">{urgentSignal.source} · SLA due {fmtDateTime(urgentSignal.sla_due_at)}</p>
            <Link to="/inbox" search={{ tab: "triage", signal: urgentSignal.id }} className="mt-4 inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              Triage now
            </Link>
          </UrgentCard>
        ) : (
          <AllClearCard title="Most urgent signal" />
        )}

        {stalestSprintItem ? (
          <UrgentCard title="Most stale sprint item" tone={daysSince(stalestSprintItem.updated_at) >= 2 ? "bad" : "neutral"}>
            <p className="font-mono text-xs text-muted-foreground">{stalestSprintItem.jira_key ?? "No Jira key"}</p>
            <p className="mt-1 font-medium leading-snug">{signalTitle(signals, stalestSprintItem)}</p>
            <p className="mt-2 text-xs text-muted-foreground">{stalestSprintItem.delivery_status} · {daysSince(stalestSprintItem.updated_at)}d stale</p>
            <Link to="/delivery" search={{ tab: "board" }} className="mt-4 inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              View on board
            </Link>
          </UrgentCard>
        ) : (
          <AllClearCard title="Most stale sprint item" />
        )}

        {overdueClinicPhase ? (
          <UrgentCard title="Most overdue clinic phase" tone={overdueClinicPhase.days > 5 ? "bad" : "warn"}>
            <p className="font-medium leading-snug">{overdueClinicPhase.clinic}</p>
            <p className="mt-2 text-xs text-muted-foreground">{overdueClinicPhase.phase} · {overdueClinicPhase.days}d in phase</p>
            <Link to="/clinics" className="mt-4 inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              Check in
            </Link>
          </UrgentCard>
        ) : (
          <AllClearCard title="Most overdue clinic phase" />
        )}
      </div>
      )}
    </div>
  );
}

function MetricTile({ to, search, icon, label, value, detail, tone }: { to: "/inbox" | "/shaping" | "/delivery"; search?: { tab: "board" }; icon: React.ReactNode; label: string; value: string; detail: string; tone: Tone }) {
  return (
    <Link to={to} search={search} className="tfp-card block p-5 transition hover:bg-muted/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={cn("mt-2 font-display text-4xl", toneClass(tone))}>{value}</p>
        </div>
        <span className={cn("rounded-md p-2", toneBg(tone))}>{icon}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </Link>
  );
}

function UrgentCard({ title, tone, children }: { title: string; tone: Tone; children: React.ReactNode }) {
  return (
    <section className={cn("tfp-card min-h-48 p-5", tone === "bad" && "border-destructive/40", tone === "warn" && "border-[var(--color-status-hold)]/40")}>
      <p className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </section>
  );
}

function AllClearCard({ title }: { title: string }) {
  return (
    <section className="tfp-card min-h-48 border-[var(--color-status-proceed)]/30 p-5">
      <p className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="flex items-center gap-2 text-[var(--color-status-proceed)]">
        <CheckCircle2 className="h-4 w-4" />
        <span className="font-medium">All clear</span>
      </div>
    </section>
  );
}

function signalTitle(signals: Signal[], item: ShapingItem) {
  return signals.find((signal) => signal.id === item.signal_id)?.title ?? item.jira_key ?? item.id;
}

function clinicNameFromText(text: string) {
  const known = ["Generation Fertility", "Procrea QC", "Heartland", "RCC", "Olive"];
  return known.find((name) => text.toLowerCase().includes(name.toLowerCase())) ?? text.replace(/\s*Go-Live\s*/i, "").trim();
}

function toneClass(tone: Tone) {
  if (tone === "good") return "text-[var(--color-status-proceed)]";
  if (tone === "warn") return "text-[var(--color-status-hold)]";
  if (tone === "bad") return "text-destructive";
  return "text-foreground";
}

function toneBg(tone: Tone) {
  if (tone === "good") return "bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]";
  if (tone === "warn") return "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]";
  if (tone === "bad") return "bg-destructive/10 text-destructive";
  return "bg-primary/10 text-primary";
}
