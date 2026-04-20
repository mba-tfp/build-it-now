import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/delivery")({
  component: () => (
    <Placeholder
      view="View 4"
      title="Delivery Board"
      wave="Wave 2"
      summary="Sprint board pulled from Jira, Dev Complete gate, blocked-item handling, scope lock."
    />
  ),
});

function Placeholder({ view, title, wave, summary }: { view: string; title: string; wave: string; summary: string }) {
  return (
    <div>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{view}</p>
        <h1 className="mt-1 font-display text-3xl">{title}</h1>
      </header>
      <div className="tfp-card p-12 text-center">
        <span className="inline-block rounded-full bg-accent/40 px-3 py-1 text-xs font-medium text-accent-foreground">
          Coming in {wave}
        </span>
        <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">{summary}</p>
      </div>
    </div>
  );
}
