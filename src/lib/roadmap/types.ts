// Roadmap planning module types.
// UI labels: "Stream" = Product (internal), "Sub-Stream" = Section (internal).

export type ItemStatus = "Todo" | "Planned" | "In Progress" | "Done" | "Blocked";
export type ItemPriority = "Low" | "Medium" | "High" | "Highest";

export type Section = {
  id: string;
  name: string;
  visible_external: boolean; // false = internal-only
};

export type Product = {
  id: string;
  name: string;
  locked: boolean; // true for the 6 Otto/TFP products
  sections: Section[];
};

export type RoadmapItem = {
  id: string;
  title: string;
  description: string;
  product_id: string; // Stream
  section_id: string; // Sub-Stream
  months: string[]; // sorted list of "YYYY-MM" keys; empty => "To Be Planned"
  status: ItemStatus;
  priority: ItemPriority;
  owner: string;
  color_tag: string; // CSS color (e.g. "#6366f1")
  notes: string;
  clinic: string;
  internal_only: boolean;
  created_at: number;
  updated_at: number;
  // Optional link back to a TFP shaping item
  shaping_id?: string | null;
};

export type TimelineConfig = {
  start_year: number;
  start_month: number; // 0-11 (Jan=0)
  month_count: number; // total visible months
};

export type Roadmap = {
  id: string;
  name: string;
  created_at: number;
  config: TimelineConfig;
  products: Product[];
  items: RoadmapItem[];
};

export type RoadmapRegistryEntry = {
  id: string;
  name: string;
};

export type GroupByField =
  | "product"
  | "section"
  | "status"
  | "priority"
  | "owner"
  | "clinic";

// Default Otto/TFP locked streams (mirrors src/lib/tfp/types.ts Product enum).
export const LOCKED_PRODUCTS: { id: string; name: string }[] = [
  { id: "p-otto-onboard", name: "Otto-Onboard" },
  { id: "p-otto-notes", name: "Otto Notes" },
  { id: "p-otto-pulse", name: "Otto Pulse" },
  { id: "p-fertiwise", name: "FertiWise" },
  { id: "p-stimsmart", name: "StimSmart" },
  { id: "p-platform", name: "Platform" },
];

export const STATUSES: ItemStatus[] = ["Todo", "Planned", "In Progress", "Done", "Blocked"];
export const PRIORITIES: ItemPriority[] = ["Low", "Medium", "High", "Highest"];

export const STATUS_TONE: Record<ItemStatus, string> = {
  Todo: "bg-slate-100 text-slate-700 border-slate-200",
  Planned: "bg-blue-100 text-blue-700 border-blue-200",
  "In Progress": "bg-amber-100 text-amber-700 border-amber-200",
  Done: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Blocked: "bg-rose-100 text-rose-700 border-rose-200",
};

export const PRIORITY_DOT: Record<ItemPriority, string> = {
  Low: "bg-slate-400",
  Medium: "bg-blue-500",
  High: "bg-amber-500",
  Highest: "bg-rose-600",
};

export const COLOR_PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b",
  "#10b981", "#14b8a6", "#06b6d4", "#3b82f6", "#64748b",
];
