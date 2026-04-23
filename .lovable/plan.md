

## Round 6: Intake / Triage / Shaping / Go-Live / Workflows polish

Nine targeted changes addressing the feedback. Each is small and isolated; no schema rewrites.

### 1. Intake: title is required

`src/routes/_app.intake.tsx`
- Mark Title field `required`, add validation (min 3 chars), include in `canSubmit`.
- Drop the "we'll use the first line of your description" hint.
- `createSignal` already accepts title; remove the fallback to description slice in store too (`store.ts` line 1429) so titles are never silently derived.

### 2. Intake: remove auto-classification, keep it for triage

`src/routes/_app.intake.tsx`
- Delete the right-hand "Auto-classification" aside entirely (Issue type / SLA tier / Due by / Why panel).
- Remove `overrideType`, `overrideTier`, `classification` state and the `Sparkles` icon.
- Submit no longer sends `issue_type_override` / `tier_override`.

`src/routes/_app.triage.tsx`
- Surface live classification inside the **Triage panel** (right-side drawer when a signal opens). New "Auto-classification" block above the inline edit fields, calling `classifySignal({ source, description })`. The PM can accept or override Type/Tier from there (existing inline selects already do this; just add a "Reset to suggestion" affordance).

### 3. Intake: file/image uploads (not just links)

`src/components/tfp/AttachmentsField.tsx`
- Add a second mode: file upload via `<input type="file" multiple accept="image/*,.pdf,.doc,.docx" />`.
- For each file, read with `FileReader.readAsDataURL` and store the data URL in the existing `Attachment.url` slot (label = filename, marked with a `kind: "file"` field on Attachment).
- Image attachments render an inline thumbnail; non-images keep the current pill styling.
- Persistence is the same `setSignalAttachments` path — files live in localStorage as data URLs (consistent with the rest of the demo store).

`src/lib/tfp/types.ts`
- `Attachment` gains optional `kind?: "link" | "file"` and `mime_type?: string`. Backward compatible.

### 4. Move "conflicts with committed item" checkbox from Intake → Triage

`src/routes/_app.intake.tsx`
- Remove the "Conflicts with a committed item?" Field block, the `displacementFlag` / `displacementNote` state, and the related `canSubmit` clause.
- `createSignal` call sends `displacement_flag: false, displacement_note: null`.

`src/routes/_app.triage.tsx` (Triage panel)
- Add the same checkbox + note input inside the panel, persisted via `updateSignal({ displacement_flag, displacement_note })`.

### 5. Intake: add Priority (single-select)

`src/lib/tfp/types.ts`
- New union: `export type IntakePriority = "Must have" | "Nice to have" | "Food for thought";`
- Add `priority: IntakePriority` to `Signal`.

`src/lib/tfp/store.ts`
- `createSignal` accepts `priority`; default `"Nice to have"` for any seed/internal callers (monitoring alerts, follow-on signals, clinic feedback all default to "Nice to have"; monitoring alerts default to "Must have").

`src/routes/_app.intake.tsx`
- New required `Field` "Priority" with three pill buttons (`MultiSelectPills` style, single-select).

`src/routes/_app.triage.tsx`
- Show priority as a badge on each row + an inline-editable select in the panel.

### 6. Triage: default filter to "New"

`src/routes/_app.triage.tsx`
- Change initial state `useState<…>("All")` → `useState<…>("New")` for `statusF`.
- "All" is still in the dropdown so users can reveal everything.

### 7. Shaping: complexity → dropdown, evidence → attachments

`src/routes/_app.shaping.tsx` — `SolutionBrief` component
- Replace the three pill buttons with a `<select>` (Simple / Medium / Complex).
- **Show all six fields regardless of complexity** (drop `COMPLEX_FIELDS` gating). Complexity becomes a metadata tag, not a form-shape switch. `solutionComplete()` validation stays the same; `setComplexity` still fires.

`src/routes/_app.shaping.tsx` — `ProblemBrief` component
- Under the **Evidence** textarea, render an `<AttachmentsField>` bound to the shaping item's attachments via `setShapingAttachments`. Hint copy: "Attach screenshots, recordings, tickets that back this up."

### 8. Sprint allocation: discuss before changing

This one needs a conversation, not a code change. The current logic:
- A shaping item enters the active sprint the moment `pushToJira(id)` runs (Step 5 → "Approved" → "Push to Jira" button). It increments `sprint.allocated_pts` by the tech estimate immediately.
- There is no explicit "add to sprint" gesture; sprint membership = "has a Jira key in the active sprint".
- Sprint lock (`scope_locked_at`) is informational — pushing to Jira while locked still works, just fires a notification.

Plan: add a TODO note in the plan file but **do not change sprint behaviour this round.** I'll surface a short ask in chat after implementation listing the four candidate rules so you can pick:
  a. Block push-to-Jira when sprint is Locked (hard gate).
  b. Require an explicit "Add to sprint" action separate from "Push to Jira".
  c. Default new Jira pushes to "Backlog" and only the Sprint Planning view moves them in.
  d. Keep current behaviour but make Lock actually lock.

### 9. Go-Live: customizable checklists per release

`src/lib/tfp/types.ts`
- Loosen `GoLiveCriterion` from a hard union to `string`. The five existing strings become a `DEFAULT_GOLIVE_CRITERIA` constant.
- `GoLiveChecklist.criteria` becomes `Record<string, { done; note; checked_by; checked_at }>` (string-keyed).

`src/routes/_app.golive.tsx`
- `ComposeGoLive` gains a "Checklist items" section: editable list of strings, prefilled with the five defaults, add/remove rows, reorder buttons.
- Card view iterates `Object.keys(g.criteria)` instead of the constant `CRITERIA`.
- Existing checklists keep working because their five default keys are still present.

`src/lib/tfp/store.ts`
- `upsertGoLive` accepts an optional `criteria_keys: string[]`; if absent, falls back to defaults.
- `toggleGoLiveCriterion` already takes `criterion: string`-shaped key, just widen the type.

### 10. Workflow Builder: make trigger / decision / action / stage do something

Today the four buttons just add a node with a different colour. Plan:

`src/routes/_app.workflows.tsx`
- Above the canvas, add a one-line legend explaining each kind:
  - **Trigger** — entry point (e.g. "New signal", "SLA breach"). Workflows must start from one.
  - **Decision** — branch point with two outgoing edges (Yes/No labels auto-applied).
  - **Action** — system action (notify, assign, push to Jira). Configurable from the right panel.
  - **Stage** — a workflow step that maps to an app state (Triage, Shaping, etc.).
- Right-hand "Selected node" panel grows kind-specific config:
  - **Trigger**: dropdown of `NotificationTrigger` values from `types.ts`.
  - **Decision**: two text inputs for the Yes/No edge labels; auto-relabel outgoing edges.
  - **Action**: dropdown (`Notify user`, `Push to Jira`, `Assign owner`, `Set status`) + a target field.
  - **Stage**: dropdown of app routes (`/triage`, `/shaping`, `/delivery`, `/review`, `/golive`).
- `addNode(kind)` seeds sensible defaults per kind so the node is immediately useful.
- Save validation: warn (not block) if no `trigger` node exists or a `decision` has fewer than 2 outgoing edges.

This stays observational (no runtime engine) but the builder finally communicates intent and stores configuration.

### Out of scope

- Real backend uploads (still data-URL in localStorage, consistent with the rest of the demo).
- A workflow execution engine (still observational; v1 fires notifications when active).
- Sprint allocation rule changes (item 8 — needs your input first).
- Touching Roadmap list-view sort (still deferred from previous round).

### Files affected

- `src/lib/tfp/types.ts`
- `src/lib/tfp/store.ts`
- `src/components/tfp/AttachmentsField.tsx`
- `src/routes/_app.intake.tsx`
- `src/routes/_app.triage.tsx`
- `src/routes/_app.shaping.tsx`
- `src/routes/_app.golive.tsx`
- `src/routes/_app.workflows.tsx`

