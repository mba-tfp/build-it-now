The features are likely not working consistently because the app has accumulated several demo-flow changes quickly, and there are two stability issues underneath them:

1. The preview has a React hydration/runtime error (`Minified React error #418`). This usually means the HTML rendered on the server does not match what React renders in the browser. When that happens, clicks, state, and UI sections can behave unpredictably.
2. The TFP workflow state is stored in persisted browser state (`tfp-os-v6`). As seed data and workflow shapes changed across recent edits, older saved local state can conflict with the newer code. That can make expected seed items, statuses, Jira keys, review state, or onboarding state appear missing or stale.

I also noticed the dev server log has a Tailwind config generation warning, but the Vite server still starts. That is probably less important than the hydration/state mismatch, but it is worth cleaning up if visual styles are inconsistent.

Plan to fix this properly:

1. Fix the hydration mismatch first
   - Remove the broad `mounted` gate around the entire app shell if it is causing server/client output differences.
   - Make only the browser-dependent pieces client-safe: sidebar state, notifications, search shortcut, and any localStorage-based sorting.
   - Add `suppressHydrationWarning` at the document/body level only if needed for unavoidable dynamic browser attributes.

2. Make persisted TFP demo state safe after schema changes
   - Bump the Zustand persisted store version.
   - Strengthen migration so missing/new fields are backfilled from the latest seed data instead of leaving partially old objects.
   - Add a lightweight “Reset demo data” admin/helper action if needed, so the demo can be restored without manually clearing local storage.

3. Audit the main demo paths for regressions
   - Inbox → Proceed → Shaping deep-link.
   - Shaping → Tech Review → Ready for Sprint.
   - Delivery Backlog → Sprint Planning → Commit/Jira creation.
   - Sprint Board lookback/review badges.
   - Leadership dashboard attention counts and overdue reviews.
   - Clinics phase/checklist flow.

4. Fix obvious UX breakpoints discovered during the audit
   - Make sure links that should navigate do not get swallowed by card click handlers.
   - Make sure completed/Ready for Sprint items appear in exactly one contextual place.
   - Ensure status labels match the new terminology everywhere.

5. Clean up preview warnings
   - Address the missing Tailwind config generation warning if it is affecting Lovable’s style tooling.
   - Re-check recent runtime errors after the stability fixes.

After this pass, the app should feel less brittle: the sidebar can stay collapsed by default, but the first priority is eliminating the hydration/runtime error and stale persisted workflow state, because those are the main reasons multiple unrelated features can seem broken at once.