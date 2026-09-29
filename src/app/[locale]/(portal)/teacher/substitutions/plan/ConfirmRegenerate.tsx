"use client";

import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
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
 * The «Επαναδημιουργία» button for a plan imported from SchoolAbsence. Running
 * the app's own generator deletes every imported entry, so it asks first.
 */
export function ConfirmRegenerate({ action }: { action: () => Promise<void> }) {
  const t = useTranslations("substitutionImport");
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
          >
            <Sparkles className="w-4 h-4" />
            {t("regenerate")}
          </button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("regenerateTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("regenerateBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <form action={action}>
            <AlertDialogAction type="submit" className="bg-red-600 hover:bg-red-700 text-white">
              {t("regenerateConfirm")}
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
