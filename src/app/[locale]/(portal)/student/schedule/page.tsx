import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getPeriodsPerDay, getBellSchedule } from "@/lib/schoolConfig";
import { getNow, utcMidnight, localDateStr } from "@/lib/dates";
import { getSpecialDaysInRange, buildDayMeetingMap } from "@/lib/calendar";
import { rowsForDay, storedPeriodAt, isMeetingRow, isLessonCancelled } from "@/lib/homegroupPeriod";
import { periodTime } from "@/lib/bellSchedule";
import { getDayOverrides } from "@/server/substitutions";
import { periodLabel } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { PrintTimetableLink } from "@/components/timetable/PrintTimetableLink";

export default async function StudentSchedulePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const student = await db.studentProfile.findUnique({
    where: { userId: session.user.id },
    include: { group: true, subjectGroups: { select: { groupId: true } } },
  });
  if (!student) redirect(`/${locale}/login`);

  const t = await getTranslations("mySchedule");
  const tShared = await getTranslations("tests");
  const DOW = tShared.raw("dow") as string[];

  const groupIds = [
    ...new Set([
      ...(student.groupId ? [student.groupId] : []),
      ...student.subjectGroups.map((sg) => sg.groupId),
    ]),
  ];

  // This week's dates (Mon–Fri): homegroup-period days shift or cancel lessons.
  const monday = new Date(getNow());
  const jsDay = monday.getDay();
  monday.setDate(monday.getDate() + (jsDay === 0 ? -6 : 1 - jsDay));
  const weekIso: Record<number, string> = {};
  for (let d = 1; d <= 5; d++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + (d - 1));
    weekIso[d] = localDateStr(dt);
  }
  const weekDates = [1, 2, 3, 4, 5].map((d) => utcMidnight(weekIso[d]!));

  const [slots, periodsConfig, bell, specialDays] = await Promise.all([
    groupIds.length > 0
      ? db.timetableSlot.findMany({
          where: { groupId: { in: groupIds } },
          include: {
            course: { select: { name: true } },
            staff: { include: { user: { select: { name: true } } } },
            group: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    getPeriodsPerDay(),
    getBellSchedule(),
    getSpecialDaysInRange(weekDates[0]!, weekDates[4]!),
  ]);
  const meetings = buildDayMeetingMap(specialDays, weekDates);
  const meetingOf = (d: number) => meetings.get(weekIso[d]!) ?? null;
  const rowsOn = (d: number) => rowsForDay(periodsConfig[d] ?? 7, meetingOf(d));

  // Homegroup slots first, subject-group slots override the same cell.
  type Slot = (typeof slots)[number] & { isSubjectGroup?: boolean };
  const grid = new Map<number, Slot>();
  for (const s of slots.filter((s) => s.groupId === student.groupId)) {
    grid.set(s.dayOfWeek * 100 + s.period, s);
  }
  for (const s of slots.filter((s) => s.groupId !== student.groupId)) {
    grid.set(s.dayOfWeek * 100 + s.period, { ...s, isSubjectGroup: true });
  }

  const teacherName = (s: Slot) => s.staff?.scheduleName ?? s.staffName ?? s.staff?.user?.name ?? null;

  const days = [1, 2, 3, 4, 5];
  const allPeriods = Array.from({ length: Math.max(...days.map(rowsOn)) }, (_, i) => i + 1);
  const dayKind = (d: number) => {
    const m = meetingOf(d);
    if (m) return m.mode === "insert" ? t("intercalaryDay") : t("homegroupPeriod");
    return bell.days[d] === "eight" ? t("eightDay") : t("sevenDay");
  };

  // Highlight today's column (no highlight on weekends)
  const todayDow = getNow().getDay();

  // Today's finalized substitutions touching this student's groups → per-period
  const overrides = await getDayOverrides(utcMidnight());
  const todayOverride = new Map<number, { label: string; sub: string | null; newRoom: string | null }>();
  if (overrides) {
    for (const gid of groupIds) {
      for (const e of overrides.forGroup(gid)) {
        if (e.period == null) continue;
        const label =
          e.kind === "RELEASE"
            ? t("released")
            : e.kind === "STUDY_HALL" || e.kind === "CHAPERONE_HALL"
              ? "Φ/δι"
              : e.kind === "ROOM_CHANGE"
                ? t("roomChanged")
                : t("substituteLabel");
        todayOverride.set(e.period, {
          label,
          sub: e.substituteStaff?.scheduleName ?? null,
          newRoom: e.newRoom,
        });
      }
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
          <p className="text-slate-500 text-sm mt-1">{student.group?.name ?? t("noGroup")}</p>
        </div>
        {grid.size > 0 && <PrintTimetableLink kind="student" value={student.id} />}
      </div>

      {grid.size === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <CalendarDays className="w-12 h-12 mb-3 opacity-30" />
          <p>{t("noTimetable")}</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide w-12" />
                  {days.map((d) => (
                    <th
                      key={d}
                      className={cn(
                        "px-3 py-3 text-xs font-semibold uppercase tracking-wide text-left",
                        d === todayDow ? "text-emerald-700 bg-emerald-50/70" : "text-slate-500"
                      )}
                    >
                      {DOW[d]}
                      {d === todayDow && <span className="ml-1 text-emerald-500">●</span>}
                      <span
                        className={cn(
                          "block mt-0.5 text-[10px] font-normal normal-case tracking-normal",
                          meetingOf(d) ? "text-purple-600" : "text-slate-400",
                        )}
                      >
                        {dayKind(d)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {allPeriods.map((p) => (
                  <tr key={p}>
                    <td className="px-3 py-2 text-xs font-bold text-slate-400 align-top">
                      {periodLabel(p, locale)}
                    </td>
                    {days.map((d) => {
                      const isToday = d === todayDow;
                      const todayBg = isToday ? "bg-emerald-50/40" : undefined;
                      const meeting = meetingOf(d);
                      if (p > rowsOn(d)) return <td key={d} className={cn("px-3 py-2", isToday ? "bg-emerald-50/40" : "bg-slate-50/60")} />;
                      const time = periodTime(bell, d, p, meeting);
                      const timeLine = time && (
                        <p className="text-[10px] tabular-nums text-slate-400 mb-0.5">
                          {time.start}–{time.end}
                        </p>
                      );
                      // «Υπευθυνότητα Τμήματος»: the homegroup meets its teacher.
                      if (isMeetingRow(p, meeting)) {
                        return (
                          <td key={d} className={cn("px-1.5 py-1.5 align-top", todayBg)}>
                            {timeLine}
                            <div className="rounded-lg px-2 py-1.5 border border-purple-200 bg-purple-50">
                              <p className="font-medium text-purple-900 text-xs leading-snug">{t("homegroupPeriod")}</p>
                              {student.group?.name && <p className="text-[11px] text-purple-600 mt-0.5">{student.group.name}</p>}
                            </div>
                          </td>
                        );
                      }
                      // Lessons keep their stored period; on an inserted day they show one row later.
                      const stored = storedPeriodAt(p, meeting);
                      const slot = grid.get(d * 100 + stored);
                      if (!slot) return <td key={d} className={cn("px-1.5 py-1.5 align-top", todayBg)}>{timeLine}</td>;
                      if (isLessonCancelled(stored, meeting)) {
                        return (
                          <td key={d} className={cn("px-1.5 py-1.5 align-top", todayBg)}>
                            {timeLine}
                            <div className="rounded-lg px-2 py-1.5 border border-slate-200 bg-slate-50 opacity-70">
                              <p className="font-medium text-slate-400 text-xs leading-snug line-through">{slot.course.name}</p>
                              <p className="text-[11px] text-purple-600 mt-0.5">{t("cancelledHomegroup")}</p>
                            </div>
                          </td>
                        );
                      }
                      const override = isToday ? todayOverride.get(stored) : undefined;
                      return (
                        <td key={d} className={cn("px-1.5 py-1.5 align-top", todayBg)}>
                          {timeLine}
                          <div
                            className={cn(
                              "rounded-lg px-2 py-1.5 border",
                              override ? "border-sky-200 bg-sky-50" : "border-slate-100 bg-slate-50/80"
                            )}
                          >
                            <p className="font-medium text-slate-900 text-xs leading-snug">{slot.course.name}</p>
                            {override ? (
                              <p className="text-[11px] text-sky-700 font-medium mt-0.5">
                                {override.label}
                                {override.sub && `: ${override.sub}`}
                              </p>
                            ) : (
                              teacherName(slot) && (
                                <p className="text-[11px] text-slate-500 mt-0.5">{teacherName(slot)}</p>
                              )
                            )}
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {slot.isSubjectGroup && (
                                <span className="text-indigo-500 font-medium">{slot.group.name}</span>
                              )}
                              {slot.isSubjectGroup && (override?.newRoom ?? slot.room) && " · "}
                              {(override?.newRoom ?? slot.room) &&
                                t("room", { room: override?.newRoom ?? slot.room ?? "" })}
                            </p>
                          </div>
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
