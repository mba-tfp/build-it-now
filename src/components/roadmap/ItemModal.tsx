import { useEffect, useMemo, useState } from "react";
import { X, Trash2, Copy } from "lucide-react";
import {
  COLOR_PALETTE,
  PRIORITIES,
  STATUSES,
  type ItemPriority,
  type ItemStatus,
  type Roadmap,
  type RoadmapItem,
} from "@/lib/roadmap/types";
import { roadmapActions } from "@/lib/roadmap/store";
import { buildMonths } from "@/lib/roadmap/timeline";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  roadmap: Roadmap;
  itemId: string | null; // null = create
  initialProductId?: string;
  initialSectionId?: string;
  initialMonths?: string[];
  onClose: () => void;
};

export function ItemModal({
  roadmap,
  itemId,
  initialProductId,
  initialSectionId,
  initialMonths,
  onClose,
}: Props) {
  const editing = itemId
    ? roadmap.items.find((i) => i.id === itemId) ?? null
    : null;

  const months = useMemo(() => buildMonths(roadmap.config), [roadmap.config]);

  const firstProduct = roadmap.products[0];
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [productId, setProductId] = useState(editing?.product_id ?? initialProductId ?? firstProduct?.id ?? "");
  const [sectionId, setSectionId] = useState(
    editing?.section_id ?? initialSectionId ?? firstProduct?.sections[0]?.id ?? "",
  );
  const [selectedMonths, setSelectedMonths] = useState<string[]>(
    editing?.months ?? initialMonths ?? [],
  );
  const [status, setStatus] = useState<ItemStatus>(editing?.status ?? "Planned");
  const [priority, setPriority] = useState<ItemPriority>(editing?.priority ?? "P2");
  const [owner, setOwner] = useState(editing?.owner ?? "");
  const [colorTag, setColorTag] = useState(editing?.color_tag ?? COLOR_PALETTE[0]);
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [clinic, setClinic] = useState(editing?.clinic ?? "");
  const [internalOnly, setInternalOnly] = useState(editing?.internal_only ?? false);

  const product = roadmap.products.find((p) => p.id === productId);
  const sections = product?.sections ?? [];

  // Keep section valid if product changes
  useEffect(() => {
    if (sections.length === 0) return;
    if (!sections.find((s) => s.id === sectionId)) {
      setSectionId(sections[0].id);
    }
  }, [productId, sections, sectionId]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggleMonth(key: string) {
    setSelectedMonths((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key].sort(),
    );
  }

  function handleSave() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!productId || !sectionId) {
      toast.error("Stream and Sub-Stream are required");
      return;
    }
    if (editing) {
      roadmapActions.updateItem(editing.id, {
        title: title.trim(),
        description,
        product_id: productId,
        section_id: sectionId,
        months: selectedMonths,
        status,
        priority,
        owner,
        color_tag: colorTag,
        notes,
        clinic,
        internal_only: internalOnly,
      });
      toast.success("Item updated");
    } else {
      roadmapActions.addItem({
        title: title.trim(),
        description,
        product_id: productId,
        section_id: sectionId,
        months: selectedMonths,
        status,
        priority,
        owner,
        color_tag: colorTag,
        notes,
        clinic,
        internal_only: internalOnly,
        shaping_id: null,
      } as Omit<RoadmapItem, "id" | "created_at" | "updated_at">);
      toast.success("Item created");
    }
    onClose();
  }

  function handleDelete() {
    if (!editing) return;
    if (!confirm("Delete this item? This cannot be undone.")) return;
    roadmapActions.deleteItem(editing.id);
    toast.success("Item deleted");
    onClose();
  }

  function handleDuplicate() {
    if (!editing) return;
    roadmapActions.duplicateItem(editing.id);
    toast.success("Item duplicated");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-display text-lg">
            {editing ? "Edit roadmap item" : "Add roadmap item"}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <Field label="Title">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              placeholder="Short, action-oriented title"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              placeholder="Optional context"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Stream">
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              >
                {roadmap.products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Sub-Stream">
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={`Months ${selectedMonths.length === 0 ? "(To Be Planned)" : `(${selectedMonths.length} selected)`}`}>
            <div className="flex flex-wrap gap-1.5">
              {months.map((m) => {
                const active = selectedMonths.includes(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => toggleMonth(m.key)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input bg-surface text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {m.monthLabel} {String(m.year).slice(2)}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ItemStatus)}
                className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as ItemPriority)}
                className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Owner">
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
                placeholder="Who is accountable"
              />
            </Field>
            <Field label="Clinic">
              <input
                value={clinic}
                onChange={(e) => setClinic(e.target.value)}
                className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
                placeholder="Optional"
              />
            </Field>
          </div>

          <Field label="Color tag">
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColorTag(c)}
                  className={cn(
                    "h-7 w-7 rounded-md border-2",
                    colorTag === c ? "border-foreground" : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
              <input
                type="color"
                value={colorTag}
                onChange={(e) => setColorTag(e.target.value)}
                className="h-7 w-12 cursor-pointer rounded-md border border-input"
              />
            </div>
          </Field>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              placeholder="Implementation notes, links, etc."
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={internalOnly}
              onChange={(e) => setInternalOnly(e.target.checked)}
            />
            Internal only (hidden from external roadmap views)
          </label>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/20 px-5 py-3">
          <div className="flex gap-2">
            {editing && (
              <>
                <button
                  onClick={handleDelete}
                  className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-surface px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
                <button
                  onClick={handleDuplicate}
                  className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-1.5 text-xs hover:bg-accent"
                >
                  <Copy className="h-3.5 w-3.5" /> Duplicate
                </button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {editing ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
