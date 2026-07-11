"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { SPECIAL_ED_CODE_MAX, SPECIAL_ED_LABEL_MAX } from "@/lib/specialEd";
import { addSpecialEdCode, removeSpecialEdCode, type CodeKind } from "./actions";

export interface CodeRow {
  id: string;
  code: string;
  label: string;
  active: boolean;
  inUse: number;
}

const input =
  "h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500";

function CodeList({ kind, rows }: { kind: CodeKind; rows: CodeRow[] }) {
  const t = useTranslations("adminSettings");
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await addSpecialEdCode(kind, code, label);
      if (res.ok) {
        setCode("");
        setLabel("");
      } else {
        toast.error(t(res.error as Parameters<typeof t>[0]));
      }
    });
  };

  const remove = (id: string) => {
    setBusyId(id);
    startTransition(async () => {
      const res = await removeSpecialEdCode(kind, id);
      if (res.ok && res.deactivated) toast.info(t("seCodeDeactivated"));
      setBusyId(null);
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-700">
        {kind === "problem" ? t("seProblems") : t("seAccommodations")}
      </p>
      <div className="max-h-64 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-50">
        {rows.map((r) => (
          <div key={r.id} className={`flex items-start gap-2 px-3 py-1.5 ${r.active ? "" : "opacity-50"}`}>
            <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 rounded px-1.5 py-0.5 mt-0.5 shrink-0">
              {r.code}
            </span>
            <span className="flex-1 text-xs text-slate-600 leading-snug" title={r.label}>
              {r.label}
              {!r.active && <span className="ml-1.5 text-slate-400">({t("seInactive")})</span>}
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {r.inUse > 0 && (
                <span className="text-[10px] text-slate-400">{t("seInUse", { count: r.inUse })}</span>
              )}
              {r.active && (
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  disabled={pending}
                  title={t("seRemove")}
                  className="text-slate-300 hover:text-red-500 disabled:opacity-40"
                >
                  {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                </button>
              )}
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="px-3 py-4 text-center text-sm text-slate-400">—</p>
        )}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">{t("seCode")}</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={SPECIAL_ED_CODE_MAX} required className={`${input} w-24`} />
        </div>
        <div className="space-y-1 flex-1">
          <label className="text-xs font-medium text-slate-500">{t("seLabel")}</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={SPECIAL_ED_LABEL_MAX} required className={`${input} w-full`} />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t("seAdd")}
        </button>
      </form>
    </div>
  );
}

export function SpecialEdCodesForm({ problems, accommodations }: { problems: CodeRow[]; accommodations: CodeRow[] }) {
  const t = useTranslations("adminSettings");
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">{t("specialEdCodesHint")}</p>
      <CodeList kind="problem" rows={problems} />
      <CodeList kind="accommodation" rows={accommodations} />
    </div>
  );
}
