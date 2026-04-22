import { Link } from "@tanstack/react-router";
import { USERS, useTfpStore } from "@/lib/tfp/store";
import type { Role } from "@/lib/tfp/types";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { id: string; label: string; to: string };

const CHECKLISTS: Record<Role, Item[]> = {
  PM: [
    { id: "log_signal", label: "Log your first signal", to: "/intake" },
    { id: "triage_3", label: "Triage 3 signals", to: "/triage" },
    { id: "open_shaping", label: "Open a shaping item", to: "/shaping" },
    { id: "delivery_board", label: "Review the delivery board", to: "/delivery" },
    { id: "queue_health", label: "Open Queue Health", to: "/health" },
  ],
  "Senior PM": [
    { id: "log_signal", label: "Log your first signal", to: "/intake" },
    { id: "triage_3", label: "Triage 3 signals", to: "/triage" },
    { id: "open_shaping", label: "Open a shaping item", to: "/shaping" },
    { id: "delivery_board", label: "Review the delivery board", to: "/delivery" },
    { id: "queue_health", label: "Open Queue Health", to: "/health" },
  ],
  "Associate PM": [
    { id: "log_clinic", label: "Log a clinic signal", to: "/intake" },
    { id: "triage", label: "Review the Triage queue", to: "/triage" },
    { id: "draft_comms", label: "Draft a clinic communication", to: "/comms" },
    { id: "golive", label: "Open a go-live checklist", to: "/golive" },
  ],
  "Tech Lead": [
    { id: "open_shaping", label: "Open a shaping item awaiting tech review", to: "/shaping" },
    { id: "tech_review", label: "Complete a tech review", to: "/shaping" },
    { id: "delivery_board", label: "Review the Delivery board", to: "/delivery" },
    { id: "log_decision", label: "Log a decision in the Decision Log", to: "/decisions" },
  ],
  Developer: [
    { id: "delivery_board", label: "Review the Delivery board", to: "/delivery" },
    { id: "assigned", label: "Open your assigned items", to: "/delivery" },
    { id: "dev_complete", label: "Read the Dev Complete gate (three checkboxes)", to: "/delivery" },
  ],
  "QA Scrum Master": [
    { id: "delivery_board", label: "Review the Delivery board", to: "/delivery" },
    { id: "queue_health", label: "Open Queue Health", to: "/health" },
    { id: "retros", label: "Review the Sprint Retros section", to: "/retros" },
  ],
  Leadership: [
    { id: "leadership", label: "Review the Leadership dashboard", to: "/leadership" },
    { id: "queue_health", label: "Open Queue Health", to: "/health" },
    { id: "overrides", label: "Review the Override log", to: "/overrides" },
  ],
};

export function OnboardingModal({ onClose }: { onClose: () => void }) {
  const me = USERS.find((u) => u.id === useTfpStore((s) => s.currentUserId))!;
  const user = useTfpStore((s) => s.users.find((u) => u.id === me.id)) ?? me;
  const completeItem = useTfpStore((s) => s.completeOnboardingItem);
  const completeAll = useTfpStore((s) => s.completeOnboarding);

  const items = CHECKLISTS[me.role] ?? [];
  const allDone = items.every((i) => user.onboarding_progress[i.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
        <header className="flex items-start gap-3 border-b border-border p-5">
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Welcome to TFP OS</p>
            <h2 className="mt-0.5 font-display text-xl">Getting started · {me.role}</h2>
            <p className="mt-1 text-xs text-muted-foreground">A short tour of the surfaces relevant to your role.</p>
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
