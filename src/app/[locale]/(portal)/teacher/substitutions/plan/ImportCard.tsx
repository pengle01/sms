"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileUp, Loader2, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDisplayDate, fmtDisplayDateTime } from "@/lib/dates";
import { IMPORT_MAX_BYTES, type ImportIssue, type ImportKind } from "@/lib/substitutionImport";
import { previewImportAction, importPlanAction, type ImportPreview } from "./actions";

const KINDS: ImportKind[] = ["COVER", "SWAP", "SUPPORT_MERGE", "RELEASE", "ROOM_CHANGE", "STUDY_HALL", "CHAPERONE_HALL"];

/**
 * Upload the day's plan exported by SchoolAbsence. The file is checked first
 * and every mismatch with the timetable listed; only a clean file can be
 * imported, and it lands as a DRAFT for the coordinator to finalize.
 */
export function ImportCard({ locale }: { locale: string }) {
  const t = useTranslations("substitutionImport");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [raw, setRaw] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const issue = (i: ImportIssue, prefix: "err" | "warn") =>
    t(`${prefix}_${i.code}` as Parameters<typeof t>[0], (i.params ?? {}) as Record<string, string | number>);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again after a fix
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    if (file.size > IMPORT_MAX_BYTES) {
      setRaw(null);
      setPreview({ ok: false, error: { code: "tooLarge" } });
      return;
    }
    const text = await file.text();
    setRaw(text);
    startTransition(async () => setPreview(await previewImportAction(text)));
  }

  function doImport() {
    if (!raw) return;
    startTransition(async () => {
      const res = await importPlanAction(raw);
      if (res.ok) {
        toast.success(t("imported"));
        setPreview(null);
        setRaw(null);
        router.push(`/${locale}/teacher/substitutions/plan?date=${res.date}`);
      } else {
        // The file changed between check and import (or the timetable did):
        // show the fresh reasons instead of a generic failure.
        setPreview((p) => (p && p.ok ? { ...p, errors: res.errors } : { ok: false, error: res.errors[0] }));
      }
    });
  }

  const clean = preview?.ok && preview.errors.length === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileUp className="w-4 h-4 text-emerald-600" />
          {t("title")}
        </CardTitle>
        <p className="text-xs text-slate-500">{t("hint")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <input ref={input} type="file" accept=".json,application/json" onChange={onFile} className="hidden" />
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={pending}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            {pending ? t("checking") : t("chooseFile")}
          </button>
          {fileName && <span className="text-sm text-slate-500 truncate max-w-xs">{fileName}</span>}
        </div>

        {preview && !preview.ok && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {issue(preview.error, "err")}
          </div>
        )}

        {preview?.ok && (
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-slate-900">
                {t("previewFor", { date: fmtDisplayDate(preview.date), day: preview.dayName ?? "—" })}
              </p>
              {preview.exportedAt && (
                <p className="text-xs text-slate-400">
                  {t("exportedAt", { when: fmtDisplayDateTime(new Date(preview.exportedAt)) })}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {KINDS.filter((k) => preview.counts[k] > 0).map((k) => (
                <span key={k} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                  {t(`kind_${k}` as Parameters<typeof t>[0])} · <strong>{preview.counts[k]}</strong>
                </span>
              ))}
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                {t("absencesCount", { count: preview.absences })}
              </span>
              {preview.duty > 0 && (
                <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-800">
                  {t("dutyCount", { count: preview.duty })}
                </span>
              )}
            </div>

            {preview.errors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 space-y-1.5">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  {t("errorsTitle", { count: preview.errors.length })}
                </p>
                <p className="text-xs text-red-700">{t("errorsHint")}</p>
                <ul className="list-disc pl-5 space-y-0.5 max-h-72 overflow-y-auto">
                  {preview.errors.map((e, i) => (
                    <li key={i}>{issue(e, "err")}</li>
                  ))}
                </ul>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
                <p className="font-semibold">{t("warningsTitle")}</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {preview.warnings.map((w, i) => (
                    <li key={i}>{issue(w, "warn")}</li>
                  ))}
                </ul>
              </div>
            )}

            {clean && preview.existing && (
              <p className="text-sm text-slate-600 flex items-start gap-1.5">
                <Info className="w-4 h-4 mt-0.5 text-sky-600 flex-shrink-0" />
                {preview.existing === "FINAL" ? t("replaceFinal") : t("replaceDraft")}
              </p>
            )}

            {clean && (
              <button
                type="button"
                onClick={doImport}
                disabled={pending}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {t("importButton")}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
