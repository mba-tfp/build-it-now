import { useMemo } from "react";
import {
  PRIORITY_DOT,
  STATUS_TONE,
  type GroupByField,
  type Roadmap,
  type RoadmapItem,
} from "@/lib/roadmap/types";
import { cn } from "@/lib/utils";
import { ScrollTable } from "@/components/tfp/ScrollTable";
import { SortMenu, useSortMenu } from "@/components/tfp/SortMenu";
import { sortRows } from "@/components/tfp/SortableHeader";

type Props = {
  roadmap: Roadmap;
  filteredItems: RoadmapItem[];
  groupBy: GroupByField[];
  onOpenItem: (id: string) => void;
};

type Node = {
  key: string;
  label: string;
  depth: number;
  items: RoadmapItem[];
  children: Node[];
};

type SortKey = "title" | "product" | "status" | "priority" | "owner" | "start" | "end";

const PRIORITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function getValue(roadmap: Roadmap, item: RoadmapItem, field: GroupByField): { key: string; label: string } {
  switch (field) {
    case "product": {
      const p = roadmap.products.find((x) => x.id === item.product_id);
      return { key: item.product_id, label: p?.name ?? "Unknown stream" };
    }
    case "section": {
      const p = roadmap.products.find((x) => x.id === item.product_id);
      const s = p?.sections.find((x) => x.id === item.section_id);
      return { key: item.section_id, label: s?.name ?? "Unknown sub-stream" };
    }
    case "status": return { key: item.status, label: item.status };
    case "priority": return { key: item.priority, label: item.priority };
    case "owner": return { key: item.owner || "(unassigned)", label: item.owner || "(unassigned)" };
    case "clinic": return { key: item.clinic || "(none)", label: item.clinic || "(none)" };
  }
}

function buildTree(roadmap: Roadmap, items: RoadmapItem[], fields: GroupByField[]): Node[] {
  if (fields.length === 0) {
    return [{ key: "all", label: "All items", depth: 0, items, children: [] }];
  }
  function recurse(items: RoadmapItem[], depth: number): Node[] {
    if (depth >= fields.length) return [];
    const field = fields[depth];
    const groups = new Map<string, { label: string; items: RoadmapItem[] }>();
    for (const it of items) {
      const { key, label } = getValue(roadmap, it, field);
      if (!groups.has(key)) groups.set(key, { label, items: [] });
      groups.get(key)!.items.push(it);
    }
    return Array.from(groups.entries())
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map(([key, g]) => ({
        key: `${depth}:${key}`,
        label: g.label,
        depth,
        items: depth === fields.length - 1 ? g.items : [],
        children: depth === fields.length - 1 ? [] : recurse(g.items, depth + 1),
      }));
  }
  return recurse(items, 0);
}

function sortItems(roadmap: Roadmap, items: RoadmapItem[], sort: ReturnType<typeof useSortMenu<SortKey>>["sort"]): RoadmapItem[] {
  return sortRows(items, sort, (it, k) => {
    if (k === "title") return it.title.toLowerCase();
    if (k === "product") return roadmap.products.find((p) => p.id === it.product_id)?.name ?? "";
    if (k === "status") return it.status;
    if (k === "priority") return PRIORITY_ORDER[it.priority] ?? 99;
    if (k === "owner") return it.owner || "";
    if (k === "start") return it.months[0] ?? "";
    if (k === "end") return it.months[it.months.length - 1] ?? "";
    return null;
  });
}

export function ListView({ roadmap, filteredItems, groupBy, onOpenItem }: Props) {
  const { sort, setSort } = useSortMenu<SortKey>(`roadmap.list.${roadmap.id}`, { key: "title", dir: "asc" });

  const sortedItems = useMemo(() => sortItems(roadmap, filteredItems, sort), [roadmap, filteredItems, sort]);
  const tree = useMemo(() => buildTree(roadmap, sortedItems, groupBy), [roadmap, sortedItems, groupBy]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <SortMenu
          tableId={`roadmap.list.${roadmap.id}`}
          sort={sort}
          onChange={setSort}
          options={[
            { key: "title", label: "Title" },
            { key: "product", label: "Stream" },
            { key: "status", label: "Status" },
            { key: "priority", label: "Priority" },
            { key: "owner", label: "Owner" },
            { key: "start", label: "Start month" },
            { key: "end", label: "End month" },
          ]}
        />
      </div>
      <ScrollTable maxHeight="calc(100vh - 360px)" className="border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Stream</th>
              <th className="px-3 py-2">Sub-Stream</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Months</th>
            </tr>
          </thead>
          <tbody>
            {tree.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No items match your filters.</td>
              </tr>
            )}
            {tree.map((node) => <NodeRows key={node.key} node={node} roadmap={roadmap} onOpenItem={onOpenItem} />)}
          </tbody>
        </table>
      </ScrollTable>
    </div>
  );
}

function NodeRows({ node, roadmap, onOpenItem }: { node: Node; roadmap: Roadmap; onOpenItem: (id: string) => void }) {
  const itemCount = node.items.length || node.children.reduce((a, c) => a + countItems(c), 0);
  const showHeader = node.label !== "All items";

  return (
    <>
      {showHeader && (
        <tr className={cn(
          "border-b border-border bg-muted/20",
          node.depth === 0 && "bg-muted/40",
        )}>
          <td colSpan={7} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ paddingLeft: 12 + node.depth * 16 }}>
            {node.label} <span className="ml-1 font-normal text-muted-foreground">{itemCount}</span>
          </td>
        </tr>
      )}
      {node.items.map((it) => {
        const product = roadmap.products.find((p) => p.id === it.product_id);
        const section = product?.sections.find((s) => s.id === it.section_id);
        return (
          <tr
            key={it.id}
            onClick={() => onOpenItem(it.id)}
            className="cursor-pointer border-b border-border/60 hover:bg-accent/30"
          >
            <td className="px-3 py-2" style={{ paddingLeft: 12 + (node.depth + 1) * 16 }}>
              <div className="flex items-center gap-2">
                <span className="h-3 w-1 rounded-sm" style={{ background: it.color_tag }} />
                <span className="font-medium">{it.title}</span>
                {it.internal_only && <span className="rounded bg-amber-100 px-1 text-[9px] uppercase text-amber-700">internal</span>}
              </div>
            </td>
            <td className="px-3 py-2 text-muted-foreground">{product?.name ?? "—"}</td>
            <td className="px-3 py-2 text-muted-foreground">{section?.name ?? "—"}</td>
            <td className="px-3 py-2">
              <span className={cn("rounded border px-1.5 py-0.5 text-[10px]", STATUS_TONE[it.status])}>{it.status}</span>
            </td>
            <td className="px-3 py-2">
              <span className="inline-flex items-center gap-1 text-xs">
                <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOT[it.priority])} />
                {it.priority}
              </span>
            </td>
            <td className="px-3 py-2 text-muted-foreground">{it.owner || "—"}</td>
            <td className="px-3 py-2 text-xs text-muted-foreground">
              {it.months.length === 0 ? "To Be Planned" : `${it.months[0]} → ${it.months[it.months.length - 1]} (${it.months.length})`}
            </td>
          </tr>
        );
      })}
      {node.children.map((c) => <NodeRows key={c.key} node={c} roadmap={roadmap} onOpenItem={onOpenItem} />)}
    </>
  );
}

function countItems(node: Node): number {
  return node.items.length + node.children.reduce((a, c) => a + countItems(c), 0);
}
