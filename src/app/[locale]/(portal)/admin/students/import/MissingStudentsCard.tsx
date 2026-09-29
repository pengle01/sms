"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { UserMinus, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
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
import type { MissingStudent } from "@/server/studentImportSync";
import { deactivateMissingStudents } from "./actions";

/**
 * Students not in the uploaded file. Nothing is removed until the admin confirms;
 * each can be unticked (e.g. a student simply missing from a partial export).
 * Removal = deactivation: records stay, and a later file with them brings them back.
 */
export function MissingStudentsCard({
  missing,
  partial,
  fileCount,
  activeCount,
}: {
  missing: MissingStudent[];
  partial: boolean;
  fileCount: number;
  activeCount: number;
}) {
  const t = useTranslations("adminStudents");
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(missing.map((m) => m.profileId)));
  const [done, setDone] = useState<{ students: number; parents: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        {t("missingDone", { students: done.students, parents: done.parents })}
      </div>
    );
  }

  const toggle = (id: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOn = chosen.size === missing.length;

  const confirm = () =>
    startTransition(async () => {
      setError(null);
      const res = await deactivateMissingStudents([...chosen]);
      if (res.ok) setDone({ students: res.students, parents: res.parents });
      else setError(res.error);
    });

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-start gap-2">
        <UserMinus className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" />
        <div>
          <p className="text-sm font-semibold text-amber-900">{t("missingTitle", { count: missing.length })}</p>
          <p className="text-xs text-amber-800 mt-0.5">{t("missingHint")}</p>
        </div>
      </div>

      {partial && (
        <p className="flex items-start gap-2 rounded-md bg-white/70 border border-amber-300 px-2.5 py-2 text-xs font-medium text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
          {t("missingPartialWarning", { file: fileCount, active: activeCount })}
        </p>
      )}

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={allOn}
          onChange={() => setChosen(allOn ? new Set() : new Set(missing.map((m) => m.profileId)))}
        />
        {t("missingSelectAll")}
      </label>
      <ul className="max-h-72 overflow-y-auto space-y-1 rounded-md bg-white border border-amber-200 p-2 text-xs">
        {missing.map((m) => (
          <li key={m.profileId}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={chosen.has(m.profileId)} onChange={() => toggle(m.profileId)} />
              <span className="font-mono text-slate-500 w-14 shrink-0">{m.registry}</span>
              <span className="text-slate-800 flex-1">{m.name}</span>
              <span className="text-slate-500">{m.group ?? "—"}</span>
            </label>
          </li>
        ))}
      </ul>

      {error && <p className="text-xs text-red-700">{error}</p>}

      <AlertDialog>
        <AlertDialogTrigger
          render={
            <button
              type="button"
              disabled={pending || chosen.size === 0}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
              {t("missingDeactivate", { count: chosen.size })}
            </button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("missingConfirmTitle", { count: chosen.size })}</AlertDialogTitle>
            <AlertDialogDescription>{t("missingConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("missingCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>{t("missingConfirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
