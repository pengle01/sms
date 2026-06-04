"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { EditControls } from "./EditControls";

interface Props {
  initial: number;
}

export function MaxTestsForm({ initial }: Props) {
  const [value, setValue] = useState(initial);
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

  const change = (delta: number) => {
    setValue((v) => Math.min(10, Math.max(2, v + delta)));
    setSaved(false);
  };

  const save = () => mutate({ key: "maxTestsPerWeek", value: String(value) });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-700">Max tests per student per week</p>
        <p className="text-xs text-slate-400">A student cannot receive more than this many tests in a single calendar week. Big tests are additionally limited to 1 per day.</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
          <button
            type="button"
            onClick={() => change(-1)}
            disabled={!editing || value <= 2 || isPending}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="w-8 text-center text-2xl font-bold text-slate-800 tabular-nums">
            {value}
          </span>
          <button
            type="button"
            onClick={() => change(+1)}
            disabled={!editing || value >= 10 || isPending}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <span className="text-sm text-slate-400">tests / week</span>
      </div>

      <EditControls
        editing={editing}
        pending={isPending}
        saved={saved}
        onEdit={() => setEditing(true)}
        onCancel={() => { setValue(initial); setEditing(false); }}
        onSave={save}
      />
    </div>
  );
}
