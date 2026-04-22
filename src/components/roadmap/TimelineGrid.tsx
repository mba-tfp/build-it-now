import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import {
  PRIORITY_DOT,
  STATUS_TONE,
  type Roadmap,
  type RoadmapItem,
} from "@/lib/roadmap/types";
import { roadmapActions } from "@/lib/roadmap/store";
import {
  buildMonths,
  groupByYearQuarter,
  rangeMonths,
  visibleSpan,
  type MonthCell,
} from "@/lib/roadmap/timeline";
import { cn } from "@/lib/utils";

type Props = {
  roadmap: Roadmap;
  filteredItems: RoadmapItem[];
  collapsedYears: Set<number>;
  collapsedQuarters: Set<string>;
  collapsedStreams: Set<string>;
  toggleYear: (y: number) => void;
  toggleQuarter: (key: string) => void;
  toggleStream: (id: string) => void;
  onOpenItem: (id: string) => void;
  onCreateItem: (productId: string, sectionId: string, months?: string[]) => void;
  /** When true, render a vertical month-gridline overlay so snap targets are visible. */
  showSnapGrid?: boolean;
};

const SECTION_COL_WIDTH = 220;
const TBP_COL_WIDTH = 180;
const MONTH_COL_MIN = 110;

export function TimelineGrid({
  roadmap,
  filteredItems,
  collapsedYears,
  collapsedQuarters,
  collapsedStreams,
  toggleYear,
  toggleQuarter,
  toggleStream,
  onOpenItem,
  onCreateItem,
  showSnapGrid = false,
}: Props) {
  const allMonths = useMemo(() => buildMonths(roadmap.config), [roadmap.config]);

  // Compute visible months based on collapsed years/quarters
  const visibleMonths = useMemo(
    () =>
      allMonths.filter(
        (m) => !collapsedYears.has(m.year) && !collapsedQuarters.has(`${m.year}-Q${m.quarter}`),
      ),
    [allMonths, collapsedYears, collapsedQuarters],
  );

  const yearGroups = useMemo(() => groupByYearQuarter(allMonths), [allMonths]);

  // Total grid width
  const gridTemplateColumns = `${SECTION_COL_WIDTH}px ${TBP_COL_WIDTH}px repeat(${visibleMonths.length}, minmax(${MONTH_COL_MIN}px, 1fr))`;

  // Live region for screen-reader announcements during drag/resize.
  const [liveMessage, setLiveMessage] = useState("");
  useEffect(() => {
    if (!liveMessage) return;
    const t = setTimeout(() => setLiveMessage(""), 2000);
    return () => clearTimeout(t);
  }, [liveMessage]);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      {/* Polite live region — announces snap targets to assistive tech */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>
      <div
        className="min-w-full"
        role="grid"
        aria-label={`Roadmap timeline with ${visibleMonths.length} visible months`}
      >
        {/* ===== Sticky 3-row header ===== */}
        <div className="sticky top-0 z-30">
          {/* Row 1: Year */}
          <div
            className="grid border-b border-border bg-blue-50"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-40 border-r border-border bg-blue-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-900">
              Sub-Stream
            </div>
            <div className="border-r border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-900">
              To Be Planned
            </div>
            {yearGroups.map((yg) => {
              const visibleInYear = yg.quarters.flatMap((q) => q.months).filter((m) => visibleMonths.includes(m));
              if (visibleInYear.length === 0) {
                // Year fully collapsed → render a single narrow cell
                return (
                  <button
                    key={yg.year}
                    onClick={() => toggleYear(yg.year)}
                    className="border-r border-border px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-blue-900 hover:bg-blue-100"
                    style={{ gridColumn: `span 1` }}
                  >
                    <ChevronRight className="inline h-3 w-3" /> {yg.year}
                  </button>
                );
              }
              return (
                <button
                  key={yg.year}
                  onClick={() => toggleYear(yg.year)}
                  className="flex items-center gap-1 border-r border-border px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-blue-900 hover:bg-blue-100"
                  style={{ gridColumn: `span ${visibleInYear.length}` }}
                >
                  <ChevronDown className="h-3 w-3" /> {yg.year}
                </button>
              );
            })}
          </div>

          {/* Row 2: Quarter */}
          <div
            className="grid border-b border-border bg-slate-50"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-40 border-r border-border bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-700"></div>
            <div className="border-r border-border bg-slate-50 px-3 py-1.5"></div>
            {yearGroups.flatMap((yg) =>
              yg.quarters.map((q) => {
                const visibleInQ = q.months.filter((m) => visibleMonths.includes(m));
                if (visibleInQ.length === 0) {
                  if (collapsedYears.has(yg.year)) return null;
                  const qKey = `${yg.year}-Q${q.quarter}`;
                  return (
                    <button
                      key={qKey}
                      onClick={() => toggleQuarter(qKey)}
                      className="border-r border-border px-2 py-1.5 text-left text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    >
                      <ChevronRight className="inline h-3 w-3" /> Q{q.quarter}
                    </button>
                  );
                }
                const qKey = `${yg.year}-Q${q.quarter}`;
                return (
                  <button
                    key={qKey}
                    onClick={() => toggleQuarter(qKey)}
                    className="flex items-center gap-1 border-r border-border px-2 py-1.5 text-left text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                    style={{ gridColumn: `span ${visibleInQ.length}` }}
                  >
                    <ChevronDown className="h-3 w-3" /> Q{q.quarter}
                  </button>
                );
              }),
            )}
          </div>

          {/* Row 3: Month */}
          <div
            className="grid border-b border-border bg-white"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-40 border-r border-border bg-white px-3 py-1.5"></div>
            <div className="border-r border-border bg-white px-3 py-1.5"></div>
            {visibleMonths.map((m) => (
              <div key={m.key} className="border-r border-border px-2 py-1.5 text-[11px] font-medium text-slate-700">
                {m.monthLabel}
              </div>
            ))}
          </div>
        </div>

        {/* ===== Stream rows ===== */}
        {roadmap.products.map((product) => {
          const productItems = filteredItems.filter((it) => it.product_id === product.id);
          if (productItems.length === 0 && !collapsedStreams.has(product.id)) {
            // Still show empty product for adding items
          }
          const isCollapsed = collapsedStreams.has(product.id);

          return (
            <div key={product.id}>
              {/* Stream header row */}
              <div
                className="grid border-b border-border bg-muted/40"
                style={{ gridTemplateColumns }}
              >
                <button
                  onClick={() => toggleStream(product.id)}
                  className="sticky left-0 z-20 flex items-center gap-1.5 border-r border-border bg-muted/40 px-3 py-2 text-left text-sm font-semibold hover:bg-muted/60"
                >
                  {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  <span>{product.name}</span>
                  <span className="ml-auto text-[10px] font-normal text-muted-foreground">{productItems.length}</span>
                </button>
                <div className="col-span-full" />
              </div>

              {/* Sub-stream rows */}
              {!isCollapsed &&
                product.sections.map((section) => {
                  const sectionItems = productItems.filter((it) => it.section_id === section.id);
                  return (
                    <SubStreamRow
                      key={section.id}
                      productId={product.id}
                      sectionId={section.id}
                      sectionName={section.name}
                      visibleExternal={section.visible_external}
                      items={sectionItems}
                      visibleMonths={visibleMonths}
                      gridTemplateColumns={gridTemplateColumns}
                      showSnapGrid={showSnapGrid}
                      onAnnounce={setLiveMessage}
                      onOpenItem={onOpenItem}
                      onCreateItem={onCreateItem}
                    />
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============= Sub-stream row =============

function SubStreamRow({
  productId,
  sectionId,
  sectionName,
  visibleExternal,
  items,
  visibleMonths,
  gridTemplateColumns,
  showSnapGrid,
  onAnnounce,
  onOpenItem,
  onCreateItem,
}: {
  productId: string;
  sectionId: string;
  sectionName: string;
  visibleExternal: boolean;
  items: RoadmapItem[];
  visibleMonths: MonthCell[];
  gridTemplateColumns: string;
  showSnapGrid: boolean;
  onAnnounce: (msg: string) => void;
  onOpenItem: (id: string) => void;
  onCreateItem: (productId: string, sectionId: string, months?: string[]) => void;
}) {
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const tbpItems = items.filter((it) => it.months.length === 0);

  // For each item with months, compute its visible span
  const placedItems = items
    .filter((it) => it.months.length > 0)
    .map((it) => ({ item: it, span: visibleSpan(it.months, visibleMonths) }))
    .filter((x): x is { item: RoadmapItem; span: { startIdx: number; span: number } } => x.span !== null);

  function onDragOverCell(e: React.DragEvent, key: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverKey(key);
  }

  function onDropCell(e: React.DragEvent, monthKey: string | null) {
    e.preventDefault();
    setDragOverKey(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    if (monthKey === null) {
      // Drop into "To Be Planned"
      roadmapActions.moveItemMonths(id, []);
    } else {
      // Move whole item to start at this month, preserving its length
      const item = items.find((it) => it.id === id);
      const length = item ? Math.max(1, item.months.length) : 1;
      const keys = visibleMonths.map((m) => m.key);
      const startIdx = keys.indexOf(monthKey);
      const newMonths = keys.slice(startIdx, startIdx + length);
      roadmapActions.moveItemMonths(id, newMonths);
    }
  }

  return (
    <div className="grid border-b border-border" style={{ gridTemplateColumns }}>
      {/* Sub-stream label */}
      <div className="sticky left-0 z-10 border-r border-border bg-surface px-3 py-2">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-sm">{sectionName}</span>
          <button
            onClick={() => onCreateItem(productId, sectionId)}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-accent"
            title="Add item to this sub-stream"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        {!visibleExternal && (
          <span className="text-[10px] uppercase tracking-wider text-amber-600">internal</span>
        )}
      </div>

      {/* To Be Planned column */}
      <div
        onDragOver={(e) => onDragOverCell(e, "tbp")}
        onDragLeave={() => setDragOverKey(null)}
        onDrop={(e) => onDropCell(e, null)}
        className={cn(
          "min-h-[60px] border-r border-border p-1.5",
          dragOverKey === "tbp" && "bg-primary/5",
        )}
      >
        <div className="space-y-1">
          {tbpItems.map((it) => (
            <RoadmapCardSimple key={it.id} item={it} onClick={() => onOpenItem(it.id)} />
          ))}
        </div>
      </div>

      {/* Month cells: render drop targets first, then absolute-positioned spanning cards */}
      <div
        className="relative col-span-full grid"
        style={{ gridTemplateColumns: `repeat(${visibleMonths.length}, minmax(${MONTH_COL_MIN}px, 1fr))` }}
        role="row"
      >
        {visibleMonths.map((m) => (
          <div
            key={m.key}
            role="gridcell"
            aria-label={`${m.monthLabel} ${m.year}, ${sectionName}. Drop a card here to snap to ${m.monthLabel}.`}
            onDragOver={(e) => onDragOverCell(e, m.key)}
            onDragLeave={() => setDragOverKey(null)}
            onDrop={(e) => onDropCell(e, m.key)}
            onDoubleClick={() => onCreateItem(productId, sectionId, [m.key])}
            title={`${m.monthLabel} ${m.year} — drop to snap here, double-click to add`}
            className={cn(
              "min-h-[60px] border-r border-border last:border-r-0 transition",
              showSnapGrid && "bg-[linear-gradient(to_right,transparent_calc(100%-1px),var(--border)_calc(100%-1px))] [background-size:50%_8px] [background-repeat:repeat-y]",
              dragOverKey === m.key && "bg-primary/15 ring-2 ring-inset ring-primary/40",
            )}
          />
        ))}

        {/* Optional snap-grid overlay: vertical month dividers visible across the row */}
        {showSnapGrid && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 grid"
            style={{ gridTemplateColumns: `repeat(${visibleMonths.length}, minmax(${MONTH_COL_MIN}px, 1fr))` }}
          >
            {visibleMonths.map((m, i) => (
              <div
                key={m.key}
                className={cn(
                  "border-r border-dashed border-primary/30",
                  i === visibleMonths.length - 1 && "border-r-0",
                )}
              />
            ))}
          </div>
        )}

        {/* Spanning cards layer */}
        <div className="pointer-events-none absolute inset-0 grid p-1.5"
          style={{ gridTemplateColumns: `repeat(${visibleMonths.length}, minmax(${MONTH_COL_MIN}px, 1fr))` }}
        >
          {placedItems.map(({ item, span }, idx) => (
            <SpanningCard
              key={item.id}
              item={item}
              startIdx={span.startIdx}
              span={span.span}
              row={idx}
              visibleMonths={visibleMonths}
              onAnnounce={onAnnounce}
              onClick={() => onOpenItem(item.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============= Spanning card with resize =============

function SpanningCard({
  item,
  startIdx,
  span,
  row,
  visibleMonths,
  onAnnounce,
  onClick,
}: {
  item: RoadmapItem;
  startIdx: number;
  span: number;
  row: number;
  visibleMonths: MonthCell[];
  onAnnounce: (msg: string) => void;
  onClick: () => void;
}) {
  const [resizing, setResizing] = useState<"left" | "right" | null>(null);
  const [previewSpan, setPreviewSpan] = useState<{ startIdx: number; span: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  function rangeLabel(p: { startIdx: number; span: number }) {
    const a = visibleMonths[p.startIdx];
    const b = visibleMonths[p.startIdx + p.span - 1];
    if (!a) return "";
    if (p.span === 1) return `${a.monthLabel} ${a.year}`;
    return `${a.monthLabel} ${a.year} to ${b.monthLabel} ${b.year}`;
  }

  function commitSpan(p: { startIdx: number; span: number }) {
    const startKey = visibleMonths[p.startIdx].key;
    const endKey = visibleMonths[p.startIdx + p.span - 1].key;
    const newMonths = rangeMonths(startKey, endKey, visibleMonths);
    roadmapActions.moveItemMonths(item.id, newMonths);
    onAnnounce(`${item.title} now spans ${rangeLabel(p)} (${p.span} month${p.span === 1 ? "" : "s"}).`);
  }

  function handleResizeStart(e: React.MouseEvent, side: "left" | "right") {
    e.stopPropagation();
    e.preventDefault();
    setResizing(side);

    const grid = cardRef.current?.parentElement;
    if (!grid) return;
    const gridRect = grid.getBoundingClientRect();
    const colW = gridRect.width / visibleMonths.length;

    function onMove(ev: MouseEvent) {
      const rel = ev.clientX - gridRect.left;
      const colIdx = Math.max(0, Math.min(visibleMonths.length - 1, Math.floor(rel / colW)));
      if (side === "right") {
        const newSpan = Math.max(1, colIdx - startIdx + 1);
        setPreviewSpan({ startIdx, span: newSpan });
      } else {
        const newStart = Math.min(startIdx + span - 1, colIdx);
        const newSpan = startIdx + span - newStart;
        setPreviewSpan({ startIdx: newStart, span: newSpan });
      }
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setResizing(null);
      setPreviewSpan((preview) => {
        if (preview) commitSpan(preview);
        return null;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Keyboard resize: focus a handle, then ←/→ shrinks/grows by one month.
  function handleHandleKey(e: React.KeyboardEvent, side: "left" | "right") {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    let next: { startIdx: number; span: number };
    if (side === "right") {
      const newSpan = Math.max(1, Math.min(visibleMonths.length - startIdx, span + dir));
      next = { startIdx, span: newSpan };
    } else {
      const newStart = Math.max(0, Math.min(startIdx + span - 1, startIdx + dir));
      const newSpan = startIdx + span - newStart;
      next = { startIdx: newStart, span: newSpan };
    }
    commitSpan(next);
  }

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
    onAnnounce(`Dragging ${item.title}. Drop on a month cell to snap.`);
  }

  const effective = previewSpan ?? { startIdx, span };
  const multiMonth = item.months.length > 1;
  const cardLabel = `${item.title}, ${item.status}, ${rangeLabel({ startIdx, span })}. Press Enter to edit.`;
  const leftTooltipId = `tt-l-${item.id}`;
  const rightTooltipId = `tt-r-${item.id}`;

  return (
    <div
      ref={cardRef}
      draggable={!resizing}
      onDragStart={handleDragStart}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={cardLabel}
      aria-grabbed={!!resizing}
      className={cn(
        "pointer-events-auto group relative mb-1 cursor-grab overflow-hidden rounded-md border border-border bg-surface px-2 py-1.5 text-xs shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing",
        resizing && "ring-2 ring-primary",
      )}
      style={{
        gridColumn: `${effective.startIdx + 1} / span ${effective.span}`,
        gridRow: row + 1,
        borderLeftWidth: 4,
        borderLeftColor: item.color_tag,
      }}
    >
      {/* Left resize handle (snap-to-month) — accessible button */}
      <button
        type="button"
        onMouseDown={(e) => handleResizeStart(e, "left")}
        onKeyDown={(e) => handleHandleKey(e, "left")}
        aria-label={`Resize start of ${item.title}. Currently starts ${visibleMonths[startIdx]?.monthLabel} ${visibleMonths[startIdx]?.year}. Use left and right arrow keys to adjust by one month.`}
        aria-describedby={leftTooltipId}
        title="Drag or use ← → keys to change start month (snaps to month)"
        className="absolute inset-y-0 left-0 z-10 flex w-1.5 cursor-col-resize items-center justify-center bg-transparent opacity-0 transition focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary group-hover:opacity-100 hover:w-2 hover:bg-primary"
      >
        <span className="pointer-events-none h-3 w-px bg-primary/70" />
      </button>
      <span id={leftTooltipId} role="tooltip" className="sr-only">
        Drag horizontally or press arrow keys to change start month. Snaps to the month grid.
      </span>

      {/* Right resize handle (snap-to-month) — accessible button */}
      <button
        type="button"
        onMouseDown={(e) => handleResizeStart(e, "right")}
        onKeyDown={(e) => handleHandleKey(e, "right")}
        aria-label={`Resize end of ${item.title}. Currently ends ${visibleMonths[startIdx + span - 1]?.monthLabel} ${visibleMonths[startIdx + span - 1]?.year}. Use left and right arrow keys to adjust by one month.`}
        aria-describedby={rightTooltipId}
        title="Drag or use ← → keys to change end month (snaps to month)"
        className="absolute inset-y-0 right-0 z-10 flex w-1.5 cursor-col-resize items-center justify-center bg-transparent opacity-0 transition focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary group-hover:opacity-100 hover:w-2 hover:bg-primary"
      >
        <span className="pointer-events-none h-3 w-px bg-primary/70" />
      </button>
      <span id={rightTooltipId} role="tooltip" className="sr-only">
        Drag horizontally or press arrow keys to change end month. Snaps to the month grid.
      </span>

      {/* Live snap range readout while resizing */}
      {resizing && previewSpan && (
        <div className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background shadow">
          {visibleMonths[previewSpan.startIdx]?.monthLabel}{" "}
          {String(visibleMonths[previewSpan.startIdx]?.year).slice(2)}
          {previewSpan.span > 1 && (
            <>
              {" → "}
              {visibleMonths[previewSpan.startIdx + previewSpan.span - 1]?.monthLabel}{" "}
              {String(visibleMonths[previewSpan.startIdx + previewSpan.span - 1]?.year).slice(2)}
            </>
          )}
          <span className="ml-1 text-background/70">· {previewSpan.span}mo</span>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_DOT[item.priority])} title={`Priority: ${item.priority}`} />
        <span className="truncate font-medium" title={item.title}>{item.title}</span>
        {multiMonth && (
          <span className="ml-auto shrink-0 rounded bg-muted px-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            {item.months.length}m
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className={cn("rounded border px-1 py-px text-[9px]", STATUS_TONE[item.status])}>{item.status}</span>
        {item.owner && <span className="truncate">{item.owner}</span>}
        {item.clinic && <span className="truncate">· {item.clinic}</span>}
      </div>
    </div>
  );
}

function RoadmapCardSimple({ item, onClick }: { item: RoadmapItem; onClick: () => void }) {
  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
  }
  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={onClick}
      className="cursor-grab rounded-md border border-border bg-surface px-2 py-1.5 text-xs shadow-sm hover:shadow-md active:cursor-grabbing"
      style={{ borderLeftWidth: 4, borderLeftColor: item.color_tag }}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_DOT[item.priority])} />
        <span className="truncate font-medium">{item.title}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className={cn("rounded border px-1 py-px text-[9px]", STATUS_TONE[item.status])}>{item.status}</span>
        {item.owner && <span className="truncate">{item.owner}</span>}
      </div>
    </div>
  );
}
