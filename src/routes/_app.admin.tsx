import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTfpStore } from "@/lib/tfp/store";
import type { FeatureFlags, HelpArticle, Role, User } from "@/lib/tfp/types";
import { fmtDateTime } from "@/lib/tfp/format";
import { ScrollTable } from "@/components/tfp/ScrollTable";
import { SortableHeader, sortRows, useTableSort } from "@/components/tfp/SortableHeader";
import { ConfirmDialog } from "@/components/tfp/ConfirmDialog";
import { Plus, Settings2, Trash2, UserCog, FileText, History, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
});

const ROLES: Role[] = [
  "PM",
  "Senior PM",
  "Associate PM",
  "Tech Lead",
  "Developer",
  "QA Scrum Master",
  "Leadership",
];

type Tab = "users" | "flags" | "help" | "audit";

function AdminPage() {
  const me = useTfpStore((s) => s.users.find((u) => u.id === s.currentUserId));
  const flags = useTfpStore((s) => s.flags);
  const [tab, setTab] = useState<Tab>("users");

  const isAdmin = !!me && (me.role === "Senior PM" || me.role === "Leadership");
  if (!flags.adminPanelEnabled) {
    return (
      <div className="tfp-card mx-auto max-w-md p-8 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-3 font-display text-xl">Admin panel disabled</h2>
        <p className="mt-2 text-sm text-muted-foreground">An admin can re-enable this in feature flags.</p>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="tfp-card mx-auto max-w-md p-8 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-3 font-display text-xl">Admin only</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in as a Senior PM or Leadership to view this page.
        </p>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: "users", label: "Users", icon: UserCog },
    { id: "flags", label: "Feature flags", icon: Settings2 },
    { id: "help", label: "Help articles", icon: FileText },
    { id: "audit", label: "Audit log", icon: History },
  ];

  return (
    <div>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Admin</p>
        <h1 className="mt-1 font-display text-3xl">Admin Panel</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage users, feature toggles, help content, and inspect the audit log.</p>
      </header>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "flex items-center gap-1.5 rounded-t border-b-2 px-3 py-2 text-sm transition " +
                (tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "users" && <UsersTab />}
      {tab === "flags" && <FlagsTab />}
      {tab === "help" && <HelpTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

function UsersTab() {
  const users = useTfpStore((s) => s.users);
  const upsertUser = useTfpStore((s) => s.upsertUser);
  const removeUser = useTfpStore((s) => s.removeUser);
  const resetOnboarding = useTfpStore((s) => s.resetOnboarding);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", role: "PM" as Role });

  const { sort, cycle } = useTableSort<keyof User>("admin.users");
  const sorted = useMemo(
    () => sortRows(users, sort, (u, k) => (u[k] as string | number | null | undefined)),
    [users, sort],
  );

  function createUser() {
    if (!draft.name.trim()) {
      toast.error("Name required");
      return;
    }
    const id = "u-" + draft.name.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 16);
    upsertUser({ id, name: draft.name.trim(), role: draft.role, onboarding_completed: false, onboarding_progress: {} });
    toast.success("User created");
    setDraft({ name: "", role: "PM" });
    setCreating(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{users.length} users</p>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1 rounded-md border border-input bg-surface px-2.5 py-1.5 text-xs hover:bg-accent/40"
        >
          <Plus className="h-3.5 w-3.5" /> New user
        </button>
      </div>

      {creating && (
        <div className="tfp-card flex flex-wrap items-end gap-3 p-3">
          <label className="flex flex-col text-xs text-muted-foreground">
            Name
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="mt-1 rounded border border-input bg-surface px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">
            Role
            <select
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}
              className="mt-1 rounded border border-input bg-surface px-2 py-1 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <button onClick={createUser} className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90">
            Create
          </button>
        </div>
      )}

      <ScrollTable className="tfp-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <SortableHeader field="id" sort={sort} onSort={cycle}>ID</SortableHeader>
              <SortableHeader field="name" sort={sort} onSort={cycle}>Name</SortableHeader>
              <SortableHeader field="role" sort={sort} onSort={cycle}>Role</SortableHeader>
              <th className="px-3 py-2.5 font-medium">Onboarding</th>
              <th className="px-3 py-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((u) => (
              <tr key={u.id} className="border-b border-border/60">
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{u.id}</td>
                <td className="px-3 py-2 font-medium">{u.name}</td>
                <td className="px-3 py-2">
                  <select
                    value={u.role}
                    onChange={(e) => {
                      upsertUser({ ...u, role: e.target.value as Role });
                      toast.success(`Role updated to ${e.target.value}`);
                    }}
                    className="rounded border border-input bg-surface px-1.5 py-0.5 text-xs"
                  >
                    {ROLES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {u.onboarding_completed ? "Completed" : `${Object.keys(u.onboarding_progress).length} steps`}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        resetOnboarding(u.id);
                        toast.success("Onboarding reset");
                      }}
                      className="rounded px-2 py-0.5 text-xs hover:bg-muted"
                    >
                      Reset onboarding
                    </button>
                    <button
                      onClick={() => setRemoveId(u.id)}
                      className="rounded text-destructive hover:bg-destructive/5"
                      aria-label="Remove user"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>

      <ConfirmDialog
        open={!!removeId}
        title="Remove user?"
        description="This deletes the user from the local roster. They will not appear in pickers anymore."
        destructive
        confirmLabel="Remove"
        onCancel={() => setRemoveId(null)}
        onConfirm={() => {
          if (removeId) {
            removeUser(removeId);
            toast.success("User removed");
          }
          setRemoveId(null);
        }}
      />
    </div>
  );
}

function FlagsTab() {
  const flags = useTfpStore((s) => s.flags);
  const setFlag = useTfpStore((s) => s.setFlag);

  const items: Array<{ key: keyof FeatureFlags; label: string; description: string }> = [
    { key: "attachmentsEnabled", label: "Attachments", description: "Show attachment links across signals, shaping, comms, etc." },
    { key: "helpCenterEnabled", label: "Help center", description: "Enable /help articles + in-app links." },
    { key: "workflowBuilderEnabled", label: "Workflow builder", description: "Show /workflows canvas builder." },
    { key: "multiSelectIntake", label: "Multi-select intake", description: "Allow multi-source / multi-product on intake." },
    { key: "auditVerbose", label: "Verbose audit log", description: "Use field-by-field readable audit entries." },
    { key: "adminPanelEnabled", label: "Admin panel", description: "Master toggle for this page." },
  ];

  return (
    <div className="tfp-card divide-y divide-border">
      {items.map((it) => (
        <label key={it.key} className="flex items-start justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-medium">{it.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{it.description}</p>
          </div>
          <button
            onClick={() => {
              setFlag(it.key, !flags[it.key]);
              toast.success(`${it.label} ${!flags[it.key] ? "enabled" : "disabled"}`);
            }}
            className={
              "relative h-6 w-11 shrink-0 rounded-full transition " +
              (flags[it.key] ? "bg-primary" : "bg-muted")
            }
            aria-pressed={flags[it.key]}
          >
            <span
              className={
                "absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition " +
                (flags[it.key] ? "left-[1.375rem]" : "left-0.5")
              }
            />
          </button>
        </label>
      ))}
    </div>
  );
}

function HelpTab() {
  const articles = useTfpStore((s) => s.helpArticles);
  const upsertHelpArticle = useTfpStore((s) => s.upsertHelpArticle);
  const removeHelpArticle = useTfpStore((s) => s.removeHelpArticle);
  const [editing, setEditing] = useState<HelpArticle | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);

  function startNew() {
    setEditing({
      id: "",
      slug: "",
      title: "",
      section: "Workflow",
      body_markdown: "# New article\n\n",
      updated_at: new Date().toISOString(),
      updated_by: "",
    });
  }

  function save() {
    if (!editing) return;
    if (!editing.title.trim() || !editing.slug.trim()) {
      toast.error("Title and slug required");
      return;
    }
    const payload: Parameters<typeof upsertHelpArticle>[0] = {
      slug: editing.slug.trim(),
      title: editing.title.trim(),
      section: editing.section,
      body_markdown: editing.body_markdown,
    };
    if (editing.id) payload.id = editing.id;
    upsertHelpArticle(payload);
    toast.success("Article saved");
    setEditing(null);
  }

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <div className="tfp-card p-3">
        <button
          onClick={startNew}
          className="mb-3 flex w-full items-center justify-center gap-1 rounded border border-dashed border-border px-2 py-1.5 text-xs hover:bg-muted/40"
        >
          <Plus className="h-3 w-3" /> New article
        </button>
        <ul className="space-y-1">
          {articles.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => setEditing(a)}
                className={
                  "flex w-full flex-col rounded p-2 text-left text-xs hover:bg-muted/40 " +
                  (editing?.id === a.id ? "bg-muted/40" : "")
                }
              >
                <span className="font-medium">{a.title}</span>
                <span className="text-[10px] text-muted-foreground">/{a.slug} · {a.section}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="tfp-card p-4">
        {!editing ? (
          <p className="text-sm text-muted-foreground">Pick an article on the left, or create a new one.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col text-xs text-muted-foreground">
                Title
                <input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="mt-1 rounded border border-input bg-surface px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col text-xs text-muted-foreground">
                Slug
                <input
                  value={editing.slug}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value.replace(/[^a-z0-9-]/gi, "-").toLowerCase() })}
                  className="mt-1 rounded border border-input bg-surface px-2 py-1 text-sm font-mono"
                />
              </label>
              <label className="col-span-2 flex flex-col text-xs text-muted-foreground">
                Section
                <input
                  value={editing.section}
                  onChange={(e) => setEditing({ ...editing, section: e.target.value })}
                  className="mt-1 rounded border border-input bg-surface px-2 py-1 text-sm"
                />
              </label>
            </div>
            <label className="flex flex-col text-xs text-muted-foreground">
              Markdown
              <textarea
                value={editing.body_markdown}
                onChange={(e) => setEditing({ ...editing, body_markdown: e.target.value })}
                rows={14}
                className="mt-1 rounded border border-input bg-surface px-2 py-1.5 font-mono text-xs"
              />
            </label>
            <div className="flex justify-between gap-2">
              <button
                onClick={() => editing.id && setRemoveId(editing.id)}
                disabled={!editing.id}
                className="rounded text-xs text-destructive hover:underline disabled:opacity-30"
              >
                Delete
              </button>
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className="rounded px-3 py-1.5 text-xs hover:bg-muted">
                  Cancel
                </button>
                <button onClick={save} className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90">
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!removeId}
        title="Delete article?"
        description="This permanently removes the article from the help center."
        destructive
        confirmLabel="Delete"
        onCancel={() => setRemoveId(null)}
        onConfirm={() => {
          if (removeId) {
            removeHelpArticle(removeId);
            toast.success("Article deleted");
            setEditing(null);
          }
          setRemoveId(null);
        }}
      />
    </div>
  );
}

function AuditTab() {
  const audit = useTfpStore((s) => s.audit);
  const users = useTfpStore((s) => s.users);
  const [entityFilter, setEntityFilter] = useState<string>("All");
  const [search, setSearch] = useState("");

  const types = useMemo(() => {
    const set = new Set<string>(audit.map((a) => a.entity_type));
    return ["All", ...Array.from(set)];
  }, [audit]);

  const filtered = useMemo(
    () =>
      audit.filter((a) => {
        if (entityFilter !== "All" && a.entity_type !== entityFilter) return false;
        if (search && !a.action.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [audit, entityFilter, search],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="rounded-md border border-input bg-surface px-2 py-1.5 text-sm"
        >
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search action…"
          className="w-64 rounded-md border border-input bg-surface px-2.5 py-1.5 text-sm"
        />
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} entries</span>
      </div>
      <ScrollTable className="tfp-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">When</th>
              <th className="px-3 py-2.5 font-medium">Who</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 font-medium">Entity</th>
              <th className="px-3 py-2.5 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map((a) => (
              <tr key={a.id} className="border-b border-border/60">
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{fmtDateTime(a.ts)}</td>
                <td className="px-3 py-2 text-xs">{users.find((u) => u.id === a.actor_id)?.name ?? a.actor_id}</td>
                <td className="px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">{a.entity_type}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{a.entity_id.slice(0, 12)}</td>
                <td className="px-3 py-2">{a.action}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-12 text-center text-sm text-muted-foreground">
                  No entries match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollTable>
    </div>
  );
}
