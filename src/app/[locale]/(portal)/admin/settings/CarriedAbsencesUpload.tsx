"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Trash2, Upload } from "lucide-react";
import {
  deleteAllCarriedAbsences,
  previewCarriedAbsences,
  saveCarriedAbsences,
  type CarriedResult,
} from "./carried-absences-actions";

/** Choose the file, see what changes, save. A 0 removes a student's number. */
export function CarriedAbsencesUpload({ hasData }: { hasData: boolean }) {
  const t = useTranslations("carriedAbsences");
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CarriedResult | null>(null);
  const [deleted, setDeleted] = useState<number | null>(null);

  const run = (f: File, save: boolean) =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", f);
      const r = save ? await saveCarriedAbsences(fd) : await previewCarriedAbsences(fd);
      setResult(r);
      if (save && r.ok) {
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            setDeleted(null);
            if (f) {
              setFile(f);
              run(f, false);
            }
          }}
          className="max-w-full text-sm file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border file:border-slate-200 file:bg-white file:text-sm file:font-medium"
        />
        {pending && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
      </div>
      <p className="text-xs text-slate-500">{t("uploadHint")}</p>

      {result && !result.ok && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{t(`err_${result.error}`)}</p>
          {result.rows && result.rows.length > 0 && <p className="text-xs mt-1">{result.rows.slice(0, 20).join(", ")}</p>}
        </div>
      )}
      {result?.ok && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 space-y-2">
          <p>
            {result.saved ? t("savedSummary") : t("previewSummary")}{" "}
            {t("summary", { added: result.added, changed: result.changed, removed: result.removed, unchanged: result.unchanged })}
          </p>
          {!result.saved && file && (
            <button
              type="button"
              onClick={() => run(file, true)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
            >
              <Upload className="w-4 h-4" />
              {t("save")}
            </button>
          )}
        </div>
      )}

      {hasData && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(t("deleteConfirm"))) return;
            startTransition(async () => {
              const r = await deleteAllCarriedAbsences();
              setDeleted(r.deleted);
              setResult(null);
            });
          }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t("deleteAll")}
        </button>
      )}
      {deleted != null && <p className="text-sm text-slate-600">{t("deleted", { count: deleted })}</p>}
    </div>
  );
}
