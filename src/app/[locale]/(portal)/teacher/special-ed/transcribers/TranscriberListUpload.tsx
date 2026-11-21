"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Upload } from "lucide-react";
import { uploadTranscribers, type TranscriberUploadResult } from "./actions";

/** Upload the Excel of transcribers («ΜΕΤΑΓΡΑΦΕΙΣ», «ΠΕΡΙΟΔΟΙ»); shows how it went. */
export function TranscriberListUpload() {
  const t = useTranslations("transcribers");
  const [result, action, pending] = useActionState<TranscriberUploadResult | null, FormData>(uploadTranscribers, null);

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
          <p>{t("uploaded", { count: result.transcribers })}</p>
          {result.unmatched.length > 0 && (
            <p className="text-amber-700 mt-1">{t("unmatchedNames", { names: result.unmatched.join(", ") })}</p>
          )}
          {result.repeated.length > 0 && (
            <p className="text-amber-700 mt-1">{t("repeatedNames", { names: result.repeated.join(", ") })}</p>
          )}
        </div>
      )}
    </form>
  );
}
