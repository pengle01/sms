import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Printer, Sun } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { RollCallStudent } from "@/lib/attendanceReport";

/**
 * One line per absent student for one day.
 *
 * The stored form is one row per student PER PERIOD, so a pupil out all day
 * appears seven times and the office has to collapse it by eye. This is the
 * view that answers "who was absent today".
 */
export async function DailyRollCall({
  locale,
  dateLabel,
  students,
  dayPeriods,
  printHref,
}: {
  locale: string;
  dateLabel: string;
  students: RollCallStudent[];
  /** Periods in the school day — the denominator of the 4/7 column. */
  dayPeriods: number;
  printHref: string;
}) {
  const t = await getTranslations("officeAttendance");

  const totals = students.reduce(
    (acc, s) => ({
      periods: acc.periods + s.periods.length,
      whole: acc.whole + (s.wholeDay ? 1 : 0),
      waived: acc.waived + s.waived,
    }),
    { periods: 0, whole: 0, waived: 0 },
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3 bg-slate-800 text-white">
        <span className="text-sm font-bold capitalize">{t("dailyFor", { date: dateLabel })}</span>
        <Link
          href={printHref}
          prefetch={false}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          {t("print")}
        </Link>
      </div>

      {students.length === 0 ? (
        <div className="px-5 py-16 text-center text-slate-400">
          <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
          {t("dailyEmpty")}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colStudent")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colGroup")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colPeriods")}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("colTotal")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">SMS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {students.map((s) => (
                  <tr key={s.studentProfileId} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/${locale}/office/students/${s.studentProfileId}`}
                        className="font-medium text-slate-900 hover:text-emerald-700"
                      >
                        {s.studentName}
                      </Link>
                      <span className="ml-2 font-mono text-[11px] text-slate-400">{s.studentId}</span>
                      <span className="ml-2 inline-flex gap-1 align-middle">
                        {s.wholeDay && (
                          <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                            <Sun className="w-2.5 h-2.5 mr-0.5" />
                            {t("wholeDay")}
                          </Badge>
                        )}
                        {s.hasPermit && (
                          <Badge variant="outline" className="text-[10px] bg-yellow-50 text-yellow-700 border-yellow-200">
                            {t("exitPermit")}
                          </Badge>
                        )}
                        {s.late > 0 && (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                            {t("late")}
                          </Badge>
                        )}
                        {s.waived > 0 && (
                          <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-500 border-slate-200">
                            {t("waived")} {s.waived}
                          </Badge>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {s.groupName ? (
                        <Badge variant="outline" className="text-xs">{s.groupName}</Badge>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {s.periods.join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">
                      {t("ofPeriods", {
                        absent: s.periods.length,
                        total: s.scheduled || dayPeriods,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {s.smsSent ? (
                        <span className="text-xs text-green-600 font-medium">{t("smsSent")}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="px-5 py-3 text-xs text-slate-500 border-t border-slate-100 bg-slate-50/60">
            {t("dailySummary", {
              students: students.length,
              periods: totals.periods,
              whole: totals.whole,
              waived: totals.waived,
            })}
          </p>
        </>
      )}
    </div>
  );
}
