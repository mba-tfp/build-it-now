import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTfpStore } from "@/lib/tfp/store";
import { BookOpen, Search } from "lucide-react";

export const Route = createFileRoute("/_app/help")({
  component: HelpLayout,
});

function HelpLayout() {
  const articles = useTfpStore((s) => s.helpArticles);
  const flags = useTfpStore((s) => s.flags);
  const location = useLocation();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q.trim()) return articles;
    const lc = q.toLowerCase();
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(lc) ||
        a.slug.toLowerCase().includes(lc) ||
        a.body_markdown.toLowerCase().includes(lc),
    );
  }, [articles, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const a of filtered) {
      const arr = map.get(a.section) ?? [];
      arr.push(a);
      map.set(a.section, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  if (!flags.helpCenterEnabled) {
    return (
      <div className="tfp-card mx-auto max-w-md p-8 text-center">
        <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-3 font-display text-xl">Help center disabled</h2>
        <p className="mt-2 text-sm text-muted-foreground">An admin can re-enable this in feature flags.</p>
      </div>
    );
  }

  const isIndex = location.pathname === "/help" || location.pathname === "/help/";

  return (
    <div>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Help</p>
        <h1 className="mt-1 font-display text-3xl">Help Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How to manage product work from signal to delivery. Search across all content.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <aside className="tfp-card p-3">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search articles…"
              className="w-full rounded border border-input bg-surface py-1.5 pl-7 pr-2 text-xs"
            />
          </div>
          <nav className="space-y-3">
            {grouped.map(([section, items]) => (
              <div key={section}>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{section}</p>
                <ul className="space-y-0.5">
                  {items.map((a) => (
                    <li key={a.id}>
                      <Link
                        to="/help/$slug"
                        params={{ slug: a.slug }}
                        className="block rounded px-2 py-1 text-xs hover:bg-muted/40"
                        activeProps={{ className: "block rounded px-2 py-1 text-xs bg-muted/40 font-medium text-foreground" }}
                      >
                        {a.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {grouped.length === 0 && (
              <p className="px-2 text-xs text-muted-foreground">No articles match.</p>
            )}
          </nav>
        </aside>

        <main className="tfp-card p-6">
          {isIndex ? (
            <div className="prose prose-sm max-w-none">
              <h2 className="font-display text-2xl">Welcome</h2>
              <p className="text-sm text-muted-foreground">
                TFP Workflow captures every signal — from the first clinic email to the leadership ask — and
                walks it through Home → Inbox → Shaping → Delivery → Roadmap without anything getting dropped.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Pick a topic on the left to learn how each step works. Admins can edit articles in the
                Admin panel.
              </p>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
