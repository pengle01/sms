"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { StudentPicker, type PickerGroup } from "@/components/students/StudentPicker";
import { conflictsForSelection, type ActivityTestConflict } from "@/lib/activities";

/**
 * Step 2 of a new activity: pick students from any homegroups (the selection
 * survives switching homegroups). The picks go to the create form as hidden
 * `studentId` inputs; tests clashing for the picked students are flagged.
 */
export function ActivityStudentsField({
  groups,
  formId,
  tests,
  initialSelected,
}: {
  groups: PickerGroup[];
  formId: string;
  tests: ActivityTestConflict[];
  /** Pre-selected students (copying an activity); ones no longer active are dropped. */
  initialSelected?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(() => {
    if (!initialSelected?.length) return [];
    const active = new Set(groups.flatMap((g) => g.students.map((s) => s.id)));
    return initialSelected.filter((id) => active.has(id));
  });
  const conflicts = conflictsForSelection(tests, selected);

  return (
    <div className="space-y-4">
      <StudentPicker groups={groups} selectedIds={selected} onChange={setSelected} />
      {selected.map((id) => (
        <input key={id} type="hidden" name="studentId" value={id} form={formId} />
      ))}
      <p className="text-sm text-slate-600">
        {selected.length === 0
          ? "Δεν έχουν επιλεγεί μαθητές."
          : selected.length === 1
            ? "Επιλέχθηκε 1 μαθητής/τρια."
            : `Επιλέχθηκαν ${selected.length} μαθητές.`}
      </p>

      {conflicts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-amber-800">Διαγωνίσματα προγραμματισμένα σε αυτές τις περιόδους</p>
          </div>
          <div className="divide-y divide-amber-100 px-4">
            {conflicts.map((w) => (
              <div key={w.id} className="py-3 flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-amber-900">
                    {w.courseName}
                    <span
                      className={`ml-2 text-xs px-1.5 py-0.5 rounded font-semibold ${
                        w.type === "BIG" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {w.type === "BIG" ? "Μεγάλο" : "Μικρό"}
                    </span>
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    {w.groupName} · {w.periodLabel}
                    {w.staffName && ` · ${w.staffName}`}
                  </p>
                </div>
                <span className="text-xs text-amber-700 bg-amber-100 rounded-full px-2 py-1 whitespace-nowrap">
                  {w.affectedCount === 1 ? "1 μαθητής/τρια επηρεάζεται" : `${w.affectedCount} μαθητές επηρεάζονται`}
                </span>
              </div>
            ))}
          </div>
          <p className="px-4 py-2.5 text-xs text-amber-600 border-t border-amber-200">
            Μπορείτε να δημιουργήσετε τη δραστηριότητα — αυτό είναι μόνο για ενημέρωσή σας.
          </p>
        </div>
      )}
    </div>
  );
}
