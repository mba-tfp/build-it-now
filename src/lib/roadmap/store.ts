// Multi-roadmap planning store.
// SSR-safe: reads localStorage lazily on the client only.

import { useSyncExternalStore } from "react";
import {
  LOCKED_PRODUCTS,
  type Product,
  type Roadmap,
  type RoadmapItem,
  type RoadmapRegistryEntry,
  type Section,
  type TimelineConfig,
} from "./types";

const REGISTRY_KEY = "tfp.roadmap.registry";
const ACTIVE_KEY = "tfp.roadmap.active";
const ROADMAP_KEY = (id: string) => `tfp.roadmap.data.${id}`;

const isBrowser = typeof window !== "undefined";

function uid(prefix = "i") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultConfig(): TimelineConfig {
  // Start at the beginning of the current quarter, span 12 months.
  // Use a stable fallback for SSR to avoid hydration drift.
  const now = isBrowser ? new Date() : new Date("2026-01-01T00:00:00Z");
  const month = Math.floor(now.getUTCMonth() / 3) * 3;
  return {
    start_year: now.getUTCFullYear(),
    start_month: month,
    month_count: 12,
  };
}

function defaultProducts(): Product[] {
  return LOCKED_PRODUCTS.map((p) => ({
    id: p.id,
    name: p.name,
    locked: true,
    sections: [
      { id: uid("sec"), name: "Roadmap", visible_external: true },
      { id: uid("sec"), name: "Internal", visible_external: false },
    ],
  }));
}

function seedItems(products: Product[], config: TimelineConfig): RoadmapItem[] {
  const monthKey = (offset: number) => {
    const m = (config.start_month + offset) % 12;
    const y = config.start_year + Math.floor((config.start_month + offset) / 12);
    return `${y}-${String(m + 1).padStart(2, "0")}`;
  };
  const onboard = products.find((p) => p.name === "Otto-Onboard")!;
  const notes = products.find((p) => p.name === "Otto Notes")!;
  const pulse = products.find((p) => p.name === "Otto Pulse")!;
  const now = Date.now();
  const mk = (
    title: string,
    product: Product,
    monthsIdx: number[],
    status: RoadmapItem["status"],
    priority: RoadmapItem["priority"],
    color: string,
  ): RoadmapItem => ({
    id: uid(),
    title,
    description: "",
    product_id: product.id,
    section_id: product.sections[0].id,
    months: monthsIdx.map(monthKey),
    status,
    priority,
    owner: "Bazil",
    color_tag: color,
    notes: "",
    clinic: "",
    internal_only: false,
    created_at: now,
    updated_at: now,
  });
  return [
    mk("Patient onboarding portal v2", onboard, [0, 1, 2], "In Progress", "Highest", "#6366f1"),
    mk("Accuro sync hardening", onboard, [3, 4], "Planned", "High", "#3b82f6"),
    mk("Voice-to-text drafts", notes, [1, 2, 3], "In Progress", "High", "#8b5cf6"),
    mk("Clinical templates library", notes, [5, 6], "Todo", "Medium", "#ec4899"),
    mk("Outcome dashboards", pulse, [2, 3, 4, 5], "Planned", "High", "#10b981"),
    mk("AI insights v1", pulse, [], "Todo", "Medium", "#14b8a6"),
  ];
}

function makeNewRoadmap(name: string): Roadmap {
  const config = defaultConfig();
  const products = defaultProducts();
  return {
    id: uid("rm"),
    name,
    created_at: Date.now(),
    config,
    products,
    items: [],
  };
}

function makeSeedRoadmap(): Roadmap {
  const config = defaultConfig();
  const products = defaultProducts();
  return {
    id: "rm-otto-default",
    name: "Otto Roadmap",
    created_at: Date.now(),
    config,
    products,
    items: seedItems(products, config),
  };
}

// ---------- Storage helpers ----------

function readRegistry(): RoadmapRegistryEntry[] {
  if (!isBrowser) return [{ id: "rm-otto-default", name: "Otto Roadmap" }];
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RoadmapRegistryEntry[];
  } catch {
    return [];
  }
}

function writeRegistry(entries: RoadmapRegistryEntry[]) {
  if (!isBrowser) return;
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(entries));
}

function readRoadmap(id: string): Roadmap | null {
  if (!isBrowser) return null;
  try {
    const raw = localStorage.getItem(ROADMAP_KEY(id));
    if (!raw) return null;
    return JSON.parse(raw) as Roadmap;
  } catch {
    return null;
  }
}

function writeRoadmap(rm: Roadmap) {
  if (!isBrowser) return;
  localStorage.setItem(ROADMAP_KEY(rm.id), JSON.stringify(rm));
}

function deleteRoadmapStorage(id: string) {
  if (!isBrowser) return;
  localStorage.removeItem(ROADMAP_KEY(id));
}

function readActiveId(): string | null {
  if (!isBrowser) return null;
  return localStorage.getItem(ACTIVE_KEY);
}

function writeActiveId(id: string) {
  if (!isBrowser) return;
  localStorage.setItem(ACTIVE_KEY, id);
}

// ---------- Bootstrap ----------

function ensureBootstrapped(): { registry: RoadmapRegistryEntry[]; activeId: string } {
  let registry = readRegistry();
  if (registry.length === 0) {
    const seed = makeSeedRoadmap();
    writeRoadmap(seed);
    registry = [{ id: seed.id, name: seed.name }];
    writeRegistry(registry);
    writeActiveId(seed.id);
    return { registry, activeId: seed.id };
  }
  let activeId = readActiveId();
  if (!activeId || !registry.find((r) => r.id === activeId)) {
    activeId = registry[0].id;
    writeActiveId(activeId);
  }
  // Ensure active roadmap data exists
  if (!readRoadmap(activeId)) {
    const fresh = makeNewRoadmap(registry.find((r) => r.id === activeId)!.name);
    fresh.id = activeId;
    writeRoadmap(fresh);
  }
  return { registry, activeId };
}

// ---------- Subscriber pattern ----------

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Cached snapshot to keep useSyncExternalStore stable.
let snapshotCache: {
  registry: RoadmapRegistryEntry[];
  activeId: string;
  active: Roadmap | null;
  version: number;
} = {
  registry: [{ id: "rm-otto-default", name: "Otto Roadmap" }],
  activeId: "rm-otto-default",
  active: null,
  version: 0,
};

function refreshSnapshot() {
  if (!isBrowser) return snapshotCache;
  const { registry, activeId } = ensureBootstrapped();
  const active = readRoadmap(activeId);
  snapshotCache = {
    registry,
    activeId,
    active,
    version: snapshotCache.version + 1,
  };
  return snapshotCache;
}

function getSnapshot() {
  return snapshotCache;
}

function getServerSnapshot() {
  return snapshotCache;
}

// Initialize on first import in the browser.
if (isBrowser) {
  refreshSnapshot();
  // Listen to storage events so other tabs sync.
  window.addEventListener("storage", () => {
    refreshSnapshot();
    notify();
  });
}

// ---------- React hook ----------

export function useRoadmapStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ---------- Undo / Redo history ----------

const HISTORY_LIMIT = 50;
type HistoryStacks = { past: Roadmap[]; future: Roadmap[] };
const historyByRoadmap = new Map<string, HistoryStacks>();

function getHistory(id: string): HistoryStacks {
  if (!historyByRoadmap.has(id)) historyByRoadmap.set(id, { past: [], future: [] });
  return historyByRoadmap.get(id)!;
}

function pushHistory(prev: Roadmap) {
  const h = getHistory(prev.id);
  h.past.push(JSON.parse(JSON.stringify(prev)));
  if (h.past.length > HISTORY_LIMIT) h.past.shift();
  // Any new edit clears the redo stack
  h.future = [];
}

export function canUndo(): boolean {
  const id = snapshotCache.activeId;
  return getHistory(id).past.length > 0;
}

export function canRedo(): boolean {
  const id = snapshotCache.activeId;
  return getHistory(id).future.length > 0;
}

export function undo() {
  const snap = refreshSnapshot();
  if (!snap.active) return;
  const h = getHistory(snap.active.id);
  const prev = h.past.pop();
  if (!prev) return;
  h.future.push(JSON.parse(JSON.stringify(snap.active)));
  writeRoadmap(prev);
  refreshSnapshot();
  notify();
}

export function redo() {
  const snap = refreshSnapshot();
  if (!snap.active) return;
  const h = getHistory(snap.active.id);
  const next = h.future.pop();
  if (!next) return;
  h.past.push(JSON.parse(JSON.stringify(snap.active)));
  writeRoadmap(next);
  refreshSnapshot();
  notify();
}

// ---------- Mutations ----------

function commit(updater: (rm: Roadmap) => Roadmap | void) {
  const snap = refreshSnapshot();
  if (!snap.active) return;
  // Snapshot for undo BEFORE applying the change.
  pushHistory(snap.active);
  const next = { ...snap.active };
  const result = updater(next);
  const final = result ?? next;
  writeRoadmap(final);
  refreshSnapshot();
  notify();
}

export const roadmapActions = {
  createRoadmap(name: string): string {
    const rm = makeNewRoadmap(name.trim() || "Untitled roadmap");
    writeRoadmap(rm);
    const reg = readRegistry();
    reg.push({ id: rm.id, name: rm.name });
    writeRegistry(reg);
    writeActiveId(rm.id);
    refreshSnapshot();
    notify();
    return rm.id;
  },

  deleteRoadmap(id: string) {
    const reg = readRegistry().filter((r) => r.id !== id);
    if (reg.length === 0) {
      // Re-seed default
      const seed = makeSeedRoadmap();
      writeRoadmap(seed);
      reg.push({ id: seed.id, name: seed.name });
      writeActiveId(seed.id);
    } else {
      writeActiveId(reg[0].id);
    }
    writeRegistry(reg);
    deleteRoadmapStorage(id);
    refreshSnapshot();
    notify();
  },

  setActive(id: string) {
    writeActiveId(id);
    refreshSnapshot();
    notify();
  },

  renameRoadmap(id: string, name: string) {
    const reg = readRegistry().map((r) => (r.id === id ? { ...r, name } : r));
    writeRegistry(reg);
    const rm = readRoadmap(id);
    if (rm) {
      rm.name = name;
      writeRoadmap(rm);
    }
    refreshSnapshot();
    notify();
  },

  updateConfig(patch: Partial<TimelineConfig>) {
    commit((rm) => {
      rm.config = { ...rm.config, ...patch };
    });
  },

  addProduct(name: string) {
    commit((rm) => {
      rm.products = [
        ...rm.products,
        {
          id: uid("p"),
          name: name.trim() || "New stream",
          locked: false,
          sections: [{ id: uid("sec"), name: "Default", visible_external: true }],
        },
      ];
    });
  },

  renameProduct(id: string, name: string) {
    commit((rm) => {
      rm.products = rm.products.map((p) => (p.id === id ? { ...p, name } : p));
    });
  },

  deleteProduct(id: string) {
    commit((rm) => {
      const target = rm.products.find((p) => p.id === id);
      if (!target || target.locked) return;
      rm.products = rm.products.filter((p) => p.id !== id);
      rm.items = rm.items.filter((it) => it.product_id !== id);
    });
  },

  reorderProducts(ids: string[]) {
    commit((rm) => {
      const map = new Map(rm.products.map((p) => [p.id, p]));
      rm.products = ids.map((id) => map.get(id)!).filter(Boolean);
    });
  },

  addSection(productId: string, name: string) {
    commit((rm) => {
      rm.products = rm.products.map((p) =>
        p.id === productId
          ? {
              ...p,
              sections: [
                ...p.sections,
                { id: uid("sec"), name: name.trim() || "New sub-stream", visible_external: true },
              ],
            }
          : p,
      );
    });
  },

  renameSection(productId: string, sectionId: string, name: string) {
    commit((rm) => {
      rm.products = rm.products.map((p) =>
        p.id === productId
          ? { ...p, sections: p.sections.map((s) => (s.id === sectionId ? { ...s, name } : s)) }
          : p,
      );
    });
  },

  toggleSectionVisibility(productId: string, sectionId: string) {
    commit((rm) => {
      rm.products = rm.products.map((p) =>
        p.id === productId
          ? {
              ...p,
              sections: p.sections.map((s) =>
                s.id === sectionId ? { ...s, visible_external: !s.visible_external } : s,
              ),
            }
          : p,
      );
    });
  },

  deleteSection(productId: string, sectionId: string) {
    commit((rm) => {
      rm.products = rm.products.map((p) =>
        p.id === productId
          ? { ...p, sections: p.sections.filter((s) => s.id !== sectionId) }
          : p,
      );
      rm.items = rm.items.filter((it) => it.section_id !== sectionId);
    });
  },

  reorderSections(productId: string, sectionIds: string[]) {
    commit((rm) => {
      rm.products = rm.products.map((p) => {
        if (p.id !== productId) return p;
        const map = new Map(p.sections.map((s) => [s.id, s]));
        return { ...p, sections: sectionIds.map((id) => map.get(id)!).filter(Boolean) as Section[] };
      });
    });
  },

  addItem(item: Omit<RoadmapItem, "id" | "created_at" | "updated_at">): string {
    const id = uid();
    commit((rm) => {
      rm.items = [
        ...rm.items,
        {
          ...item,
          id,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ];
    });
    return id;
  },

  updateItem(id: string, patch: Partial<RoadmapItem>) {
    commit((rm) => {
      rm.items = rm.items.map((it) =>
        it.id === id ? { ...it, ...patch, updated_at: Date.now() } : it,
      );
    });
  },

  deleteItem(id: string) {
    commit((rm) => {
      rm.items = rm.items.filter((it) => it.id !== id);
    });
  },

  duplicateItem(id: string): string | null {
    let newId: string | null = null;
    commit((rm) => {
      const src = rm.items.find((it) => it.id === id);
      if (!src) return;
      newId = uid();
      rm.items = [
        ...rm.items,
        { ...src, id: newId, title: src.title + " (copy)", created_at: Date.now(), updated_at: Date.now() },
      ];
    });
    return newId;
  },

  moveItemMonths(id: string, months: string[]) {
    commit((rm) => {
      rm.items = rm.items.map((it) =>
        it.id === id ? { ...it, months: [...months].sort(), updated_at: Date.now() } : it,
      );
    });
  },

  /**
   * Bulk-import items. Streams (products) and Sub-Streams (sections) are
   * matched by name and auto-created if missing. Returns count of items added.
   */
  importItems(rows: Array<Partial<RoadmapItem> & { stream_name?: string; sub_stream_name?: string }>): {
    added: number;
    streamsCreated: number;
    sectionsCreated: number;
  } {
    let added = 0;
    let streamsCreated = 0;
    let sectionsCreated = 0;
    commit((rm) => {
      const products = [...rm.products];
      for (const row of rows) {
        const streamName = (row.stream_name ?? "").trim() || "Imported";
        const subName = (row.sub_stream_name ?? "").trim() || "Imported";
        let product = products.find((p) => p.name.toLowerCase() === streamName.toLowerCase());
        if (!product) {
          product = {
            id: uid("p"),
            name: streamName,
            locked: false,
            sections: [],
          };
          products.push(product);
          streamsCreated++;
        }
        let section = product.sections.find((s) => s.name.toLowerCase() === subName.toLowerCase());
        if (!section) {
          section = { id: uid("sec"), name: subName, visible_external: true };
          product.sections = [...product.sections, section];
          sectionsCreated++;
        }
        rm.items.push({
          id: uid(),
          title: (row.title ?? "Untitled").toString(),
          description: (row.description ?? "").toString(),
          product_id: product.id,
          section_id: section.id,
          months: Array.isArray(row.months) ? row.months : [],
          status: (row.status as RoadmapItem["status"]) ?? "Todo",
          priority: (row.priority as RoadmapItem["priority"]) ?? "Medium",
          owner: (row.owner ?? "").toString(),
          color_tag: (row.color_tag ?? "#6366f1").toString(),
          notes: (row.notes ?? "").toString(),
          clinic: (row.clinic ?? "").toString(),
          internal_only: !!row.internal_only,
          shaping_id: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        });
        added++;
      }
      rm.products = products;
    });
    return { added, streamsCreated, sectionsCreated };
  },
};

// ---------- UI preferences (persisted) ----------
//
// Preferences can be scoped two ways:
//   - "roadmap": stored per-roadmap (key includes the roadmap id)
//   - "global":  stored once for this device, applied to every roadmap
// The chosen scope itself is stored at a stable device-wide key so it
// survives switching between roadmaps.

export type PrefsScope = "roadmap" | "global";

const UI_PREFS_KEY = (id: string) => `tfp.roadmap.ui.${id}`;
const GLOBAL_UI_PREFS_KEY = "tfp.roadmap.ui.__global";
const PREFS_SCOPE_KEY = "tfp.roadmap.ui.scope";

export function readPrefsScope(): PrefsScope {
  if (typeof window === "undefined") return "roadmap";
  try {
    const raw = localStorage.getItem(PREFS_SCOPE_KEY);
    return raw === "global" ? "global" : "roadmap";
  } catch {
    return "roadmap";
  }
}

export function writePrefsScope(scope: PrefsScope) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFS_SCOPE_KEY, scope);
  } catch {
    /* non-fatal */
  }
}

function prefsKeyFor(roadmapId: string, scope: PrefsScope): string {
  return scope === "global" ? GLOBAL_UI_PREFS_KEY : UI_PREFS_KEY(roadmapId);
}

export function readUiPrefs<T>(roadmapId: string, fallback: T, scope?: PrefsScope): T {
  if (typeof window === "undefined") return fallback;
  const useScope = scope ?? readPrefsScope();
  try {
    const raw = localStorage.getItem(prefsKeyFor(roadmapId, useScope));
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) } as T;
  } catch {
    return fallback;
  }
}

export function writeUiPrefs<T>(roadmapId: string, prefs: T, scope?: PrefsScope) {
  if (typeof window === "undefined") return;
  const useScope = scope ?? readPrefsScope();
  try {
    localStorage.setItem(prefsKeyFor(roadmapId, useScope), JSON.stringify(prefs));
  } catch {
    /* quota / serialization errors are non-fatal */
  }
}

