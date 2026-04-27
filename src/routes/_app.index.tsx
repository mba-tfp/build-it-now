import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, MessageSquare, TrendingUp } from "lucide-react";
import { USERS, useTfpStore, usableCapacity } from "@/lib/tfp/store";
import { fmtDate, fmtDateTime } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import { StaleBadge } from "@/components/tfp/StaleBadge";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});

function DashboardPage() {
  const signals = useTfpStore((s) => s.signals);
  const shaping = useTfpStore((s) => s.shaping);
  const sprint = useTfpStore((s) => s.sprint);
  const audit = useTfpStore((s) => s.audit);
  const decisions = useTfpStore((s) => s.decisions);
  const comms = useTfpStore((s) => s.comms);
  const users = useTfpStore((s) => s.users);

  const usable = usableCapacity(sprint);
  const sprintItems = shaping.filter((s) => s.in_sprint && s.delivery_status);
  const blocked = shaping.filter((s) => s.delivery_status === "Blocked");
  const staleShaping = shaping.filter((s) => s.shaping_status !== "In Delivery" && Date.now() - new Date(s.updated_at).getTime() > 7 * 86400000);
  const openDecisions = decisions.filter((d) => d.status === "Open");
  const commsNeedsApproval = comms.filter((c) => c.status === "Pending Approval");
  const questions = shaping
    .filter((s) => s.solution_questions.trim().length > 0 && s.shaping_status !== "In Delivery")
    .map((s) => ({ sh: s, sig: signals.find((x) => x.id === s.signal_id) }))
    .filter((x) => !!x.sig)
    .slice(0, 6);

  const recent = useMemo(() => audit.slice(0, 12), [audit]);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">TFP AI Workflow System</p>
          <h1 className="mt-1 font-display text-3xl">Team Home</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The practical dashboard: what is moving, what is blocked, and what needs a decision.
          </p>
        </div>
        <Link to="/inbox" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Open Inbox
        </Link>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<TrendingUp className="h-4 w-4" />} label="Sprint allocation" value={`${sprint.allocated_pts}/${usable} pts`} detail={`${Math.round((sprint.allocated_pts / Math.max(1, usable)) * 100)}% of usable capacity`} tone={sprint.allocated_pts > usable ? "bad" : "neutral"} />
        <Metric icon={<AlertTriangle className="h-4 w-4" />} label="Blocked" value={`${blocked.length}`} detail="items needing unblock" tone={blocked.length ? "bad" : "good"} />
        <Metric icon={<Clock className="h-4 w-4" />} label="Stale shaping" value={`${staleShaping.length}`} detail="no update in 7+ days" tone={staleShaping.length ? "warn" : "good"} />
        <Metric icon={<HelpCircle className="h-4 w-4" />} label="Needs attention" value={`${openDecisions.length + commsNeedsApproval.length}`} detail={`${openDecisions.length} decisions · ${commsNeedsApproval.length} comms`} tone={openDecisions.length + commsNeedsApproval.length ? "warn" : "good"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Active sprint" subtitle={`${sprintItems.length} committed items in ${sprint.name}`}>
          <div className="space-y-2">
            {sprintItems.slice(0, 8).map((sh) => {
              const sig = signals.find((s) => s.id === sh.signal_id);
              const owner = users.find((u) => u.id === sh.delivery_assignee_id) ?? USERS.find((u) => u.id === sh.delivery_assignee_id);
              return (
                <Link key={sh.id} to="/delivery" className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-muted/40">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{sig?.title ?? sh.jira_key}</div>
                    <div className="text-xs text-muted-foreground">{sh.jira_key} · {owner?.name ?? "Unassigned"}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StaleBadge iso={sh.updated_at} />
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{sh.delivery_status}</span>
                  </div>
                </Link>
              );
            })}
            {sprintItems.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No sprint items yet.</p>}
          </div>
        </Panel>

        <Panel title="Open questions" subtitle="Shaping items with unanswered questions">
          <div className="space-y-3">
            {questions.map(({ sh, sig }) => (
              <Link key={sh.id} to="/shaping" className="block rounded-md border border-border bg-surface p-3 hover:bg-muted/40">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-sm">{sig?.title}</p>
                  <StaleBadge iso={sh.updated_at} />
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{sh.solution_questions}</p>
              </Link>
            ))}
            {questions.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No open shaping questions.</p>}
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Recent activity" subtitle="Only meaningful transitions and approvals">
          <div className="space-y-2">
            {recent.map((a) => (
              <div key={a.id} className="flex gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <p>{a.action}</p>
                  <p className="text-xs text-muted-foreground">{a.entity_type} · {fmtDateTime(a.ts)}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="This week" subtitle="Quick links for daily work">
          <div className="grid gap-2 sm:grid-cols-2">
            <QuickLink to="/inbox" icon={<MessageSquare className="h-4 w-4" />} title="Triage inbox" detail={`${signals.filter((s) => s.status === "New" || s.status === "In Review").length} open signals`} />
            <QuickLink to="/shaping" icon={<TrendingUp className="h-4 w-4" />} title="Shape work" detail={`${shaping.filter((s) => s.shaping_status !== "In Delivery").length} active items`} />
            <QuickLink to="/delivery" icon={<TrendingUp className="h-4 w-4" />} title="Delivery board" detail={`${blocked.length} blocked`} />
            <QuickLink to="/leadership" icon={<CheckCircle2 className="h-4 w-4" />} title="Briefing" detail={`Updated ${fmtDate(new Date().toISOString())}`} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: "good" | "warn" | "bad" | "neutral" }) {
  return (
    <div className="tfp-card p-4">
      <div className={cn("mb-3 inline-flex rounded-md p-2", tone === "good" && "bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]", tone === "warn" && "bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]", tone === "bad" && "bg-destructive/10 text-destructive", tone === "neutral" && "bg-primary/10 text-primary")}>{icon}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="tfp-card p-5"><div className="mb-4"><h2 className="font-display text-lg">{title}</h2><p className="text-xs text-muted-foreground">{subtitle}</p></div>{children}</section>;
}

function QuickLink({ to, icon, title, detail }: { to: "/inbox" | "/shaping" | "/delivery" | "/leadership"; icon: React.ReactNode; title: string; detail: string }) {
  return <Link to={to} className="rounded-md border border-border bg-surface p-4 hover:bg-muted/40"><div className="mb-2 text-primary">{icon}</div><div className="font-medium">{title}</div><div className="mt-1 text-xs text-muted-foreground">{detail}</div></Link>;
}
