"use client";

import { useActionState, useRef, useState } from "react";
import { importGroupAssignments, type GroupImportResult } from "./actions";
import { Upload, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export function GroupAssignmentImport() {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [result, action, pending] = useActionState(importGroupAssignments, null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) {
    return (
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-9 gap-2 border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
      >
        <Upload className="w-4 h-4" />
        {t("importAssignments")}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{t("importTitle")}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{t("importInstructions")}</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form action={action} className="space-y-4">
          <label
            className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors
              ${pending
                ? "border-slate-200 bg-slate-50 pointer-events-none"
                : "border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/40"}`}
          >
            <input
              ref={inputRef}
              type="file"
              name="file"
              accept=".xlsx,.xls"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) e.target.form?.requestSubmit();
              }}
              disabled={pending}
            />
            {pending ? (
              <>
                <svg className="animate-spin w-7 h-7 text-emerald-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                <p className="text-sm text-slate-500 font-medium">{tCommon("importing")}</p>
              </>
            ) : (
              <>
                <Upload className="w-7 h-7 text-slate-400" />
                <p className="text-sm font-medium text-slate-700">{t("selectFile")}</p>
              </>
            )}
          </label>

          {result && (
            <div className="space-y-3">
              {result.success && (
                <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-green-800">
                      {t("importSuccess", { count: result.assigned })}
                    </p>
                    {result.skipped.length > 0 && (
                      <p className="text-xs text-green-700 mt-1">
                        {t("importSkipped", { count: result.skipped.length })}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <p className="text-sm font-semibold text-amber-800">
                      {t("importErrors", { count: result.errors.length })}
                    </p>
                  </div>
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <li key={i} className="text-xs text-amber-700 font-mono">{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </form>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setOpen(false)} className="h-9">
            {tCommon("close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
