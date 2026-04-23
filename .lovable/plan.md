

## Sidebar consolidation: pipeline tabs + governance hub

You're right — 16 sidebar items is too many, and several of them are operationally one workflow. Here's the proposal.

### New sidebar (7 items, down from 16)

```text
PIPELINE
  ● Inbox          (Intake + Triage as tabs)
  ● Shaping
  ● Delivery       (Delivery + Go-Live as tabs)
  ● Roadmap

  ● Leadership

GOVERNANCE
  ● Governance     (Comms · Reviews · Decisions · Overrides · Retros · Queue Health as tabs)

SYSTEM (flag-gated, unchanged)
  ● Help · Workflows · Admin
```

### Consolidations

**1. Inbox = Intake + Triage** — same queue, two views. New route `/inbox` with tabs:
- "Submit" → current Intake form
- "Triage" → current Triage list

Keeps `/intake` and `/triage` as redirects to `/inbox?tab=submit` / `/inbox?tab=triage` so deep links and notifications keep working.

**2. Delivery = Delivery + Go-Live** — Go-Live is the tail end of Delivery. New tabs on `/delivery`:
- "Sprint" → existing kanban + backlog
- "Go-Live" → existing Go-Live checklist

`/golive` redirects to `/delivery?tab=golive`.

**3. Governance hub = Comms + Reviews + Decisions + Overrides + Retros + Queue Health** — all six are reporting/audit surfaces, opened occasionally, never daily. New route `/governance` with a horizontal tab bar:
- Comms · Reviews · Decisions · Overrides · Retros · Queue Health

Each tab renders the existing page body. Old routes (`/comms`, `/review`, `/decisions`, `/overrides`, `/retros`, `/health`) redirect to `/governance?tab=<name>`.

**One nuance on Comms in Governance:** Comms is slightly higher-frequency than the others (PMs draft updates weekly). If it feels buried, we can promote it back to its own sidebar item later — easy to revert. For now, grouping it keeps the sidebar clean and "Governance" is one click away.

### What stays top-level

- **Shaping** — daily PM work, distinct from intake and delivery
- **Roadmap** — planning surface, distinct audience (cross-product view)
- **Leadership** — exec-only audience, deserves its own entry

### Sidebar UX

- Active tab in a hub determines which sidebar item is highlighted (e.g. `/governance?tab=retros` lights up "Governance").
- Tab state lives in the URL `?tab=` search param (TanStack `validateSearch` with zod), so links and refreshes work.
- Default tab when none specified: first tab of each hub.

### Files affected

- `src/components/tfp/AppShell.tsx` — collapse `NAV` to 5 items + Governance + System.
- New: `src/routes/_app.inbox.tsx` — tab shell that imports the existing Intake and Triage page bodies (extracted into components).
- New: `src/routes/_app.governance.tsx` — tab shell mounting Comms, Reviews, Decisions, Overrides, Retros, Queue Health bodies.
- Refactor (extract page body into a component, route file becomes a thin wrapper):
  - `src/routes/_app.intake.tsx`, `_app.triage.tsx` → bodies moved to `src/components/tfp/pages/IntakePage.tsx` and `TriagePage.tsx`; routes become redirects.
  - `_app.golive.tsx` → body moved to `GoLivePage.tsx`; route redirects to `/delivery?tab=golive`.
  - `_app.delivery.tsx` → body moved to `DeliveryPage.tsx`; route renders tabs + `DeliveryPage` / `GoLivePage`.
  - `_app.comms.tsx`, `_app.review.tsx`, `_app.decisions.tsx`, `_app.overrides.tsx`, `_app.retros.tsx`, `_app.health.tsx` → bodies moved to matching `*Page.tsx` components; routes become redirects to `/governance?tab=<name>`.

No data model changes. No store changes. No new dependencies. Tabs use the existing shadcn `<Tabs>` component, controlled by the URL.

### Out of scope

- Renaming "Intake" to "Inbox" anywhere except the sidebar label and the new route
- Restyling the page bodies — they get moved verbatim
- Removing any feature

