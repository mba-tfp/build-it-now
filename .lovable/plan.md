

## Propagate Sort + Scroll to Remaining Queues

Apply the existing `SortMenu` + `ScrollTable` primitives to the nine remaining queue routes. Same pattern already shipped in Overrides and Comms: a dropdown sort control on the toolbar (persisted per-table to localStorage) and a sticky-bordered scroll container around the list.

### Routes and sort fields

| Route | Sort options | Notes |
|---|---|---|
| Shaping | Started date · Completeness % · Tier · Fast-track first | Preserves existing overdue/fast-track default sort as the initial state. |
| Delivery | Updated date · Status · Assignee · Days since update | Per-column kanban — sort applies within each column. |
| Roadmap | Bucket · Tier · Sprint pts · Title | Applies to the list view; bucket grouping kept. |
| Reviews | Due date · Status · Outcome rating · Signal tier | |
| Decisions | Date · Decision type · Owner | |
| Go-Live | Target date · Readiness % · Product | |
| Health | Severity · Triggered at · System | |
| Retros | Sprint date · Action items count | |
| Leadership | Date · Source · Tier | Leadership clinic feedback table. |

### Implementation pattern (per route)

1. Import `SortMenu`, `useSortMenu`, `sortRows`, `ScrollTable`.
2. Add a `SortKey` union type and `useSortMenu("<route-id>", { key, dir })`.
3. Wrap the existing filter/select chain in `sortRows(base, sort, getValue)`.
4. Place `<SortMenu className="ml-auto" ... />` in the toolbar row.
5. Wrap the list/grid in `<ScrollTable className="border border-border bg-surface/40">`.

### Out of scope (not this pass)

- Attachments on detail panels
- Help Center deep-links
- Workflow activation runtime
- Touching the kanban DnD or roadmap drag-to-reorder logic — sort applies to the view only.

### Files affected

- `src/routes/_app.shaping.tsx`
- `src/routes/_app.delivery.tsx`
- `src/routes/_app.roadmap.tsx`
- `src/routes/_app.review.tsx`
- `src/routes/_app.decisions.tsx`
- `src/routes/_app.golive.tsx`
- `src/routes/_app.health.tsx`
- `src/routes/_app.retros.tsx`
- `src/routes/_app.leadership.tsx`

