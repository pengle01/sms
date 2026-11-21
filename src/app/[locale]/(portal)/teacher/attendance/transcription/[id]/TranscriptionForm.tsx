"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveTranscriptionAttendance, type TranscriptionMark } from "./actions";

type Status = TranscriptionMark["status"];

/** Present / absent / late for the one student, per period of the test. */
export function TranscriptionForm({
  id,
  backHref,
  initial,
}: {
  id: string;
  backHref: string;
  initial: TranscriptionMark[];
}) {
  const t = useTranslations("transcription");
  const router = useRouter();
  const [marks, setMarks] = useState<TranscriptionMark[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (period: number, patch: Partial<TranscriptionMark>) =>
    setMarks((all) => all.map((m) => (m.period === period ? { ...m, ...patch } : m)));

  const save = () =>
    startTransition(async () => {
      setError(null);
      const r = await saveTranscriptionAttendance(id, marks);
      if (!r.ok) setError(r.error);
      else {
        router.push(backHref);
        router.refresh();
      }
    });

  const button = (m: TranscriptionMark, status: Status, label: string, Icon: typeof CheckCircle, on: string) => (
    <button
      type="button"
      onClick={() => set(m.period, { status })}
      className={cn(
        "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium",
        m.status === status ? on : "border-slate-200 text-slate-500 hover:bg-slate-50",
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {marks.map((m) => (
          <div key={m.period} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <span className="w-24 text-sm font-medium text-slate-700">{t("period", { period: m.period })}</span>
            {button(m, "PRESENT", t("present"), CheckCircle, "border-emerald-600 bg-emerald-50 text-emerald-700")}
            {button(m, "ABSENT", t("absent"), XCircle, "border-red-500 bg-red-50 text-red-700")}
            {button(m, "LATE", t("late"), Clock, "border-amber-500 bg-amber-50 text-amber-700")}
            {m.status === "LATE" && (
              <label className="flex items-center gap-1.5 text-sm text-slate-600">
                <input
                  type="number"
                  min={0}
                  max={45}
                  value={m.minutesDelayed}
                  onChange={(e) => set(m.period, { minutesDelayed: Number(e.target.value) || 0 })}
                  className="h-9 w-16 rounded-lg border border-slate-200 px-2 text-sm"
                />
                {t("minutes")}
              </label>
            )}
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{t(`err_${error}`)}</p>}
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending && <Loader2 className="w-4 h-4 animate-spin" />}
        {t("save")}
      </button>
    </div>
  );
}
