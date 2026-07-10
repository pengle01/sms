"use client";

import { useActionState, useRef } from "react";
import { useTranslations } from "next-intl";
import { importStudents, type ImportResult } from "./actions";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const initial: ImportResult | null = null;

export function ImportForm() {
  const t = useTranslations("adminStudents");
  const [result, action, pending] = useActionState(importStudents, initial);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6 max-w-xl">
      <form action={action} className="space-y-4">
        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-slate-400" />
          <p className="text-sm font-medium text-slate-700">{t("importClickToChoose")}</p>
          <p className="text-xs text-slate-400 mt-1">{t("importFileHint")}</p>
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => e.target.form?.requestSubmit()}
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full h-10 rounded-lg bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {t("importing")}</>
          ) : (
            <><Upload className="w-4 h-4" /> {t("importButton")}</>
          )}
        </button>
      </form>

      {result && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            {result.success ? (
              <>
                <div className="flex items-center gap-2 text-green-700 font-medium">
                  <CheckCircle2 className="w-5 h-5" />
                  {t("importComplete")}
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <Stat label={t("statStudentsCreated")} value={result.studentsCreated} />
                  <Stat label={t("statStudentsUpdated")} value={result.studentsUpdated} />
                  <Stat label={t("statGroupsCreated")}   value={result.groupsCreated} />
                  <Stat label={t("statSmsContacts")}     value={result.smsContactsCreated} />
                  <Stat label={t("statFlaggedSms")}      value={result.flaggedStudents} />
                  <Stat label={t("statRowsSkipped")}     value={result.skipped} />
                </dl>
              </>
            ) : (
              <div className="flex items-center gap-2 text-red-700 font-medium">
                <AlertCircle className="w-5 h-5" />
                {t("importFailed")}
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t("errorCount", { count: result.errors.length })}
                </p>
                <ul className="text-xs text-red-700 space-y-1 max-h-48 overflow-y-auto font-mono bg-red-50 rounded-lg p-3">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            {/* SMS recipients to fix — flagged during import */}
            {result.flagged.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                  {t("flaggedCount", { count: result.flagged.length })}
                </p>
                <ul className="text-xs space-y-1 max-h-56 overflow-y-auto bg-amber-50 border border-amber-200 rounded-lg p-3">
                  {result.flagged.map((f, i) => (
                    <li key={i} className="flex items-start justify-between gap-3">
                      <span className="text-slate-700">
                        <span className="font-mono text-slate-500">{f.studentId}</span> {f.name}
                      </span>
                      <span className="text-amber-700 text-right shrink-0">{f.reason}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-slate-400">
                  {t("importFlaggedNote")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </>
  );
}
