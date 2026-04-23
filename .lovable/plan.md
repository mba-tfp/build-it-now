
## Round 7: Sprint flow rewrite, Roadmap sort, Triage tabs, Workflow Builder v2

Five focused changes. The biggest one is a full rethink of the Workflow Builder — we're throwing away the freeform canvas and replacing it with something a PM can actually understand in 60 seconds.

---

### 1. Sprint allocation: combo logic (Backlog → Add to Sprint → Lock)

Today, "Push to Jira" silently dumps items into the active sprint and bumps `allocated_pts`. That's why "nothing can go in the current sprint" felt broken. New flow:

**Two-step model**
- **Push to Jira** (in Shaping, after Approval): creates the Jira issue, sets `delivery_status = "To Do"`, sets `shaping_status = "In Delivery"`, but **does NOT touch sprint allocation**. Item lands in the "Backlog" rail.
- **Add to Sprint** (new action, in Delivery board): moves a backlog item into the active sprint. Only this action increments `allocated_pts` and makes the item appear in the sprint kanban columns.

**Hard-block when locked**
- If `sprint.status === "Locked"` OR `sprint.scope_locked_at` is set → "Add to Sprint" is disabled with tooltip "Sprint locked. Use Override log."
- Push to Jira itself is never blocked by sprint lock (backlog is always open).

**Delivery board changes**
- New "Backlog" rail above the kanban (alongside the existing "Blocked" rail), showing items with `jira_key` but not yet in the sprint.
- Each backlog card has an "Add to Sprint" button (disabled + tooltip when locked).
- Kanban columns now only show items that have been explicitly added to the sprint.

**Data model**
- Add `in_sprint: boolean` (default `false`) to `ShapingItem`. Backlog = `jira_key && !in_sprint`. In-sprint = `jira_key && in_sprint`.
- Migrate seed: any seed item currently in a delivery column gets `in_sprint: true`.

**Store changes**
- `pushToJira()`: stop incrementing `allocated_pts`, stop firing capacity warning. Just create issue.
- New `addToSprint(shapingId)`: validates lock, sets `in_sprint: true`, increments `allocated_pts`, fires capacity warning if >85%.
- New `removeFromSprint(shapingId)`: opposite, blocked if sprint locked.

---

### 2. Roadmap List View: add sort + scrollable table

Mirror the Delivery/Triage pattern that already works well.

- `src/routes/_app.roadmap.tsx`: add `<SortMenu>` next to the view toggle, only visible when `view === "list"`.
- Sort keys: `title`, `product`, `status`, `priority`, `owner`, `start_date`, `end_date`.
- Persist sort in the same `RoadmapUiPrefs` blob (keyed per roadmap).
- `src/components/roadmap/ListView.tsx`: wrap output in `<ScrollTable maxHeight="calc(100vh - 360px)">` so long lists don't push the page. Apply sort to the leaf items inside each group (groups themselves stay alphabetical).

---

### 3. Triage Panel: tab the dense right-side drawer

The panel currently stacks Title/badges, Description, Auto-classification, Priority editor, Attachments, Owner, Decision controls — too much vertical scroll.

Split into 3 tabs at the top of the drawer body:
- **Details** — title, description, badges, edit form
- **Classify** — auto-classification suggestion, priority editor, type/tier/source/product editing, "affects committed item" checkbox
- **Attachments & Decision** — attachments list/upload + Proceed/Hold/Reject controls

Use the existing shadcn `<Tabs>` component. State stays in `TriagePanel`; default tab = "Details".

---

### 4. Stability: silence ResizeObserver loop warning

Wrap the React Flow / any `ResizeObserver` callback in `requestAnimationFrame`, and add a global `window.addEventListener("error")` filter in `__root.tsx` that swallows the benign "ResizeObserver loop completed with undelivered notifications" message. (It's noise, not a real error, but it fills your runtime-errors panel.)

---

### 5. Workflow Builder v2 — REPLAN (the big one)

**The problem with v1:** It's a freeform graph editor with abstract node kinds (Trigger / Decision / Action / Stage). To use it you have to (a) understand graph theory, (b) know which `NotificationTrigger` enum values are real, (c) wire edges yourself, (d) configure JSON-ish key/value pairs. Nothing in the UI tells you *what changes in your app* if you save and activate a workflow. And in fact, nothing changes — Round 6 explicitly noted workflows are "observational only."

**The new model: Notification Rules, not flowcharts**

Replace the canvas + nodes + edges with a simple **rule list**. A workflow becomes:

> **WHEN** {event} **AND** {optional filter} → **DO** {action} → **NOTIFY** {who}

Each rule is one row. No drawing. No edges. No graph.

#### Page layout

```text
┌─────────────────────────────────────────────────────┐
│ Notification Rules                          [+ New] │
├─────────────────────────────────────────────────────┤
│ ● ON  SLA breach (T1/T2 only)                       │
│       → Notify PM owner                       [Edit]│
├─────────────────────────────────────────────────────┤
│ ○ OFF Sprint capacity > 85%                         │
│       → Notify Leadership                     [Edit]│
├─────────────────────────────────────────────────────┤
│ ● ON  Comms pending approval > 4h                   │
│       → Notify Senior PM + push Slack         [Edit]│
└─────────────────────────────────────────────────────┘
```

Each row shows: on/off toggle, plain-English summary, edit button.

#### Edit dialog (modal, not canvas)

Three sections, top-to-bottom, no graph:

1. **WHEN** — dropdown of `NotificationTrigger` events, each with a one-line description in the option (e.g. "SLA breach — fired when a signal passes its SLA due date").
2. **IF** *(optional)* — 0-3 filter rows: `{field} {operator} {value}`. Fields offered depend on the trigger (e.g. for `sla_breach`: tier, product, source). "+ Add filter" button.
3. **THEN** — pick action(s):
   - Notify role (PM / Senior PM / Tech Lead / QA SM / Leadership)
   - Notify specific user
   - Set priority (P1-P4)

**Live preview:** below the form, show "Last 7 days: this rule would have fired N times" by replaying the rule against the existing notification history. Gives instant confidence the rule does what you want.

#### What replaces the existing Workflow type

Keep the storage shape but treat it as a rule, not a graph:
- `Workflow.nodes[0]` (kind=trigger) holds `event` + filters in `config`.
- `Workflow.nodes[1]` (kind=action) holds the action config.
- Drop `decision` and `stage` kinds entirely from the UI (still valid in the type for back-compat).
- `Workflow.edges` becomes a single implicit `[trigger → action]` edge, written automatically.

The `notify.ts` runtime that fires notifications when active workflows match doesn't need to change — it already reads the trigger event off the workflow.

#### Migration

- Existing v1 workflows: on first load, if a workflow has multiple triggers/actions, mark it `migrated: false` and show a banner "This workflow used the old builder. [Recreate as rule]". User clicks → opens the new edit dialog pre-filled with the first trigger + first action found.
- Users with no saved workflows: see an empty state with "+ Create your first rule" and 3 example templates ("SLA breach P1 alert", "Sprint capacity warning", "Blocker over 24h").

#### Files affected (Workflow Builder)
- `src/routes/_app.workflows.tsx` — full rewrite (keep route + flag check, replace everything below)
- New: `src/components/tfp/RuleEditor.tsx` — the modal
- Optional: `src/lib/tfp/rules.ts` — small helper to convert between Workflow ↔ rule shape, plus the "would have fired N times" replay function

#### Files NOT touched
- `src/lib/tfp/types.ts` — no Workflow shape changes
- `src/lib/tfp/notify.ts` — runtime stays as-is
- `@xyflow/react` dependency stays installed but is no longer imported (can be removed in a later cleanup pass)

---

### Out of scope for this round

- Migrating attachments off `localStorage` data URLs to cloud storage
- "Save as template" for Go-Live checklists
- "Duplicate Workflow" action (the rule list makes this trivial later)
- `classifySignal` smart defaults for Intake Priority

### Files affected (full list)

- `src/lib/tfp/types.ts` (add `in_sprint` to ShapingItem)
- `src/lib/tfp/store.ts` (split pushToJira / addToSprint / removeFromSprint, seed migration)
- `src/routes/_app.shaping.tsx` (relabel button to "Push to Jira (backlog)")
- `src/routes/_app.delivery.tsx` (Backlog rail, Add to Sprint button, lock enforcement)
- `src/routes/_app.roadmap.tsx` (SortMenu when list view)
- `src/components/roadmap/ListView.tsx` (ScrollTable + apply sort)
- `src/routes/_app.triage.tsx` (Tabs in TriagePanel)
- `src/routes/__root.tsx` (ResizeObserver warning filter)
- `src/routes/_app.workflows.tsx` (full rewrite)
- `src/components/tfp/RuleEditor.tsx` (new)
- `src/lib/tfp/rules.ts` (new, small)
