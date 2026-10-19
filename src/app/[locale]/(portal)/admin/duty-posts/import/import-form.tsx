"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { previewDutyFile, applyDutyImport, type DutyPreview, type DutyApplyResult } from "./actions";
import { cn } from "@/lib/utils";

const DAYS = [1, 2, 3, 4, 5] as const;

/** Upload → preview (sheet picker, posts, unmatched names, roster check) → «Εισαγωγή». */
export function DutyImportForm() {
  const t = useTranslations("breakDuty");
  const [preview, previewAction, previewing] = useActionState<DutyPreview | null, FormData>(previewDutyFile, null);
  const [applied, setApplied] = useState<DutyApplyResult | null>(null);
  const [applying, startApply] = useTransition();

  const unmatched = preview?.posts.flatMap((p) => p.unmatched) ?? [];
  const placeholders = preview?.posts.flatMap((p) => p.placeholders) ?? [];

  return (
    <div className="space-y-6">
      <form action={(fd) => { setApplied(null); previewAction(fd); }} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label htmlFor="duty-file" className="block text-xs text-slate-500 mb-1.5">{t("file")}</label>
          <input id="duty-file" type="file" name="file" accept=".xlsx,.xls" required className="text-sm" />
        </div>
        {preview && preview.sheetNames.length > 1 && (
          <div>
            <label htmlFor="duty-sheet" className="block text-xs text-slate-500 mb-1.5">{t("sheet")}</label>
            <select id="duty-sheet" name="sheet" defaultValue={preview.sheet} className="h-9 rounded-lg border border-slate-200 px-2 text-sm">
              {preview.sheetNames.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
        <button
          type="submit"
          disabled={previewing}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {t("preview")}
        </button>
      </form>

      {preview && !preview.ok && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{preview.error}</p>
      )}

      {preview?.ok && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-700">
              {t("previewSummary", { sheet: preview.sheet, posts: preview.posts.length, assignments: preview.assignments })}
            </p>
            <button
              type="button"
              disabled={applying}
              onClick={() => startApply(async () => setApplied(await applyDutyImport(preview.payload)))}
              className="ml-auto inline-flex items-center gap-2 h-9 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
            >
              {applying && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("import")}
            </button>
          </div>
          <p className="text-xs text-slate-500">{t("replaceNote")}</p>

          {applied && (
            <p
              className={cn(
                "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm",
                applied.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700",
              )}
            >
              {applied.ok && <CheckCircle2 className="w-4 h-4" />}
              {applied.ok ? t("imported", { posts: applied.posts, assignments: applied.assignments, linked: applied.linked }) : applied.error}
            </p>
          )}

          {preview.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-700">{w}</p>
          ))}
          {unmatched.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="flex items-center gap-2 font-medium"><AlertTriangle className="w-4 h-4" />{t("unmatchedTitle", { count: unmatched.length })}</p>
              <p className="mt-1 text-xs">{t("unmatchedHint")}</p>
              <p className="mt-1 text-xs font-mono">{[...new Set(unmatched)].join(" · ")}</p>
            </div>
          )}
          {placeholders.length > 0 && (
            <p className="text-xs text-slate-500">{t("placeholdersNote", { names: [...new Set(placeholders)].join(", ") })}</p>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[760px] text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-500">
                  <th className="px-2 py-2 w-12">{t("colCode")}</th>
                  <th className="px-2 py-2">{t("colPost")}</th>
                  {DAYS.map((d) => (
                    <th key={d} className="px-2 py-2">{t(`day${d}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100 bg-sky-50/50 align-top">
                  <td className="px-2 py-1.5" />
                  <td className="px-2 py-1.5 font-medium text-sky-800">{t("deputiesRow")}</td>
                  {DAYS.map((d) => (
                    <td key={d} className="px-2 py-1.5">
                      <p className="text-slate-700">{preview.deputies[d]?.file.join(" · ") || "—"}</p>
                      <p className="mt-0.5 text-sky-700">{t("rosterLabel")}: {preview.deputies[d]?.roster.join(", ") || "—"}</p>
                    </td>
                  ))}
                </tr>
                {preview.posts.map((p) => (
                  <tr key={p.code} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-1.5 font-semibold text-slate-600">{p.code}</td>
                    <td className="px-2 py-1.5 text-slate-800">{p.name}</td>
                    {DAYS.map((d) => (
                      <td key={d} className="px-2 py-1.5">
                        {(p.days[d] ?? []).map((n) => (
                          <p
                            key={n}
                            className={cn(
                              p.placeholders.includes(n) ? "text-slate-400 italic" : p.unmatched.includes(n) ? "text-amber-700" : "text-slate-800",
                            )}
                          >
                            {n}
                          </p>
                        ))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">{t("rosterNote")}</p>
        </div>
      )}
    </div>
  );
}
