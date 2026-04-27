import { Link } from "@tanstack/react-router";
import { USERS, useTfpStore } from "@/lib/tfp/store";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { id: string; label: string; to: string };

const CHECKLIST: Item[] = [
  { id: "home", label: "Start at Home to see today's work", to: "/" },
  { id: "inbox", label: "Capture or review incoming work", to: "/inbox" },
  { id: "shaping", label: "Shape approved work", to: "/shaping" },
  { id: "delivery", label: "Track sprint delivery", to: "/delivery" },
  { id: "roadmap", label: "Plan with the roadmap", to: "/roadmap" },
  { id: "leadership", label: "Use leadership and support views when needed", to: "/leadership" },
];

export function OnboardingModal({ onClose }: { onClose: () => void }) {
  const me = USERS.find((u) => u.id === useTfpStore((s) => s.currentUserId))!;
  const user = useTfpStore((s) => s.users.find((u) => u.id === me.id)) ?? me;
  const completeItem = useTfpStore((s) => s.completeOnboardingItem);
  const completeAll = useTfpStore((s) => s.completeOnboarding);

  const items = CHECKLIST;
  const allDone = items.every((i) => user.onboarding_progress[i.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
        <header className="flex items-start gap-3 border-b border-border p-5">
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Welcome to TFP Workflow</p>
            <h2 className="mt-0.5 font-display text-xl">Getting started</h2>
            <p className="mt-1 text-xs text-muted-foreground">One simple path from signal to delivery.</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5">
          {allDone ? (
            <div className="text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--color-status-proceed)]/10 text-[var(--color-status-proceed)]">
                <Check className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg">You're set up</h3>
              <button
                onClick={() => { completeAll(me.id); onClose(); }}
                className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Finish
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => {
                const done = !!user.onboarding_progress[item.id];
                return (
                  <li key={item.id}>
                    <Link
                      to={item.to}
                      onClick={() => { completeItem(me.id, item.id); onClose(); }}
                      className={cn(
                        "flex items-center gap-3 rounded-md border p-3 text-sm transition",
                        done ? "border-[var(--color-status-proceed)]/30 bg-[var(--color-status-proceed)]/5" : "border-border hover:border-primary/40 hover:bg-accent/40",
                      )}
                    >
                      <span className={cn(
                        "grid h-5 w-5 place-items-center rounded-full",
                        done ? "bg-[var(--color-status-proceed)] text-white" : "bg-muted text-muted-foreground",
                      )}>
                        {done ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                      </span>
                      <span className={cn("flex-1", done && "line-through opacity-70")}>{item.label}</span>
                      <span className="text-[11px] text-muted-foreground">{item.to}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-border bg-muted/20 px-5 py-3">
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
            Remind me later
          </button>
          {!allDone && (
            <button
              onClick={() => { completeAll(me.id); onClose(); }}
              className="text-xs text-primary hover:underline"
            >
              Skip — mark complete
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
