import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc" | null;
export type SortState<K extends string = string> = { key: K | null; dir: SortDir };

const STORAGE_PREFIX = "tfp.sort.";

export function readSort<K extends string>(tableId: string): SortState<K> {
  if (typeof window === "undefined") return { key: null, dir: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + tableId);
    if (!raw) return { key: null, dir: null };
    return JSON.parse(raw);
  } catch {
    return { key: null, dir: null };
  }
}

export function writeSort<K extends string>(tableId: string, state: SortState<K>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + tableId, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function useTableSort<K extends string>(tableId: string, initial: SortState<K> = { key: null, dir: null }) {
  const [sort, setSort] = useState<SortState<K>>(() => {
    const persisted = readSort<K>(tableId);
    return persisted.key ? persisted : initial;
  });
  const cycle = useCallback(
    (key: K) => {
      setSort((prev) => {
        let next: SortState<K>;
        if (prev.key !== key) next = { key, dir: "asc" };
        else if (prev.dir === "asc") next = { key, dir: "desc" };
        else next = { key: null, dir: null };
        writeSort(tableId, next);
        return next;
      });
    },
    [tableId],
  );
  return { sort, setSort, cycle };
}

export function sortRows<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  getValue: (row: T, key: K) => string | number | null | undefined,
): T[] {
  if (!sort.key || !sort.dir) return rows;
  const { key, dir } = sort;
  return [...rows].sort((a, b) => {
    const av = getValue(a, key);
    const bv = getValue(b, key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") {
      return dir === "asc" ? av - bv : bv - av;
    }
    const as = String(av).toLowerCase();
    const bs = String(bv).toLowerCase();
    if (as < bs) return dir === "asc" ? -1 : 1;
    if (as > bs) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

export function SortableHeader<K extends string>({
  field,
  sort,
  onSort,
  children,
  className,
}: {
  field: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const active = sort.key === field;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("px-3 py-2.5 font-medium", className)}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition",
          active && "text-foreground",
        )}
      >
        <span>{children}</span>
        <Icon className="h-3 w-3 opacity-60" />
      </button>
    </th>
  );
}
