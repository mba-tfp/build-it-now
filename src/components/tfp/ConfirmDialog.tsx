import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

export function ConfirmDialog({
  open,
  title,
  description,
  requireReason = false,
  confirmLabel = "Confirm",
  destructive = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  requireReason?: boolean;
  confirmLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  if (!open) return null;
  const canConfirm = !requireReason || reason.trim().length >= 5;

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-foreground/30 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="fixed left-1/2 top-1/2 z-[101] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className={
                destructive
                  ? "grid h-8 w-8 place-items-center rounded-full bg-destructive/10 text-destructive"
                  : "grid h-8 w-8 place-items-center rounded-full bg-[var(--color-status-hold)]/10 text-[var(--color-status-hold)]"
              }
            >
              <AlertTriangle className="h-4 w-4" />
            </span>
            <h3 className="font-display text-lg leading-tight">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            className="rounded p-1 hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-sm text-muted-foreground whitespace-pre-line">{description}</p>
        {requireReason && (
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Reason for bypass (min 5 chars)…"
            className="mb-3 w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-accent/40"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm(reason);
              setReason("");
            }}
            disabled={!canConfirm}
            className={
              destructive
                ? "rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground hover:opacity-90 disabled:opacity-40"
                : "rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-40"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
