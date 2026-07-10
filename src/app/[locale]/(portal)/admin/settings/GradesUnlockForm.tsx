"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Lock, LockOpen } from "lucide-react";
import type { GradesUnlocked, GradePeriod } from "@/lib/grades";
import { EditControls } from "./EditControls";
import { saveGradesUnlocked } from "./actions";

/** Labels are adminSettings.* message keys. */
const TERMS: { period: GradePeriod; labelKey: string }[] = [
  { period: "TERM1", labelKey: "term1" },
  { period: "TERM2", labelKey: "term2" },
];

export function GradesUnlockForm({ initial }: { initial: GradesUnlocked }) {
  const t = useTranslations("adminSettings");
  const router = useRouter();
  const [values, setValues] = useState<GradesUnlocked>(initial);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await saveGradesUnlocked(values);
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
      <p className="text-xs text-slate-400">{t("gradesIntro")}</p>

      <div className="divide-y divide-slate-100">
        {TERMS.map(({ period, labelKey }) => {
          const unlocked = values[period];
          return (
            <div key={period} className="py-2.5 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-700">{t(labelKey)}</span>
              {editing ? (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={unlocked}
                    onChange={(e) => setValues((v) => ({ ...v, [period]: e.target.checked }))}
                    className="accent-emerald-600 w-4 h-4"
                  />
                  <span className="text-slate-600">{t("unlocked")}</span>
                </label>
              ) : unlocked ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-2.5 py-1">
                  <LockOpen className="w-3 h-3" />
                  {t("unlocked")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-500 text-xs px-2.5 py-1">
                  <Lock className="w-3 h-3" />
                  {t("locked")}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <EditControls
        editing={editing}
        pending={pending}
        saved={saved}
        onEdit={() => setEditing(true)}
        onCancel={() => { setValues(initial); setEditing(false); }}
        onSave={save}
      />
    </div>
  );
}
