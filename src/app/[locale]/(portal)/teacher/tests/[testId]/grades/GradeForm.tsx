"use client";

import { useTransition, useState } from "react";
import { toast } from "sonner";
import { saveTestGrades } from "./actions";
import { Loader2 } from "lucide-react";
import { GRADE_MIN, GRADE_MAX, isValidGradeValue } from "@/lib/grades";

type Student = {
  id: string;
  name: string;
  existingValue: string;
};

export function GradeForm({
  testId,
  students,
  locale,
  labels,
  locked = false,
}: {
  testId: string;
  students: Student[];
  locale: string;
  labels: {
    saveAll: string;
    saved: string;
    colStudent: string;
    colScore: string;
    invalidGrade: string;
  };
  /** Read-only before the test date — grading opens on the day of the test. */
  locked?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(students.map((s) => [s.id, s.existingValue]))
  );
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    // Client-side validation
    for (const s of students) {
      const raw = (values[s.id] ?? "").trim();
      if (raw === "") continue;
      const v = parseFloat(raw);
      if (!isValidGradeValue(v)) {
        toast.error(labels.invalidGrade, { description: `${s.name}: ${raw}` });
        return;
      }
    }

    startTransition(async () => {
      const result = await saveTestGrades(
        testId,
        students.map((s) => ({ studentId: s.id, value: values[s.id] ?? "" }))
      );
      if (result.success) {
        toast.success(labels.saved);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                {labels.colStudent}
              </th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide w-36">
                {labels.colScore}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {students.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/50">
                <td className="px-5 py-3 font-medium text-slate-900">{s.name}</td>
                <td className="px-5 py-3">
                  <input
                    type="number"
                    min={GRADE_MIN}
                    max={GRADE_MAX}
                    step={0.5}
                    placeholder="—"
                    value={values[s.id] ?? ""}
                    disabled={locked}
                    onChange={(e) => setValues((v) => ({ ...v, [s.id]: e.target.value }))}
                    className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!locked && (
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="inline-flex items-center gap-2 h-9 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {labels.saveAll}
          </button>
        </div>
      )}
    </div>
  );
}
