"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Trash2, TriangleAlert, Loader2, UserX, UserCheck } from "lucide-react";
import { confirmsDeletion, type HistoryBlocker } from "@/lib/studentDelete";
import { deleteStudent, setStudentActive } from "./delete-actions";

interface Props {
  studentProfileId: string;
  studentName: string;
  registryNumber: string;
  isActive: boolean;
  /** History that prevents deletion. Empty ⇒ the student can be deleted. */
  blockers: HistoryBlocker[];
  /** Where to go after a delete — each portal's own student list. */
  listHref: string;
}

/**
 * Delete / deactivate, shared by the admin and office student pages.
 *
 * Delete is offered only for a student with no history, behind a typed
 * confirmation of the registry number. Anyone with records is deactivated
 * instead — hidden everywhere, every record kept, and reversible.
 */
export function DeleteStudentCard({
  studentProfileId,
  studentName,
  registryNumber,
  isActive,
  blockers,
  listHref,
}: Props) {
  const t = useTranslations("studentDelete");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [typed, setTyped] = useState("");

  const canDelete = blockers.length === 0;
  const confirmed = confirmsDeletion(typed, registryNumber);

  function onDelete() {
    startTransition(async () => {
      const res = await deleteStudent(studentProfileId, typed);
      if (res.ok) {
        toast.success(t("deleted"));
        router.push(listHref);
      } else {
        toast.error(t(res.error));
        router.refresh();
      }
    });
  }

  function onToggleActive() {
    startTransition(async () => {
      const res = await setStudentActive(studentProfileId, !isActive);
      if (res.ok) {
        toast.success(t(isActive ? "deactivated" : "reactivated"));
        router.refresh();
      } else {
        toast.error(t(res.error));
      }
    });
  }

  const spinner = <Loader2 className="w-3.5 h-3.5 animate-spin" />;

  return (
    <Card className="border-red-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-red-700">
          <TriangleAlert className="w-4 h-4" />
          {t("dangerZone")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Deactivate / reactivate — always available */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800">{t("statusTitle")}</p>
            <p className="text-xs text-slate-400 mt-0.5">{isActive ? t("activeHelp") : t("inactiveHelp")}</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <button
                  disabled={pending}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  {pending ? spinner : isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                  {isActive ? t("deactivate") : t("reactivate")}
                </button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t(isActive ? "deactivateTitle" : "reactivateTitle", { name: studentName })}
                </AlertDialogTitle>
                <AlertDialogDescription>{t(isActive ? "deactivateBody" : "reactivateBody")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={onToggleActive}>
                  {isActive ? t("deactivate") : t("reactivate")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Delete — only without history */}
        <div className="border-t border-red-100 pt-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">{t("deleteTitle")}</p>
            {canDelete ? (
              <p className="text-xs text-slate-400 mt-0.5">{t("deleteHelp")}</p>
            ) : (
              <>
                <p className="text-xs text-amber-700 mt-0.5">{t("blocked")}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {blockers.map((b) => (
                    <Badge key={b.key} variant="outline" className="text-xs text-slate-600">
                      {t(`history.${b.key}`)} · {b.count}
                    </Badge>
                  ))}
                </div>
              </>
            )}
          </div>
          {canDelete && (
            <AlertDialog onOpenChange={(open) => { if (!open) setTyped(""); }}>
              <AlertDialogTrigger
                render={
                  <button
                    disabled={pending}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    {pending ? spinner : <Trash2 className="w-3.5 h-3.5" />}
                    {t("deleteButton")}
                  </button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteConfirmTitle", { name: studentName })}</AlertDialogTitle>
                  <AlertDialogDescription>{t("deleteConfirmBody")}</AlertDialogDescription>
                </AlertDialogHeader>
                <label className="block space-y-1.5">
                  <span className="text-sm text-slate-600">{t("typeToConfirm", { reg: registryNumber })}</span>
                  <Input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    className="font-mono"
                  />
                </label>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    disabled={!confirmed || pending}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {t("deleteButton")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
