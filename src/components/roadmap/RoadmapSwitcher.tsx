import { useState } from "react";
import { roadmapActions } from "@/lib/roadmap/store";
import type { RoadmapRegistryEntry } from "@/lib/roadmap/types";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";

type Props = {
  registry: RoadmapRegistryEntry[];
  activeId: string;
};

export function RoadmapSwitcher({ registry, activeId }: Props) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");

  const active = registry.find((r) => r.id === activeId);

  function handleCreate() {
    if (!name.trim()) return;
    roadmapActions.createRoadmap(name.trim());
    setName("");
    setCreateOpen(false);
    setOpen(false);
  }

  function handleDelete(id: string, label: string) {
    if (!confirm(`Delete roadmap "${label}"? This cannot be undone.`)) return;
    roadmapActions.deleteRoadmap(id);
  }

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-1.5 text-sm hover:bg-accent"
        >
          <span className="font-medium">{active?.name ?? "Select roadmap"}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-10 z-40 w-72 overflow-hidden rounded-md border border-border bg-surface shadow-lg">
              <div className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Your roadmaps
              </div>
              <div className="max-h-64 overflow-y-auto">
                {registry.map((r) => (
                  <div
                    key={r.id}
                    className={`group flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent ${r.id === activeId ? "bg-primary/5 font-medium" : ""}`}
                  >
                    <button
                      onClick={() => {
                        roadmapActions.setActive(r.id);
                        setOpen(false);
                      }}
                      className="flex-1 truncate text-left"
                    >
                      {r.name}
                    </button>
                    <button
                      onClick={() => handleDelete(r.id, r.name)}
                      className="rounded p-1 opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      title="Delete roadmap"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
                className="flex w-full items-center gap-1.5 border-t border-border px-3 py-2 text-sm text-primary hover:bg-primary/5"
              >
                <Plus className="h-3.5 w-3.5" /> New roadmap
              </button>
            </div>
          </>
        )}
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setCreateOpen(false)}>
          <div className="w-full max-w-md rounded-lg border border-border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="font-display text-lg">New roadmap</h2>
              <button onClick={() => setCreateOpen(false)} className="rounded p-1 hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Name</label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                  className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
                  placeholder="e.g. FY26 Strategic Roadmap"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                A new roadmap is seeded with the 6 locked Otto/TFP streams. You can add more streams in Settings.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-muted/20 px-5 py-3">
              <button onClick={() => setCreateOpen(false)} className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm hover:bg-accent">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
