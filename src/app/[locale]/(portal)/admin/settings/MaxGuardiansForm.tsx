"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { EditControls } from "./EditControls";

interface Props {
  initial: number;
}

const MIN = 1;
const MAX = 5;

export function MaxGuardiansForm({ initial }: Props) {
  const t = useTranslations("adminSettings");
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
    setValue((v) => Math.min(MAX, Math.max(MIN, v + delta)));
    setSaved(false);
  };

  const save = () => mutate({ key: "maxGuardiansPerStudent", value: String(value) });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-700">{t("maxGuardiansTitle")}</p>
        <p className="text-xs text-slate-400">{t("maxGuardiansHint")}</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
          <button
            type="button"
            onClick={() => change(-1)}
            disabled={!editing || value <= MIN || isPending}
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
            disabled={!editing || value >= MAX || isPending}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <span className="text-sm text-slate-400">{t("guardiansPerStudent")}</span>
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
