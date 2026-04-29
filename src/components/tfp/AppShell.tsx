import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { OnboardingModal } from "./OnboardingModal";
import { GlobalSearch } from "./GlobalSearch";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
      <SidebarHeader className="border-b border-sidebar-border">
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
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
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
  const pushNotification = useTfpStore((s) => s.pushNotification);
  const resetOnboarding = useTfpStore((s) => s.resetOnboarding);
  const me = (users.find((u) => u.id === currentUserId) ?? USERS.find((u) => u.id === currentUserId))!;
  const meLive = users.find((u) => u.id === currentUserId);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const showOnboarding = !!meLive && !meLive.onboarding_completed && !onboardingDismissed;

  // Reset dismiss when user switches
  useEffect(() => {
    setOnboardingDismissed(false);
  }, [currentUserId]);

  useEffect(() => {
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

    shaping
      .filter((item) => item.in_sprint && item.blocked_since && hoursSince(item.blocked_since) > 48)
      .forEach((item) => {
        ["u-shahid", "u-karim"].forEach((userId) => fireOnce(item.id, "blocked_over_1d", {
          trigger: "blocked_over_1d",
          title: "Blocker escalated",
          body: item.blocker_description || `${item.jira_key ?? "Sprint item"} has been blocked for 48+ hours.`,
          link_to: "/delivery",
          for_user_id: userId,
          entity_id: item.id,
        }));
      });

    shaping
      .filter((item) => item.delivery_status === "Done" && hoursSince(item.updated_at) > 120 && !reviews.some((review) => review.shaping_id === item.id && review.status === "Completed"))
      .forEach((item) => {
        [item.pm_owner_id, "u-shahid"].forEach((userId) => fireOnce(item.id, "review_overdue", {
          trigger: "review_overdue",
          title: "Review overdue",
          body: `${item.jira_key ?? "Done item"} needs an outcome review.`,
          link_to: "/review",
          for_user_id: userId,
          entity_id: item.id,
        }));
      });
  }, [currentUserId, pushNotification, reviews, shaping, signals]);

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
    <SidebarProvider>
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

          <main className="mx-auto w-full max-w-[1500px] px-6 py-8">
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
  const notifications = useTfpStore((s) => s.notifications);
  const markRead = useTfpStore((s) => s.markNotificationRead);
  const markAll = useTfpStore((s) => s.markAllNotificationsRead);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lastSeenIdRef = useRef<string | null>(null);

  const unread = notifications.filter((n) => !n.read).length;

  // Toast on new notifications (fired during session, not on initial mount)
  useEffect(() => {
    if (notifications.length === 0) return;
    const newest = notifications[0];
    if (lastSeenIdRef.current === null) {
      lastSeenIdRef.current = newest.id;
      return;
    }
    if (newest.id !== lastSeenIdRef.current && !newest.read) {
      lastSeenIdRef.current = newest.id;
      const fn = newest.priority === "P1" ? toast.error : newest.priority === "P2" ? toast.warning : toast;
      fn(newest.title, { description: newest.body });
    }
  }, [notifications]);

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
            <button onClick={markAll} className="text-[11px] text-primary hover:underline">
              Mark all read
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {notifications.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">No notifications.</p>
            )}
            {notifications.slice(0, 30).map((n) => (
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
