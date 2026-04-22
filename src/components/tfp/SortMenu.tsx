import { ArrowDown, ArrowDownUp, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { SortState } from "./SortableHeader";
import { writeSort, readSort } from "./SortableHeader";

export type SortOption<K extends string> = {
  key: K;
  label: string;
};

/**
 * Inline sort dropdown for card-based lists (where a <thead> doesn't exist).
 * Persists per-tableId in localStorage via the same store as <SortableHeader>.
 */
export function SortMenu<K extends string>({
  tableId,
  options,
  sort,
  onChange,
  className,
}: {
  tableId: string;
  options: SortOption<K>[];
  sort: SortState<K>;
  onChange: (next: SortState<K>) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const active = options.find((o) => o.key === sort.key);
  const Icon = !sort.dir ? ArrowDownUp : sort.dir === "asc" ? ArrowUp : ArrowDown;

  function pick(key: K) {
    let dir: "asc" | "desc" | null = "asc";
    if (sort.key === key) {
      dir = sort.dir === "asc" ? "desc" : sort.dir === "desc" ? null : "asc";
    }
    const next: SortState<K> = dir ? { key, dir } : { key: null, dir: null };
    writeSort(tableId, next);
    onChange(next);
    setOpen(false);
  }

  function clear() {
    const next: SortState<K> = { key: null, dir: null };
    writeSort(tableId, next);
    onChange(next);
    setOpen(false);
  }

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"
      >
        <Icon className="h-3 w-3" />
        <span>
          Sort{active ? `: ${active.label}` : ""}
          {sort.dir ? ` (${sort.dir})` : ""}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-30 w-48 overflow-hidden rounded-md border border-border bg-surface shadow-lg">
          {options.map((opt) => {
            const isActive = sort.key === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => pick(opt.key)}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-accent/40",
                  isActive && "text-foreground font-medium",
                )}
              >
                <span>{opt.label}</span>
                {isActive && (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {sort.dir}
                  </span>
                )}
              </button>
            );
          })}
          {sort.key && (
            <button
              type="button"
              onClick={clear}
              className="block w-full border-t border-border px-3 py-2 text-left text-[11px] text-muted-foreground hover:bg-accent/40"
            >
              Clear sort
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function useSortMenu<K extends string>(
  tableId: string,
  initial: SortState<K> = { key: null, dir: null },
) {
  const [sort, setSort] = useState<SortState<K>>(() => {
    const persisted = readSort<K>(tableId);
    return persisted.key ? persisted : initial;
  });
  return { sort, setSort };
}
