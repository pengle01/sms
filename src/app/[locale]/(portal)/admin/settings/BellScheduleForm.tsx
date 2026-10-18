"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import { cn } from "@/lib/utils";
import {
  BELL_SCHEDULE_IDS,
  BELL_SCHEDULE_KEY,
  bellProblems,
  breaksOf,
  dayMismatches,
  normalizeBellSchedule,
  type BellScheduleConfig,
  type BellScheduleId,
} from "@/lib/bellSchedule";
import type { PeriodsPerDay } from "@/lib/periods";
import { EditControls } from "./EditControls";

const DAYS = [
  { dow: 1, labelKey: "monday" },
  { dow: 2, labelKey: "tuesday" },
  { dow: 3, labelKey: "wednesday" },
  { dow: 4, labelKey: "thursday" },
  { dow: 5, labelKey: "friday" },
] as const;

/**
 * «Ωράριο περιόδων»: start/end of each period for the 7- and 8-period day,
 * and which one each weekday follows. Read-only until «Επεξεργασία».
 */
export function BellScheduleForm({ initial, periodsPerDay }: { initial: BellScheduleConfig; periodsPerDay: PeriodsPerDay }) {
  const t = useTranslations("adminSettings");
  const [values, setValues] = useState<BellScheduleConfig>(initial);
  const [stored, setStored] = useState<BellScheduleConfig>(initial);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  const problems = bellProblems(values);
  const bad = new Set(problems.map((p) => `${p.schedule}:${p.period}`));
  const mismatched = dayMismatches(values, periodsPerDay);

  const { mutate, isPending } = trpc.settings.upsert.useMutation({
    onSuccess: (_res, input) => {
      const next = JSON.parse(input.value) as BellScheduleConfig;
      setValues(next);
      setStored(next);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e) => toast.error(e.message),
  });

  const save = () => mutate({ key: BELL_SCHEDULE_KEY, value: JSON.stringify(normalizeBellSchedule(values)) });

  const setTime = (id: BellScheduleId, i: number, field: "start" | "end", v: string) =>
    setValues((c) => ({
      ...c,
      schedules: { ...c.schedules, [id]: c.schedules[id].map((per, j) => (j === i ? { ...per, [field]: v } : per)) },
    }));

  const timeInput = (id: BellScheduleId, i: number, field: "start" | "end") => (
    <input
      id={`bell-${id}-${i + 1}-${field}`}
      value={values.schedules[id][i]![field]}
      onChange={(e) => setTime(id, i, field, e.target.value)}
      disabled={!editing}
      inputMode="numeric"
      maxLength={5}
      aria-label={`${t(id === "seven" ? "bellSeven" : "bellEight")} ${t("bellPeriod", { n: i + 1 })} ${t(field === "start" ? "bellStart" : "bellEnd")}`}
      className={cn(
        "w-16 h-8 rounded-md border px-2 text-sm text-center tabular-nums disabled:bg-transparent disabled:border-transparent disabled:text-slate-700",
        bad.has(`${id}:${i + 1}`) && editing ? "border-red-400 bg-red-50" : "border-slate-200",
      )}
    />
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-6 sm:grid-cols-2">
        {BELL_SCHEDULE_IDS.map((id) => {
          const breaks = new Map(breaksOf(values.schedules[id]).map((b) => [b.afterPeriod, b.minutes]));
          return (
            <div key={id} className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 mb-2">{t(id === "seven" ? "bellSeven" : "bellEight")}</p>
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                {values.schedules[id].map((_, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                      <span className="text-sm text-slate-600">{t("bellPeriod", { n: i + 1 })}</span>
                      <span className="flex items-center gap-1">
                        {timeInput(id, i, "start")}
                        <span className="text-slate-400">–</span>
                        {timeInput(id, i, "end")}
                      </span>
                    </div>
                    {breaks.has(i + 1) && (
                      <p className="px-3 py-1 text-xs font-medium text-amber-700 bg-amber-50/70">
                        {t("bellBreak", { minutes: breaks.get(i + 1)! })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-800 mb-2">{t("bellDays")}</p>
        <div className="divide-y divide-slate-100">
          {DAYS.map(({ dow, labelKey }) => (
            <div key={dow} className="flex items-center justify-between py-2">
              <span className="text-sm font-medium text-slate-700">{t(labelKey)}</span>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                {BELL_SCHEDULE_IDS.map((id, k) => {
                  const on = values.days[dow] === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!editing}
                      onClick={() => setValues((c) => ({ ...c, days: { ...c.days, [dow]: id } }))}
                      className={cn(
                        "px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed",
                        on ? (editing ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700") : "bg-white text-slate-400",
                        editing && !on && "hover:bg-slate-50 text-slate-500",
                        k > 0 && "border-l border-slate-200",
                      )}
                    >
                      {t(id === "seven" ? "bellSevenShort" : "bellEightShort")}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {mismatched.length > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            {t("bellMismatch", { days: mismatched.map((d) => t(DAYS[d - 1]!.labelKey)).join(", ") })}
          </p>
        )}
      </div>

      {editing && problems.length > 0 && (
        <p className="text-xs text-red-600">{t("bellInvalid")}</p>
      )}

      <EditControls
        editing={editing}
        pending={isPending}
        saved={saved}
        canSave={problems.length === 0}
        onEdit={() => setEditing(true)}
        onCancel={() => { setValues(stored); setEditing(false); }}
        onSave={save}
      />
    </div>
  );
}
