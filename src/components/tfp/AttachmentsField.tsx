import { useState } from "react";
import { ExternalLink, Paperclip, Plus, Trash2 } from "lucide-react";
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

  function addAttachment() {
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
    };
    onChange([...(attachments ?? []), next]);
    setLabel("");
    setUrl("");
    setAdding(false);
    toast.success("Attachment added");
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
        {(attachments ?? []).map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-2 rounded border border-border bg-surface px-2 py-1.5 text-xs"
          >
            <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 truncate text-primary hover:underline"
              title={a.url}
            >
              {a.label}
            </a>
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Open"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
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
        ))}
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
              onClick={addAttachment}
              className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:opacity-90"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {!readOnly && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Plus className="h-3 w-3" />
          Add link
        </button>
      )}
    </div>
  );
}
