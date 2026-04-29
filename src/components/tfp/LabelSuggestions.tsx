import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useTfpStore } from "@/lib/tfp/store";

export const SEEDED_LABELS = ["French-required", "PHIPA", "patient-facing", "integration", "tech-debt", "Procrea-QC", "compliance", "board"];

export function LabelSuggestions({ selected, onAdd }: { selected: string[]; onAdd: (label: string) => void }) {
  const customLabels = useTfpStore((s) => s.customLabels);
  const addCustomLabel = useTfpStore((s) => s.addCustomLabel);
  const removeCustomLabel = useTfpStore((s) => s.removeCustomLabel);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const labels = [...SEEDED_LABELS, ...customLabels.filter((label) => !SEEDED_LABELS.some((seed) => seed.toLowerCase() === label.toLowerCase()))];

  function commit() {
    const label = draft.trim();
    if (!label) {
      setAdding(false);
      return;
    }
    addCustomLabel(label);
    onAdd(label);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {labels.map((label) => {
        const custom = customLabels.includes(label);
        return (
          <span key={label} className="group inline-flex items-center rounded-full border border-border bg-surface text-[11px] text-muted-foreground hover:bg-accent/40">
            <button type="button" onClick={() => onAdd(label)} className="px-2 py-0.5">
              {label}{selected.includes(label) ? " ✓" : ""}
            </button>
            {custom && (
              <button
                type="button"
                onClick={() => window.confirm(`Remove ${label} from suggestions? Existing signals using this label will keep it.`) && removeCustomLabel(label)}
                className="hidden pr-1.5 text-muted-foreground hover:text-destructive group-hover:inline-flex"
                aria-label={`Remove ${label}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          placeholder="Type new label and press Enter"
          className="min-w-56 rounded-full border border-input bg-surface px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="grid h-6 w-6 place-items-center rounded-full border border-border bg-surface text-muted-foreground hover:bg-accent/40" aria-label="Add custom label">
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}