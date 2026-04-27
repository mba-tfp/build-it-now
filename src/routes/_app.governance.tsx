import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CommsPage } from "./_app.comms";
import { ReviewsPage } from "./_app.review";
import { RetrosPage } from "./_app.retros";

const TABS = ["comms", "lookback"] as const;
type TabKey = (typeof TABS)[number];

const searchSchema = z.object({
  tab: fallback(z.enum(TABS), "comms").default("comms"),
});

export const Route = createFileRoute("/_app/governance")({
  validateSearch: zodValidator(searchSchema),
  component: GovernancePage,
});

function GovernancePage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v as TabKey } })}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="comms">Comms</TabsTrigger>
          <TabsTrigger value="lookback">Lookback</TabsTrigger>
        </TabsList>
        <TabsContent value="comms" className="mt-4"><CommsPage /></TabsContent>
        <TabsContent value="lookback" className="mt-4"><LookbackPage /></TabsContent>
      </Tabs>
    </div>
  );
}

function LookbackPage() {
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Lookback</p>
          <h1 className="mt-1 font-display text-3xl">Reviews & Retros</h1>
          <p className="mt-1 text-sm text-muted-foreground">One place for feature reviews and sprint learning.</p>
        </div>
        <ReviewsPage />
      </section>
      <section className="border-t border-border pt-8">
        <RetrosPage />
      </section>
    </div>
  );
}
