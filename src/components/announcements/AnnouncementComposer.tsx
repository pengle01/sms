"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Megaphone, Loader2, Pencil, Paperclip, X, Undo2 } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { AttachmentPicker, uploadAttachments } from "@/components/attachments/AttachmentPicker";
import { cn } from "@/lib/utils";

const field =
  "w-full px-3 py-2 rounded-lg border border-amber-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

type ExistingFile = { id: string; filename: string };

export type AnnouncementInitial = {
  id: string;
  title: string | null;
  body: string;
  /** YYYY-MM-DD — the day it shows. */
  dayIso: string;
  files: ExistingFile[];
};

/**
 * The announcement form, for a new post or an edit. A client component rather
 * than a plain server-action form because the attachments have to be uploaded
 * to /api/attachments FIRST — server actions cap request bodies at 1 MB, far
 * under what a set of files may be. The action then only carries file ids.
 */
function AnnouncementForm({
  action,
  todayIso,
  initial,
  onDone,
}: {
  action: (formData: FormData) => Promise<void>;
  todayIso: string;
  initial?: AnnouncementInitial;
  onDone?: () => void;
}) {
  const t = useTranslations("dashboard");
  const ta = useTranslations("attachments");
  const [files, setFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const editing = !!initial;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    setUploading(true);
    const fileIds = await uploadAttachments(files, "announcement", ta);
    setUploading(false);
    if (fileIds === null) return;
    for (const id of fileIds) formData.append("fileId", id);
    for (const f of initial?.files ?? []) if (!removed.has(f.id)) formData.append("keepFileId", f.id);

    startTransition(async () => {
      await action(formData);
      setFiles([]);
      onDone?.();
    });
  }

  const busy = uploading || pending;

  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input name="title" defaultValue={initial?.title ?? ""} placeholder={t("announcementTitle")} className={field} />
      <textarea
        name="body"
        required
        rows={editing ? 3 : 2}
        defaultValue={initial?.body ?? ""}
        placeholder={t("announcementPlaceholder")}
        className={field}
      />

      {initial && initial.files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {initial.files.map((f) => {
            const gone = removed.has(f.id);
            return (
              <li
                key={f.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs",
                  gone ? "border-slate-200 text-slate-400 line-through" : "border-amber-200 bg-white text-slate-700",
                )}
              >
                <Paperclip className="w-3 h-3" />
                {f.filename}
                <button
                  type="button"
                  onClick={() =>
                    setRemoved((s) => {
                      const next = new Set(s);
                      if (next.has(f.id)) next.delete(f.id);
                      else next.add(f.id);
                      return next;
                    })
                  }
                  aria-label={gone ? t("keepFile") : t("removeFile")}
                  title={gone ? t("keepFile") : t("removeFile")}
                  className="text-slate-400 hover:text-red-500"
                >
                  {gone ? <Undo2 className="w-3 h-3" /> : <X className="w-3 h-3" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <AttachmentPicker files={files} onChange={setFiles} accent="amber" />

      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor={`day-${initial?.id ?? "new"}`} className="text-xs text-slate-500">
          {t("announcementDay")}
        </label>
        <DateInput
          id={`day-${initial?.id ?? "new"}`}
          name="day"
          defaultValue={initial && initial.dayIso >= todayIso ? initial.dayIso : todayIso}
          min={todayIso}
          className="px-2 py-1 rounded-lg border border-amber-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <div className="ml-auto flex items-center gap-2">
          {editing && (
            <button type="button" onClick={onDone} disabled={busy} className="text-sm text-slate-500 hover:text-slate-700">
              {t("cancelEdit")}
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />}
            {uploading ? ta("uploading") : editing ? t("saveAnnouncement") : t("post")}
          </button>
        </div>
      </div>
    </form>
  );
}

/** «Νέα ανακοίνωση ημέρας»: the collapsed composer. */
export function AnnouncementComposer({
  action,
  todayIso,
}: {
  action: (formData: FormData) => Promise<void>;
  todayIso: string;
}) {
  const t = useTranslations("dashboard");
  return (
    <details className="group">
      <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 [&::-webkit-details-marker]:hidden">
        <Megaphone className="w-4 h-4" />
        {t("newAnnouncement")}
      </summary>
      <div className="mt-3">
        <AnnouncementForm action={action} todayIso={todayIso} />
      </div>
    </details>
  );
}

/**
 * One announcement in the posters' list. `view` is the rendered announcement
 * and `actions` its other controls (delete); the author also gets a pencil
 * that swaps the view for the edit form.
 */
export function EditableAnnouncement({
  view,
  actions,
  canEdit,
  action,
  todayIso,
  initial,
}: {
  view: React.ReactNode;
  actions?: React.ReactNode;
  canEdit: boolean;
  action: (formData: FormData) => Promise<void>;
  todayIso: string;
  initial: AnnouncementInitial;
}) {
  const t = useTranslations("dashboard");
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <AnnouncementForm action={action} todayIso={todayIso} initial={initial} onDone={() => setEditing(false)} />;
  }
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2">
      <div className="flex-1 min-w-0">{view}</div>
      <div className="flex items-center gap-2">
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={t("editAnnouncement")}
            title={t("editAnnouncement")}
            className="text-slate-300 hover:text-amber-700 transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}
