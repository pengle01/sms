"use client";

import { useTransition, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { parseGradeInput, type GradePeriod } from "@/lib/grades";
import { saveGrades } from "./actions";

type Student = {
  id: string;
  name: string;
  existingValue: string;
};

export function GradeEntryForm({
  courseId,
  groupId,
  period,
  students,
  labels,
}: {
  courseId: string;
  groupId: string;
  period: GradePeriod;
  students: Student[];
  labels: {
    saveAll: string;
    saved: string;
    colStudent: string;
    colScore: string;
    invalidGrade: string;
  };
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(students.map((s) => [s.id, s.existingValue]))
  );
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    for (const s of students) {
      if (!parseGradeInput(values[s.id] ?? "").ok) {
        toast.error(labels.invalidGrade, { description: `${s.name}: ${values[s.id]}` });
        return;
      }
    }

    startTransition(async () => {
      const result = await saveGrades({
        courseId,
        groupId,
        period,
        grades: students.map((s) => ({ studentId: s.id, value: values[s.id] ?? "" })),
      });
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
                    min={0}
                    max={20}
                    step={0.5}
                    placeholder="—"
                    value={values[s.id] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [s.id]: e.target.value }))}
                    className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}
