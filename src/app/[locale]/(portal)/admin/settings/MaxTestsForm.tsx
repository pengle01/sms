"use client";

import { useState, useTransition } from "react";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Loader2, Check, Minus, Plus } from "lucide-react";

interface Props {
  initial: number;
}

export function MaxTestsForm({ initial }: Props) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const { mutate } = trpc.settings.upsert.useMutation({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e) => toast.error(e.message),
  });

  const change = (delta: number) => {
    const next = Math.min(10, Math.max(2, value + delta));
    setValue(next);
    setSaved(false);
    startTransition(() => {
      mutate({ key: "maxTestsPerWeek", value: String(next) });
    });
  };

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
            disabled={value <= 2 || pending}
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
            disabled={value >= 10 || pending}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <span className="text-sm text-slate-400">tests / week</span>

        <div className="w-5 flex-shrink-0">
          {pending && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
          {saved && !pending && <Check className="w-4 h-4 text-emerald-500" />}
        </div>
      </div>
    </div>
  );
}
