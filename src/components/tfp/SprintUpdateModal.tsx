import { useEffect, useMemo, useState } from "react";
import { useTfpStore, USERS } from "@/lib/tfp/store";
import { buildSprintUpdate } from "@/lib/tfp/exports";
import { Copy, Check, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function SprintUpdateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sprint = useTfpStore((s) => s.sprint);
  const signals = useTfpStore((s) => s.signals);
  const shaping = useTfpStore((s) => s.shaping);
  const reviews = useTfpStore((s) => s.reviews);
  const overrides = useTfpStore((s) => s.overrides);
  const [copied, setCopied] = useState(false);

  // Deterministic "now" mirrors the leadership page seed epoch
  const now = useMemo(() => new Date("2026-04-15T09:00:00.000Z"), []);

  const markdown = useMemo(
    () => buildSprintUpdate({ sprint, signals, shaping, reviews, overrides, users: USERS, now }),
    [sprint, signals, shaping, reviews, overrides, now],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      toast.success("Sprint update copied", {
        description: "Paste into Teams, Slack or your retro doc.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed", { description: "Select the text manually and copy." });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
        <header className="flex items-start gap-3 border-b border-border p-5">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <FileText className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Sprint update</p>
            <h2 className="mt-0.5 font-display text-lg">Teams-ready summary · {sprint.name}</h2>
            <p className="text-[11px] text-muted-foreground">
              Markdown formatted — paste into Teams, Slack or any markdown renderer.
            </p>
          </div>
          <button
            onClick={copy}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
              copied
                ? "bg-[var(--color-status-proceed)]/15 text-[var(--color-status-proceed)]"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy markdown"}
          </button>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <pre className="flex-1 overflow-auto whitespace-pre-wrap break-words bg-background p-5 font-mono text-[12px] leading-relaxed text-foreground">
          {markdown}
        </pre>
      </div>
    </div>
  );
}
