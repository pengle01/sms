"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { AttachmentPicker, uploadAttachments } from "@/components/attachments/AttachmentPicker";

export function NewNoticeDialog() {
  const t = useTranslations("adminNoticeboard");
  const ta = useTranslations("attachments");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [staffOnly, setStaffOnly] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const { mutate, isPending } = trpc.notices.create.useMutation({
    onSuccess: () => {
      toast.success(t("posted"));
      setOpen(false);
      setTitle(""); setBody(""); setUrgent(false); setStaffOnly(false); setTagsInput("");
      setFiles([]);
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);

    // Attachments are uploaded first; the notice stores only their ids.
    setUploading(true);
    const fileIds = await uploadAttachments(files, "notice", ta);
    setUploading(false);
    if (fileIds === null) return;

    mutate({ title, body, urgent, staffOnly, tags, fileIds });
  };

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
      >
        <Plus className="w-4 h-4" />
        {t("postNotice")}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{t("postNotice")}</h3>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">{t("titleLabel")}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">{t("bodyLabel")}</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={5}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">{t("tagsLabel")}</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder={t("tagsPlaceholder")}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">{ta("attachmentLabel")}</label>
            <AttachmentPicker files={files} onChange={setFiles} />
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="rounded" />
              {t("markUrgent")}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={staffOnly} onChange={(e) => setStaffOnly(e.target.checked)} className="rounded" />
              {t("staffOnly")}
            </label>
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-9 px-4">
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isPending || uploading || !title || !body} className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white">
              {(isPending || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {uploading ? ta("uploading") : t("post")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
