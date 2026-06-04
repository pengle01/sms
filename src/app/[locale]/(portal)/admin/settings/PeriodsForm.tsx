"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { EditControls } from "./EditControls";

const DAYS = [
  { dow: 1, label: "Monday" },
  { dow: 2, label: "Tuesday" },
  { dow: 3, label: "Wednesday" },
  { dow: 4, label: "Thursday" },
  { dow: 5, label: "Friday" },
];

interface Props {
  initial: Record<number, number>;
}

export function PeriodsForm({ initial }: Props) {
  const [values, setValues] = useState<Record<number, number>>(initial);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  const { mutate, isPending } = trpc.settings.upsert.useMutation({
    onSuccess: () => {
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e) => toast.error(e.message),
  });

  const save = () =>
    mutate({ key: "periodsPerDay", value: JSON.stringify(values) });

  return (
    <div className="space-y-4">
      <div className="divide-y divide-slate-100">
        {DAYS.map(({ dow, label }) => (
          <div key={dow} className="flex items-center justify-between py-3">
            <span className="text-sm font-medium text-slate-700">{label}</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {[7, 8].map((n) => (
                <button
                  key={n}
                  disabled={!editing}
                  onClick={() => setValues((v) => ({ ...v, [dow]: n }))}
                  className={`px-5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                    values[dow] === n
                      ? editing
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 text-slate-700"
                      : "bg-white text-slate-400"
                  } ${editing && values[dow] !== n ? "hover:bg-slate-50 text-slate-500" : ""} ${
                    n === 8 ? "border-l border-slate-200" : ""
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <EditControls
        editing={editing}
        pending={isPending}
        saved={saved}
        onEdit={() => setEditing(true)}
        onCancel={() => { setValues(initial); setEditing(false); }}
        onSave={save}
      />
    </div>
  );
}
