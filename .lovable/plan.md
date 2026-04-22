

## Finish Sort + Scroll: Remaining 6 Routes

Wrap up the queue-wide sort/scroll pass. Five of the original nine are done (Overrides, Comms, Shaping, Delivery, Reviews); six remain. Each gets the same `SortMenu` + `ScrollTable` pattern wired into its existing toolbar/list.

### Per-route work

| Route | Sort options (default) | List wrapped in ScrollTable |
|---|---|---|
| Decisions (`_app.decisions.tsx`) | Date · Type · Owner (Date desc) | Card list under filter pills |
| Go-Live (`_app.golive.tsx`) | Target date · Readiness % · Product (Target asc, current behaviour) | 2-col card grid |
| Retros (`_app.retros.tsx`) | Sprint date · Action items count (Sprint desc) | Card list |
| Health (`_app.health.tsx`) | Severity · Triggered at · System (Severity desc) | Alerts panel inside Overview tab — keep the existing P1→P4 fallback; sort applies on top |
| Leadership (`_app.leadership.tsx`) | Date · Source · Tier (Date desc) | Filtered signals drill-down table at the bottom — not the dashboard tiles |
| Roadmap (`_app.roadmap.tsx`) | Bucket · Tier · Sprint pts · Title (Bucket asc) | List view only — `ListView` rows. Timeline view untouched. |

### Implementation pattern (identical per route)

1. Import `SortMenu`, `useSortMenu`, `sortRows`, `ScrollTable`.
2. Add `type SortKey = …` and `const { sort, setSort } = useSortMenu<SortKey>("<route-id>", { key, dir })`.
3. Pipe the existing filtered array through `sortRows(filtered, sort, getValue)`.
4. Drop `<SortMenu className="ml-auto" tableId="…" sort={sort} onChange={setSort} options={…} />` into the toolbar row.
5. Wrap the list/grid in `<ScrollTable className="border border-border bg-surface/40">…</ScrollTable>`.

### Route-specific notes

- **Go-Live**: keep the "scheduled-asc" default identical to today; menu just lets users override.
- **Health**: only touches the Overview tab's Alerts panel. Other tabs (Monthly, Clinics, Sprints, Tech debt, Integrations) are out of scope.
- **Leadership**: sort attaches to the signals drill-down table that already has source/product/tier/status filters. KPI tiles, throughput, burndown, override log, go-live pipeline panels are untouched.
- **Roadmap**: applies only when `view === "list"`. Timeline grid, drag-to-reorder, undo/redo, snap-grid, and per-roadmap pref persistence are untouched. ListView receives the pre-sorted array; bucket grouping inside the list is preserved.
- **Retros**: "Action items count" derives from the comma/line count of `one_change` since there's no separate action-items field — straightforward derived getter.

### Out of scope

- Any DnD, kanban reorder, or roadmap snap behaviour
- Detail panels, attachments, help-center deep-links
- Workflow runtime
- Backfilling sort to dashboard tiles, KPIs, charts, or burndown

### Files affected

- `src/routes/_app.decisions.tsx`
- `src/routes/_app.golive.tsx`
- `src/routes/_app.retros.tsx`
- `src/routes/_app.health.tsx`
- `src/routes/_app.leadership.tsx`
- `src/routes/_app.roadmap.tsx`

