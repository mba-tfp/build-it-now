import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SignalIntakePage } from "./_app.intake";
import { TriageQueuePage } from "./_app.triage";

const searchSchema = z.object({
  tab: fallback(z.enum(["submit", "triage"]), "triage").default("triage"),
});

export const Route = createFileRoute("/_app/inbox")({
  validateSearch: zodValidator(searchSchema),
  component: InboxPage,
});

function InboxPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <div className="space-y-4">
      <Tabs
        value={tab}
        onValueChange={(v) => navigate({ search: { tab: v as "submit" | "triage" } })}
      >
        <TabsList>
          <TabsTrigger value="triage">Triage queue</TabsTrigger>
          <TabsTrigger value="submit">Submit signal</TabsTrigger>
        </TabsList>
        <TabsContent value="triage" className="mt-4">
          <TriageQueuePage />
        </TabsContent>
        <TabsContent value="submit" className="mt-4">
          <SignalIntakePage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
