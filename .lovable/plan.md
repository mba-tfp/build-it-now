I’ll create a downloadable Markdown technical audit package that Claude can ingest to understand what has been built, how it works, and where the risks/gaps are.

## Output
- File: `/mnt/documents/tfp-workflow-technical-audit-handoff.md`
- Format: Markdown, optimized for Claude upload/paste.
- Purpose: A self-contained handoff document explaining the TFP Workflow app architecture, workflow logic, state model, UI routes, business rules, and audit findings.

## Document structure

1. **Claude briefing header**
   - Short instruction block telling Claude how to use the document.
   - Project name, current app purpose, and implementation status.
   - Plain-language summary: this is a client-side operational workflow prototype for The Fertility Partners.

2. **Executive technical summary**
   - What the app does end to end.
   - Current implementation model: TanStack Start + React + Zustand persisted local state.
   - Important caveat: backend/database/auth/Jira integrations are mocked or not yet wired.

3. **Technology stack**
   - TanStack Start / TanStack Router route structure.
   - React 19, Vite, Tailwind CSS v4, shadcn/Radix components.
   - Zustand persistence under local storage key `tfp-os-v6` version `7`.
   - Supporting libraries: lucide-react, sonner, zod, date-fns, @xyflow/react, Recharts, marked/DOMPurify.

4. **Application architecture**
   - Root shell and app shell responsibilities.
   - Sidebar navigation groups:
     - Pipeline: Home, Inbox, Shaping, Delivery, Roadmap
     - Leadership: Leadership
     - Support: Comms & Lookback
     - System: Help Center, Workflows, Admin
   - Route layout pattern using `_app` protected-style layout even though real auth is not implemented.
   - Key reusable components: search, onboarding, attachments, timeline drawer, sorting/table helpers, notifications.

5. **Core data model**
   I’ll document the main entities and their relationships:
   - `User`, `Role`
   - `Signal`
   - `ShapingItem`
   - `Sprint`
   - `JiraEvent`
   - `Review`
   - `Override`
   - `GoLiveChecklist`
   - `CommsItem`
   - `Decision`
   - `SprintRetro`
   - `Notification`
   - `Clinic`, `MonitoringAlert`, `TechDebtReview`, `ClinicFeedbackRecord`
   - `FeatureFlags`, `HelpArticle`, `Workflow`

6. **End-to-end workflow map**
   Include an ASCII flow diagram:

   ```text
   Intake / Clinic Feedback / Monitoring
     -> Signal created
     -> Inbox triage: New / In Review / Hold / Rejected / Proceed
     -> Shaping: Define -> Tech Review -> Approval
     -> Push to Jira backlog
     -> Add to Sprint
     -> Delivery: To Do -> In Progress -> In QA -> Done, or Blocked
     -> Dev Complete gate
     -> Outcome Review
     -> Go-Live readiness
     -> Comms, Lookback, Retros, Leadership reporting
   ```

7. **Business rules and state transitions**
   - Signal status transition rules and bypass behavior.
   - Auto-classification rules for issue type and priority.
   - SLA calculations: P1 24h, P2 7d, P3 30d.
   - Proceed creates shaping.
   - P1 bugs become fast-track and are assigned to Tech Lead.
   - Leadership signals prefill evidence context.
   - Shaping gates: completeness, solution, tech review, approval.
   - Push to Jira blocked unless shaping status is `Approved`.
   - Jira push creates simulated `TFP-####` key and moves item into delivery backlog.
   - Add to Sprint changes `in_sprint` and updates allocated capacity.
   - Locked sprint requires override for new scope.
   - Done requires Dev Complete sign-off.
   - Done auto-creates pending outcome review.
   - Comms self-approval is blocked.
   - Clinic feedback has duplicate/rate-limit protection.

8. **Route-by-route technical guide**
   I’ll summarize each major route’s responsibility, state used, important actions, and risks:
   - `/` Home
   - `/inbox`, `/intake`, `/triage`
   - `/shaping`
   - `/delivery?tab=sprint|golive`
   - `/roadmap`
   - `/leadership`
   - `/governance?tab=comms|lookback`
   - `/comms`, `/review`, `/retros`, `/decisions`, `/overrides`, `/health` where relevant
   - `/help`, `/help/$slug`
   - `/admin`
   - `/workflows`
   - `/clinic-feedback`

9. **Store action reference**
   Document major `useTfpStore` actions grouped by domain:
   - Intake and triage
   - Shaping
   - Jira/delivery
   - Reviews/lookback
   - Governance/comms/decisions/retros
   - Go-live
   - Overrides/audit/notifications
   - Admin/help/workflows/users/feature flags
   - Clinics/monitoring/feedback

10. **Known implementation status and limitations**
   - State is persisted in browser local storage, not a shared backend.
   - User switching is a UI dropdown, not secure authentication.
   - Roles are stored directly on local mock users; this is acceptable for prototype only, not production.
   - Jira integration is simulated.
   - Attachments are local/link-style references, not durable object storage.
   - Notifications are local and capped at 200.
   - Audit log is local and not tamper-proof.
   - Backend, database, RLS, real auth, and external integrations are future work.

11. **Audit findings**
   I’ll write this as a practical engineering audit:
   - Architecture risks
   - Security risks
   - Data integrity risks
   - Workflow/business-rule risks
   - UX risks
   - Production-readiness gaps
   - Suggested remediation priority: Critical / High / Medium / Low

12. **Recommended next implementation roadmap**
   - Phase 1: Stabilize prototype and tests.
   - Phase 2: Add real backend persistence.
   - Phase 3: Add authentication and secure server-side roles.
   - Phase 4: Wire Jira/API integrations.
   - Phase 5: Add production audit, reporting, and observability.

13. **Claude prompt appendix**
   - Include a ready-to-copy prompt the user can paste into Claude, such as:
     “You are reviewing the TFP Workflow technical handoff below. First summarize the architecture, then identify production risks, then propose an implementation plan...”

## Technical steps after approval
1. Inspect any remaining route files needed to complete route-by-route accuracy.
2. Generate the Markdown document in `/mnt/documents/tfp-workflow-technical-audit-handoff.md`.
3. Validate the document content for completeness, consistent headings, and accurate route/action references.
4. Return the downloadable Markdown artifact link and summarize what is included.

Because this is Markdown, no visual PDF/page QA is needed; I’ll instead do a content completeness pass before delivering it.