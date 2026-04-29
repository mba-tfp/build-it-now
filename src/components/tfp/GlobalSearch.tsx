import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useTfpStore } from "@/lib/tfp/store";
import { cn } from "@/lib/utils";

type Hit = {
  id: string;
  type: "Signal" | "Shaping" | "Decision" | "Override" | "Comms" | "Clinics" | "Lookback";
  title: string;
  excerpt: string;
  product?: string;
  to: string;
};

function highlight(text: string, q: string) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-primary/20 px-0.5 text-primary">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function excerpt(text: string, q: string, max = 80) {
  if (!text) return "";
  if (!q) return text.slice(0, max);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text.slice(0, max);
  const start = Math.max(0, idx - 20);
  return (start > 0 ? "…" : "") + text.slice(start, start + max);
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const signals = useTfpStore((s) => s.signals);
  const shaping = useTfpStore((s) => s.shaping);
  const decisions = useTfpStore((s) => s.decisions);
  const overrides = useTfpStore((s) => s.overrides);
  const comms = useTfpStore((s) => s.comms);
  const goLives = useTfpStore((s) => s.goLives);
  const reviews = useTfpStore((s) => s.reviews);

  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), 200);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setDebounced("");
    }
  }, [open]);

  const results = useMemo(() => {
    const lc = debounced.trim().toLowerCase();
    const hits: Record<Hit["type"], Hit[]> = {
      Signal: [],
      Shaping: [],
      Decision: [],
      Override: [],
      Comms: [],
      Clinics: [],
      Lookback: [],
    };
    if (!lc) return hits;
    const m = (s: string) => s.toLowerCase().includes(lc);

    signals.forEach((s) => {
      if (m(s.title) || m(s.description)) {
        hits.Signal.push({
          id: s.id,
          type: "Signal",
          title: s.title,
          excerpt: excerpt(m(s.title) ? s.title : s.description, debounced),
          product: s.product,
          to: "/inbox",
        });
      }
    });
    shaping.forEach((sh) => {
      const sig = signals.find((x) => x.id === sh.signal_id);
      const text = `${sh.problem_what} ${sh.solution_approach}`;
      if (m(text)) {
        hits.Shaping.push({
          id: sh.id,
          type: "Shaping",
          title: sig?.title ?? (sh.problem_what.slice(0, 80) || sh.id),
          excerpt: excerpt(m(sh.problem_what) ? sh.problem_what : sh.solution_approach, debounced),
          product: sig?.product,
          to: "/shaping",
        });
      }
    });
    decisions.forEach((d) => {
      const text = `${d.title} ${d.context} ${d.decision}`;
      if (m(text)) {
        hits.Decision.push({
          id: d.id,
          type: "Decision",
          title: d.title,
          excerpt: excerpt(m(d.context) ? d.context : d.decision, debounced),
          to: "/shaping",
        });
      }
    });
    overrides.forEach((o) => {
      if (m(o.reason) || m(o.id)) {
        hits.Override.push({
          id: o.id,
          type: "Override",
          title: `${o.id} · ${o.kind}`,
          excerpt: excerpt(o.reason, debounced),
          to: "/delivery",
        });
      }
    });
    comms.forEach((c) => {
      if (m(c.subject) || m(c.body)) {
        hits.Comms.push({
          id: c.id,
          type: "Comms",
          title: c.subject,
          excerpt: excerpt(m(c.subject) ? c.subject : c.body, debounced),
          product: c.product,
          to: "/governance",
        });
      }
    });
    goLives.forEach((g) => {
      if (m(g.release_name)) {
        hits.Clinics.push({
          id: g.id,
          type: "Clinics",
          title: g.release_name,
          excerpt: `Scheduled ${g.scheduled_for.slice(0, 10)} · ${g.status}`,
          product: g.product,
          to: "/clinics",
        });
      }
    });
    reviews.forEach((r) => {
      const text = `${r.notes} ${r.what_worked} ${r.what_didnt}`;
      if (m(text)) {
        hits.Lookback.push({
          id: r.id,
          type: "Lookback",
          title: `${r.size} review · ${r.status}`,
          excerpt: excerpt(m(r.notes) ? r.notes : r.what_worked, debounced),
          to: "/governance",
        });
      }
    });
    return hits;
  }, [debounced, signals, shaping, decisions, overrides, comms, goLives, reviews]);

  if (!open) return null;

  const totalHits = Object.values(results).reduce((a, b) => a + b.length, 0);

  function go(to: string) {
    onClose();
    navigate({ to });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[10vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
        <Command shouldFilter={false}>
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder="Search signals, shaping, decisions, comms…"
            autoFocus
          />
          <CommandList className="max-h-[60vh]">
            {debounced && totalHits === 0 && (
              <CommandEmpty>
                <div className="space-y-2 py-6 text-center">
                  <p className="text-sm text-muted-foreground">No results for "{debounced}"</p>
                  <button
                    onClick={() => go("/intake")}
                    className="text-xs text-primary hover:underline"
                  >
                    Log a new signal →
                  </button>
                </div>
              </CommandEmpty>
            )}
            {!debounced && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Start typing to search across the workspace.
              </div>
            )}
            {(["Signal", "Shaping", "Decision", "Override", "Comms", "Clinics", "Lookback"] as const).map((type) => {
              const list = results[type];
              if (list.length === 0) return null;
              const visible = list.slice(0, 5);
              return (
                <CommandGroup key={type} heading={`${type === "Clinics" ? "Clinics" : `${type}s`} (${list.length})`}>
                  {visible.map((h) => (
                    <CommandItem key={h.id} value={`${h.type}-${h.id}`} onSelect={() => go(h.to)}>
                      <span className={cn("rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase", typeBadgeTone(type))}>{type}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{highlight(h.title, debounced)}</div>
                        {h.excerpt && <div className="truncate text-xs text-muted-foreground">{highlight(h.excerpt, debounced)}</div>}
                      </div>
                      {h.product && <span className="ml-auto rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{h.product}</span>}
                    </CommandItem>
                  ))}
                  {list.length > 5 && (
                    <CommandItem value={`more-${type}`} onSelect={() => go(visible[0]?.to ?? "/intake")}>
                      <span className="text-xs text-primary">See all {list.length} {type} results →</span>
                    </CommandItem>
                  )}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </div>
    </div>
  );
}

function typeBadgeTone(type: Hit["type"]): string {
  switch (type) {
    case "Signal":
      return "bg-[var(--color-status-new)]/15 text-[var(--color-status-new)]";
    case "Shaping":
      return "bg-primary/15 text-primary";
    case "Decision":
      return "bg-[var(--color-status-proceed)]/15 text-[var(--color-status-proceed)]";
    case "Override":
      return "bg-destructive/15 text-destructive";
    case "Comms":
      return "bg-[var(--color-status-hold)]/15 text-[var(--color-status-hold)]";
    case "Clinics":
      return "bg-accent text-accent-foreground";
    case "Lookback":
      return "bg-muted text-muted-foreground";
  }
}
