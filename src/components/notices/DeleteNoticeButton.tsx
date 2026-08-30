"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Withdraw a notice. Rendered only where canDeleteNotice() passes, and the
 * mutation re-checks the same rule — this component holds no authorisation
 * logic of its own.
 */
export function DeleteNoticeButton({ noticeId, title }: { noticeId: string; title: string }) {
  const t = useTranslations("adminNoticeboard");
  const router = useRouter();

  const { mutate, isPending } = trpc.notices.delete.useMutation({
    onSuccess: () => {
      toast.success(t("deleted"));
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <button
            disabled={isPending}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-600 font-medium disabled:opacity-50"
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {t("deleteNotice")}
          </button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("deleteConfirmBody", { title })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => mutate({ id: noticeId })}>{t("delete")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
