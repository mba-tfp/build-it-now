import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { USERS, useTfpStore } from "@/lib/tfp/store";
import { PRIORITY_TONE } from "@/lib/tfp/notify";
import { fmtDateTime } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import type { NotificationTrigger } from "@/lib/tfp/types";
import {
  Activity,
  Bell,
  HelpCircle,
  Search,
  Inbox,
  Layers,
  Truck,
  Building2,
  Crown,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { OnboardingModal } from "./OnboardingModal";
import { GlobalSearch } from "./GlobalSearch";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
} from "@/components/ui/sidebar";

const PIPELINE_NAV: Array<{ to: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/shaping", label: "Shaping", icon: Layers },
  { to: "/delivery", label: "Delivery", icon: Truck },
  { to: "/clinics", label: "Clinics", icon: Building2 },
  { to: "/leadership", label: "Leadership", icon: Crown },
];

const firedSessionNotifications = new Set<string>();
const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3600000;

function AppSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border flex items-start justify-start px-[10px] py-[10px]">
        <Link to="/" className="flex items-center gap-2 px-2 py-1.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" strokeWidth={2.25} />
          </span>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-display text-[15px] tracking-tight">TFP Workflow</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Signal → Delivery
              </div>
            </div>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {([{ label: "Pipeline", items: PIPELINE_NAV }] as const).map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((n) => {
                  const active =
                    location.pathname === n.to ||
                    location.pathname.startsWith(n.to + "/") ||
                    (n.to === "/inbox" &&
                      (location.pathname === "/intake" || location.pathname === "/triage")) ||
                    (n.to === "/clinics" && location.pathname === "/golive");
                  const Icon = n.icon;
                  return (
                    <SidebarMenuItem key={n.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={n.label}>
                        <Link to={n.to}>
                          <Icon className="h-4 w-4" />
                          <span>{n.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}

export function AppShell() {
  const currentUserId = useTfpStore((s) => s.currentUserId);
  const setCurrentUser = useTfpStore((s) => s.setCurrentUser);
  const users = useTfpStore((s) => s.users);
  const signals = useTfpStore((s) => s.signals);
  const shaping = useTfpStore((s) => s.shaping);
  const reviews = useTfpStore((s) => s.reviews);
  const goLives = useTfpStore((s) => s.goLives);
  const sprint = useTfpStore((s) => s.sprint);
  const retros = useTfpStore((s) => s.retros);
  const pushNotification = useTfpStore((s) => s.pushNotification);
  const resetOnboarding = useTfpStore((s) => s.resetOnboarding);
  const demoModeEnabled = useTfpStore((s) => s.flags.demoModeEnabled);
  const setDemoMode = useTfpStore((s) => s.setDemoMode);
  const me = (users.find((u) => u.id === currentUserId) ?? USERS.find((u) => u.id === currentUserId))!;
  const meLive = users.find((u) => u.id === currentUserId);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(false);
  const [storeHydrated, setStoreHydrated] = useState(false);
  const showOnboarding = storeHydrated && !!meLive && !meLive.onboarding_completed && !onboardingDismissed;

  useEffect(() => {
    const rehydrated = useTfpStore.persist.rehydrate();
    if (rehydrated instanceof Promise) {
      rehydrated.finally(() => setStoreHydrated(true));
    } else {
      setStoreHydrated(true);
    }
  }, []);

  // Reset dismiss when user switches
  useEffect(() => {
    setOnboardingDismissed(false);
  }, [currentUserId]);

  useEffect(() => {
    if (!storeHydrated) return;

    const fireOnce = (entityId: string, trigger: NotificationTrigger, notification: Parameters<typeof pushNotification>[0]) => {
      const key = `${entityId}:${trigger}:${notification.for_user_id ?? "system"}`;
      if (firedSessionNotifications.has(key)) return;
      firedSessionNotifications.add(key);
      pushNotification(notification);
    };

    signals
      .filter((signal) => (signal.status === "New" || signal.status === "In Review") && !signal.owner_id && hoursSince(signal.created_at) > 4)
      .forEach((signal) => fireOnce(signal.id, "shaping_stuck", {
        trigger: "shaping_stuck",
        title: "Signal unowned",
        body: signal.title,
        link_to: "/inbox",
        for_user_id: currentUserId,
        entity_id: signal.id,
      }));

    shaping
      .filter((item) => item.shaping_status === "In Shaping" && hoursSince(item.updated_at) > 120)
      .forEach((item) => fireOnce(item.id, "shaping_stuck", {
        trigger: "shaping_stuck",
        title: "Shaping stuck",
        body: "This shaping item has not moved in 5+ days.",
        link_to: "/shaping",
        for_user_id: item.pm_owner_id,
        entity_id: item.id,
      }));

    shaping
      .filter((item) => item.in_sprint && item.delivery_status && item.delivery_status !== "Done" && item.delivery_status !== "Blocked" && hoursSince(item.updated_at) > 48)
      .forEach((item) => {
        [item.delivery_assignee_id, "u-karim"].filter(Boolean).forEach((userId) => fireOnce(item.id, "blocked_over_1d", {
          trigger: "blocked_over_1d",
          title: "Item stale",
          body: `${item.jira_key ?? "Sprint item"} has not moved in 2+ days.`,
          link_to: "/delivery",
          for_user_id: userId,
          entity_id: item.id,
        }));
      });

    const inSprint = shaping.filter((item) => item.in_sprint && item.delivery_status);

    shaping
      .filter((item) => item.in_sprint && item.blocked_since && hoursSince(item.blocked_since) > 48)
      .forEach((item) => {
        [item.delivery_assignee_id, "u-shahid", "u-karim"].filter(Boolean).forEach((userId) => fireOnce(item.id, "blocked_over_1d", {
          trigger: "blocked_over_1d",
          title: "Blocker escalated",
          body: item.blocker_description || `${item.jira_key ?? "Sprint item"} has been blocked for 48+ hours.`,
          link_to: "/delivery",
          for_user_id: userId,
          entity_id: item.id,
        }));
      });

    if (sprint.allocated_pts > 0) {
      const usable = Math.max(1, sprint.gross_capacity_pts - sprint.leave_deduction_pts - sprint.interrupt_buffer_pts - sprint.qa_buffer_pts - sprint.uncertainty_buffer_pts - sprint.carryforward_estimate_pts - sprint.golive_deduction_pts);
      const blockedCount = inSprint.filter((item) => item.delivery_status === "Blocked").length;
      if (sprint.allocated_pts > usable || blockedCount >= 2) {
        fireOnce(sprint.id, "scope_change", {
          trigger: "scope_change",
          title: "Sprint goal at risk",
          body: `${sprint.allocated_pts}/${usable} pts allocated · ${blockedCount} blocked.`,
          link_to: "/leadership",
          for_user_id: "u-shahid",
          entity_id: sprint.id,
        });
      }
      if (sprint.allocated_pts / usable >= 0.9) {
        fireOnce(`${sprint.id}-capacity`, "scope_change", {
          trigger: "scope_change",
          title: "Sprint capacity over 90%",
          body: `${sprint.allocated_pts}/${usable} pts allocated.`,
          link_to: "/delivery",
          for_user_id: currentUserId,
          entity_id: sprint.id,
        });
      }
    }

    const sprintEndsInHours = (new Date(sprint.end_date).getTime() - Date.now()) / 3600000;
    const hasRetro = retros.some((retro) => retro.sprint_id === sprint.id);
    if (sprintEndsInHours < 0 && !hasRetro) {
      fireOnce(`${sprint.id}-retro-due`, "retro_escalation", {
        trigger: "retro_escalation",
        title: "Retro due for Active Sprint",
        body: "Retro due for Active Sprint — please log before closing.",
        link_to: "/delivery",
        for_user_id: "u-karim",
        entity_id: sprint.id,
      });
    }
    if (sprintEndsInHours < -48 && !hasRetro) {
      fireOnce(`${sprint.id}-retro-overdue`, "retro_escalation", {
        trigger: "retro_escalation",
        title: "Sprint retro overdue",
        body: "Sprint retro overdue — Active Sprint has not been reviewed.",
        link_to: "/leadership",
        for_user_id: "u-shahid",
        entity_id: sprint.id,
      });
    }
    if (sprintEndsInHours < 0 && inSprint.some((item) => item.delivery_status !== "Done")) {
      fireOnce(`${sprint.id}-close`, "blocker_signoff", {
        trigger: "blocker_signoff",
        title: "Sprint close checklist incomplete",
        body: `${sprint.name} has open delivery items after sprint end.`,
        link_to: "/delivery",
        for_user_id: "u-karim",
        entity_id: sprint.id,
      });
    }

    goLives.forEach((clinic) => {
      const entries = Object.entries(clinic.criteria);
      const firstOpenIndex = entries.findIndex(([, state]) => !state.done);
      if (clinic.status === "Live" || firstOpenIndex < 0) return;
      const previousCompleted = entries.slice(0, firstOpenIndex).map(([, state]) => state.checked_at).filter((date): date is string => Boolean(date)).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
      if (hoursSince(previousCompleted ?? clinic.created_at) > 72) {
        fireOnce(clinic.id, "golive_unconfirmed", {
          trigger: "golive_unconfirmed",
          title: "Clinic onboarding phase overdue",
          body: `${clinic.release_name} has an onboarding phase open for 3+ days.`,
          link_to: "/clinics",
          for_user_id: "u-shahid",
          entity_id: clinic.id,
        });
      }
    });

    shaping
      .filter((item) => item.delivery_status === "Done" && hoursSince(item.updated_at) > 120 && !reviews.some((review) => review.shaping_id === item.id && review.status === "Completed"))
      .forEach((item) => {
        [item.pm_owner_id, "u-shahid"].forEach((userId) => fireOnce(item.id, "review_overdue", {
          trigger: "review_overdue",
          title: "Review overdue",
          body: `${item.jira_key ?? "Done item"} needs an outcome review.`,
          link_to: "/delivery",
          for_user_id: userId,
          entity_id: item.id,
        }));
      });
  }, [currentUserId, goLives, pushNotification, retros, reviews, shaping, signals, sprint, storeHydrated]);

  // Global Cmd+K / Ctrl+K shortcut to open search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface/85 px-4 py-2.5 backdrop-blur">
            <SidebarTrigger />
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setSearchOpen(true)}
                className="hidden items-center gap-1.5 rounded-md border border-input bg-surface px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground md:inline-flex"
                title="Search (⌘K)"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Search</span>
                <kbd className="ml-1 hidden rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground lg:inline">⌘K</kbd>
              </button>
              <NotificationsBell />
              <button
                onClick={() => resetOnboarding(currentUserId)}
                className="hidden items-center gap-1 rounded-md border border-input bg-surface px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground md:inline-flex"
                title="Reopen onboarding checklist"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                Getting started
              </button>
              <button
                onClick={() => setDemoMode(!demoModeEnabled)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] transition",
                  demoModeEnabled
                    ? "border-[var(--color-status-hold)]/40 bg-[var(--color-status-hold)]/20 text-[var(--color-status-hold)]"
                    : "border-input bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                title="Auto-completes Tech Review and other multi-user steps for solo demos."
                aria-pressed={demoModeEnabled}
              >
                <Zap className="h-3.5 w-3.5" />
                Demo mode
              </button>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Viewing as</span>
                <select
                  value={currentUserId}
                  onChange={(e) => setCurrentUser(e.target.value)}
                  className="rounded-md border border-input bg-surface px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {USERS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {u.role}
                    </option>
                  ))}
                </select>
              </label>
              <div className="hidden items-center gap-2 md:flex">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                  {me.name[0]}
                </div>
              </div>
            </div>
          </header>

          {demoModeEnabled && !demoBannerDismissed && (
            <div className="border-b border-[var(--color-status-hold)]/30 bg-[var(--color-status-hold)]/15 px-6 py-2 text-sm text-[var(--color-status-hold)]">
              <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-3">
                <span>Demo mode active — multi-user steps auto-complete.</span>
                <button onClick={() => setDemoBannerDismissed(true)} className="rounded-md px-2 py-1 text-xs hover:bg-[var(--color-status-hold)]/10">
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <main className="mx-auto w-full max-w-[1500px] px-6 pb-8 pt-4">
            <Outlet />
          </main>

          <footer className="border-t border-border bg-surface/40 py-4 text-center text-[11px] text-muted-foreground">
            The Fertility Partners · Internal Use Only · Mock data — backend not yet wired
          </footer>
        </SidebarInset>

        {showOnboarding && <OnboardingModal onClose={() => setOnboardingDismissed(true)} />}
        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </SidebarProvider>
  );
}


function NotificationsBell() {
  const currentUserId = useTfpStore((s) => s.currentUserId);
  const notifications = useTfpStore((s) => s.notifications);
  const markRead = useTfpStore((s) => s.markNotificationRead);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lastSeenIdRef = useRef<string | null>(null);

  const visibleNotifications = useMemo(
    () => notifications.filter((n) => n.for_user_id === null || n.for_user_id === currentUserId),
    [currentUserId, notifications],
  );
  const unread = visibleNotifications.filter((n) => !n.read).length;

  // Toast on new notifications (fired during session, not on initial mount)
  useEffect(() => {
    if (visibleNotifications.length === 0) return;
    const newest = visibleNotifications[0];
    if (lastSeenIdRef.current === null) {
      lastSeenIdRef.current = newest.id;
      return;
    }
    if (newest.id !== lastSeenIdRef.current && !newest.read) {
      lastSeenIdRef.current = newest.id;
      const fn = newest.priority === "P1" ? toast.error : newest.priority === "P2" ? toast.warning : toast;
      fn(newest.title, { description: newest.body });
    }
  }, [visibleNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-9 w-9 place-items-center rounded-md border border-input bg-surface text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-[1rem] place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-[380px] overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Notifications · {unread} unread
            </span>
            <button onClick={() => visibleNotifications.forEach((n) => markRead(n.id))} className="text-[11px] text-primary hover:underline">
              Mark all read
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {visibleNotifications.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">No notifications.</p>
            )}
            {visibleNotifications.slice(0, 30).map((n) => (
              <Link
                key={n.id}
                to={n.link_to ?? "/intake"}
                onClick={() => {
                  markRead(n.id);
                  setOpen(false);
                }}
                className={cn(
                  "block border-b border-border/60 px-3 py-2.5 text-sm last:border-0 hover:bg-muted/40",
                  !n.read && "bg-primary/5",
                )}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className={cn("rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold", PRIORITY_TONE[n.priority])}>
                    {n.priority}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">{fmtDateTime(n.ts)}</span>
                </div>
                <p className={cn("font-medium leading-tight", !n.read && "text-foreground")}>{n.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
