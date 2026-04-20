import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/review")({
  component: () => (
    <div>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">View 5</p>
        <h1 className="mt-1 font-display text-3xl">Outcome Reviews</h1>
      </header>
      <div className="tfp-card p-12 text-center">
        <span className="inline-block rounded-full bg-accent/40 px-3 py-1 text-xs font-medium text-accent-foreground">
          Coming in Wave 3
        </span>
        <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
          Small / Medium / Large reviews with automatic follow-on signal logging.
        </p>
      </div>
    </div>
  ),
});
