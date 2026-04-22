

## Make Triage Queue Records Editable

Currently the triage panel is **decision-only** — you can Proceed, Hold, or Reject, but everything else (Status, Type, Tier, Source, Product, Owner, Title, Description) is read-only. Inline edits in the table are also not supported.

This was intentional in the original TFP OS design (signals are intake artifacts; triage is a *decision*, not an editor). But for practical use it's reasonable to allow corrections — misclassified type, wrong tier, wrong product assignment, or owner reassignment.

### Proposed changes

**1. Edit mode in the Triage side panel (`_app.triage.tsx`)**

Add an "Edit details" toggle in the panel header. When on, the read-only badges/metadata become editable controls:

- **Title** — text input
- **Description** — textarea
- **Source** — select (Leadership / Clinic / Internal / Dev Team)
- **Product** — select (Otto-Onboard, Otto Notes, Otto Pulse, FertiWise, StimSmart, Platform)
- **Issue Type** — select (Bug / Enhancement / Incident / Leadership Input / Dependency Change)
- **Tier** — select (T1–T4) with helper text: "changing tier resets SLA"
- **Owner** — select from `users`
- **Status** — select (New / In Review / Proceed / Hold / Rejected) with a warning when bypassing the normal flow

Save / Cancel buttons commit the patch. Decision buttons (Proceed/Hold/Reject) remain as the primary path.

**2. Inline quick-edits in the table**

For high-frequency fields, allow clicking the cell without opening the panel:

- **Status** chip → dropdown
- **Tier** chip → dropdown
- **Owner** cell → dropdown

Click-to-edit avoids opening the side panel for small corrections. Other cells still open the panel.

**3. Store: add `updateSignal` action (`src/lib/tfp/store.ts`)**

New action `updateSignal(signalId, patch: Partial<Signal>)` that:
- Merges the patch
- Recomputes `sla_due_at` if `tier` changed (using `slaDueAt` from `classify.ts`)
- Writes an `audit_log` entry per changed field (`"Tier changed T3 → T2"`, `"Owner reassigned"`, etc.)
- Triggers notifications if status crosses into Proceed/Hold/Rejected (mirroring `triageDecision` side effects)

**4. Audit & guardrails**

- All edits logged to the existing audit log so the change trail is preserved.
- Status changes via the editor still flow through the same notification hooks as `triageDecision`.
- Tier changes show a brief inline note about SLA recalculation before save.

### Out of scope

- Editing `created_at`, `created_by`, or `id` (immutable).
- Bulk multi-row edits (can be a follow-up).
- Permission gating per role (current app has no role-gated mutations).

### Files affected

- `src/routes/_app.triage.tsx` — edit mode in panel + inline cell editors in table
- `src/lib/tfp/store.ts` — add `updateSignal` action with audit log + SLA recompute

