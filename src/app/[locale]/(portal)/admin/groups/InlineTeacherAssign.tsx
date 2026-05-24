"use client";

import { useTransition, useState } from "react";
import { assignHomeroomTeacher, assignHomeroomHeadteacher } from "./actions";
import { Check, Loader2 } from "lucide-react";

interface StaffOption {
  id: string;
  name: string | null;
}

interface Props {
  groupId: string;
  currentTeacherId: string | null;
  currentHeadteacherId: string | null;
  teachers: StaffOption[];
  headteachers: StaffOption[];
}

function InlineSelect({
  value: initialValue,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: StaffOption[];
  placeholder: string;
  onChange: (id: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const handleChange = (staffId: string) => {
    setValue(staffId);
    startTransition(async () => {
      await onChange(staffId);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={pending}
        className="w-full h-8 rounded-lg border border-slate-200 px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white disabled:opacity-60"
      >
        <option value="">{placeholder}</option>
        {options.map((t) => (
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

export function InlineTeacherAssign({
  groupId,
  currentTeacherId,
  currentHeadteacherId,
  teachers,
  headteachers,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5 min-w-[220px]">
      <InlineSelect
        value={currentTeacherId ?? ""}
        options={teachers}
        placeholder="— Teacher —"
        onChange={(id) => assignHomeroomTeacher(groupId, id || null)}
      />
      <InlineSelect
        value={currentHeadteacherId ?? ""}
        options={headteachers}
        placeholder="— Headteacher B —"
        onChange={(id) => assignHomeroomHeadteacher(groupId, id || null)}
      />
    </div>
  );
}
