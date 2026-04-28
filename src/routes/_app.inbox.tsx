import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SignalIntakePage } from "./_app.intake";
import { TriageQueuePage } from "./_app.triage";

const searchSchema = z.object({
  tab: fallback(z.enum(["submit", "triage"]), "triage").default("triage"),
  signal: fallback(z.string().optional(), undefined).default(undefined),
});

export const Route = createFileRoute("/_app/inbox")({
  validateSearch: zodValidator(searchSchema),
  component: InboxPage,
});

function InboxPage() {
  const { tab, signal } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <div className="space-y-4">
      <Tabs
        value={tab}
        onValueChange={(v) => navigate({ search: { tab: v as "submit" | "triage", signal } })}
      >
        <TabsList>
          <TabsTrigger value="triage">Review work</TabsTrigger>
          <TabsTrigger value="submit">New signal</TabsTrigger>
        </TabsList>
        <TabsContent value="triage" className="mt-4">
          <TriageQueuePage initialOpenId={signal} />
        </TabsContent>
        <TabsContent value="submit" className="mt-4">
          <SignalIntakePage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
