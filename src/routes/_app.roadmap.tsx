import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Settings as SettingsIcon,
  Calendar,
  GitBranch,
  Upload,
  Undo2,
  Redo2,
} from "lucide-react";
import {
  useRoadmapStore,
  roadmapActions,
  readUiPrefs,
  writeUiPrefs,
  undo,
  redo,
  canUndo,
  canRedo,
} from "@/lib/roadmap/store";
import type { GroupByField, Roadmap, RoadmapItem } from "@/lib/roadmap/types";
import { useTfpStore } from "@/lib/tfp/store";
import type { Product as TfpProduct, ShapingItem, Signal } from "@/lib/tfp/types";
import { RoadmapSwitcher } from "@/components/roadmap/RoadmapSwitcher";
import { SummaryStats } from "@/components/roadmap/SummaryStats";
import { FiltersBar, EMPTY_FILTERS, type Filters } from "@/components/roadmap/FiltersBar";
import { TimelineGrid } from "@/components/roadmap/TimelineGrid";
import { ListView } from "@/components/roadmap/ListView";
import { ItemModal } from "@/components/roadmap/ItemModal";
import { SettingsView } from "@/components/roadmap/SettingsView";
import { ImportModal } from "@/components/roadmap/ImportModal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/roadmap")({
  component: RoadmapPage,
});

type ModalState =
  | { mode: "create"; productId?: string; sectionId?: string; months?: string[] }
  | { mode: "edit"; itemId: string }
  | null;

// Persisted UI preferences shape
type RoadmapUiPrefs = {
  view: "timeline" | "list";
  filters: Filters;
  groupBy: GroupByField[];
  collapsedYears: number[];
  collapsedQuarters: string[];
  collapsedStreams: string[];
  tab: "planning" | "delivery";
};

const DEFAULT_PREFS: RoadmapUiPrefs = {
  view: "timeline",
  filters: EMPTY_FILTERS,
  groupBy: ["product"],
  collapsedYears: [],
  collapsedQuarters: [],
  collapsedStreams: [],
  tab: "planning",
};

function RoadmapPage() {
  const snap = useRoadmapStore();
  const activeId = snap.activeId;
  // Hydrate persisted tab choice on first mount per roadmap.
  const [tab, setTab] = useState<"planning" | "delivery">("planning");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!activeId) return;
    const prefs = readUiPrefs<RoadmapUiPrefs>(activeId, DEFAULT_PREFS);
    setTab(prefs.tab);
    setHydrated(true);
  }, [activeId]);

  // Persist tab whenever it changes (after hydration).
  useEffect(() => {
    if (!hydrated || !activeId) return;
    const prefs = readUiPrefs<RoadmapUiPrefs>(activeId, DEFAULT_PREFS);
    writeUiPrefs(activeId, { ...prefs, tab });
  }, [tab, hydrated, activeId]);

  // Loading guard for SSR/first paint
  if (!snap.active) {
    return (
      <div className="grid place-items-center py-20 text-sm text-muted-foreground">
        Loading roadmap…
      </div>
    );
  }

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">View · Roadmap</p>
          <h1 className="mt-1 font-display text-3xl">Roadmap</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan strategic work across months by Stream → Sub-Stream. Switch tabs for delivery view derived from active shaping items.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RoadmapSwitcher registry={snap.registry} activeId={snap.activeId} />
        </div>
      </header>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b border-border">
        <TabButton active={tab === "planning"} onClick={() => setTab("planning")} icon={<Calendar className="h-3.5 w-3.5" />}>
          Strategic Planning
        </TabButton>
        <TabButton active={tab === "delivery"} onClick={() => setTab("delivery")} icon={<GitBranch className="h-3.5 w-3.5" />}>
          Delivery (from Shaping)
        </TabButton>
      </div>

      {tab === "planning" ? <PlanningTab roadmap={snap.active} /> : <DeliveryTab />}
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition",
        active ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ============= Planning Tab =============

function PlanningTab({ roadmap }: { roadmap: Roadmap }) {
  const [view, setView] = useState<"timeline" | "list">("timeline");
  const [showSettings, setShowSettings] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [groupBy, setGroupBy] = useState<GroupByField[]>(["product"]);
  const [modal, setModal] = useState<ModalState>(null);

  // Collapsed state for timeline
  const allYears = Array.from(new Set([roadmap.config.start_year, roadmap.config.start_year + 1]));
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set());
  const [collapsedQuarters, setCollapsedQuarters] = useState<Set<string>>(new Set());
  const [collapsedStreams, setCollapsedStreams] = useState<Set<string>>(new Set());

  function toggleYear(y: number) {
    setCollapsedYears((s) => {
      const n = new Set(s);
      if (n.has(y)) n.delete(y);
      else n.add(y);
      return n;
    });
  }
  function toggleQuarter(k: string) {
    setCollapsedQuarters((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }
  function toggleStream(id: string) {
    setCollapsedStreams((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function collapseAll() {
    setCollapsedStreams(new Set(roadmap.products.map((p) => p.id)));
  }
  function expandAll() {
    setCollapsedStreams(new Set());
    setCollapsedYears(new Set());
    setCollapsedQuarters(new Set());
  }

  // Apply filters
  const filteredItems = useMemo(() => {
    return roadmap.items.filter((it) => {
      if (filters.q && !`${it.title} ${it.description} ${it.notes}`.toLowerCase().includes(filters.q.toLowerCase())) return false;
      if (filters.productIds.length && !filters.productIds.includes(it.product_id)) return false;
      if (filters.sectionIds.length && !filters.sectionIds.includes(it.section_id)) return false;
      if (filters.statuses.length && !filters.statuses.includes(it.status)) return false;
      if (filters.priorities.length && !filters.priorities.includes(it.priority)) return false;
      if (filters.owners.length && !filters.owners.includes(it.owner)) return false;
      if (filters.clinics.length && !filters.clinics.includes(it.clinic)) return false;
      return true;
    });
  }, [roadmap.items, filters]);

  function handleExport(format: "json" | "csv") {
    const data = filteredItems.map((it) => {
      const product = roadmap.products.find((p) => p.id === it.product_id);
      const section = product?.sections.find((s) => s.id === it.section_id);
      return {
        title: it.title,
        stream: product?.name ?? "",
        sub_stream: section?.name ?? "",
        status: it.status,
        priority: it.priority,
        owner: it.owner,
        clinic: it.clinic,
        months: it.months.join(";"),
        internal_only: it.internal_only,
        description: it.description,
        notes: it.notes,
      };
    });

    let blob: Blob;
    let filename: string;

    if (format === "json") {
      blob = new Blob([JSON.stringify({ roadmap: roadmap.name, items: data }, null, 2)], { type: "application/json" });
      filename = `${roadmap.name.replace(/\s+/g, "_")}.json`;
    } else {
      const headers = ["title", "stream", "sub_stream", "status", "priority", "owner", "clinic", "months", "internal_only", "description", "notes"];
      const csv = [
        headers.join(","),
        ...data.map((row) =>
          headers
            .map((h) => {
              const v = String((row as Record<string, unknown>)[h] ?? "");
              return `"${v.replace(/"/g, '""')}"`;
            })
            .join(","),
        ),
      ].join("\n");
      blob = new Blob([csv], { type: "text/csv" });
      filename = `${roadmap.name.replace(/\s+/g, "_")}.csv`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Top bar with summary + actions */}
      <SummaryStats roadmap={roadmap} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModal({ mode: "create" })}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> Add item
          </button>
          <button
            onClick={() => setShowSettings((s) => !s)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm",
              showSettings ? "border-primary bg-primary/10 text-primary" : "border-input bg-surface hover:bg-accent",
            )}
          >
            <SettingsIcon className="h-3.5 w-3.5" /> Settings
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {filteredItems.length} of {roadmap.items.length} items
        </p>
      </div>

      {showSettings && <SettingsView roadmap={roadmap} onClose={() => setShowSettings(false)} />}

      <FiltersBar
        roadmap={roadmap}
        filters={filters}
        setFilters={setFilters}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        view={view}
        setView={setView}
        onCollapseAll={collapseAll}
        onExpandAll={expandAll}
        onExport={handleExport}
      />

      {view === "timeline" ? (
        <TimelineGrid
          roadmap={roadmap}
          filteredItems={filteredItems}
          collapsedYears={collapsedYears}
          collapsedQuarters={collapsedQuarters}
          collapsedStreams={collapsedStreams}
          toggleYear={toggleYear}
          toggleQuarter={toggleQuarter}
          toggleStream={toggleStream}
          onOpenItem={(id) => setModal({ mode: "edit", itemId: id })}
          onCreateItem={(productId, sectionId, months) =>
            setModal({ mode: "create", productId, sectionId, months })
          }
        />
      ) : (
        <ListView
          roadmap={roadmap}
          filteredItems={filteredItems}
          groupBy={groupBy}
          onOpenItem={(id) => setModal({ mode: "edit", itemId: id })}
        />
      )}

      {modal && (
        <ItemModal
          roadmap={roadmap}
          itemId={modal.mode === "edit" ? modal.itemId : null}
          initialProductId={modal.mode === "create" ? modal.productId : undefined}
          initialSectionId={modal.mode === "create" ? modal.sectionId : undefined}
          initialMonths={modal.mode === "create" ? modal.months : undefined}
          onClose={() => setModal(null)}
        />
      )}

      {/* Suppress unused-variable warning */}
      <div className="hidden">{allYears.length}</div>
    </div>
  );
}

// ============= Delivery Tab (derived from TFP shaping) =============

function DeliveryTab() {
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);

  // Derive bucket from each shaping item's fixed roadmap_bucket OR (if planning items linked) months
  const cards = useMemo(() => {
    return shaping
      .map((sh) => ({ sh, sig: signals.find((s) => s.id === sh.signal_id) }))
      .filter((x): x is { sh: ShapingItem; sig: Signal } => x.sig?.status === "Proceed");
  }, [shaping, signals]);

  const grouped: Record<"Now" | "Next" | "Later" | "Unscheduled", { sh: ShapingItem; sig: Signal }[]> = {
    Now: [], Next: [], Later: [], Unscheduled: [],
  };
  cards.forEach((c) => {
    let bucket: "Now" | "Next" | "Later" | "Unscheduled";
    if (c.sh.roadmap_bucket === "Now") bucket = "Now";
    else if (c.sh.roadmap_bucket === "Next") bucket = "Next";
    else if (c.sh.roadmap_bucket === "Later") bucket = "Later";
    else bucket = "Unscheduled";
    grouped[bucket].push(c);
  });

  const productDot: Record<TfpProduct, string> = {
    "Otto-Onboard": "bg-blue-500",
    "Otto Notes": "bg-violet-500",
    "Otto Pulse": "bg-cyan-500",
    FertiWise: "bg-emerald-500",
    StimSmart: "bg-amber-500",
    Platform: "bg-slate-400",
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm">
        <p className="font-medium">Delivery view</p>
        <p className="mt-1 text-muted-foreground">
          Now / Next / Later derived from shaping items in <Link to="/triage" className="text-primary hover:underline">Triage</Link> and{" "}
          <Link to="/shaping" className="text-primary hover:underline">Shaping</Link>. Use the Strategic Planning tab to plan ahead by month.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {(["Now", "Next", "Later", "Unscheduled"] as const).map((bucket) => (
          <div key={bucket} className="rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider">{bucket}</h3>
              <span className="text-xs text-muted-foreground">{grouped[bucket].length}</span>
            </div>
            <div className="space-y-1.5 p-2 min-h-[120px]">
              {grouped[bucket].length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">No items</p>
              )}
              {grouped[bucket].map(({ sh, sig }) => (
                <Link
                  key={sh.id}
                  to="/shaping"
                  className="block rounded border border-border bg-background px-2.5 py-1.5 text-xs hover:bg-accent"
                >
                  <div className="flex items-center gap-1.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", productDot[sig.product])} />
                    <span className="truncate font-medium">{sig.title}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>{sig.product}</span>
                    <span>· {sh.shaping_status}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Suppress: roadmapActions referenced from ItemModal/Settings/etc. Keep import for future hooks.
void roadmapActions;
