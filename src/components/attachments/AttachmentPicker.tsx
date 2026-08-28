"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_COUNT,
  formatBytes,
  validateAttachmentSet,
} from "@/lib/attachments";

/**
 * Multi-file picker shared by every composer that can carry attachments.
 *
 * Selection is additive — the native input replaces its file list on every
 * pick, so choosing two files and then a third would otherwise silently drop
 * the first two. New picks are appended and de-duplicated by name+size instead.
 */
export function AttachmentPicker({
  files,
  onChange,
  accent = "emerald",
}: {
  files: File[];
  onChange: (files: File[]) => void;
  accent?: "emerald" | "amber";
}) {
  const t = useTranslations("attachments");
  const inputRef = useRef<HTMLInputElement>(null);

  const key = (f: File) => `${f.name}:${f.size}`;

  const add = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    const existing = new Set(files.map(key));
    const merged = [...files, ...Array.from(picked).filter((f) => !existing.has(key(f)))];

    // Validate the whole resulting set, so "too many" and the combined size
    // ceiling are caught here rather than after a pointless upload.
    const verdict = validateAttachmentSet(
      merged.map((f) => ({ name: f.name, type: f.type, size: f.size })),
    );
    if (!verdict.ok) {
      toast.error(t(`attachErr_${verdict.reason}`));
    } else {
      onChange(merged);
    }
    // Always clear the input, or picking the same file twice in a row is a no-op.
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (f: File) => onChange(files.filter((x) => key(x) !== key(f)));

  const fileButton =
    accent === "amber"
      ? "file:bg-amber-100 file:text-amber-800 hover:file:bg-amber-200"
      : "file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100";
  const chipBorder = accent === "amber" ? "border-amber-200" : "border-slate-200";

  return (
    <div className="space-y-1.5">
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={key(f)}
              className={cn("flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm", chipBorder)}
            >
              <Paperclip className="w-4 h-4 flex-shrink-0 text-slate-400" />
              <span className="truncate text-slate-700">{f.name}</span>
              <span className="flex-shrink-0 text-xs text-slate-400">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => remove(f)}
                className="ml-auto flex-shrink-0 text-slate-400 hover:text-slate-600"
                aria-label={`${t("removeFile")}: ${f.name}`}
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.length < ATTACHMENT_MAX_COUNT && (
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          onChange={(e) => add(e.target.files)}
          className={cn(
            "w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium",
            fileButton,
          )}
        />
      )}
      <p className="text-xs text-slate-400">{t("attachmentHint", { count: ATTACHMENT_MAX_COUNT })}</p>
    </div>
  );
}

/**
 * Upload a picked set and return the new StoredFile ids, or null if it failed
 * (the user has already been told why). Shared so all three composers report
 * upload errors identically.
 */
export async function uploadAttachments(
  files: File[],
  category: string,
  t: (key: string) => string,
): Promise<string[] | null> {
  if (files.length === 0) return [];
  const data = new FormData();
  for (const f of files) data.append("file", f);
  data.append("category", category);

  try {
    const res = await fetch("/api/attachments", { method: "POST", body: data });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const known = ["empty", "tooLarge", "tooLargeTotal", "tooMany", "type"].includes(json?.error);
      toast.error(t(known ? `attachErr_${json.error}` : "attachErr_failed"));
      return null;
    }
    return (json.files as { id: string }[]).map((f) => f.id);
  } catch {
    toast.error(t("attachErr_failed"));
    return null;
  }
}
