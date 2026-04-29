import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTfpStore } from "@/lib/tfp/store";
import type {
  NotificationTrigger,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeKind,
} from "@/lib/tfp/types";
import { ConfirmDialog } from "@/components/tfp/ConfirmDialog";
import { Plus, Save, Trash2, Workflow as WorkflowIcon, X, HelpCircle } from "lucide-react";

export const Route = createFileRoute("/_app/workflows")({
  component: WorkflowsPage,
});

const NODE_KINDS: WorkflowNodeKind[] = ["trigger", "decision", "action", "stage"];

const TRIGGER_EVENTS: NotificationTrigger[] = [
  "leadership_signal",
  "incident",
  "tech_review_ready",
  "blocker_signoff",
  "blocked_over_1d",
  "comms_approval",
  "golive_unconfirmed",
  "review_overdue",
  "sla_breach",
  "scope_change",
  "retro_escalation",
  "override_logged",
  "shaping_stuck",
  "monitoring_alert",
  "fast_track_review",
  "timebox_breach",
  "clinic_feedback",
];

const ACTION_TYPES = [
  { value: "notify", label: "Notify user" },
  { value: "push_jira", label: "Push to Jira" },
  { value: "assign", label: "Assign owner" },
  { value: "set_status", label: "Set status" },
] as const;

const STAGE_ROUTES = [
  { value: "/inbox", label: "Inbox review" },
  { value: "/shaping", label: "Shaping" },
  { value: "/delivery", label: "Delivery" },
  { value: "/governance", label: "Lookback" },
  { value: "/clinics", label: "Clinics" },
] as const;

const KIND_DESCRIPTIONS: Record<WorkflowNodeKind, string> = {
  trigger: "Entry point. Workflow runs when this event fires.",
  decision: "Branch with two outputs (Yes / No).",
  action: "System does something: notify, push to Jira, assign, set status.",
  stage: "A stage in the app (Inbox review, Shaping, etc.).",
};

const HELP_KEY = "tfp:workflows:help-dismissed";

function defaultConfigFor(kind: WorkflowNodeKind): Record<string, string> {
  switch (kind) {
    case "trigger":
      return { event: "leadership_signal" };
    case "decision":
      return { yesLabel: "Yes", noLabel: "No" };
    case "action":
      return { actionType: "notify", target: "" };
    case "stage":
      return { route: "/inbox" };
  }
}

function defaultLabelFor(kind: WorkflowNodeKind): string {
  switch (kind) {
    case "trigger":
      return "When signal arrives";
    case "decision":
      return "Decision";
    case "action":
      return "Notify user";
    case "stage":
      return "Inbox review";
  }
}

function emptyWorkflow(name = "New workflow"): Workflow {
  const now = new Date().toISOString();
  return {
    id: "",
    name,
    active: false,
    nodes: [
      { id: "n1", kind: "trigger", label: "New signal", config: { event: "leadership_signal" }, x: 60, y: 80 },
      { id: "n2", kind: "stage", label: "Inbox review", config: { route: "/inbox" }, x: 320, y: 80 },
      { id: "n3", kind: "stage", label: "Shaping", config: { route: "/shaping" }, x: 580, y: 80 },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2" },
      { id: "e2", from: "n2", to: "n3" },
    ],
    created_at: now,
    updated_at: now,
  };
}

function toRfNodes(nodes: WorkflowNode[]): Node[] {
  return nodes.map((n) => ({
    id: n.id,
    position: { x: n.x, y: n.y },
    data: { label: `${n.label}`, kind: n.kind },
    style: nodeStyleFor(n.kind),
  }));
}

function toRfEdges(edges: WorkflowEdge[]): Edge[] {
  return edges.map((e) => ({ id: e.id, source: e.from, target: e.to, label: e.label }));
}

function nodeStyleFor(kind: WorkflowNodeKind): React.CSSProperties {
  const palette: Record<WorkflowNodeKind, { bg: string; border: string }> = {
    trigger: { bg: "hsl(var(--primary) / 0.1)", border: "hsl(var(--primary))" },
    decision: { bg: "hsl(var(--accent) / 0.5)", border: "hsl(var(--border))" },
    action: { bg: "hsl(var(--secondary) / 0.6)", border: "hsl(var(--border))" },
    stage: { bg: "hsl(var(--muted))", border: "hsl(var(--border))" },
  };
  const c = palette[kind];
  return {
    background: c.bg,
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    color: "hsl(var(--foreground))",
  };
}

function WorkflowsPage() {
  const flags = useTfpStore((s) => s.flags);
  const workflows = useTfpStore((s) => s.workflows);
  const upsertWorkflow = useTfpStore((s) => s.upsertWorkflow);
  const removeWorkflow = useTfpStore((s) => s.removeWorkflow);
  const toggleWorkflowActive = useTfpStore((s) => s.toggleWorkflowActive);

  const [selectedId, setSelectedId] = useState<string | null>(workflows[0]?.id ?? null);
  const [draft, setDraft] = useState<Workflow | null>(() => workflows[0] ?? null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [helpDismissed, setHelpDismissed] = useState(false);

  useEffect(() => {
    try {
      setHelpDismissed(localStorage.getItem(HELP_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  function dismissHelp() {
    setHelpDismissed(true);
    try {
      localStorage.setItem(HELP_KEY, "1");
    } catch {
      // ignore
    }
  }

  function showHelp() {
    setHelpDismissed(false);
    try {
      localStorage.removeItem(HELP_KEY);
    } catch {
      // ignore
    }
  }

  const rfNodes = useMemo(() => (draft ? toRfNodes(draft.nodes) : []), [draft]);
  const rfEdges = useMemo(() => (draft ? toRfEdges(draft.edges) : []), [draft]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!draft) return;
      const next = applyNodeChanges(changes, rfNodes);
      setDraft({
        ...draft,
        nodes: draft.nodes.map((n) => {
          const found = next.find((x) => x.id === n.id);
          return found ? { ...n, x: found.position.x, y: found.position.y } : n;
        }),
      });
    },
    [draft, rfNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (!draft) return;
      const next = applyEdgeChanges(changes, rfEdges);
      setDraft({
        ...draft,
        edges: next.map((e) => ({
          id: e.id,
          from: e.source,
          to: e.target,
          label:
            typeof (e as { label?: unknown }).label === "string"
              ? ((e as { label?: string }).label)
              : undefined,
        })),
      });
    },
    [draft, rfEdges],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!draft || !conn.source || !conn.target) return;
      const next = addEdge({ ...conn, id: `e-${Date.now()}` }, rfEdges);
      setDraft({
        ...draft,
        edges: next.map((e) => ({
          id: e.id,
          from: e.source,
          to: e.target,
          label:
            typeof (e as { label?: unknown }).label === "string"
              ? ((e as { label?: string }).label)
              : undefined,
        })),
      });
    },
    [draft, rfEdges],
  );

  function pickWorkflow(w: Workflow) {
    setSelectedId(w.id);
    setDraft(w);
    setSelectedNodeId(null);
  }

  function newWorkflow() {
    const w = emptyWorkflow();
    setDraft(w);
    setSelectedId(null);
    setSelectedNodeId(null);
  }

  function validateWorkflow(w: Workflow): string[] {
    const warnings: string[] = [];
    const triggers = w.nodes.filter((n) => n.kind === "trigger");
    if (triggers.length === 0) {
      warnings.push("No trigger node — workflow will never run.");
    }
    const decisions = w.nodes.filter((n) => n.kind === "decision");
    decisions.forEach((d) => {
      const out = w.edges.filter((e) => e.from === d.id);
      if (out.length !== 2) {
        warnings.push(`Decision "${d.label}" has ${out.length} outgoing edge(s); expected 2.`);
      }
    });
    const connected = new Set<string>();
    w.edges.forEach((e) => {
      connected.add(e.from);
      connected.add(e.to);
    });
    const orphans = w.nodes.filter((n) => !connected.has(n.id));
    if (orphans.length > 0 && w.nodes.length > 1) {
      warnings.push(`${orphans.length} disconnected node(s).`);
    }
    return warnings;
  }

  function saveDraft() {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error("Workflow name required");
      return;
    }
    const warnings = validateWorkflow(draft);
    const payload: Parameters<typeof upsertWorkflow>[0] = {
      name: draft.name.trim(),
      active: draft.active,
      nodes: draft.nodes,
      edges: draft.edges,
    };
    if (draft.id) payload.id = draft.id;
    const saved = upsertWorkflow(payload);
    setSelectedId(saved.id);
    setDraft(saved);
    toast.success("Workflow saved");
    warnings.forEach((w) => toast.warning(w));
  }

  function addNode(kind: WorkflowNodeKind) {
    if (!draft) return;
    const id = `n-${Date.now()}`;
    setDraft({
      ...draft,
      nodes: [
        ...draft.nodes,
        { id, kind, label: defaultLabelFor(kind), config: defaultConfigFor(kind), x: 200, y: 200 },
      ],
    });
    setSelectedNodeId(id);
  }

  function updateSelectedNode(patch: Partial<WorkflowNode>) {
    if (!draft || !selectedNodeId) return;
    setDraft({
      ...draft,
      nodes: draft.nodes.map((n) => (n.id === selectedNodeId ? { ...n, ...patch } : n)),
    });
  }

  function updateSelectedConfig(key: string, value: string) {
    if (!draft || !selectedNodeId) return;
    setDraft({
      ...draft,
      nodes: draft.nodes.map((n) =>
        n.id === selectedNodeId ? { ...n, config: { ...n.config, [key]: value } } : n,
      ),
    });
  }

  function relabelDecisionEdges(nodeId: string, yesLabel: string, noLabel: string) {
    if (!draft) return;
    const out = draft.edges.filter((e) => e.from === nodeId).sort((a, b) => a.to.localeCompare(b.to));
    const labels: Record<string, string> = {};
    if (out[0]) labels[out[0].id] = yesLabel;
    if (out[1]) labels[out[1].id] = noLabel;
    setDraft({
      ...draft,
      edges: draft.edges.map((e) => (labels[e.id] ? { ...e, label: labels[e.id] } : e)),
    });
  }

  function deleteSelectedNode() {
    if (!draft || !selectedNodeId) return;
    setDraft({
      ...draft,
      nodes: draft.nodes.filter((n) => n.id !== selectedNodeId),
      edges: draft.edges.filter((e) => e.from !== selectedNodeId && e.to !== selectedNodeId),
    });
    setSelectedNodeId(null);
  }

  if (!flags.workflowBuilderEnabled) {
    return (
      <div className="tfp-card mx-auto max-w-md p-8 text-center">
        <WorkflowIcon className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-3 font-display text-xl">Workflow builder disabled</h2>
        <p className="mt-2 text-sm text-muted-foreground">An admin can re-enable this in feature flags.</p>
      </div>
    );
  }

  const selectedNode = draft?.nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div>
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Workflows</p>
          <h1 className="mt-1 font-display text-3xl">Workflow Builder</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visualise the Signal → Inbox review → Shaping → Delivery flow. Active workflows emit observability notifications.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {helpDismissed && (
            <button
              onClick={showHelp}
              className="flex items-center gap-1 rounded-md border border-input bg-surface px-2.5 py-1.5 text-xs hover:bg-accent/40"
            >
              <HelpCircle className="h-3.5 w-3.5" /> How it works
            </button>
          )}
          <button onClick={newWorkflow} className="flex items-center gap-1 rounded-md border border-input bg-surface px-2.5 py-1.5 text-xs hover:bg-accent/40">
            <Plus className="h-3.5 w-3.5" /> New workflow
          </button>
        </div>
      </header>

      {!helpDismissed && (
        <div className="tfp-card mb-4 p-4 text-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-base">How the Workflow Builder works</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Workflows are observational — when active, they fire notifications as the trigger event occurs.
              </p>
            </div>
            <button onClick={dismissHelp} className="rounded p-1 text-muted-foreground hover:bg-muted/40" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ol className="mb-3 ml-4 list-decimal space-y-1 text-xs text-foreground">
            <li>Add a <strong>Trigger</strong> — every workflow starts with one.</li>
            <li>Add <strong>Stages</strong>, <strong>Actions</strong>, or <strong>Decisions</strong>. Drag from a node's edge handle to connect them.</li>
            <li>Click any node to configure it in the right panel.</li>
            <li>Click <strong>Save</strong>, then <strong>Activate</strong> to start emitting notifications.</li>
          </ol>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {NODE_KINDS.map((k) => (
              <div key={k} className="rounded border border-border/60 p-2">
                <div className="mb-1 flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: nodeStyleFor(k).borderColor as string }} />
                  <span className="text-xs font-medium capitalize">{k}</span>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">{KIND_DESCRIPTIONS[k]}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr_300px]">
        <aside className="tfp-card p-3">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Saved workflows</p>
          {workflows.length === 0 && <p className="text-xs text-muted-foreground">No workflows yet.</p>}
          <ul className="space-y-1">
            {workflows.map((w) => (
              <li key={w.id}>
                <button
                  onClick={() => pickWorkflow(w)}
                  className={
                    "flex w-full items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-muted/40 " +
                    (selectedId === w.id ? "bg-muted/40 font-medium" : "")
                  }
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {w.active && <span className="inline-block h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-green-500" />}
                    <span className="truncate">{w.name}</span>
                  </span>
                  <span className={"ml-2 rounded px-1.5 py-0.5 text-[9px] " + (w.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                    {w.active ? "ACTIVE" : "OFF"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="tfp-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 p-2">
            <input
              value={draft?.name ?? ""}
              onChange={(e) => draft && setDraft({ ...draft, name: e.target.value })}
              placeholder="Workflow name"
              className="rounded border border-input bg-surface px-2 py-1 text-sm"
              disabled={!draft}
            />
            {NODE_KINDS.map((k) => (
              <button
                key={k}
                onClick={() => addNode(k)}
                disabled={!draft}
                title={KIND_DESCRIPTIONS[k]}
                className="rounded border border-input bg-surface px-2 py-1 text-[11px] capitalize hover:bg-accent/40 disabled:opacity-40"
              >
                + {k}
              </button>
            ))}
            <button
              onClick={() => draft?.id && toggleWorkflowActive(draft.id)}
              disabled={!draft?.id}
              title="Active workflows fire observability notifications when their trigger event occurs."
              className="ml-auto rounded border border-input bg-surface px-2 py-1 text-[11px] hover:bg-accent/40 disabled:opacity-40"
            >
              {draft?.active ? "Deactivate" : "Activate"}
            </button>
            <button
              onClick={() => draft?.id && setRemoveId(draft.id)}
              disabled={!draft?.id}
              className="rounded border border-destructive/30 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/5 disabled:opacity-40"
            >
              <Trash2 className="inline h-3 w-3" />
            </button>
            <button onClick={saveDraft} disabled={!draft} className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-[11px] text-primary-foreground hover:opacity-90 disabled:opacity-40">
              <Save className="h-3 w-3" /> Save
            </button>
          </div>
          <div style={{ height: "calc(100vh - 360px)", minHeight: 420 }}>
            {draft ? (
              <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, n) => setSelectedNodeId(n.id)}
                onPaneClick={() => setSelectedNodeId(null)}
                fitView
              >
                <Background />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
            ) : (
              <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
                <div>
                  <p>No workflow open.</p>
                  <p className="mt-1 text-xs">Pick one on the left, or click <strong>+ New workflow</strong> above.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="tfp-card p-3">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Selected node</p>
          {!selectedNode ? (
            <p className="text-xs text-muted-foreground">Click a node to edit.</p>
          ) : (
            <div className="space-y-3">
              <div className="rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
                <span className="font-medium capitalize text-foreground">{selectedNode.kind}</span> — {KIND_DESCRIPTIONS[selectedNode.kind]}
              </div>

              <label className="flex flex-col text-xs text-muted-foreground">
                Label
                <input
                  value={selectedNode.label}
                  onChange={(e) => updateSelectedNode({ label: e.target.value })}
                  className="mt-1 rounded border border-input bg-surface px-2 py-1 text-sm"
                />
              </label>

              {selectedNode.kind === "trigger" && (
                <label className="flex flex-col text-xs text-muted-foreground">
                  Trigger event
                  <select
                    value={selectedNode.config.event ?? TRIGGER_EVENTS[0]}
                    onChange={(e) => updateSelectedConfig("event", e.target.value)}
                    className="mt-1 rounded border border-input bg-surface px-2 py-1 text-sm"
                  >
                    {TRIGGER_EVENTS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
              )}

              {selectedNode.kind === "decision" && draft && (
                <>
                  <label className="flex flex-col text-xs text-muted-foreground">
                    "Yes" label
                    <input
                      value={selectedNode.config.yesLabel ?? "Yes"}
                      onChange={(e) => {
                        updateSelectedConfig("yesLabel", e.target.value);
                        relabelDecisionEdges(selectedNode.id, e.target.value, selectedNode.config.noLabel ?? "No");
                      }}
                      className="mt-1 rounded border border-input bg-surface px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="flex flex-col text-xs text-muted-foreground">
                    "No" label
                    <input
                      value={selectedNode.config.noLabel ?? "No"}
                      onChange={(e) => {
                        updateSelectedConfig("noLabel", e.target.value);
                        relabelDecisionEdges(selectedNode.id, selectedNode.config.yesLabel ?? "Yes", e.target.value);
                      }}
                      className="mt-1 rounded border border-input bg-surface px-2 py-1 text-sm"
                    />
                  </label>
                  {(() => {
                    const out = draft.edges.filter((e) => e.from === selectedNode.id).length;
                    if (out !== 2) {
                      return (
                        <p className="rounded bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-400">
                          Decision needs exactly 2 outgoing edges (currently {out}).
                        </p>
                      );
                    }
                    return null;
                  })()}
                </>
              )}

              {selectedNode.kind === "action" && (
                <>
                  <label className="flex flex-col text-xs text-muted-foreground">
                    Action
                    <select
                      value={selectedNode.config.actionType ?? "notify"}
                      onChange={(e) => updateSelectedConfig("actionType", e.target.value)}
                      className="mt-1 rounded border border-input bg-surface px-2 py-1 text-sm"
                    >
                      {ACTION_TYPES.map((a) => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col text-xs text-muted-foreground">
                    Target
                    <input
                      value={selectedNode.config.target ?? ""}
                      onChange={(e) => updateSelectedConfig("target", e.target.value)}
                      placeholder={
                        selectedNode.config.actionType === "assign"
                          ? "owner / role"
                          : selectedNode.config.actionType === "set_status"
                          ? "status value"
                          : selectedNode.config.actionType === "push_jira"
                          ? "project key (e.g. ENG)"
                          : "user / channel"
                      }
                      className="mt-1 rounded border border-input bg-surface px-2 py-1 text-sm"
                    />
                  </label>
                </>
              )}

              {selectedNode.kind === "stage" && (
                <label className="flex flex-col text-xs text-muted-foreground">
                  App stage
                  <select
                    value={selectedNode.config.route ?? "/inbox"}
                    onChange={(e) => updateSelectedConfig("route", e.target.value)}
                    className="mt-1 rounded border border-input bg-surface px-2 py-1 text-sm"
                  >
                    {STAGE_ROUTES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </label>
              )}

              <button
                onClick={deleteSelectedNode}
                className="flex w-full items-center justify-center gap-1 rounded border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/5"
              >
                <Trash2 className="h-3 w-3" /> Delete node
              </button>
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={!!removeId}
        title="Delete workflow?"
        description="This permanently removes the workflow."
        destructive
        confirmLabel="Delete"
        onCancel={() => setRemoveId(null)}
        onConfirm={() => {
          if (removeId) {
            removeWorkflow(removeId);
            toast.success("Workflow deleted");
            setDraft(null);
            setSelectedId(null);
          }
          setRemoveId(null);
        }}
      />
    </div>
  );
}
