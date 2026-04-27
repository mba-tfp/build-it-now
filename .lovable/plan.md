# Revised cleanup plan

We will proceed with the recommended simplification pass, excluding items **5**, **7**, and **9**.

That means:

- Do **not** demote Go-Live further right now.
- Do **not** simplify Roadmap aggressively right now.
- Do **not** collapse Shaping below the current 3-step model.

The goal is to improve adoption clarity without touching the areas you want to preserve for now.

## Locked scope

### 1. Remove stale references to old surfaces

Clean user-facing language so the app consistently reflects the simplified model.

Remove or update references to:

- “5-step shaping”
- old Step 4 / Step 5 wording where it appears in user-facing copy
- “Tier” wording where users should now see P1 / P2 / P3
- old “View X” labels
- Queue Health as a primary user destination
- Decision Log / Override Log as onboarding destinations
- Go-Live as a standalone onboarding destination

Target language:

```text
Home → Inbox → Shaping → Delivery → Roadmap
```

Governance remains available, but secondary.

---

### 2. Make Home the true command center

Refine Home from a dashboard into a practical daily work surface.

Home should focus on:

- items needing action
- blocked work
- stale shaping/delivery items
- pending approvals
- open questions
- recent changes worth knowing

The intent is that a user can start from Home and know what to do next without understanding every route in the app.

---

### 3. Simplify onboarding

Replace the current role-heavy onboarding with a simpler universal guide.

New onboarding flow:

1. Start at Home
2. Capture/review work in Inbox
3. Shape approved work
4. Track work in Delivery
5. Plan with Roadmap
6. Use Leadership/Governance only when needed

This removes onboarding instructions that teach users to navigate old or secondary surfaces first.

---

### 4. Consolidate Inbox language

Make Inbox the clear home for incoming work.

Inbox should own the user mental model for:

- creating new signals
- reviewing incoming requests
- deciding whether work proceeds, waits, or is rejected

Old Intake/Triage concepts can remain internally if needed, but should not be presented as separate concepts to normal users.

---

### 6. Inline Decisions and Overrides completely

Proceed with simplifying Decisions and Overrides as standalone concepts.

User-facing model:

- Decisions happen on the relevant signal/shaping/delivery item.
- Overrides happen where the risky change is being made.
- The app can still keep logs/audit history in the background.

Implementation direction:

- Remove Decision Log and Override Log from primary navigation/onboarding.
- Add inline decision/override affordances where appropriate.
- Keep existing data structures if useful, but stop requiring users to manage separate log pages.

---

### 8. Reduce Delivery permissions complexity

Soften strict delivery role restrictions where they create friction.

Preferred model:

- allow users to update most delivery statuses
- show warnings for unusual transitions
- require reasons only for risky actions
- preserve audit trail where necessary

Example:

```text
This is usually moved by QA. Continue?
```

Instead of blocking the action entirely.

---

### 10. Consider dropping Governance as a primary concept

Proceed with demoting Governance as a primary mental model, while keeping the useful functions available.

Direction:

- Governance should not feel like a main workflow stage.
- Comms and Lookback can remain accessible as supporting tools.
- Decisions and Overrides move inline.
- Sidebar should prioritize the core work loop.

Target primary workflow:

```text
Home
Inbox
Shaping
Delivery
Roadmap
Leadership
```

Governance can remain secondary if needed.

---

### 11. Reposition the app as a workflow app first

Update visible language away from “operating system” complexity and toward a simpler product workflow.

Preferred positioning:

```text
One place to manage product work from signal to delivery.
```

Avoid leading with:

```text
Operating system for governance, shaping, delivery, reviews, comms, overrides, and roadmap planning.
```

This should show up in onboarding/help/empty-state copy where applicable.

## Explicitly excluded

### 5. Go-Live demotion

No change for now.

Go-Live can remain as a Delivery tab/surface. We will not move it into an inline Release Checklist in this pass.

### 7. Aggressive Roadmap simplification

No change for now.

Roadmap keeps its current advanced planning capabilities. We will not remove timeline tooling, roadmap switchers, filters, import, or settings in this pass.

### 9. Further Shaping collapse

No change for now.

Shaping stays as:

```text
Define → Tech Review → Approve
```

We will only clean stale references to old step numbering; we will not collapse Tech Review into the brief.

## Technical implementation notes

- Update user-facing copy in onboarding, help articles, Home, navigation, and relevant route headers.
- Review routes/components for stale terminology using targeted searches for legacy labels.
- Keep legacy route files where needed for redirects/backward compatibility, but make them feel non-primary.
- Avoid deleting data models unless clearly unused; this pass is primarily UX and mental-model simplification.
- Run typecheck/build after implementation and fix any regressions.

## Acceptance criteria

- A new user sees the product as a simple workflow: Home → Inbox → Shaping → Delivery → Roadmap.
- No visible copy teaches five-step shaping.
- No primary onboarding path sends users to old/secondary surfaces.
- Decisions and overrides are presented inline rather than as separate logs.
- Delivery updates are less blocked by role rules and use warnings where appropriate.
- Go-Live remains unchanged as requested.
- Roadmap remains unchanged as requested.
- Shaping remains three steps as requested.