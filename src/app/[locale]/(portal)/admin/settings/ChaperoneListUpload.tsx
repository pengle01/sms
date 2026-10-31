"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Upload } from "lucide-react";
import { uploadChaperoneList, type ChaperoneListResult } from "./chaperone-list-actions";

/** Upload the Excel of chaperones and their students; shows how it went. */
export function ChaperoneListUpload() {
  const t = useTranslations("chaperoneAdmin");
  const [result, action, pending] = useActionState<ChaperoneListResult | null, FormData>(uploadChaperoneList, null);

  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="file"
          accept=".xlsx,.xls"
          required
          className="text-sm file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border file:border-slate-200 file:bg-white file:text-sm file:text-slate-700 hover:file:bg-slate-50"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {t("upload")}
        </button>
      </div>
      <p className="text-xs text-slate-500">{t("uploadHint")}</p>
      {result?.ok === false && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t(`err_${result.error}`)}</p>
      )}
      {result?.ok && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p>{t("uploaded", { chaperones: result.chaperones, students: result.students })}</p>
          {result.unknown.length > 0 && (
            <p className="text-amber-700 mt-1">{t("unknownNumbers", { numbers: result.unknown.join(", ") })}</p>
          )}
          {result.skipped > 0 && <p className="text-amber-700 mt-1">{t("skippedRows", { count: result.skipped })}</p>}
        </div>
      )}
    </form>
  );
}
