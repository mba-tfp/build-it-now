import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { USERS, useTfpStore } from "@/lib/tfp/store";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

const NAV: Array<{ to: string; label: string }> = [
  { to: "/intake", label: "Signal Intake" },
  { to: "/triage", label: "Triage" },
  { to: "/shaping", label: "Shaping" },
  { to: "/delivery", label: "Delivery" },
  { to: "/review", label: "Review" },
  { to: "/health", label: "Queue Health" },
];

export function AppShell() {
  const location = useLocation();
  const currentUserId = useTfpStore((s) => s.currentUserId);
  const setCurrentUser = useTfpStore((s) => s.setCurrentUser);
  const me = USERS.find((u) => u.id === currentUserId)!;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-6 py-3">
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

          <nav className="flex flex-1 items-center gap-0.5">
            {NAV.map((n) => {
              const active =
                location.pathname === n.to ||
                (n.to !== "/intake" && location.pathname.startsWith(n.to));
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition",
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
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Viewing as</span>
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

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-border bg-surface/40 py-4 text-center text-[11px] text-muted-foreground">
        The Fertility Partners · Internal Use Only · Wave 1 preview · No backend yet
      </footer>
    </div>
  );
}
