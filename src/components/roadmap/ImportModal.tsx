import { useState } from "react";
import { X, Upload, FileJson, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { roadmapActions } from "@/lib/roadmap/store";
import { toast } from "sonner";

type Props = {
  onClose: () => void;
};

type ParsedRow = {
  title?: string;
  description?: string;
  stream_name?: string;
  sub_stream_name?: string;
  status?: string;
  priority?: string;
  owner?: string;
  clinic?: string;
  color_tag?: string;
  notes?: string;
  internal_only?: boolean;
  months?: string[];
};

const REQUIRED_HINT = "Required: title, stream_name, sub_stream_name. Optional: description, status, priority, owner, clinic, color_tag, notes, internal_only, months (semicolon-separated YYYY-MM).";

export function ImportModal({ onClose }: Props) {
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<"json" | "csv">("csv");

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setRawText(text);
      const fmt = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";
      setFormat(fmt);
      tryParse(text, fmt);
    };
    reader.readAsText(file);
  }

  function tryParse(text: string, fmt: "json" | "csv") {
    setError(null);
    setParsed(null);
    if (!text.trim()) return;
    try {
      if (fmt === "json") {
        const data = JSON.parse(text);
        // Accept either a bare array or { items: [...] }
        const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : null;
        if (!arr) throw new Error("Expected an array or { items: [...] }");
        setParsed(arr.map(normalizeRow));
      } else {
        setParsed(parseCsv(text));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse file");
    }
  }

  function handleImport() {
    if (!parsed || parsed.length === 0) return;
    // Cast to the wider import type — store will defensively coerce.
    const result = roadmapActions.importItems(parsed as Parameters<typeof roadmapActions.importItems>[0]);
    toast.success(
      `Imported ${result.added} items` +
        (result.streamsCreated ? ` · ${result.streamsCreated} new streams` : "") +
        (result.sectionsCreated ? ` · ${result.sectionsCreated} new sub-streams` : ""),
    );
    onClose();
  }

  function downloadTemplate(fmt: "json" | "csv") {
    let blob: Blob;
    let filename: string;
    if (fmt === "csv") {
      const headers = ["title", "stream_name", "sub_stream_name", "status", "priority", "owner", "clinic", "color_tag", "notes", "internal_only", "months"];
      const sample = [
        ["Patient portal v3", "Otto-Onboard", "Roadmap", "Planned", "P1", "Bazil", "Lakeshore", "#6366f1", "Major rework", "false", "2026-01;2026-02;2026-03"],
        ["Internal API hardening", "Platform", "Internal", "Todo", "P2", "Waseem", "", "#10b981", "", "true", ""],
      ];
      const csv = [headers.join(","), ...sample.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))].join("\n");
      blob = new Blob([csv], { type: "text/csv" });
      filename = "roadmap_import_template.csv";
    } else {
      const sample = {
        items: [
          {
            title: "Patient portal v3",
            stream_name: "Otto-Onboard",
            sub_stream_name: "Roadmap",
            status: "Planned",
            priority: "P1",
            owner: "Bazil",
            months: ["2026-01", "2026-02", "2026-03"],
            color_tag: "#6366f1",
          },
        ],
      };
      blob = new Blob([JSON.stringify(sample, null, 2)], { type: "application/json" });
      filename = "roadmap_import_template.json";
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg">Import roadmap items</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs">
            <p>{REQUIRED_HINT}</p>
            <p className="mt-1 text-muted-foreground">
              Streams and sub-streams are matched by name (case-insensitive) and auto-created if missing.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => downloadTemplate("csv")}
                className="inline-flex items-center gap-1 rounded border border-input bg-surface px-2 py-1 text-[11px] hover:bg-accent"
              >
                <FileSpreadsheet className="h-3 w-3" /> CSV template
              </button>
              <button
                onClick={() => downloadTemplate("json")}
                className="inline-flex items-center gap-1 rounded border border-input bg-surface px-2 py-1 text-[11px] hover:bg-accent"
              >
                <FileJson className="h-3 w-3" /> JSON template
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Upload file (.csv or .json)
            </label>
            <input
              type="file"
              accept=".csv,.json,application/json,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                …or paste content
              </label>
              <div className="flex gap-1 text-[11px]">
                <button
                  onClick={() => setFormat("csv")}
                  className={`rounded px-2 py-0.5 ${format === "csv" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
                >
                  CSV
                </button>
                <button
                  onClick={() => setFormat("json")}
                  className={`rounded px-2 py-0.5 ${format === "json" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
                >
                  JSON
                </button>
              </div>
            </div>
            <textarea
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                tryParse(e.target.value, format);
              }}
              rows={8}
              className="w-full rounded-md border border-input bg-surface px-3 py-2 font-mono text-xs"
              placeholder={format === "csv" ? "title,stream_name,sub_stream_name,…" : '{ "items": [ { "title": "…" } ] }'}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Could not parse</p>
                <p className="text-xs">{error}</p>
              </div>
            </div>
          )}

          {parsed && (
            <div className="rounded-md border border-border">
              <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="font-medium">Preview · {parsed.length} item{parsed.length === 1 ? "" : "s"}</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 border-b border-border bg-surface text-left text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5">Title</th>
                      <th className="px-2 py-1.5">Stream</th>
                      <th className="px-2 py-1.5">Sub-Stream</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5">Months</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-b-0">
                        <td className="px-2 py-1.5">{r.title || <span className="text-destructive">(missing)</span>}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.stream_name || "Imported"}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.sub_stream_name || "Imported"}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.status ?? "Todo"}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.months?.length ? r.months.join(", ") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.length > 50 && (
                  <p className="border-t border-border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
                    +{parsed.length - 50} more…
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-muted/20 px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-input bg-surface px-3 py-1.5 text-sm hover:bg-accent">
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!parsed || parsed.length === 0 || !!error}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Import {parsed?.length ?? 0} item{parsed?.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Helpers ----------

function normalizeRow(row: Record<string, unknown>): ParsedRow {
  const months =
    Array.isArray(row.months)
      ? row.months.map(String)
      : typeof row.months === "string" && row.months
        ? row.months.split(/[;,|]/).map((s) => s.trim()).filter(Boolean)
        : [];
  return {
    title: row.title as string | undefined,
    description: row.description as string | undefined,
    stream_name: (row.stream_name ?? row.stream ?? row.product) as string | undefined,
    sub_stream_name: (row.sub_stream_name ?? row.sub_stream ?? row.section) as string | undefined,
    status: row.status as string | undefined,
    priority: row.priority as string | undefined,
    owner: row.owner as string | undefined,
    clinic: row.clinic as string | undefined,
    color_tag: row.color_tag as string | undefined,
    notes: row.notes as string | undefined,
    internal_only: row.internal_only === true || row.internal_only === "true" || row.internal_only === 1,
    months,
  };
}

function parseCsv(text: string): ParsedRow[] {
  const lines = splitCsvLines(text.trim());
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.every((c) => c.trim() === "")) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? "";
    });
    rows.push(normalizeRow(obj));
  }
  return rows;
}

function splitCsvLines(text: string): string[] {
  // Split on newlines that are NOT inside quotes
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        cur += ch;
      }
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (cur) out.push(cur);
      cur = "";
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}
