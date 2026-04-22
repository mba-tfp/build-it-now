import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { USERS, useTfpStore } from "@/lib/tfp/store";
import { PRIORITY_TONE } from "@/lib/tfp/notify";
import { fmtDateTime } from "@/lib/tfp/format";
import { cn } from "@/lib/utils";
import { Activity, Bell, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { OnboardingModal } from "./OnboardingModal";

const NAV: Array<{ to: string; label: string }> = [
  { to: "/intake", label: "Intake" },
  { to: "/triage", label: "Triage" },
  { to: "/shaping", label: "Shaping" },
  { to: "/delivery", label: "Delivery" },
  { to: "/golive", label: "Go-Live" },
  { to: "/comms", label: "Comms" },
  { to: "/review", label: "Reviews" },
  { to: "/retros", label: "Retros" },
  { to: "/decisions", label: "Decisions" },
  { to: "/overrides", label: "Overrides" },
  { to: "/leadership", label: "Leadership" },
  { to: "/health", label: "Queue Health" },
];

export function AppShell() {
  const location = useLocation();
  const currentUserId = useTfpStore((s) => s.currentUserId);
  const setCurrentUser = useTfpStore((s) => s.setCurrentUser);
  const users = useTfpStore((s) => s.users);
  const resetOnboarding = useTfpStore((s) => s.resetOnboarding);
  const me = (users.find((u) => u.id === currentUserId) ?? USERS.find((u) => u.id === currentUserId))!;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-6 py-3">
          <Link to="/intake" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Activity className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <div className="leading-tight">
              <div className="font-display text-[15px] tracking-tight">TFP OS</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Signal → Shaping → Delivery
              </div>
            </div>
          </Link>

          <nav className="flex flex-1 flex-wrap items-center gap-0.5">
            {NAV.map((n) => {
              const active =
                location.pathname === n.to ||
                (n.to !== "/intake" && location.pathname.startsWith(n.to));
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[13px] transition",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <NotificationsBell />
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
            <div className="hidden items-center gap-2 md:flex">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                {me.name[0]}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-border bg-surface/40 py-4 text-center text-[11px] text-muted-foreground">
        The Fertility Partners · Internal Use Only · Mock data — backend not yet wired
      </footer>
    </div>
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
