

## Round 5: Save feedback, multi-select, audit polish, sorting, attachments, scrolling, broken-flow fixes, and three new modules

This plan covers all 10 of your asks. It's split into **Wave A (small/UX)**, **Wave B (workflow audit + fixes)**, and **Wave C (three large new modules)**. You can approve all or pick which waves to ship.

---

### Wave A — UX, data, and audit polish

**1. Save toasts + error handling on triage edits**
- Wire `sonner` toasts to `updateSignal` calls (inline cell + side-panel Save).
- `updateSignal` returns `{ ok, error }` so the UI can show "Saved" / "Couldn't save: <reason>".
- Side-panel shows inline status text ("Saved 2s ago") under the Save button; reverts to "Edit" mode after 3s.

**2. Multi-select source AND product on signal intake**
- `Signal.source` → `Source[]`, `Signal.product` → `Product[]` (data model change).
- Migration: existing single values wrapped in arrays; persisted store version bumped to migrate localStorage on first load.
- Intake screen: `Pill` group becomes multi-toggle; "primary" source/product implicitly = first selected (used for SLA/notify routing).
- Triage queue, roadmap filters, all downstream views: filter matches if ANY array element matches; cells render comma-joined chips.
- Auto-classification reads the primary (first) source.

**3. Status bypass guard**
- Define allowed status transitions:
  - New → In Review, Hold, Rejected
  - In Review → Proceed, Hold, Rejected
  - Hold → In Review, Proceed, Rejected
  - Rejected → (no forward transitions; needs explicit "reopen")
  - Proceed → (terminal from triage; cannot move back without an override)
- Inline status dropdown and panel save: when the chosen transition is disallowed, show a confirm dialog ("This bypasses the normal triage flow. Reason required."). Cancel reverts; OK requires a reason which is logged to audit and creates an `Override` record (kind: "Other", reason supplied).
- If transition is to Proceed/Hold/Rejected from a non-allowed state and user cancels OR leaves reason empty, save is blocked.

**4. Readable audit log entries**
- Replace generic `${field} changed` with field-specific formatters in `updateSignal`:
  - `Tier T3 → T1`
  - `Status In Review → Proceed`
  - `Owner Bazil → Alizar` (resolves user IDs to names)
  - `Issue type Bug → Incident`
  - `Source [Clinic] → [Clinic, Leadership]`
  - `Product [Otto Notes] → [Otto Notes, Platform]`
  - `Title "Old title" → "New title"` (truncated to 60 chars)
  - `Description updated (124 → 156 chars)` (long bodies summarized)
- Apply the same labelling pattern to shaping, override, comms, and review updates.

**5. Sorting everywhere**
- New `<SortableHeader>` component (click to cycle asc/desc/off, arrow icon).
- Apply across: Triage Queue, Shaping, Delivery, Roadmap List, Reviews, Decisions, Comms, Overrides, Go-Live, Health, Retros, Leadership, Clinic Feedback, Admin (when added).
- Sort state stored per-table in localStorage so it persists.

**6. Attachments (link/URL only)**
- New `Attachment` type: `{ id, label, url, added_by, added_at }`.
- Store attached to: `Signal`, `ShapingItem`, `Review`, `CommsItem`, `Decision`, `GoLiveChecklist`, `SprintRetro`, `Override`.
- Reusable `<AttachmentsField>`: list of label+URL rows, "Add link" button, paste-validation (must be http(s)), trash to remove, click to open in new tab.
- Rendered in each entity's detail panel/edit form.

**7. In-table scrolling**
- Wrap every data table in a sticky-header scroll container: `max-h-[calc(100vh-280px)] overflow-y-auto` with `sticky top-0` thead.
- Horizontal overflow auto-scrolls on narrow viewports.
- Applied to all routes listed in #5.

---

### Wave B — Broken / inconsistent workflows (deep audit)

Findings from tracing the state graph, with fixes included in this plan:

| # | Broken flow | Fix |
|---|---|---|
| B1 | `triageDecision("Proceed")` creates a ShapingItem but does NOT set `current_step`/`shaping_status` properly when source=Leadership (skips problem framing). | Set `shaping_status = "In Shaping"`, `current_step = 1` always; add a Leadership "context note" auto-prefilled into `problem_evidence`. |
| B2 | `updateSignal` lets you change Status to `Proceed` but never creates the corresponding ShapingItem → Shaping queue is missing the item. | Detect status→Proceed in `updateSignal`, create the ShapingItem the same way `triageDecision` does. |
| B3 | Tier change recomputes SLA from `created_at`, but if signal is already past SLA the new due date can still be in the past silently. | If recomputed `sla_due_at` < now, push notification "SLA breach (tier change)" and surface a banner in the panel. |
| B4 | `setBlocked` writes `blocked_since` but `unblock` doesn't clear `blocker_description` → old blocker text lingers. | Clear `blocker_description` and notify "Unblocked". |
| B5 | `signOffDevComplete` doesn't move `delivery_status` to "Done" → item stays "In QA" forever even after dev complete. | Auto-advance to "Done" on sign-off OR add explicit guard message. Decision: auto-advance + audit entry. |
| B6 | `approveComms` allows approval by the same user who drafted it (no separation of duties). | Block self-approval with toast; require different user. |
| B7 | `sendComms` doesn't enforce status = "Approved" → can send a Draft. | Guard + error toast. |
| B8 | `completeReview` doesn't link the resulting follow-on signal back to the originating signal/shaping. | Add `parent_signal_id` to follow-on signal and audit the link. |
| B9 | `setRoadmapBucket` doesn't write a notification/override when bucket changes from "Now" → anything else mid-sprint. | If sprint is locked AND bucket leaves "Now", auto-create an Override (kind: "Scope added mid-sprint" inverted) for visibility. |
| B10 | `pushToJira` doesn't check if the shaping item is `Tech Approved` → can push unapproved items. | Guard against pushing before approval; toast error. |
| B11 | Reviews page allows `completeReview` without `outcome_rating` in some paths. | Make it required at the type + UI level. |
| B12 | Notifications never get garbage-collected → list grows unbounded. | Cap at 200 most-recent in `pushNotification`. |
| B13 | `submitClinicFeedback` swallows duplicate submissions but doesn't tell the user. | Return `reason: "duplicate within 24h"` to the public form. |

Each fix includes the audit-log entry and (where relevant) toast.

---

### Wave C — New modules (large)

**C1. Admin panel (`/admin`)**
- Gated to users with role `Senior PM` or `Leadership`.
- Tabs:
  - **Users**: CRUD on `users`, role assignment, reset-onboarding button.
  - **Feature toggles**: new `featureFlags` slice in store: `attachmentsEnabled`, `helpCenterEnabled`, `workflowBuilderEnabled`, `multiSelectIntake`, `auditVerbose`, etc. UI is a list of switches; flags read across the app via `useTfpStore(s => s.flags.X)`.
  - **Help center management** (depends on C2): create/edit/delete articles, organize by section.
  - **Audit viewer**: filterable, sortable view of the full `audit` log with the new readable formatters.

**C2. Help center (`/help`)**
- Article model: `{ id, slug, title, section, body_markdown, updated_at, updated_by }`.
- Tree sidebar grouped by OS section (Intake, Triage, Shaping, Delivery, Roadmap, etc.).
- Full-text search across articles.
- Each OS page gets a small "Help" button in the page header that deep-links to `/help/<section>`.
- Markdown rendering via `marked` (lightweight, no DOM purify needed for trusted admin content; we sanitize anyway).
- Seeded with starter articles for each existing section.

**C3. Workflow creator (`/workflows`) — Figjam-style**
- Canvas with pan/zoom (using `@xyflow/react` — Worker-safe, no native deps).
- Node types: Trigger (signal source), Decision (status branch), Action (notify / create override / change owner / push to Jira), Stage (Shaping/Delivery/Review).
- Edge connections wire stages together; sidebar to configure each node.
- Save/load workflows to localStorage as `Workflow[]`; each workflow has a name and version.
- "Activate" a workflow: when active, store actions (`createSignal`, `triageDecision`, status changes) consult the active workflow graph for additional notifications/overrides. v1 is observability + auto-notify only (no destructive automation) to keep it safe.
- Node templates library + duplicate/delete/undo.

This module is the largest; expect a long generation pass.

---

### Out of scope (will not change)

- No backend / DB — everything stays in localStorage.
- No real file uploads (link-only as you chose).
- No permission gating beyond the Admin route check.
- The workflow creator v1 only emits notifications and overrides; it does not yet rewrite triage routing or SLA tiers.

---

### Files affected (high level)

- **Store**: `src/lib/tfp/store.ts` (multi-select migration, transition guard, readable audit, attachments, B1–B13 fixes, feature flags, help articles, workflows)
- **Types**: `src/lib/tfp/types.ts` (`Source[]`, `Product[]`, `Attachment`, `FeatureFlags`, `HelpArticle`, `Workflow`, `WorkflowNode`, `WorkflowEdge`)
- **Shared UI**: `src/components/tfp/SortableHeader.tsx`, `AttachmentsField.tsx`, `ScrollTable.tsx`, `ConfirmDialog.tsx`
- **Edited routes**: `_app.intake.tsx`, `_app.triage.tsx`, `_app.shaping.tsx`, `_app.delivery.tsx`, `_app.roadmap.tsx`, `_app.review.tsx`, `_app.decisions.tsx`, `_app.comms.tsx`, `_app.overrides.tsx`, `_app.golive.tsx`, `_app.health.tsx`, `_app.retros.tsx`, `_app.leadership.tsx`, `clinic-feedback.tsx`
- **New routes**: `_app.admin.tsx`, `_app.help.tsx`, `_app.help.$slug.tsx`, `_app.workflows.tsx`
- **New deps**: `marked` (help), `dompurify` (sanitize markdown), `@xyflow/react` (workflow canvas)

