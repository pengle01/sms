"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
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
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Admin-only: re-issues every unused access code still in the old
// letters-and-digits format as a 12-digit numeric one. Used codes are kept.
export function ReissueLegacyCodesButton({ count }: { count: number }) {
  const t = useTranslations("adminStudents");
  const router = useRouter();
  const reissue = trpc.accessCodes.reissueLegacy.useMutation({
    onSuccess: ({ reissued }) => {
      toast.success(t("codesReissuedToast", { count: reissued }));
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  if (count === 0) return null;

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <button
            disabled={reissue.isPending}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100 disabled:opacity-60"
          >
            {reissue.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {t("reissueCodesButton", { count })}
          </button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("reissueCodesTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("reissueCodesDescription", { count })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => reissue.mutate()}>{t("reissueCodesConfirm")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
