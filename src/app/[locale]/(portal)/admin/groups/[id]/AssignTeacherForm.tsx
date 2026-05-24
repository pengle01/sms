"use client";

import { useState, useTransition } from "react";
import { assignHomeroomTeacher } from "./actions";
import { Loader2 } from "lucide-react";

interface Teacher {
  id: string;
  name: string | null;
}

interface Props {
  groupId: string;
  currentStaffId: string | null;
  teachers: Teacher[];
}

export function AssignTeacherForm({ groupId, currentStaffId, teachers }: Props) {
  const [value, setValue] = useState(currentStaffId ?? "");
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(() => assignHomeroomTeacher(groupId, value || null));

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1 h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
      >
        <option value="">— None —</option>
        {teachers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name ?? t.id}
          </option>
        ))}
      </select>
      <button
        onClick={save}
        disabled={pending}
        className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
      >
        {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Save
      </button>
    </div>
  );
}
