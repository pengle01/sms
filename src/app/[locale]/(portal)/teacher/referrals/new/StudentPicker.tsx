"use client";

import { useState } from "react";
import { X, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PickerStudent {
  id: string;
  name: string;
  studentId: string;
}

export interface PickerGroup {
  id: string;
  name: string;
  grade: number;
  students: PickerStudent[];
}

interface Props {
  groups: PickerGroup[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

const GRADE_LABEL: Record<number, string> = { 1: "Α΄ Λυκείου", 2: "Β΄ Λυκείου", 3: "Γ΄ Λυκείου" };

export function StudentPicker({ groups, selectedIds, onChange }: Props) {
  const [activeGrade, setActiveGrade] = useState<number | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const grades = [...new Set(groups.map((g) => g.grade))].sort();
  const groupsForGrade = activeGrade !== null ? groups.filter((g) => g.grade === activeGrade) : [];
  const activeGroup = activeGroupId ? groups.find((g) => g.id === activeGroupId) : null;

  const allStudents = groups.flatMap((g) => g.students.map((s) => ({ ...s, groupName: g.name })));
  const selectedStudents = allStudents.filter((s) => selectedIds.includes(s.id));

  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const toggleAll = () => {
    if (!activeGroup) return;
    const gIds = activeGroup.students.map((s) => s.id);
    const allSelected = gIds.every((id) => selectedIds.includes(id));
    onChange(allSelected ? selectedIds.filter((id) => !gIds.includes(id)) : [...new Set([...selectedIds, ...gIds])]);
  };

  const selectGrade = (grade: number) => {
    setActiveGrade(grade);
    setActiveGroupId(null);
  };

  const groupSelected = (g: PickerGroup) => g.students.filter((s) => selectedIds.includes(s.id)).length;
  const allSelected = activeGroup?.students.every((s) => selectedIds.includes(s.id)) ?? false;
  const someSelected = (activeGroup?.students.some((s) => selectedIds.includes(s.id)) && !allSelected) ?? false;

  return (
    <div className="space-y-3">
      {/* Selected chips */}
      {selectedStudents.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
          {selectedStudents.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 text-xs bg-white text-emerald-800 border border-emerald-200 rounded-full px-2.5 py-1 font-medium shadow-sm"
            >
              {s.name}
              <span className="text-emerald-400 text-[10px]">{s.groupName}</span>
              <button type="button" onClick={() => toggle(s.id)} className="ml-0.5 text-emerald-400 hover:text-emerald-700">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Step 1 — Grade */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Τάξη</p>
        <div className="flex gap-2 flex-wrap">
          {grades.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => selectGrade(g)}
              className={cn(
                "h-10 px-6 rounded-xl text-sm font-medium transition-colors border",
                activeGrade === g
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700"
              )}
            >
              {GRADE_LABEL[g] ?? `Έτος ${g}`}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2 — Group */}
      {activeGrade !== null && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Τμήμα</p>
          <div className="flex gap-2 flex-wrap">
            {groupsForGrade.map((g) => {
              const count = groupSelected(g);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveGroupId(g.id)}
                  className={cn(
                    "h-10 px-5 rounded-xl text-sm font-medium transition-colors border flex items-center gap-2",
                    activeGroupId === g.id
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800"
                  )}
                >
                  {g.name}
                  {count > 0 && (
                    <span className={cn(
                      "text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold flex-shrink-0",
                      activeGroupId === g.id ? "bg-white text-slate-800" : "bg-emerald-500 text-white"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3 — Students */}
      {activeGroup && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Μαθητές — {activeGroup.name}
          </p>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            {/* Select all */}
            <label className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleAll}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
              />
              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Επιλογή όλων ({activeGroup.students.length})
              </span>
            </label>

            {/* Student rows */}
            <div className="divide-y divide-slate-50 max-h-56 overflow-y-auto bg-white">
              {activeGroup.students.map((s) => {
                const checked = selectedIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                      checked ? "bg-emerald-50" : "hover:bg-slate-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(s.id)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span className={cn("text-sm", checked ? "font-medium text-emerald-900" : "text-slate-700")}>
                      {s.name}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!activeGrade && (
        <p className="text-xs text-slate-400">Επιλέξτε τάξη για να εμφανιστούν τα τμήματα</p>
      )}
      {activeGrade && !activeGroupId && (
        <p className="text-xs text-slate-400">Επιλέξτε τμήμα για να εμφανιστούν οι μαθητές</p>
      )}
    </div>
  );
}
