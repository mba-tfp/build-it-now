## Goal
Make decisions append-only on items at every lifecycle stage (triage → sprint-closed), tag each new decision with the item's stage at write time, and render stage badges in the timeline. Add 4 new self-tests for a 36/36 total.

## Current state
- `src/lib/tfp/types.ts`: `Decision` has no `stage` field.
- `src/lib/tfp/store.ts` `createDecision`: no stage capture.
- `src/routes/_app.shaping.tsx` `InlineDecisions`: form is **not** actually disabled by tech-signoff — but it only renders inside the shaping route stepper. Items in delivery / done / sprint-closed are viewed via `_app.delivery.tsx`, which has **no decisions UI at all**. That is the real gap that broke Phase 2 step 3.
- The `Decisions on this item` section currently renders only the latest 3, has no empty state, no stage badge, and no author/timestamp display.

## Changes

### 1. Type: add optional `stage` to `Decision`
`src/lib/tfp/types.ts` — add a `DecisionStage` union and optional field. Optional so legacy stored decisions remain valid without migration.

```ts
export type DecisionStage =
  | "triage" | "shaping" | "tech-review" | "in-progress"
  | "in-qa" | "done" | "outcome-complete" | "sprint-closed";

export type Decision = {
  // ...existing fields
  stage?: DecisionStage; // missing => render as "unstaged"
};
```

### 2. Stage derivation helper
New helper in `src/lib/tfp/classify.ts` (or alongside `InlineDecisions`):

```ts
export function deriveItemStage(sig: Signal | null, sh: ShapingItem | null, sprintClosed: boolean): DecisionStage {
  if (sprintClosed) return "sprint-closed";
  if (!sh) return "triage";
  if (sh.delivery_status === "Done" && /* outcome review complete */) return "outcome-complete";
  if (sh.delivery_status === "Done") return "done";
  if (sh.delivery_status === "In QA") return "in-qa";
  if (sh.delivery_status === "In Progress" || sh.delivery_status === "Blocked" || sh.delivery_status === "To Do") return "in-progress";
  if (sh.tech_signed_off_at) return "tech-review";
  if (sh.current_step >= 2) return "tech-review";
  return "shaping";
}
```

Sprint-closed determination: look up the sprint that contains the shaping item via existing store helpers (sprints list + `closed_at`).

### 3. Store: stamp stage on write
`src/lib/tfp/store.ts` `createDecision`: accept optional `stage` from caller (preferred) — caller passes the derived stage. Persist on the record. No migration; existing seed/persisted decisions keep no `stage`.

Bump persist `version` (e.g. 8 → 9) so the store rehydrates cleanly.

### 4. Decisions panel component (shared, append-only)
Refactor `InlineDecisions` in `src/routes/_app.shaping.tsx` into a shared component
`src/components/tfp/InlineDecisions.tsx` accepting `{ signalId, shapingItemId? }`.

Behavior:
- Always render the form. Never disabled by stage. Only basic input validation (`ready`).
- On submit, derive current stage via `deriveItemStage(...)` and pass as `stage` to `createDecision`.
- List all linked decisions in current chronological order (no `.slice(0, 3)` cap).
- Empty state copy: `"No decisions logged yet. Use the form below to add the first one."`
- Each row shows: title · decision text · author name · timestamp · **stage badge** (if `stage` present).
- Stage badge uses the same visual treatment as the priority badge (`src/components/tfp/Badge.tsx`) — small pill, muted color, capitalized label (e.g. `Tech Review`, `Sprint Closed`).
- Legacy decisions (`stage` undefined): render row with author + timestamp, **no badge**.

### 5. Mount on delivery view
`src/routes/_app.delivery.tsx`: render `<InlineDecisions signalId={...} shapingItemId={...} />` inside the per-item drill-down/detail panel (the place users open from the delivery board). This closes the Phase 2 gap.

Also keep it mounted in `_app.shaping.tsx` (replace existing inline component with shared one).

### 6. Append-only enforcement
- No edit / delete affordances on decision rows in the timeline.
- Existing global decisions log at `/decisions` (currently `_app.decisions.tsx` redirects to governance) is unchanged.

### 7. Self-test additions (cases 33–36)
`src/routes/_app.self-test.tsx`:

- **33**: Render an item with `delivery_status = "Done"` via the hidden mount, query the InlineDecisions form root by `data-testid="inline-decisions-form"`, assert the submit button is **not disabled** purely from stage (only from empty inputs).
- **34**: Same as 33 but with the item's sprint marked `closed_at` set — form remains active.
- **35**: Programmatically call `createDecision` with `stage: "done"` for an item, then read the rendered list and assert a badge with text `Done` appears in the row's `data-testid="decision-stage-badge"`.
- **36**: Inject a legacy decision (no `stage` field) via `set({ decisions: [...] })`, assert the row renders with author + timestamp but **no** `decision-stage-badge` element.

Add `data-testid` hooks: `inline-decisions-form`, `inline-decisions-submit`, `decision-row`, `decision-stage-badge`, `decisions-empty`.

## Out of scope
- No changes to `/self-test` cases 1–32, home screen, bell filtering, or breadcrumbs.
- No data migration on existing decisions.
- No reordering of the timeline (preserve current order: store prepends new decisions, so list reads newest-first — keep that).
- No edit/delete on past decisions.
- Demo mode behavior unchanged.

## Verification
After implementation, navigate to `/self-test` and confirm `36/36 pass`.