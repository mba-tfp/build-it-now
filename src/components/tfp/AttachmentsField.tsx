import { useRef, useState } from "react";
import { ExternalLink, FileText, Image as ImageIcon, Link2, Paperclip, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Attachment } from "@/lib/tfp/types";

let _attCounter = 0;
const newAttId = () => {
  _attCounter += 1;
  return "att-" + Date.now().toString(36) + _attCounter.toString(36);
};

function isValidUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });
}

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB — keeps localStorage usable

export function AttachmentsField({
  attachments = [],
  onChange,
  currentUserId,
  compact = false,
  readOnly = false,
}: {
  attachments?: Attachment[];
  onChange: (next: Attachment[]) => void;
  currentUserId: string;
  compact?: boolean;
  readOnly?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  function addLink() {
    if (!label.trim()) {
      toast.error("Add a label for the attachment");
      return;
    }
    if (!isValidUrl(url.trim())) {
      toast.error("URL must start with http:// or https://");
      return;
    }
    const next: Attachment = {
      id: newAttId(),
      label: label.trim(),
      url: url.trim(),
      added_by: currentUserId,
      added_at: new Date().toISOString(),
      kind: "link",
    };
    onChange([...(attachments ?? []), next]);
    setLabel("");
    setUrl("");
    setAdding(false);
    toast.success("Link added");
  }

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const accepted: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} is over 5 MB`);
        continue;
      }
      try {
        const dataUrl = await readAsDataURL(file);
        accepted.push({
          id: newAttId(),
          label: file.name,
          url: dataUrl,
          added_by: currentUserId,
          added_at: new Date().toISOString(),
          kind: "file",
          mime_type: file.type || "application/octet-stream",
        });
      } catch {
        toast.error(`Couldn't read ${file.name}`);
      }
    }
    if (accepted.length > 0) {
      onChange([...(attachments ?? []), ...accepted]);
      toast.success(`${accepted.length} file${accepted.length === 1 ? "" : "s"} attached`);
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  function removeAttachment(id: string) {
    onChange((attachments ?? []).filter((a) => a.id !== id));
    toast.success("Attachment removed");
  }

  return (
    <div className={compact ? "" : "space-y-2"}>
      {!compact && (
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Paperclip className="h-3 w-3" />
          Attachments {attachments && attachments.length > 0 && `(${attachments.length})`}
        </div>
      )}

      {(attachments ?? []).length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">No attachments.</p>
      )}

      <ul className="space-y-1">
        {(attachments ?? []).map((a) => {
          const isFile = a.kind === "file";
          const isImage = isFile && (a.mime_type ?? "").startsWith("image/");
          return (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded border border-border bg-surface px-2 py-1.5 text-xs"
            >
              {isImage ? (
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  <img src={a.url} alt={a.label} className="h-9 w-9 rounded object-cover" />
                </a>
              ) : isFile ? (
                <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
              ) : (
                <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                download={isFile ? a.label : undefined}
                className="flex-1 truncate text-primary hover:underline"
                title={isFile ? a.label : a.url}
              >
                {a.label}
              </a>
              {!isFile && (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Open"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove attachment"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {!readOnly && adding && (
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Figma mockup)"
            className="w-full rounded border border-input bg-surface px-2 py-1 text-xs"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded border border-input bg-surface px-2 py-1 text-xs"
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setLabel("");
                setUrl("");
              }}
              className="rounded px-2 py-0.5 text-xs hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addLink}
              className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:opacity-90"
            >
              Add link
            </button>
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Plus className="h-3 w-3" />
              Add link
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Upload className="h-3 w-3" />
            Upload file
          </button>
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <ImageIcon className="h-2.5 w-2.5" /> images, PDFs, docs · 5 MB max
          </span>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.json"
            className="hidden"
            onChange={(e) => void addFiles(e.target.files)}
          />
        </div>
      )}
    </div>
  );
}
