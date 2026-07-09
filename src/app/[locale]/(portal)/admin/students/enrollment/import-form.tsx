"use client";

import { useActionState } from "react";
import { importEnrollment, type EnrollmentImportResult } from "./actions";

export function EnrollmentImportForm() {
  const [result, action, pending] = useActionState(importEnrollment, null);

  return (
    <form action={action} className="space-y-6">
      {/* Drop zone */}
      <label
        className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-12 cursor-pointer transition-colors
          ${pending
            ? "border-slate-200 bg-slate-50 pointer-events-none"
            : "border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/40"}`}
      >
        <input
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
            <svg className="animate-spin w-8 h-8 text-emerald-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-sm text-slate-500 font-medium">Γίνεται εισαγωγή κατανομών…</p>
          </>
        ) : (
          <>
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">Κάντε κλικ για μεταφόρτωση Excel κατανομής</p>
              <p className="text-xs text-slate-400 mt-1">.xlsx ή .xls — αναθέσεις μαθητών σε ομάδες μαθημάτων</p>
            </div>
          </>
        )}
      </label>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {result.success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-800 mb-3">Η εισαγωγή ολοκληρώθηκε</p>
              <dl className="grid grid-cols-3 gap-3">
                <Stat label="Μαθητές που επεξεργάστηκαν" value={result.studentsEnrolled} />
                <Stat label="Συνδέσεις που προστέθηκαν"  value={result.linksCreated} />
                <Stat label="Συνδέσεις που αφαιρέθηκαν"  value={result.linksRemoved} />
              </dl>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-800 mb-2">
                {result.errors.length} {result.errors.length !== 1 ? "προειδοποιήσεις" : "προειδοποίηση"}
              </p>
              <ul className="space-y-1 max-h-64 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-xs text-amber-700 font-mono">{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border border-emerald-100 px-3 py-2 text-center">
      <p className="text-2xl font-bold text-emerald-700">{value}</p>
      <p className="text-xs text-emerald-600 mt-0.5">{label}</p>
    </div>
  );
}
