I’ll create a downloadable PDF training manual that explains the entire TFP Workflow app step by step, at training-manual depth.

## Output
- A polished PDF report saved to `/mnt/documents/`.
- Filename: `tfp-workflow-training-manual.pdf`.
- It will be delivered with a downloadable artifact link.

## Manual structure

1. **Executive orientation**
   - What the app is for
   - End-to-end workflow summary
   - Main navigation areas: Home, Inbox, Shaping, Delivery, Roadmap, Leadership, Comms & Lookback, Help/Admin

2. **End-to-end workflow map**
   ```text
   Signal Intake
     -> Inbox Review / Triage
     -> Shaping: Define
     -> Tech Review
     -> Approval
     -> Jira Backlog
     -> Sprint Delivery
     -> QA / Done
     -> Go-Live Readiness
     -> Comms, Reviews, Retros, Leadership Reporting
   ```

3. **Roles and responsibilities**
   - PM / Senior PM / Associate PM
   - Tech Lead
   - Developer
   - QA Scrum Master
   - Leadership
   - Who owns each gate, who contributes, who approves, and who monitors

4. **Detailed training sections for every workflow stage**
   For each section I’ll cover:
   - What it is
   - Why it exists
   - Who works on it
   - When to use it
   - Where it lives in the app
   - How to complete it
   - Required fields / gates
   - Outputs and handoffs
   - Common mistakes and troubleshooting

   Sections will include:
   - New Signal intake
   - Inbox / Review incoming work
   - Proceed, Hold, Reject decisions
   - Shaping workspace
   - Define brief
   - Tech Review
   - Approval
   - Fast-track bug handling
   - Dependency change handling
   - Inline decisions
   - Push to Jira
   - Delivery backlog
   - Add to Sprint
   - Sprint board statuses: To Do, In Progress, In QA, Done, Blocked
   - Dev Complete gate
   - Blocker handling and escalation
   - Sync from Jira
   - Go-Live readiness checklist
   - War-room mode
   - Go / No-Go decision
   - Roadmap planning and delivery view
   - Leadership dashboard and reporting
   - Comms
   - Lookback: reviews and retros
   - Overrides and audit trail
   - Help Center / onboarding / global search / admin concepts

5. **Operating cadence**
   - Daily workflow habits
   - Weekly sprint / delivery review
   - Go-live readiness cadence
   - Monthly or quarterly lookback cadence
   - Leadership reporting rhythm

6. **Exception paths and governance**
   - SLA breach
   - Bypassing normal inbox transitions
   - Scope added mid-sprint
   - Blocked for more than one day
   - Fast-track bugs
   - Timebox breach
   - No-Go release decision
   - Override logging and leadership visibility

7. **Quick-reference appendix**
   - Status glossary
   - Field glossary
   - Gate checklist
   - “If this happens, do this” troubleshooting table
   - Suggested owner matrix

## Design approach
- Clean internal-training style, suitable for printing or sharing.
- Use the app’s workflow language: Signal, Triage, Shaping, Tech Review, Approval, Delivery, Go-Live, Lookback.
- Include tables and clear headings so the manual is easy to scan.
- Avoid assuming technical knowledge; explanations will be operational and practical.

## Technical steps after approval
1. Generate the PDF content using a script in the workspace.
2. Save the final PDF to `/mnt/documents/tfp-workflow-training-manual.pdf`.
3. Convert the PDF pages to images for mandatory visual QA.
4. Inspect every page for clipped text, overlap, bad page breaks, missing content, and readability.
5. Fix any layout issues, regenerate, and re-check affected pages.
6. Return the downloadable PDF artifact and summarize QA findings.