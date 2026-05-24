import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, CalendarRange, FlaskConical } from "lucide-react";
import { utcMidnight, localDateStr } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getPeriodsPerDay, periodsForDow, maxPeriodCount } from "@/lib/schoolConfig";

const DOW_LABELS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DOW_SHORT  = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];

export default async function StudentSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; studentId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { locale, studentId } = await params;
  const { view } = await searchParams;
  const showWeek = view === "week";

  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const student = await db.studentProfile.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { name: true } },
      group: true,
      subjectGroups: { include: { group: true } },
    },
  });

  if (!student || !student.user) notFound();

  const groupIds = [
    student.groupId,
    ...student.subjectGroups.map((sg) => sg.groupId),
  ].filter(Boolean) as string[];

  const todayStr = localDateStr();
  const today = utcMidnight(todayStr);
  const now = new Date();
  const todayDow = now.getDay();
  const isSchoolDay = todayDow >= 1 && todayDow <= 5;

  const periodsConfig = await getPeriodsPerDay();
  const todayPeriods = periodsForDow(periodsConfig, isSchoolDay ? todayDow : 1);
  const allPeriods = Array.from({ length: maxPeriodCount(periodsConfig) }, (_, i) => i + 1);

  const [allSlots, todayActivities, upcomingTests] = await Promise.all([
    groupIds.length > 0
      ? db.timetableSlot.findMany({
          where: { groupId: { in: groupIds } },
          include: {
            course: true,
            group: true,
            staff: { include: { user: { select: { name: true } } } },
          },
          orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
        })
      : Promise.resolve([]),
    db.activity.findMany({
      where: { date: today, participants: { some: { studentId } } },
      include: { filer: { include: { user: { select: { name: true } } } } },
      orderBy: { startPeriod: "asc" },
    }),
    groupIds.length > 0
      ? db.testSchedule.findMany({
          where: { groupId: { in: groupIds }, date: { gte: today } },
          include: {
            course: { select: { name: true } },
            group: { select: { name: true } },
            staff: { include: { user: { select: { name: true } } } },
          },
          orderBy: [{ date: "asc" }, { period: "asc" }],
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  type SlotEntry = (typeof allSlots)[0] & { isSubjectGroup?: boolean };
  const grid: Record<number, Record<number, SlotEntry>> = {};

  for (const slot of allSlots.filter((s) => s.groupId === student.groupId)) {
    grid[slot.dayOfWeek] ??= {};
    grid[slot.dayOfWeek]![slot.period] = slot;
  }
  for (const slot of allSlots.filter((s) => s.groupId !== student.groupId)) {
    grid[slot.dayOfWeek] ??= {};
    grid[slot.dayOfWeek]![slot.period] = { ...slot, isSubjectGroup: true };
  }

  const activityByPeriod: Record<number, string> = {};
  for (const act of todayActivities) {
    for (let p = act.startPeriod; p <= act.endPeriod; p++) {
      activityByPeriod[p] = act.name;
    }
  }

  // Smart back link: return to locate page with grade+group context
  const backUrl = student.group
    ? `/${locale}/teacher/attendance/locate?grade=${student.group.grade}&groupId=${student.groupId}`
    : `/${locale}/teacher/attendance/locate`;

  const dayUrl = `/${locale}/teacher/students/${studentId}`;
  const weekUrl = `/${locale}/teacher/students/${studentId}?view=week`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href={backUrl} className="text-slate-500 hover:text-slate-700 mt-1 flex-shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-slate-900">{student.user.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            {student.group && <Badge variant="outline">{student.group.name}</Badge>}
            {student.subjectGroups.length > 0 && (
              <span className="text-xs text-slate-400">
                +{student.subjectGroups.length} support group{student.subjectGroups.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Day / Week toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden flex-shrink-0">
          <Link
            href={dayUrl}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              !showWeek
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-500 hover:bg-slate-50"
            )}
          >
            Today
          </Link>
          <Link
            href={weekUrl}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200",
              showWeek
                ? "bg-slate-800 text-white"
                : "bg-white text-slate-500 hover:bg-slate-50"
            )}
          >
            Week
          </Link>
        </div>
      </div>

      {/* Today's activities */}
      {todayActivities.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-800">
              <CalendarRange className="w-4 h-4" />
              Today&apos;s Activities
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {todayActivities.map((a) => (
              <div key={a.id} className="flex items-center gap-3 text-sm">
                <span className="text-emerald-700 font-medium">{a.name}</span>
                <span className="text-emerald-600">
                  P{a.startPeriod}{a.startPeriod !== a.endPeriod && `–${a.endPeriod}`}
                </span>
                {a.location && <span className="text-emerald-500">· {a.location}</span>}
                <Link href={`/${locale}/teacher/activities/${a.id}`} className="text-emerald-600 hover:underline text-xs ml-auto">
                  View
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* DAY VIEW */}
      {!showWeek && (
        <>
          {isSchoolDay ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Today — {DOW_LABELS[todayDow]}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-50">
                    {todayPeriods.map((p) => {
                      const slot = grid[todayDow]?.[p];
                      const activity = activityByPeriod[p];
                      return (
                        <tr key={p} className={activity ? "bg-emerald-50/60" : "hover:bg-slate-50"}>
                          <td className="px-5 py-3 text-xs font-semibold text-slate-400 w-14">P{p}</td>
                          {activity ? (
                            <td colSpan={3} className="px-5 py-3">
                              <span className="font-medium text-emerald-700">{activity}</span>
                              <Badge variant="outline" className="ml-2 text-xs bg-emerald-50 text-emerald-700 border-emerald-200">Activity</Badge>
                            </td>
                          ) : slot ? (
                            <>
                              <td className="px-5 py-3 font-medium text-slate-900">{slot.course.name}</td>
                              <td className="px-5 py-3 text-slate-500">{slot.staffName ?? slot.staff?.user.name ?? "—"}</td>
                              <td className="px-5 py-3 text-slate-400">{slot.room ?? ""}</td>
                            </>
                          ) : (
                            <td colSpan={3} className="px-5 py-3 text-slate-300">—</td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-slate-400">No school today — switch to Week view to see the timetable.</p>
          )}
        </>
      )}

      {/* UPCOMING TESTS */}
      {upcomingTests.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="w-4 h-4" />
              Upcoming Tests
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Subject</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Group</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Period</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {upcomingTests.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {DOW_SHORT[t.date.getUTCDay()]} {t.date.toLocaleDateString("el-GR", { day: "numeric", month: "short", timeZone: "UTC" })}
                    </td>
                    <td className="px-5 py-3 text-slate-700">{t.course.name}</td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{t.group.name}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs">
                      {t.periodCount > 1 ? `P${t.period}–${t.period + t.periodCount - 1}` : `P${t.period}`}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant="outline"
                        className={t.type === "BIG"
                          ? "text-xs bg-slate-800 text-white border-slate-800"
                          : "text-xs bg-slate-100 text-slate-600 border-slate-200"}
                      >
                        {t.type === "BIG" ? "Big · 45 min" : "Small · 20 min"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* WEEK VIEW */}
      {showWeek && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Weekly Timetable</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 w-10" />
                  {[1, 2, 3, 4, 5].map((d) => (
                    <th
                      key={d}
                      className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide ${
                        d === todayDow ? "text-emerald-600" : "text-slate-500"
                      }`}
                    >
                      {DOW_SHORT[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {allPeriods.map((p) => (
                  <tr key={p} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-semibold text-slate-400">P{p}</td>
                    {[1, 2, 3, 4, 5].map((d) => {
                      const slot = grid[d]?.[p];
                      const isToday = d === todayDow;
                      const activity = isToday ? activityByPeriod[p] : undefined;
                      return (
                        <td key={d} className={`px-4 py-3 ${isToday ? "bg-emerald-50/30" : ""}`}>
                          {activity ? (
                            <div>
                              <p className="font-medium text-emerald-700 leading-tight text-xs">{activity}</p>
                              <Badge variant="outline" className="text-[10px] px-1 py-0 mt-0.5 bg-emerald-50 text-emerald-700 border-emerald-200">Activity</Badge>
                            </div>
                          ) : slot ? (
                            <div className="space-y-0.5">
                              <p className="font-medium text-slate-800 leading-tight text-xs">{slot.course.name}</p>
                              {(slot.staffName ?? slot.staff?.user.name) && (
                                <p className="text-[11px] text-slate-500 leading-tight">{slot.staffName ?? slot.staff?.user.name}</p>
                              )}
                              {slot.room && (
                                <p className="text-[11px] text-slate-400 leading-tight">Room {slot.room}</p>
                              )}
                              {slot.isSubjectGroup && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0">{slot.group.name}</Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-200">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
