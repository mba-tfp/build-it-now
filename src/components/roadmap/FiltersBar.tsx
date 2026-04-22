import { Search, X, ChevronsUp, ChevronsDown, Download } from "lucide-react";
import type { GroupByField, Roadmap } from "@/lib/roadmap/types";
import { PRIORITIES, STATUSES } from "@/lib/roadmap/types";

export type Filters = {
  q: string;
  productIds: string[];
  sectionIds: string[];
  statuses: string[];
  priorities: string[];
  owners: string[];
  clinics: string[];
};

export const EMPTY_FILTERS: Filters = {
  q: "",
  productIds: [],
  sectionIds: [],
  statuses: [],
  priorities: [],
  owners: [],
  clinics: [],
};

type Props = {
  roadmap: Roadmap;
  filters: Filters;
  setFilters: (f: Filters) => void;
  groupBy: GroupByField[];
  setGroupBy: (g: GroupByField[]) => void;
  view: "timeline" | "list";
  setView: (v: "timeline" | "list") => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onExport: (format: "json" | "csv") => void;
};

const GROUP_FIELDS: { field: GroupByField; label: string }[] = [
  { field: "product", label: "Stream" },
  { field: "section", label: "Sub-Stream" },
  { field: "status", label: "Status" },
  { field: "priority", label: "Priority" },
  { field: "owner", label: "Owner" },
  { field: "clinic", label: "Clinic" },
];

export function FiltersBar({
  roadmap,
  filters,
  setFilters,
  groupBy,
  setGroupBy,
  view,
  setView,
  onCollapseAll,
  onExpandAll,
  onExport,
}: Props) {
  const owners = Array.from(new Set(roadmap.items.map((i) => i.owner).filter(Boolean))).sort();
  const clinics = Array.from(new Set(roadmap.items.map((i) => i.clinic).filter(Boolean))).sort();
  const allSections = roadmap.products.flatMap((p) => p.sections.map((s) => ({ ...s, product: p.name })));

  function toggle<T extends string>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  function toggleGroup(f: GroupByField) {
    setGroupBy(groupBy.includes(f) ? groupBy.filter((g) => g !== f) : [...groupBy, f]);
  }

  const activeFilterCount =
    filters.productIds.length +
    filters.sectionIds.length +
    filters.statuses.length +
    filters.priorities.length +
    filters.owners.length +
    filters.clinics.length +
    (filters.q ? 1 : 0);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="Search items…"
            className="w-full rounded-md border border-input bg-surface pl-8 pr-3 py-1.5 text-sm"
          />
        </div>

        <Multi
          label="Stream"
          values={filters.productIds}
          options={roadmap.products.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(v) => setFilters({ ...filters, productIds: v })}
        />
        <Multi
          label="Sub-Stream"
          values={filters.sectionIds}
          options={allSections.map((s) => ({ value: s.id, label: `${s.product} › ${s.name}` }))}
          onChange={(v) => setFilters({ ...filters, sectionIds: v })}
        />
        <Multi
          label="Status"
          values={filters.statuses}
          options={STATUSES.map((s) => ({ value: s, label: s }))}
          onChange={(v) => setFilters({ ...filters, statuses: v })}
        />
        <Multi
          label="Priority"
          values={filters.priorities}
          options={PRIORITIES.map((p) => ({ value: p, label: p }))}
          onChange={(v) => setFilters({ ...filters, priorities: v })}
        />
        {owners.length > 0 && (
          <Multi
            label="Owner"
            values={filters.owners}
            options={owners.map((o) => ({ value: o, label: o }))}
            onChange={(v) => setFilters({ ...filters, owners: v })}
          />
        )}
        {clinics.length > 0 && (
          <Multi
            label="Clinic"
            values={filters.clinics}
            options={clinics.map((c) => ({ value: c, label: c }))}
            onChange={(v) => setFilters({ ...filters, clinics: v })}
          />
        )}

        {activeFilterCount > 0 && (
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-surface px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            <X className="h-3 w-3" /> Clear ({activeFilterCount})
          </button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <div className="flex overflow-hidden rounded-md border border-input">
            <button
              onClick={() => setView("timeline")}
              className={`px-3 py-1.5 text-xs ${view === "timeline" ? "bg-primary text-primary-foreground" : "bg-surface text-foreground hover:bg-accent"}`}
            >
              Timeline
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 text-xs ${view === "list" ? "bg-primary text-primary-foreground" : "bg-surface text-foreground hover:bg-accent"}`}
            >
              List
            </button>
          </div>

          {view === "timeline" && (
            <>
              <button onClick={onCollapseAll} className="grid h-7 w-7 place-items-center rounded-md border border-input bg-surface text-muted-foreground hover:bg-accent" title="Collapse all">
                <ChevronsUp className="h-3.5 w-3.5" />
              </button>
              <button onClick={onExpandAll} className="grid h-7 w-7 place-items-center rounded-md border border-input bg-surface text-muted-foreground hover:bg-accent" title="Expand all">
                <ChevronsDown className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          <button onClick={() => onExport("json")} className="inline-flex items-center gap-1 rounded-md border border-input bg-surface px-2 py-1 text-xs hover:bg-accent" title="Export JSON">
            <Download className="h-3 w-3" /> JSON
          </button>
          <button onClick={() => onExport("csv")} className="inline-flex items-center gap-1 rounded-md border border-input bg-surface px-2 py-1 text-xs hover:bg-accent" title="Export CSV">
            <Download className="h-3 w-3" /> CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Group by:</span>
        {GROUP_FIELDS.map(({ field, label }) => {
          const idx = groupBy.indexOf(field);
          const active = idx >= 0;
          return (
            <button
              key={field}
              onClick={() => toggleGroup(field)}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-surface text-muted-foreground hover:bg-accent"
              }`}
            >
              {active && <span className="font-mono text-[10px]">{idx + 1}.</span>}
              {label}
            </button>
          );
        })}
        {groupBy.length > 0 && (
          <button onClick={() => setGroupBy([])} className="text-xs text-muted-foreground hover:underline">
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function Multi({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: { value: string; label: string }[];
  onChange: (v: string[]) => void;
}) {
  return (
    <details className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md border border-input bg-surface px-2.5 py-1.5 text-xs hover:bg-accent">
        {label}
        {values.length > 0 && (
          <span className="rounded bg-primary/15 px-1 text-[10px] font-medium text-primary">{values.length}</span>
        )}
      </summary>
      <div className="absolute left-0 top-9 z-30 max-h-64 w-56 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-lg">
        {options.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No options</p>}
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent">
            <input
              type="checkbox"
              checked={values.includes(o.value)}
              onChange={() => onChange(values.includes(o.value) ? values.filter((v) => v !== o.value) : [...values, o.value])}
            />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
