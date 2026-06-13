"use client";

import { useActionState, useRef } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { importSpecialEd, type ImportResult } from "../actions";

const initial: ImportResult | null = null;

export function SpecialEdImportForm() {
  const [result, action, pending] = useActionState(importSpecialEd, initial);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        <div
          className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-slate-400" />
          <p className="text-sm font-medium text-slate-700">Επιλέξτε αρχείο Excel</p>
          <p className="text-xs text-slate-400 mt-1">.xlsx — κατάλογος ειδικής αγωγής</p>
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.form?.requestSubmit()}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full h-10 rounded-lg bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Εισαγωγή…</> : <><Upload className="w-4 h-4" /> Εισαγωγή</>}
        </button>
      </form>

      {result && !result.ok && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {result.error}
        </div>
      )}

      {result && result.ok && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center gap-2 text-green-700 font-medium">
              <CheckCircle2 className="w-5 h-5" />
              Η εισαγωγή ολοκληρώθηκε
            </div>
            <dl className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
              <Stat label="Νέοι" value={result.created} />
              <Stat label="Ενημερώθηκαν" value={result.updated} />
              <Stat label="Σύνολο" value={result.processed} />
            </dl>
            {result.unmatched.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <p className="font-medium">Δεν βρέθηκαν μαθητές για {result.unmatched.length} Αρ. Μητρ.:</p>
                <p className="mt-1 font-mono text-xs break-words">{result.unmatched.join(", ")}</p>
              </div>
            )}
            {result.unknownCodes.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <p className="font-medium">Άγνωστοι κωδικοί (παραλείφθηκαν):</p>
                <p className="mt-1 font-mono text-xs">{result.unknownCodes.join(", ")}</p>
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
    <div>
      <dt className="text-slate-400 text-xs">{label}</dt>
      <dd className="text-lg font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
