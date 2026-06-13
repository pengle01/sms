"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { updateSpecialEdRecord, removeSpecialEdRecord } from "../actions";

type Code = { code: string; label: string };

export function EditSpecialEdForm({
  studentId,
  locale,
  problemCatalog,
  accommodationCatalog,
  initial,
  hasRecord,
}: {
  studentId: string;
  locale: string;
  problemCatalog: Code[];
  accommodationCatalog: Code[];
  initial: {
    fileNo: string;
    remarks: string;
    frenchExempt: boolean;
    otherExemptions: string;
    problemCodes: string[];
    accommodationCodes: string[];
  };
  hasRecord: boolean;
}) {
  const router = useRouter();
  const [problems, setProblems] = useState<Set<string>>(new Set(initial.problemCodes));
  const [accoms, setAccoms] = useState<Set<string>>(new Set(initial.accommodationCodes));
  const [fileNo, setFileNo] = useState(initial.fileNo);
  const [remarks, setRemarks] = useState(initial.remarks);
  const [frenchExempt, setFrenchExempt] = useState(initial.frenchExempt);
  const [otherExemptions, setOtherExemptions] = useState(initial.otherExemptions);
  const [pending, startTransition] = useTransition();

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, code: string) => {
    const next = new Set(set);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setter(next);
  };

  function save() {
    startTransition(async () => {
      const res = await updateSpecialEdRecord({
        studentId,
        problemCodes: [...problems],
        accommodationCodes: [...accoms],
        fileNo,
        remarks,
        frenchExempt,
        otherExemptions,
      });
      if (res.ok) {
        toast.success("Αποθηκεύτηκε");
        router.push(`/${locale}/teacher/special-ed`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function remove() {
    if (!confirm("Διαγραφή του μαθητή από την Ειδική Αγωγή;")) return;
    startTransition(async () => {
      const res = await removeSpecialEdRecord(studentId);
      if (res.ok) {
        toast.success("Διαγράφηκε");
        router.push(`/${locale}/teacher/special-ed`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Στοιχεία Ειδικής Αγωγής</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Κωδικοί προβλημάτων</p>
          <div className="flex flex-wrap gap-1.5">
            {problemCatalog.map((c) => (
              <button
                key={c.code}
                type="button"
                title={c.label}
                onClick={() => toggle(problems, setProblems, c.code)}
                className={cn(
                  "px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors",
                  problems.has(c.code)
                    ? "bg-amber-600 text-white border-amber-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-amber-400",
                )}
              >
                {c.code}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Διευκολύνσεις</p>
          <div className="space-y-1.5">
            {accommodationCatalog.map((c) => (
              <label key={c.code} className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={accoms.has(c.code)}
                  onChange={() => toggle(accoms, setAccoms, c.code)}
                  className="mt-0.5"
                />
                <span><span className="font-semibold">{c.code}.</span> <span className="text-slate-600">{c.label}</span></span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Αρ. Φακέλου</label>
            <input value={fileNo} onChange={(e) => setFileNo(e.target.value)} className={input} />
          </div>
          <label className="flex items-center gap-2 text-sm sm:mt-7">
            <input type="checkbox" checked={frenchExempt} onChange={(e) => setFrenchExempt(e.target.checked)} />
            Απαλλαγή Γαλλικών
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Παρατηρήσεις</label>
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} className={input} />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Άλλες απαλλαγές</label>
          <input value={otherExemptions} onChange={(e) => setOtherExemptions(e.target.value)} className={input} />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Αποθήκευση
          </button>
          {hasRecord && (
            <button
              onClick={remove}
              disabled={pending}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 disabled:opacity-60"
            >
              <Trash2 className="w-4 h-4" />
              Διαγραφή
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
