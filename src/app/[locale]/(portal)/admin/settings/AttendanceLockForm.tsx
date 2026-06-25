"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, LockOpen } from "lucide-react";
import type { AttendanceLockConfig, AttendanceLockWindow } from "@/lib/attendanceLock";
import { EditControls } from "./EditControls";
import { saveAttendanceLock } from "./actions";

const WINDOWS: { value: AttendanceLockWindow; label: string }[] = [
  { value: "day", label: "Previous school day" },
  { value: "week", label: "Last 7 days" },
  { value: "term", label: "Current term" },
  { value: "year", label: "Whole school year" },
];

export function AttendanceLockForm({ initial }: { initial: AttendanceLockConfig }) {
  const router = useRouter();
  const [value, setValue] = useState<AttendanceLockConfig>(initial);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await saveAttendanceLock(value);
      if (res.ok) {
        setEditing(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        When enabled, a teacher with unmarked past lessons is blocked from the
        rest of the teacher portal until they record them. Lessons someone else
        already marked (e.g. a cover) and days the teacher was absent don&apos;t count.
      </p>

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">Lock the portal</span>
        {editing ? (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={value.enabled}
              onChange={(e) => setValue((v) => ({ ...v, enabled: e.target.checked }))}
              className="accent-emerald-600 w-4 h-4"
            />
            <span className="text-slate-600">Enabled</span>
          </label>
        ) : value.enabled ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs px-2.5 py-1">
            <Lock className="w-3 h-3" />
            Enabled
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-500 text-xs px-2.5 py-1">
            <LockOpen className="w-3 h-3" />
            Disabled
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">Look back</span>
        {editing ? (
          <select
            value={value.window}
            onChange={(e) => setValue((v) => ({ ...v, window: e.target.value as AttendanceLockWindow }))}
            className="h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {WINDOWS.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-slate-600">{WINDOWS.find((w) => w.value === value.window)?.label}</span>
        )}
      </div>

      <EditControls
        editing={editing}
        pending={pending}
        saved={saved}
        onEdit={() => setEditing(true)}
        onCancel={() => { setValue(initial); setEditing(false); }}
        onSave={save}
      />
    </div>
  );
}
