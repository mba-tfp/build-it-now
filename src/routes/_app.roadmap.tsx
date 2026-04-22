import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  USERS,
  useTfpStore,
  usableCapacity,
} from "@/lib/tfp/store";
import type {
  Product,
  RoadmapBucket,
  ShapingItem,
  ShapingStatus,
  Signal,
} from "@/lib/tfp/types";
import { cn } from "@/lib/utils";
import { Plus, X, Printer } from "lucide-react";

export const Route = createFileRoute("/_app/roadmap")({
  component: RoadmapPage,
});

const PRODUCT_DOT: Record<Product, string> = {
  "Otto-Onboard": "bg-[oklch(0.6_0.15_240)]",
  "Otto Notes": "bg-[oklch(0.55_0.18_290)]",
  "Otto Pulse": "bg-[oklch(0.6_0.13_180)]",
  FertiWise: "bg-[oklch(0.6_0.15_150)]",
  StimSmart: "bg-[oklch(0.7_0.15_70)]",
  Platform: "bg-muted-foreground",
};

const STATUS_TONE: Record<ShapingStatus, string> = {
  Unshaped: "bg-muted text-muted-foreground",
  "In Shaping": "bg-[var(--color-status-new)]/15 text-[var(--color-status-new)]",
  Shaped: "bg-[var(--color-status-new)]/20 text-[var(--color-status-new)]",
  "In Tech Review": "bg-primary/15 text-primary",
  "Tech Approved": "bg-primary/20 text-primary",
  Approved: "bg-[var(--color-status-proceed)]/15 text-[var(--color-status-proceed)]",
  "In Delivery": "bg-[var(--color-status-proceed)]/20 text-[var(--color-status-proceed)]",
};

type Lane = "Go-Live" | "Enhancement" | "BAU" | "Integrations";
type Zone = "Now" | "Next" | "Later" | "Not Now";
const ZONES: Zone[] = ["Now", "Next", "Later", "Not Now"];
const LANES: Lane[] = ["Go-Live", "Enhancement", "BAU", "Integrations"];

function laneFor(sig: Signal | undefined, sh: ShapingItem, hasGoLive: boolean): Lane {
  if (hasGoLive) return "Go-Live";
  if (sig?.product === "Otto-Onboard" && /integrat|sync|api|accuro|phelix/i.test((sig?.description ?? "") + " " + sh.solution_approach)) return "Integrations";
  if (sig?.issue_type === "Dependency Change") return "Integrations";
  if (sig?.tier === "T4" || sh.fast_track) return "BAU";
  return "Enhancement";
}

function zoneFor(sh: ShapingItem): Zone {
  const b = sh.roadmap_bucket;
  if (b === "Now") return "Now";
  if (b === "Next") return "Next";
  if (b === "Later") return "Later";
  return "Not Now";
}

function RoadmapPage() {
  const me = useTfpStore((s) => s.users.find((u) => u.id === s.currentUserId)!);
  const sprints = useTfpStore((s) => s.sprints);
  const sprint = useTfpStore((s) => s.sprint);
  const shaping = useTfpStore((s) => s.shaping);
  const signals = useTfpStore((s) => s.signals);
  const clinics = useTfpStore((s) => s.clinics);
  const goLives = useTfpStore((s) => s.goLives);
  const setRoadmapBucket = useTfpStore((s) => s.setRoadmapBucket);
  const createSignal = useTfpStore((s) => s.createSignal);
  const triageDecision = useTfpStore((s) => s.triageDecision);

  const isPM = me.role === "PM" || me.role === "Senior PM";
  const isLeadership = me.role === "Leadership";
  const draggable = isPM && !isLeadership;

  const [compact, setCompact] = useState(isLeadership);
  const [productFilter, setProductFilter] = useState<Set<Product>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<ShapingStatus>>(new Set());

  // Modals
  const [displaceModal, setDisplaceModal] = useState<{ id: string; bucket: Zone } | null>(null);
  const [parkModal, setParkModal] = useState<{ id: string } | null>(null);
  const [addModal, setAddModal] = useState<{ lane: Lane; zone: Zone } | null>(null);

  // Time axis sub-columns
  const nowSprints = useMemo(
    () => sprints.filter((s) => s.status === "Active" || s.status === "Planning").slice(0, 4),
    [sprints],
  );
  const nextMonths = useMemo(() => {
    const out: { key: string; label: string }[] = [];
    const base = new Date();
    for (let i = 1; i <= 2; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString("en", { month: "short", year: "numeric" }) });
    }
    return out;
  }, []);
  const laterQuarters = useMemo(() => {
    const out: { key: string; label: string }[] = [];
    const base = new Date();
    const baseQ = Math.floor(base.getMonth() / 3);
    for (let i = 1; i <= 2; i++) {
      const q = ((baseQ + i) % 4) + 1;
      const yr = base.getFullYear() + Math.floor((baseQ + i) / 4);
      out.push({ key: `${yr}-Q${q}`, label: `Q${q} ${yr}` });
    }
    return out;
  }, []);

  // Cards: shaping items linked to a Proceed signal
  const cards = useMemo(() => {
    return shaping
      .map((sh) => ({ sh, sig: signals.find((s) => s.id === sh.signal_id) }))
      .filter((x) => x.sig?.status === "Proceed");
  }, [shaping, signals]);

  const filteredCards = useMemo(() => {
    return cards.filter(({ sh, sig }) => {
      if (!sig) return false;
      if (productFilter.size > 0 && !productFilter.has(sig.product)) return false;
      if (statusFilter.size > 0 && !statusFilter.has(sh.shaping_status)) return false;
      return true;
    });
  }, [cards, productFilter, statusFilter]);

  // Group: lane → zone → cards
  const grid = useMemo(() => {
    const out: Record<Lane, Record<Zone, Array<{ sh: ShapingItem; sig: Signal; gl?: typeof goLives[number] }>>> = {
      "Go-Live": { Now: [], Next: [], Later: [], "Not Now": [] },
      Enhancement: { Now: [], Next: [], Later: [], "Not Now": [] },
      BAU: { Now: [], Next: [], Later: [], "Not Now": [] },
      Integrations: { Now: [], Next: [], Later: [], "Not Now": [] },
    };
    filteredCards.forEach(({ sh, sig }) => {
      if (!sig) return;
      const gl = goLives.find((g) => g.shaping_id === sh.id);
      const lane = laneFor(sig, sh, !!gl);
      const zone = zoneFor(sh);
      out[lane][zone].push({ sh, sig, gl });
    });
    return out;
  }, [filteredCards, goLives]);

  // Capacity per lane×zone (vs estimated capacity)
  function capacityFor(zone: Zone): number {
    if (zone === "Now") return nowSprints.reduce((a, sp) => a + usableCapacity(sp), 0) || usableCapacity(sprint);
    if (zone === "Next") return nextMonths.length * 45;
    if (zone === "Later") return laterQuarters.length * 90;
    return 999;
  }

  // Drag handlers
  function onDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e: React.DragEvent) {
    if (!draggable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function onDrop(e: React.DragEvent, zone: Zone) {
    if (!draggable) return;
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const item = shaping.find((s) => s.id === id);
    if (!item) return;
    if (zone === "Now") {
      // Capacity check vs Now zone allocation
      const nowAlloc = filteredCards
        .filter(({ sh }) => zoneFor(sh) === "Now")
        .reduce((a, { sh }) => a + (sh.tech_estimate_pts ?? 0), 0);
      const cap = capacityFor("Now");
      const usedPct = (nowAlloc / Math.max(1, cap)) * 100;
      if (usedPct > 85) {
        setDisplaceModal({ id, bucket: zone });
        return;
      }
    }
    if (zone === "Not Now") {
      setParkModal({ id });
      return;
    }
    setRoadmapBucket(id, zone, item.displacement);
  }

  function commitDisplace(text: string) {
    if (!displaceModal) return;
    setRoadmapBucket(displaceModal.id, displaceModal.bucket, text);
    setDisplaceModal(null);
  }
  function commitPark(text: string) {
    if (!parkModal) return;
    setRoadmapBucket(parkModal.id, "Not Now", text);
    setParkModal(null);
  }

  function commitAdd(title: string, product: Product) {
    if (!addModal) return;
    const sig = createSignal({
      title,
      description: title + " (added from Roadmap)",
      source: "Internal",
      product,
      displacement_flag: false,
      displacement_note: null,
    });
    triageDecision(sig.id, "Proceed");
    // Find the new shaping item for this signal
    const sh = useTfpStore.getState().shaping.find((s) => s.signal_id === sig.id);
    if (sh) {
      const zone = addModal.zone === "Not Now" ? "Not Now" : addModal.zone;
      setRoadmapBucket(sh.id, zone as RoadmapBucket, "");
    }
    setAddModal(null);
  }

  // Active clinics for go-live sub-rows
  const activeClinics = useMemo(
    () =>
      clinics
        .filter((c) => c.status === "Active")
        .sort((a, b) => (a.go_live_date ?? "").localeCompare(b.go_live_date ?? "")),
    [clinics],
  );

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">View · Roadmap</p>
          <h1 className="mt-1 font-display text-3xl">Roadmap</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Now → Next → Later · streams across Go-Live, Enhancement, BAU, Integrations.
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
            Compact
          </label>
          {isLeadership && (
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-1.5 text-xs hover:bg-accent"
            >
              <Printer className="h-3.5 w-3.5" /> Export PDF
            </button>
          )}
        </div>
      </header>

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Product:</span>
        {(Object.keys(PRODUCT_DOT) as Product[]).map((p) => (
          <FilterChip key={p} active={productFilter.has(p)} onClick={() => setProductFilter((s) => toggle(s, p))} dot={PRODUCT_DOT[p]}>
            {p}
          </FilterChip>
        ))}
        <span className="ml-3 text-xs text-muted-foreground">Status:</span>
        {(["Unshaped", "In Shaping", "Shaped", "In Tech Review", "Approved"] as ShapingStatus[]).map((st) => (
          <FilterChip key={st} active={statusFilter.has(st)} onClick={() => setStatusFilter((s) => toggle(s, st))}>
            {st}
          </FilterChip>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <div className="min-w-[1200px]">
          {/* Time axis header */}
          <div className="grid sticky top-0 z-10 grid-cols-[180px_minmax(0,3fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_140px] border-b border-border bg-muted/30 text-xs">
            <div className="px-3 py-2 font-medium">Stream</div>
            <div className="border-l border-border px-3 py-2">
              <div className="font-semibold uppercase tracking-wider">Now</div>
              <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, nowSprints.length)}, minmax(0,1fr))` }}>
                {nowSprints.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground">No active sprint</span>
                ) : (
                  nowSprints.map((sp) => (
                    <span key={sp.id} className="truncate text-[10px] text-muted-foreground">{sp.name}</span>
                  ))
                )}
              </div>
            </div>
            <div className="border-l border-border px-3 py-2">
              <div className="font-semibold uppercase tracking-wider">Next</div>
              <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${nextMonths.length}, minmax(0,1fr))` }}>
                {nextMonths.map((m) => (
                  <span key={m.key} className="truncate text-[10px] text-muted-foreground">{m.label}</span>
                ))}
              </div>
            </div>
            <div className="border-l border-border px-3 py-2">
              <div className="font-semibold uppercase tracking-wider">Later</div>
              <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${laterQuarters.length}, minmax(0,1fr))` }}>
                {laterQuarters.map((q) => (
                  <span key={q.key} className="truncate text-[10px] text-muted-foreground">{q.label}</span>
                ))}
              </div>
            </div>
            <div className="border-l border-border px-3 py-2">
              <div className="font-semibold uppercase tracking-wider">Not Now</div>
              <span className="text-[10px] text-muted-foreground">Parking lot</span>
            </div>
          </div>

          {/* Lane rows */}
          {LANES.map((lane) => {
            const isGoLive = lane === "Go-Live";
            const isBAU = lane === "BAU";
            const subRows = isGoLive
              ? activeClinics.map((c) => c.name)
              : [null];

            return subRows.map((subRow, subIdx) => {
              const isFirstSubRow = subIdx === 0;
              return (
                <div
                  key={lane + (subRow ?? "")}
                  className={cn(
                    "grid grid-cols-[180px_minmax(0,3fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_140px] border-b border-border",
                    isBAU && "bg-muted/10",
                  )}
                >
                  {/* Stream label */}
                  <div className={cn("border-r border-border p-3", isFirstSubRow ? "" : "pt-1")}>
                    {isFirstSubRow && (
                      <>
                        <div className="flex items-center justify-between gap-1">
                          <span className={cn("font-display", isBAU ? "text-sm" : "text-base")}>{lane}</span>
                          {draggable && !isGoLive && (
                            <button
                              onClick={() => setAddModal({ lane, zone: "Now" })}
                              className="grid h-5 w-5 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                              title="Add card"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <CapacityBar lane={lane} zones={ZONES} grid={grid} capacityFor={capacityFor} />
                      </>
                    )}
                    {subRow && (
                      <div className="text-xs text-muted-foreground">{subRow}</div>
                    )}
                  </div>

                  {ZONES.map((zone) => {
                    let items = grid[lane][zone];
                    if (isGoLive && subRow) {
                      items = items.filter(({ gl }) => {
                        if (!gl) return false;
                        // crude: try to match clinic name in release_name
                        return gl.release_name.toLowerCase().includes(subRow.toLowerCase());
                      });
                    }
                    return (
                      <div
                        key={zone}
                        onDragOver={onDragOver}
                        onDrop={(e) => onDrop(e, zone)}
                        className={cn(
                          "min-h-[80px] border-r border-border p-2 last:border-r-0",
                          isBAU && "py-1",
                        )}
                      >
                        <div className="space-y-1.5">
                          {items.map(({ sh, sig, gl }) => (
                            <RoadmapCard
                              key={sh.id}
                              sh={sh}
                              sig={sig}
                              gl={gl}
                              compact={compact || isBAU}
                              draggable={draggable}
                              onDragStart={(e) => onDragStart(e, sh.id)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            });
          })}
        </div>
      </div>

      {/* Modals */}
      {displaceModal && (
        <PromptModal
          title="What moves to make room for this item?"
          description="Sprint capacity is over 85% — name the item that gets postponed or descoped."
          required
          onCancel={() => setDisplaceModal(null)}
          onConfirm={commitDisplace}
        />
      )}
      {parkModal && (
        <PromptModal
          title="Why is this being parked?"
          description="Card moves to Not Now. Capture the reason for traceability."
          required
          onCancel={() => setParkModal(null)}
          onConfirm={commitPark}
        />
      )}
      {addModal && (
        <AddCardModal lane={addModal.lane} onCancel={() => setAddModal(null)} onConfirm={commitAdd} />
      )}

      {filteredCards.length === 0 && (
        <p className="mt-6 rounded-md border border-border bg-surface p-6 text-center text-sm text-muted-foreground">
          No items match your filters.{" "}
          <Link to="/triage" className="text-primary hover:underline">Triage some signals →</Link>
        </p>
      )}
    </div>
  );
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function FilterChip({
  active,
  onClick,
  children,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface hover:border-primary/40",
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />}
      {children}
    </button>
  );
}

function CapacityBar({
  lane,
  zones,
  grid,
  capacityFor,
}: {
  lane: Lane;
  zones: Zone[];
  grid: Record<Lane, Record<Zone, Array<{ sh: ShapingItem }>>>;
  capacityFor: (z: Zone) => number;
}) {
  return (
    <div className="mt-2 space-y-0.5">
      {zones.slice(0, 3).map((z) => {
        const used = grid[lane][z].reduce((a, { sh }) => a + (sh.tech_estimate_pts ?? 0), 0);
        const cap = capacityFor(z);
        const pct = (used / Math.max(1, cap)) * 100;
        const tone = pct > 95 ? "bg-destructive" : pct > 80 ? "bg-[var(--color-status-hold)]" : "bg-[var(--color-status-proceed)]";
        return (
          <div key={z} className="flex items-center gap-1 text-[9px] text-muted-foreground" title={`${used} / ${cap} pts in ${z}`}>
            <span className="w-8">{z}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full", tone)} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RoadmapCard({
  sh,
  sig,
  gl,
  compact,
  draggable,
  onDragStart,
}: {
  sh: ShapingItem;
  sig: Signal;
  gl?: { criteria: Record<string, { done: boolean }>; scheduled_for: string };
  compact: boolean;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const pts = sh.tech_estimate_pts ?? (Number((sh.solution_effort.match(/\d+/) ?? [])[0]) || null);
  const needsShaping = sh.shaping_status === "Unshaped" && sh.roadmap_bucket === "Now";
  let goLiveIcon = null as string | null;
  if (gl) {
    const total = Object.values(gl.criteria).length;
    const done = Object.values(gl.criteria).filter((c) => c.done).length;
    const past = new Date(gl.scheduled_for).getTime() < Date.now();
    if (done === total) goLiveIcon = "✓";
    else if (past) goLiveIcon = "✗";
    else goLiveIcon = "⚠";
  }
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className={cn(
        "rounded-md border border-border bg-surface text-xs shadow-sm transition",
        draggable && "cursor-grab active:cursor-grabbing hover:border-primary/50",
        compact ? "p-1.5" : "p-2",
      )}
    >
      <div className="flex items-start gap-1.5">
        <span className={cn("mt-0.5 h-2 w-2 flex-shrink-0 rounded-full", PRODUCT_DOT[sig.product])} title={sig.product} />
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium leading-snug", compact ? "line-clamp-1 text-[11px]" : "line-clamp-2 text-[12px]")}>
            {sig.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className={cn("rounded px-1 py-0 text-[9px] font-medium", STATUS_TONE[sh.shaping_status])}>
              {sh.shaping_status}
            </span>
            {!compact && pts !== null && (
              <span className="rounded bg-muted px-1 py-0 font-mono text-[9px] text-muted-foreground">{pts}pts</span>
            )}
            {goLiveIcon && (
              <span
                className={cn(
                  "rounded px-1 py-0 text-[9px] font-medium",
                  goLiveIcon === "✓" && "bg-[var(--color-status-proceed)]/15 text-[var(--color-status-proceed)]",
                  goLiveIcon === "⚠" && "bg-[var(--color-status-hold)]/15 text-[var(--color-status-hold)]",
                  goLiveIcon === "✗" && "bg-destructive/15 text-destructive",
                )}
              >
                Go-Live {goLiveIcon}
              </span>
            )}
            {needsShaping && (
              <span className="rounded bg-destructive/15 px-1 py-0 text-[9px] font-medium text-destructive">Needs shaping</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PromptModal({
  title,
  description,
  required,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  required?: boolean;
  onCancel: () => void;
  onConfirm: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const ok = !required || text.trim().length > 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-foreground/40" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h3 className="font-display text-lg leading-tight">{title}</h3>
          <button onClick={onCancel} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          autoFocus
          className="mt-3 w-full resize-y rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            disabled={!ok}
            onClick={() => onConfirm(text)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function AddCardModal({
  lane,
  onCancel,
  onConfirm,
}: {
  lane: Lane;
  onCancel: () => void;
  onConfirm: (title: string, product: Product) => void;
}) {
  const [title, setTitle] = useState("");
  const [product, setProduct] = useState<Product>("Platform");
  const ok = title.trim().length > 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-foreground/40" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl">
        <h3 className="mb-2 font-display text-lg">Add to {lane}</h3>
        <p className="mb-3 text-xs text-muted-foreground">Creates a Proceed signal and unshaped roadmap card in Now.</p>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Card title…"
          className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          value={product}
          onChange={(e) => setProduct(e.target.value as Product)}
          className="mt-2 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {(Object.keys(PRODUCT_DOT) as Product[]).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            disabled={!ok}
            onClick={() => onConfirm(title, product)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            Add card
          </button>
        </div>
      </div>
    </div>
  );
}
