"use client";

import { useTransition, useState } from "react";
import { assignHomeroomTeacher } from "./actions";
import { Check, Loader2 } from "lucide-react";

interface Teacher {
  id: string;
  name: string | null;
}

interface Props {
  groupId: string;
  currentStaffId: string | null;
  teachers: Teacher[];
}

export function InlineTeacherAssign({ groupId, currentStaffId, teachers }: Props) {
  const [value, setValue] = useState(currentStaffId ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const onChange = (staffId: string) => {
    setValue(staffId);
    startTransition(async () => {
      await assignHomeroomTeacher(groupId, staffId || null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        className="w-full h-8 rounded-lg border border-slate-200 px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white disabled:opacity-60"
      >
        <option value="">— Unassigned —</option>
        {teachers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name ?? t.id}
          </option>
        ))}
      </select>
      <div className="w-4 flex-shrink-0">
        {pending && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
        {saved && !pending && <Check className="w-4 h-4 text-emerald-500" />}
      </div>
    </div>
  );
}
