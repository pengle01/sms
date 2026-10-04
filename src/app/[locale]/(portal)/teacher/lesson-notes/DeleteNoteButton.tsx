"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { deleteLessonNote } from "./actions";

export function DeleteNoteButton({ id }: { id: string }) {
  const t = useTranslations("lessonNotes");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title={t("delete")}
      onClick={() => {
        if (!confirm(t("deleteConfirm"))) return;
        startTransition(async () => {
          const res = await deleteLessonNote(id);
          if (res.ok) {
            toast.success(t("deletedToast"));
            router.refresh();
          } else toast.error(t("errSave"));
        });
      }}
      className="text-slate-300 hover:text-red-600 transition-colors disabled:opacity-50"
    >
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </button>
  );
}
