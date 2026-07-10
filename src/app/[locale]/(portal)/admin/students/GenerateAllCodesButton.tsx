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
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Admin-only: generates an access code for every active student that doesn't
// have one yet. Existing codes are untouched.
export function GenerateAllCodesButton({ missing }: { missing: number }) {
  const t = useTranslations("adminStudents");
  const router = useRouter();
  const generateAll = trpc.accessCodes.generateAll.useMutation({
    onSuccess: ({ created }) => {
      toast.success(t("codesGeneratedToast", { count: created }));
      router.refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  if (missing === 0) return null;

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <button
            disabled={generateAll.isPending}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            {generateAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {t("generateCodesButton", { count: missing })}
          </button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("generateCodesTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("generateCodesDescription", { count: missing })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => generateAll.mutate()}>{t("generate")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
