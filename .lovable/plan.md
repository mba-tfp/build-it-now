
## Make the Workflow Builder Usable

The builder today is a blank React Flow canvas with four "+ kind" buttons and a label/kind editor. Nothing tells you what a node *does*, what to connect to what, or how to test it. This plan finishes the Round 6 item that was deferred and turns the builder into something a PM can actually drive.

### What you'll see after this change

1. **An on-canvas legend** above the toolbar explaining the four node kinds in one line each:
   - **Trigger** — entry point. Every workflow starts here. (e.g. "New signal arrives", "SLA breach")
   - **Decision** — branch with Yes/No outputs.
   - **Action** — system does something (notify, push to Jira, assign owner, set status).
   - **Stage** — represents an app stage (Triage, Shaping, Delivery, Review, Go-Live).

2. **A "How it works" help strip** (collapsible, dismissable, remembered in localStorage) at the top of the page with a 4-step quickstart:
   1. Add a Trigger
   2. Add Stages/Actions and drag from a node's edge to connect them
   3. Click any node to configure it in the right panel
   4. Save → Activate to start emitting notifications

3. **Kind-specific config panels** in the right sidebar (replacing the current label + kind dropdown):
   - **Trigger**: dropdown of `NotificationTrigger` values from `types.ts` (signal_created, sla_breach, shaping_ready, etc.) + the existing label.
   - **Decision**: two text inputs ("Yes label", "No label") that auto-relabel the two outgoing edges; warning if it doesn't have exactly 2 outgoing edges.
   - **Action**: action-type dropdown (`Notify user`, `Push to Jira`, `Assign owner`, `Set status`) + a contextual "Target" field (user/role/status value).
   - **Stage**: dropdown mapping to app routes (`/triage`, `/shaping`, `/delivery`, `/review`, `/golive`) so stage nodes are linkable.

4. **Better defaults when you click "+ trigger/decision/action/stage"**: each new node spawns with a sensible label and pre-filled config (e.g. "+ trigger" creates a node already set to `signal_created`), so the canvas is never empty-meaning.

5. **Save-time validation (warn, don't block)**:
   - No trigger node → toast warning "Workflow has no trigger; it will never run."
   - Decision with ≠2 outgoing edges → toast warning naming the node.
   - Disconnected nodes → toast warning with count.

6. **Active-state clarity**: the existing "Activate" button gets a tooltip explaining "Active workflows fire observability notifications when their trigger event occurs." A small green pulse dot appears on active workflows in the left list.

### Out of scope (explicitly)

- A real execution engine. Active workflows still only emit notifications on trigger events (current observational behaviour). The plan makes intent *configurable and visible*, not executable.
- Conditional logic on Decision branches (no expression editor). Yes/No labels are descriptive only.
- Per-node permissions, scheduling, or retry policies.

### Technical notes

- `WorkflowNode.config` already exists as a free-form object — extend usage, no schema migration needed. New shapes per kind:
  - `trigger`: `{ event: NotificationTrigger }`
  - `decision`: `{ yesLabel: string, noLabel: string }`
  - `action`: `{ actionType: "notify"|"push_jira"|"assign"|"set_status", target?: string }`
  - `stage`: `{ route: string }`
- `addNode(kind)` updated to seed `config` per kind.
- When a Decision node's `yesLabel`/`noLabel` change, walk its outgoing edges (sorted by `to` for stability) and assign labels to the first two.
- Help strip dismissal stored under `tfp:workflows:help-dismissed` in localStorage.
- `saveDraft()` runs validation pass before `upsertWorkflow`; warnings via `sonner` `toast.warning`.
- No new dependencies. All changes localized to `src/routes/_app.workflows.tsx`; `WorkflowNodeKind` and `NotificationTrigger` already exist in `src/lib/tfp/types.ts`.

### Files affected

- `src/routes/_app.workflows.tsx` (only file touched)
