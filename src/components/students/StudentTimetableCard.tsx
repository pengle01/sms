import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarDays, AlertTriangle } from "lucide-react";
import { db } from "@/server/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPeriodsPerDay } from "@/lib/schoolConfig";
import { periodsForDow, maxPeriodCount } from "@/lib/periods";
import { slotTeacherName } from "@/lib/staffName";
import { cn } from "@/lib/utils";
import { PrintTimetableLink } from "@/components/timetable/PrintTimetableLink";

const DAY_KEYS = ["dayMon", "dayTue", "dayWed", "dayThu", "dayFri"] as const;

/**
 * A student's weekly timetable (homegroup + subject/support groups), flagging
 * clashes and free periods. Shared by the admin and the office student pages;
 * `checksHref` (admin only) links the clash warning to the data checks.
 */
export async function StudentTimetableCard({
  studentProfileId,
  homegroupId,
  groupIds,
  checksHref,
}: {
  studentProfileId: string;
  homegroupId: string | null;
  groupIds: string[];
  checksHref?: string;
}) {
  const t = await getTranslations("adminStudents");
  // Weekly timetable = union of homegroup + subject-group slots. Cells with
  // more than one slot are scheduling conflicts and are flagged.
  const [slots, periodsPerDay] = await Promise.all([
    groupIds.length > 0
      ? db.timetableSlot.findMany({
          where: { groupId: { in: groupIds } },
          include: {
            course: { select: { name: true } },
            group: { select: { name: true } },
            staff: { select: { scheduleName: true, user: { select: { name: true } } } },
          },
          orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
        })
      : Promise.resolve([]),
    getPeriodsPerDay(),
  ]);

  type Slot = (typeof slots)[number];
  const cells = new Map<number, Slot[]>(); // dow*100+period → all slots in that cell
  for (const s of slots) {
    const key = s.dayOfWeek * 100 + s.period;
    cells.set(key, [...(cells.get(key) ?? []), s]);
  }
  const allPeriods = Array.from({ length: maxPeriodCount(periodsPerDay) }, (_, i) => i + 1);
  const dayPeriodCount = (dow: number) => periodsForDow(periodsPerDay, dow).length;
  const conflictCells = [...cells.values()].filter((c) => c.length >= 2).length;
  const gapCells = groupIds.length > 0
    ? [1, 2, 3, 4, 5].reduce(
        (sum, dow) =>
          sum +
          periodsForDow(periodsPerDay, dow).filter((p) => !cells.has(dow * 100 + p)).length,
        0
      )
    : 0;

  return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-slate-400" />
              {t("weeklyTimetable")}
            </CardTitle>
            <div className="flex items-center gap-2">
              {conflictCells > 0 && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                  {t("conflictCount", { count: conflictCells })}
                </Badge>
              )}
              {gapCells > 0 && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                  {t("freePeriodCount", { count: gapCells })}
                </Badge>
              )}
              {groupIds.length > 0 && <PrintTimetableLink kind="student" value={studentProfileId} />}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {groupIds.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-400 text-center">
              {t("noGroupsAssigned")}
            </p>
          ) : (
            <>
              {conflictCells > 0 && (
                <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {t("conflictWarning")}
                  {checksHref && (
                    <>
                      {" "}
                      <Link href={checksHref} className="font-semibold underline">
                        {t("dataChecks")}
                      </Link>.
                    </>
                  )}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="w-10 px-3 py-2.5 text-xs font-semibold text-slate-400" />
                      {DAY_KEYS.map((d) => (
                        <th key={d} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                          {t(d)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {allPeriods.map((period) => (
                      <tr key={period}>
                        <td className="px-3 py-2 text-center text-xs font-bold text-slate-400">{period}</td>
                        {[1, 2, 3, 4, 5].map((dow) => {
                          const inDay = period <= dayPeriodCount(dow);
                          const cellSlots = cells.get(dow * 100 + period) ?? [];
                          const conflict = cellSlots.length >= 2;
                          return (
                            <td
                              key={dow}
                              className={cn(
                                "px-3 py-2 align-top",
                                !inDay && "bg-slate-50/60",
                                conflict && "bg-red-50",
                                inDay && cellSlots.length === 0 && "bg-amber-50/40"
                              )}
                            >
                              {!inDay ? null : cellSlots.length === 0 ? (
                                <span className="text-[11px] text-amber-500">{t("freeCell")}</span>
                              ) : (
                                <div className="space-y-1">
                                  {cellSlots.map((s) => (
                                    <div key={s.id} className={cn(conflict && "rounded-md border border-red-200 bg-white px-1.5 py-1")}>
                                      <p className={cn("text-xs font-medium truncate", conflict ? "text-red-700" : "text-slate-800")}>
                                        {s.course.name}
                                      </p>
                                      <p className={cn("text-[11px] truncate", s.groupId === homegroupId ? "text-slate-400" : "text-indigo-500")}>
                                        {s.group.name}
                                        {s.room ? ` · ${s.room}` : ""}
                                      </p>
                                      {slotTeacherName(s, "") && (
                                        <p className="text-[11px] text-slate-500 truncate">{slotTeacherName(s, "")}</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
  );
}
