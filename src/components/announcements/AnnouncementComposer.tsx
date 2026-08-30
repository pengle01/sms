"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Megaphone, Loader2 } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { AttachmentPicker, uploadAttachments } from "@/components/attachments/AttachmentPicker";

const field =
  "w-full px-3 py-2 rounded-lg border border-amber-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

/**
 * Announcement composer. A client component rather than a plain server-action
 * form because the attachments have to be uploaded to /api/attachments FIRST —
 * server actions cap request bodies at 1 MB, far under what a set of files may
 * be. The action then only carries the resulting file ids.
 */
export function AnnouncementComposer({
  action,
  todayIso,
}: {
  action: (formData: FormData) => Promise<void>;
  todayIso: string;
}) {
  const t = useTranslations("dashboard");
  const ta = useTranslations("attachments");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    setUploading(true);
    const fileIds = await uploadAttachments(files, "announcement", ta);
    setUploading(false);
    if (fileIds === null) return;
    for (const id of fileIds) formData.append("fileId", id);

    startTransition(async () => {
      await action(formData);
      setFiles([]);
    });
  }

  const busy = uploading || pending;

  return (
    <details className="group">
      <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 [&::-webkit-details-marker]:hidden">
        <Megaphone className="w-4 h-4" />
        {t("newAnnouncement")}
      </summary>

      <form onSubmit={onSubmit} className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
        <input name="title" placeholder={t("announcementTitle")} className={field} />
        <textarea name="body" required rows={2} placeholder={t("announcementPlaceholder")} className={field} />

        <AttachmentPicker files={files} onChange={setFiles} accent="amber" />

        <div className="flex items-center gap-2 flex-wrap">
          <label htmlFor="pinnedUntil" className="text-xs text-slate-500">
            {t("showUntil")}
          </label>
          <DateInput
            id="pinnedUntil"
            name="pinnedUntil"
            defaultValue={todayIso}
            min={todayIso}
            className="px-2 py-1 rounded-lg border border-amber-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            type="submit"
            disabled={busy}
            className="ml-auto inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />}
            {uploading ? ta("uploading") : t("post")}
          </button>
        </div>
      </form>
    </details>
  );
}
