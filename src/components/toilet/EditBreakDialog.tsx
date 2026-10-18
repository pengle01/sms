"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Loader2, Trash2 } from "lucide-react";
import { trpc } from "@/trpc/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { nicosiaHhmm } from "@/lib/toilet";

export type EditableBreak = { id: string; leftAt: string; returnedAt: string | null };

const ERRORS = ["badTime", "returnBeforeLeave", "future", "openNotToday"] as const;

/**
 * «Διόρθωση» for a toilet exit, offered to the teacher who recorded it: fix the
 * exit/return times, mark them still out (today only), or delete a wrong tap.
 */
export function EditBreakDialog({
  brk,
  studentName,
  isToday,
  onChange,
}: {
  brk: EditableBreak;
  studentName: string;
  isToday: boolean;
  /** The corrected exit, or null when it was deleted. */
  onChange: (next: EditableBreak | null) => void;
}) {
  const t = useTranslations("attendance");
  const [open, setOpen] = useState(false);
  const [leftAt, setLeftAt] = useState("");
  const [returnedAt, setReturnedAt] = useState("");
  const [stillOut, setStillOut] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reset = () => {
    setLeftAt(nicosiaHhmm(brk.leftAt));
    setReturnedAt(brk.returnedAt ? nicosiaHhmm(brk.returnedAt) : "");
    setStillOut(brk.returnedAt === null && isToday);
    setConfirmDelete(false);
  };

  const errorText = (msg: string) =>
    (ERRORS as readonly string[]).includes(msg) ? t(`wcErr.${msg as (typeof ERRORS)[number]}`) : msg;

  const update = trpc.toilet.update.useMutation({
    onSuccess: (b) => {
      onChange({ id: b.id, leftAt: new Date(b.leftAt).toISOString(), returnedAt: b.returnedAt ? new Date(b.returnedAt).toISOString() : null });
      toast.success(t("wcSaved"));
      setOpen(false);
    },
    onError: (e) => toast.error(errorText(e.message)),
  });
  const remove = trpc.toilet.remove.useMutation({
    onSuccess: () => {
      onChange(null);
      toast.success(t("wcDeleted"));
      setOpen(false);
    },
    onError: (e) => toast.error(errorText(e.message)),
  });
  const pending = update.isPending || remove.isPending;

  const field = "w-20 h-9 rounded-lg border border-slate-200 px-2 text-center text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-400";

  return (
    <>
      <button
        type="button"
        onClick={() => { reset(); setOpen(true); }}
        title={t("wcEdit")}
        aria-label={t("wcEdit")}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>

      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("wcEdit")}</DialogTitle>
            <DialogDescription>{studentName}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`wc-left-${brk.id}`} className="text-sm text-slate-600">{t("wcLeftAt")}</label>
              <input
                id={`wc-left-${brk.id}`}
                value={leftAt}
                onChange={(e) => setLeftAt(e.target.value)}
                inputMode="numeric"
                maxLength={5}
                className={field}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`wc-back-${brk.id}`} className="text-sm text-slate-600">{t("wcReturnedAt")}</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={stillOut}
                  onClick={() => setReturnedAt(nicosiaHhmm(new Date()))}
                  className="text-xs font-medium text-emerald-700 hover:underline disabled:text-slate-300 disabled:no-underline"
                >
                  {t("wcNowShort")}
                </button>
                <input
                  id={`wc-back-${brk.id}`}
                  value={stillOut ? "" : returnedAt}
                  onChange={(e) => setReturnedAt(e.target.value)}
                  disabled={stillOut}
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="--:--"
                  className={field}
                />
              </div>
            </div>
            {isToday && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={stillOut} onChange={(e) => setStillOut(e.target.checked)} className="accent-emerald-600" />
                {t("wcStillOut")}
              </label>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove.mutate({ id: brk.id })}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {remove.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {t("wcDeleteConfirm")}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="text-sm text-slate-500 hover:text-slate-700">
                  {t("wcKeep")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
                {t("wcDelete")}
              </button>
            )}
            {!confirmDelete && (
              <button
                type="button"
                disabled={pending}
                onClick={() => update.mutate({ id: brk.id, leftAt, returnedAt: stillOut ? null : returnedAt })}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {update.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("wcSave")}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
