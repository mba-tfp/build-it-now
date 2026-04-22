import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
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
import type { Workflow, WorkflowEdge, WorkflowNode, WorkflowNodeKind } from "@/lib/tfp/types";
import { ConfirmDialog } from "@/components/tfp/ConfirmDialog";
import { Plus, Save, Trash2, Workflow as WorkflowIcon } from "lucide-react";

export const Route = createFileRoute("/_app/workflows")({
  component: WorkflowsPage,
});

const NODE_KINDS: WorkflowNodeKind[] = ["trigger", "decision", "action", "stage"];

function emptyWorkflow(name = "New workflow"): Workflow {
  const now = new Date().toISOString();
  return {
    id: "",
    name,
    active: false,
    nodes: [
      { id: "n1", kind: "trigger", label: "New signal", config: {}, x: 60, y: 80 },
      { id: "n2", kind: "stage", label: "Triage", config: {}, x: 320, y: 80 },
      { id: "n3", kind: "stage", label: "Shaping", config: {}, x: 580, y: 80 },
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
        edges: next.map((e) => ({ id: e.id, from: e.source, to: e.target, label: typeof e.label === "string" ? e.label : undefined })),
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
        edges: next.map((e) => ({ id: e.id, from: e.source, to: e.target, label: typeof e.label === "string" ? e.label : undefined })),
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

  function saveDraft() {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error("Workflow name required");
      return;
    }
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
  }

  function addNode(kind: WorkflowNodeKind) {
    if (!draft) return;
    const id = `n-${Date.now()}`;
    setDraft({
      ...draft,
      nodes: [...draft.nodes, { id, kind, label: kind[0].toUpperCase() + kind.slice(1), config: {}, x: 200, y: 200 }],
    });
  }

  function updateSelectedNode(patch: Partial<WorkflowNode>) {
    if (!draft || !selectedNodeId) return;
    setDraft({
      ...draft,
      nodes: draft.nodes.map((n) => (n.id === selectedNodeId ? { ...n, ...patch } : n)),
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
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Workflows</p>
          <h1 className="mt-1 font-display text-3xl">Workflow Builder</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visualise the Signal → Triage → Shaping → Delivery flow. Active workflows emit observability notifications.
          </p>
        </div>
        <button onClick={newWorkflow} className="flex items-center gap-1 rounded-md border border-input bg-surface px-2.5 py-1.5 text-xs hover:bg-accent/40">
          <Plus className="h-3.5 w-3.5" /> New workflow
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr_280px]">
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
                  <span className="truncate">{w.name}</span>
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
                className="rounded border border-input bg-surface px-2 py-1 text-[11px] hover:bg-accent/40 disabled:opacity-40"
              >
                + {k}
              </button>
            ))}
            <button
              onClick={() => draft?.id && toggleWorkflowActive(draft.id)}
              disabled={!draft?.id}
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
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Pick a workflow on the left or create a new one.
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
              <label className="flex flex-col text-xs text-muted-foreground">
                Label
                <input
                  value={selectedNode.label}
                  onChange={(e) => updateSelectedNode({ label: e.target.value })}
                  className="mt-1 rounded border border-input bg-surface px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col text-xs text-muted-foreground">
                Kind
                <select
                  value={selectedNode.kind}
                  onChange={(e) => updateSelectedNode({ kind: e.target.value as WorkflowNodeKind })}
                  className="mt-1 rounded border border-input bg-surface px-2 py-1 text-sm"
                >
                  {NODE_KINDS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
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
