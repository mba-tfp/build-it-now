import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CommsPage } from "./_app.comms";
import { ReviewsPage } from "./_app.review";
import { DecisionsPage } from "./_app.decisions";
import { OverridesPage } from "./_app.overrides";
import { RetrosPage } from "./_app.retros";
import { QueueHealthPage } from "./_app.health";

const TABS = ["comms", "reviews", "decisions", "overrides", "retros", "health"] as const;
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
      <Tabs
        value={tab}
        onValueChange={(v) => navigate({ search: { tab: v as TabKey } })}
      >
        <TabsList className="flex-wrap">
          <TabsTrigger value="comms">Comms</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
          <TabsTrigger value="overrides">Overrides</TabsTrigger>
          <TabsTrigger value="retros">Retros</TabsTrigger>
          <TabsTrigger value="health">Queue Health</TabsTrigger>
        </TabsList>
        <TabsContent value="comms" className="mt-4"><CommsPage /></TabsContent>
        <TabsContent value="reviews" className="mt-4"><ReviewsPage /></TabsContent>
        <TabsContent value="decisions" className="mt-4"><DecisionsPage /></TabsContent>
        <TabsContent value="overrides" className="mt-4"><OverridesPage /></TabsContent>
        <TabsContent value="retros" className="mt-4"><RetrosPage /></TabsContent>
        <TabsContent value="health" className="mt-4"><QueueHealthPage /></TabsContent>
      </Tabs>
    </div>
  );
}
