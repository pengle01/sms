import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { fmtDisplayDate } from "@/lib/dates";
import { periodLabel } from "@/lib/periods";
import type { PendingLesson } from "@/server/attendanceLock";

/**
 * Blocking screen shown across the teacher portal when the attendance-lock is
 * on and the teacher has unmarked past lessons. Lists every pending lesson with
 * a direct link to record it (the marking route is exempt from the lock).
 */
export async function AttendanceLockScreen({
  pending,
  locale,
}: {
  pending: PendingLesson[];
  locale: string;
}) {
  const t = await getTranslations("attendanceLock");
  const CAP = 60;
  const shown = pending.slice(0, CAP);

  const byDate = new Map<string, PendingLesson[]>();
  for (const p of shown) {
    const list = byDate.get(p.dateIso);
    if (list) list.push(p);
    else byDate.set(p.dateIso, [p]);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
        <Lock className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <h2 className="text-xl font-bold text-amber-900">{t("title")}</h2>
          <p className="text-sm text-amber-800 mt-1">{t("intro", { n: pending.length })}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 divide-y divide-slate-100">
          {[...byDate.entries()].map(([dateIso, lessons]) => (
            <div key={dateIso} className="px-5 py-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                {fmtDisplayDate(dateIso + "T00:00:00.000Z")}
              </p>
              <div className="space-y-1.5">
                {lessons.map((l, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="inline-flex w-9 justify-center rounded bg-slate-100 text-xs font-semibold text-slate-600 py-0.5">
                      {periodLabel(l.period, locale)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-900">{l.courseName}</span>
                      <span className="text-xs text-slate-400 ml-2">{l.groupName}</span>
                    </div>
                    <Link
                      href={`/${locale}/teacher/attendance/mark?groupId=${l.groupId}&period=${l.period}&date=${l.dateIso}`}
                      className="inline-flex items-center h-8 px-3 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700"
                    >
                      {t("mark")}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {pending.length > shown.length && (
        <p className="text-xs text-slate-400 text-center">{t("more", { n: pending.length - shown.length })}</p>
      )}
    </div>
  );
}
