"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Trash2, TriangleAlert, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { deleteUser } from "./actions";

interface Props {
  userId: string;
  userName: string;
  locale: string;
  /** Viewing your own account — deletion is disabled. */
  isSelf: boolean;
  /** Deleting would leave the system without any super admin. */
  isLastAdmin: boolean;
}

export function DeleteUserCard({ userId, userName, locale, isSelf, isLastAdmin }: Props) {
  const t = useTranslations("adminUsers");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const blockedReason = isSelf
    ? t("cannotDeleteSelf")
    : isLastAdmin
      ? t("lastAdminCannotDelete")
      : null;

  function onConfirm() {
    startTransition(async () => {
      const res = await deleteUser(userId);
      if (res.ok) {
        toast.success(t("userDeleted"));
        router.push(`/${locale}/admin/users`);
      } else {
        toast.error(res.error ?? t("somethingWentWrong"));
      }
    });
  }

  return (
    <Card className="border-red-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-red-700">
          <TriangleAlert className="w-4 h-4" />
          {t("dangerZone")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800">{t("deleteThisUser")}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {t("deleteHint")}
            </p>
          </div>
          <div className="flex-shrink-0">
            {blockedReason ? (
              <span className="text-xs text-amber-600">{blockedReason}</span>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <button
                      disabled={pending}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                    >
                      {pending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      {t("deleteUser")}
                    </button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("deleteConfirmTitle", { name: userName })}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("deleteConfirmDescription")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>{t("delete")}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
