"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { removeHomegroup } from "./actions";

/** «Διαγραφή τμήματος» for a listed homegroup with no active students. */
export function RemoveHomegroupButton({ groupId, groupName }: { groupId: string; groupName: string }) {
  const t = useTranslations("groups");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const res = await removeHomegroup(groupId);
      if (res.ok) {
        toast.success(t(res.done === "delete" ? "removedDeleted" : "removedUnassigned", { name: groupName }));
        router.refresh();
      } else {
        toast.error(t(res.error === "hasStudents" ? "removeHasStudents" : "removeNotFound"));
      }
    });

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <button
            type="button"
            disabled={pending}
            title={t("removeGroup")}
            className="text-slate-300 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("removeTitle", { name: groupName })}</AlertDialogTitle>
          <AlertDialogDescription>{t("removeBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("removeCancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={run}>{t("removeConfirm")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
