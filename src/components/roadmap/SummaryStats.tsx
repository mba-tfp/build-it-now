import type { Roadmap } from "@/lib/roadmap/types";
import { STATUSES } from "@/lib/roadmap/types";

type Props = {
  roadmap: Roadmap;
};

export function SummaryStats({ roadmap }: Props) {
  const items = roadmap.items;
  const total = items.length;

  const byStatus = STATUSES.map((s) => ({
    status: s,
    count: items.filter((i) => i.status === s).length,
  }));

  const byStream = roadmap.products.map((p) => ({
    name: p.name,
    count: items.filter((i) => i.product_id === p.id).length,
  })).filter((s) => s.count > 0);

  const unscheduled = items.filter((i) => i.months.length === 0).length;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total items" value={total} />
        <Stat label="Unscheduled" value={unscheduled} tone={unscheduled > 0 ? "amber" : "default"} />
        <Stat label="Streams" value={byStream.length} />
        <Stat label="In Progress" value={items.filter((i) => i.status === "In Progress").length} tone="blue" />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">By status</p>
          <div className="flex flex-wrap gap-1.5">
            {byStatus.map((s) => (
              <span
                key={s.status}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs"
              >
                <span className="font-medium">{s.status}</span>
                <span className="text-muted-foreground">{s.count}</span>
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">By stream</p>
          <div className="flex flex-wrap gap-1.5">
            {byStream.length === 0 ? (
              <span className="text-xs text-muted-foreground">No items yet</span>
            ) : (
              byStream.map((s) => (
                <span
                  key={s.name}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground">{s.count}</span>
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "amber" | "blue" }) {
  const toneCls =
    tone === "amber" ? "text-amber-600" :
    tone === "blue" ? "text-blue-600" :
    "text-foreground";
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-display text-2xl ${toneCls}`}>{value}</p>
    </div>
  );
}
