## Plan

Single edit to `src/components/tfp/AppShell.tsx`:

1. Remove the Activity logo `<span>` inside `SidebarHeader` (lines 55–57).
2. Change `SidebarHeader` to a fixed-height empty bar that matches the page header's height so the bottom border lines up across the sidebar/inset boundary on every route. Concretely: `className="border-b border-sidebar-border h-[45px] p-0"` (matches header `py-2.5` + `h-6` icon row).
3. Leave the page header's home link / "TFP Workflow" wordmark untouched.

Then re-run `/self-test` and report the count.