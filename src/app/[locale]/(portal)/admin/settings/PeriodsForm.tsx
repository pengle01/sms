"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  const { mutate, isPending } = trpc.settings.upsert.useMutation({
    onSuccess: () => toast.success("Saved"),
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
                  onClick={() => setValues((v) => ({ ...v, [dow]: n }))}
                  className={`px-5 py-1.5 text-sm font-medium transition-colors ${
                    values[dow] === n
                      ? "bg-emerald-600 text-white"
                      : "bg-white text-slate-500 hover:bg-slate-50"
                  } ${n === 8 ? "border-l border-slate-200" : ""}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-1">
        <Button
          onClick={save}
          disabled={isPending}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  );
}
