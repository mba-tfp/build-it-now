import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, Eye, EyeOff, Pencil, Check, X } from "lucide-react";
import { roadmapActions } from "@/lib/roadmap/store";
import { buildMonths, MONTH_NAMES } from "@/lib/roadmap/timeline";
import type { Roadmap } from "@/lib/roadmap/types";
import { cn } from "@/lib/utils";

type Props = {
  roadmap: Roadmap;
  onClose: () => void;
};

export function SettingsView({ roadmap, onClose }: Props) {
  const [year, setYear] = useState(roadmap.config.start_year);
  const [month, setMonth] = useState(roadmap.config.start_month);
  const [count, setCount] = useState(roadmap.config.month_count);

  const previewMonths = buildMonths({ start_year: year, start_month: month, month_count: count });

  function applyConfig() {
    roadmapActions.updateConfig({ start_year: year, start_month: month, month_count: count });
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onProductDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = roadmap.products.map((p) => p.id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    roadmapActions.reorderProducts(arrayMove(ids, oldIdx, newIdx));
  }

  return (
    <div className="space-y-6 rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl">Roadmap settings</h2>
          <p className="text-sm text-muted-foreground">Configure timeline and manage Streams / Sub-Streams.</p>
        </div>
        <button onClick={onClose} className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm hover:bg-accent">
          Done
        </button>
      </div>

      {/* Timeline config */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Timeline</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Start month</span>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            >
              {MONTH_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Start year</span>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Months visible</span>
            <input
              type="number"
              min={3}
              max={36}
              value={count}
              onChange={(e) => setCount(Math.max(3, Math.min(36, Number(e.target.value))))}
              className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 rounded-md border border-dashed border-border bg-muted/20 p-3">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Live preview</p>
          <div className="flex flex-wrap gap-1">
            {previewMonths.map((m) => (
              <span key={m.key} className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border">
                {m.monthLabel} {String(m.year).slice(2)}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={applyConfig} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Apply timeline
          </button>
        </div>
      </section>

      {/* Streams */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Streams &amp; Sub-Streams</h3>
          <AddStreamButton />
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onProductDragEnd}>
          <SortableContext items={roadmap.products.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {roadmap.products.map((p) => (
                <SortableProduct key={p.id} product={p} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </section>
    </div>
  );
}

function SortableProduct({ product }: { product: Roadmap["products"][number] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);

  function onSectionDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = product.sections.map((s) => s.id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    roadmapActions.reorderSections(product.id, arrayMove(ids, oldIdx, newIdx));
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-md border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </button>
        {editing ? (
          <>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { roadmapActions.renameProduct(product.id, name); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
              className="flex-1 rounded border border-input bg-surface px-2 py-1 text-sm"
            />
            <button onClick={() => { roadmapActions.renameProduct(product.id, name); setEditing(false); }} className="text-primary"><Check className="h-4 w-4" /></button>
            <button onClick={() => { setName(product.name); setEditing(false); }} className="text-muted-foreground"><X className="h-4 w-4" /></button>
          </>
        ) : (
          <>
            <span className="flex-1 font-medium">{product.name}</span>
            {product.locked && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-blue-700">locked</span>}
            <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
            {!product.locked && (
              <button
                onClick={() => {
                  if (confirm(`Delete stream "${product.name}" and all its items?`)) {
                    roadmapActions.deleteProduct(product.id);
                  }
                }}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      <div className="p-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSectionDragEnd}>
          <SortableContext items={product.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {product.sections.map((s) => (
                <SortableSection key={s.id} productId={product.id} section={s} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <AddSectionButton productId={product.id} />
      </div>
    </div>
  );
}

function SortableSection({ productId, section }: { productId: string; section: Roadmap["products"][number]["sections"][number] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section.name);

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1.5">
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing">
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {editing ? (
        <>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { roadmapActions.renameSection(productId, section.id, name); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
            className="flex-1 rounded border border-input bg-surface px-2 py-1 text-xs"
          />
          <button onClick={() => { roadmapActions.renameSection(productId, section.id, name); setEditing(false); }} className="text-primary"><Check className="h-3.5 w-3.5" /></button>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm">{section.name}</span>
          <button
            onClick={() => roadmapActions.toggleSectionVisibility(productId, section.id)}
            className={cn("text-muted-foreground hover:text-foreground", !section.visible_external && "text-amber-600")}
            title={section.visible_external ? "External visible (click to mark internal)" : "Internal only (click to mark external)"}
          >
            {section.visible_external ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
          <button
            onClick={() => {
              if (confirm(`Delete sub-stream "${section.name}" and all its items?`)) {
                roadmapActions.deleteSection(productId, section.id);
              }
            }}
            className="text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );
}

function AddStreamButton() {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  function commit() {
    if (!name.trim()) return;
    roadmapActions.addProduct(name.trim());
    setName("");
    setAdding(false);
  }
  if (!adding) {
    return (
      <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-md border border-input bg-surface px-3 py-1.5 text-xs hover:bg-accent">
        <Plus className="h-3.5 w-3.5" /> Add Stream
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setAdding(false); }}
        placeholder="Stream name"
        className="rounded border border-input bg-surface px-2 py-1 text-xs"
      />
      <button onClick={commit} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">Add</button>
      <button onClick={() => setAdding(false)} className="text-xs text-muted-foreground">Cancel</button>
    </div>
  );
}

function AddSectionButton({ productId }: { productId: string }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  function commit() {
    if (!name.trim()) return;
    roadmapActions.addSection(productId, name.trim());
    setName("");
    setAdding(false);
  }
  if (!adding) {
    return (
      <button onClick={() => setAdding(true)} className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
        <Plus className="h-3 w-3" /> Add Sub-Stream
      </button>
    );
  }
  return (
    <div className="mt-1.5 flex items-center gap-2 px-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setAdding(false); }}
        placeholder="Sub-stream name"
        className="rounded border border-input bg-surface px-2 py-1 text-xs"
      />
      <button onClick={commit} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">Add</button>
      <button onClick={() => setAdding(false)} className="text-xs text-muted-foreground">Cancel</button>
    </div>
  );
}
