import { db } from "@/server/db";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, AlertTriangle } from "lucide-react";
import { getPeriodsPerDay, getBellSchedule } from "@/lib/schoolConfig";
import { getNow, utcMidnight, localDateStr } from "@/lib/dates";
import { getSpecialDaysInRange, buildDayMeetingMap, buildDayTypeMap, isHolidayType } from "@/lib/calendar";
import { rowsForDay, storedPeriodAt, isMeetingRow, isLessonCancelled } from "@/lib/homegroupPeriod";
import { periodTime } from "@/lib/bellSchedule";
import { getDayOverrides } from "@/server/substitutions";
import { loadActivityIndex } from "@/server/activityAbsences";
import { activityForAbsence } from "@/lib/activities";
import { changeForLesson, type LessonChange, type PlanEntryLite } from "@/lib/studentDayChanges";
import { periodLabel } from "@/lib/periods";
import { cn } from "@/lib/utils";

/**
 * A student's timetable for this week, with what changes on each day: the
 * FINAL substitution plan (substitute, released, Φ/δι, room), homegroup
 * periods, excursions, holidays and the student's activities — plus a list of
 * today's changes on top. Shared by the student's own page and a chaperone's
 * view of their student.
 */
export async function StudentWeekTimetable({
  locale,
  student,
}: {
  locale: string;
  student: { id: string; groupId: string | null; groupName: string | null; subjectGroupIds: string[] };
}) {
  const t = await getTranslations({ locale, namespace: "mySchedule" });
  const tShared = await getTranslations({ locale, namespace: "tests" });
  const DOW = tShared.raw("dow") as string[];

  const groupIds = [...new Set([...(student.groupId ? [student.groupId] : []), ...student.subjectGroupIds])];

  // This week's dates (Mon–Fri).
  const monday = new Date(getNow());
  const jsDay = monday.getDay();
  monday.setDate(monday.getDate() + (jsDay === 0 ? -6 : 1 - jsDay));
  const weekIso: Record<number, string> = {};
  for (let d = 1; d <= 5; d++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + (d - 1));
    weekIso[d] = localDateStr(dt);
  }
  const days = [1, 2, 3, 4, 5];
  const weekDates = days.map((d) => utcMidnight(weekIso[d]!));

  const [slots, periodsConfig, bell, specialDays, activities, ...plans] = await Promise.all([
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
    loadActivityIndex(weekIso[1]!, weekIso[5]!, [student.id]),
    // Each day's FINAL substitution plan (null until finalized)
    ...weekDates.map((d) => getDayOverrides(d)),
  ]);
  const meetings = buildDayMeetingMap(specialDays, weekDates);
  const dayTypes = buildDayTypeMap(specialDays, weekDates);
  const meetingOf = (d: number) => meetings.get(weekIso[d]!) ?? null;
  const typeOf = (d: number) => dayTypes.get(weekIso[d]!) ?? null;
  const rowsOn = (d: number) => rowsForDay(periodsConfig[d] ?? 7, meetingOf(d));

  const entriesOn = (d: number): PlanEntryLite[] =>
    (plans[d - 1]?.entries ?? [])
      .filter((e) => e.groupId == null || groupIds.includes(e.groupId))
      .map((e) => ({
        kind: e.kind,
        period: e.period,
        groupId: e.groupId,
        timetableSlotId: e.timetableSlotId,
        substituteName: e.substituteStaff?.scheduleName ?? null,
        newRoom: e.newRoom,
      }));
  const dayEntries = new Map(days.map((d) => [d, entriesOn(d)]));

  // Homegroup slots first, subject-group slots override the same cell.
  type Slot = (typeof slots)[number] & { isSubjectGroup?: boolean };
  const grid = new Map<number, Slot>();
  for (const s of slots.filter((s) => s.groupId === student.groupId)) grid.set(s.dayOfWeek * 100 + s.period, s);
  for (const s of slots.filter((s) => s.groupId !== student.groupId)) {
    grid.set(s.dayOfWeek * 100 + s.period, { ...s, isSubjectGroup: true });
  }

  const teacherName = (s: Slot) => s.staff?.scheduleName ?? s.staffName ?? s.staff?.user?.name ?? null;
  const changeText = (c: LessonChange) =>
    c.kind === "substitute" && c.substituteName ? `${t("substituteLabel")}: ${c.substituteName}` : t(c.kind);

  const allPeriods = Array.from({ length: Math.max(...days.map(rowsOn)) }, (_, i) => i + 1);
  const dayKind = (d: number) => {
    const type = typeOf(d);
    if (type === "EXCURSION") return t("excursion");
    if (isHolidayType(type)) return t("holiday");
    const m = meetingOf(d);
    if (m) return m.mode === "insert" ? t("intercalaryDay") : t("homegroupPeriod");
    return bell.days[d] === "eight" ? t("eightDay") : t("sevenDay");
  };

  // Highlight today's column (no highlight on weekends)
  const todayDow = getNow().getDay();
  const isWeekday = todayDow >= 1 && todayDow <= 5;

  // Today's changes, in period order, for the list on top
  const todayChanges: { period: number; course: string | null; text: string }[] = [];
  if (isWeekday && typeOf(todayDow) !== "EXCURSION" && !isHolidayType(typeOf(todayDow))) {
    const meeting = meetingOf(todayDow);
    for (let p = 1; p <= rowsOn(todayDow); p++) {
      if (isMeetingRow(p, meeting)) continue;
      const stored = storedPeriodAt(p, meeting);
      const slot = grid.get(todayDow * 100 + stored);
      const change = slot ? changeForLesson(dayEntries.get(todayDow)!, { id: slot.id, groupId: slot.groupId, period: stored }) : null;
      const activity = activityForAbsence(activities, student.id, weekIso[todayDow]!, stored);
      if (change || activity) {
        todayChanges.push({
          period: p,
          course: slot?.course.name ?? null,
          text: [activity && t("activity", { name: activity }), change && changeText(change), change?.newRoom && t("room", { room: change.newRoom })]
            .filter(Boolean)
            .join(" · "),
        });
      }
    }
  }

  if (grid.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <CalendarDays className="w-12 h-12 mb-3 opacity-30" />
        <p>{t("noTimetable")}</p>
      </div>
    );
  }

  const todayType = isWeekday ? typeOf(todayDow) : null;

  return (
    <div className="space-y-5">
      {isWeekday && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              {t("todayChanges")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1.5 text-sm">
            {todayType === "EXCURSION" ? (
              <p className="text-blue-700 font-medium">{t("excursionToday")}</p>
            ) : isHolidayType(todayType) ? (
              <p className="text-slate-500">{t("holidayToday")}</p>
            ) : todayChanges.length === 0 ? (
              <p className="text-slate-500">{t("noChangesToday")}</p>
            ) : (
              todayChanges.map((c) => (
                <p key={c.period} className="flex gap-2">
                  <span className="w-8 flex-shrink-0 font-bold text-slate-400">{periodLabel(c.period, locale)}</span>
                  <span>
                    {c.course && <span className="font-medium text-slate-900">{c.course} — </span>}
                    <span className="text-sky-700 font-medium">{c.text}</span>
                  </span>
                </p>
              ))
            )}
            {meetingOf(todayDow) && todayType !== "EXCURSION" && (
              <p className="text-purple-700">{meetingOf(todayDow)!.mode === "insert" ? t("intercalaryDay") : t("homegroupPeriod")}</p>
            )}
            <p className="pt-1 text-xs text-slate-400">{t("changesNote")}</p>
          </CardContent>
        </Card>
      )}

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
                      d === todayDow ? "text-emerald-700 bg-emerald-50/70" : "text-slate-500",
                    )}
                  >
                    {DOW[d]}
                    {d === todayDow && <span className="ml-1 text-emerald-500">●</span>}
                    <span
                      className={cn(
                        "block mt-0.5 text-[10px] font-normal normal-case tracking-normal",
                        typeOf(d) === "EXCURSION" ? "text-blue-600" : meetingOf(d) ? "text-purple-600" : "text-slate-400",
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
                  <td className="px-3 py-2 text-xs font-bold text-slate-400 align-top">{periodLabel(p, locale)}</td>
                  {days.map((d) => {
                    const isToday = d === todayDow;
                    const todayBg = isToday ? "bg-emerald-50/40" : undefined;
                    const meeting = meetingOf(d);
                    if (p > rowsOn(d)) return <td key={d} className={cn("px-3 py-2", isToday ? "bg-emerald-50/40" : "bg-slate-50/60")} />;
                    // Excursion / holiday: no lessons that day
                    const type = typeOf(d);
                    if (type === "EXCURSION" || isHolidayType(type)) {
                      return (
                        <td key={d} className={cn("px-1.5 py-1.5 align-top", type === "EXCURSION" ? "bg-blue-50/40" : "bg-slate-50/60")}>
                          {p === 1 && (
                            <p className={cn("text-xs font-medium", type === "EXCURSION" ? "text-blue-700" : "text-slate-400")}>
                              {type === "EXCURSION" ? t("excursion") : t("holiday")}
                            </p>
                          )}
                        </td>
                      );
                    }
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
                            {student.groupName && <p className="text-[11px] text-purple-600 mt-0.5">{student.groupName}</p>}
                          </div>
                        </td>
                      );
                    }
                    // Lessons keep their stored period; on an inserted day they show one row later.
                    const stored = storedPeriodAt(p, meeting);
                    const slot = grid.get(d * 100 + stored);
                    const activity = activityForAbsence(activities, student.id, weekIso[d]!, stored);
                    const activityLine = activity && (
                      <p className="text-[11px] text-violet-700 font-medium mt-0.5">{t("activity", { name: activity })}</p>
                    );
                    if (!slot) {
                      return (
                        <td key={d} className={cn("px-1.5 py-1.5 align-top", todayBg)}>
                          {timeLine}
                          {activityLine}
                        </td>
                      );
                    }
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
                    const change = changeForLesson(dayEntries.get(d)!, { id: slot.id, groupId: slot.groupId, period: stored });
                    const room = change?.newRoom ?? slot.room;
                    return (
                      <td key={d} className={cn("px-1.5 py-1.5 align-top", todayBg)}>
                        {timeLine}
                        <div
                          className={cn(
                            "rounded-lg px-2 py-1.5 border",
                            activity
                              ? "border-violet-200 bg-violet-50"
                              : change
                                ? "border-sky-200 bg-sky-50"
                                : "border-slate-100 bg-slate-50/80",
                          )}
                        >
                          <p
                            className={cn(
                              "font-medium text-xs leading-snug",
                              change?.kind === "released" ? "text-slate-400 line-through" : "text-slate-900",
                            )}
                          >
                            {slot.course.name}
                          </p>
                          {change ? (
                            <p className="text-[11px] text-sky-700 font-medium mt-0.5">{changeText(change)}</p>
                          ) : (
                            teacherName(slot) && <p className="text-[11px] text-slate-500 mt-0.5">{teacherName(slot)}</p>
                          )}
                          {activityLine}
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {slot.isSubjectGroup && <span className="text-indigo-500 font-medium">{slot.group.name}</span>}
                            {slot.isSubjectGroup && room && " · "}
                            {room && (
                              <span className={cn(change?.newRoom && "text-sky-700 font-medium")}>{t("room", { room })}</span>
                            )}
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
    </div>
  );
}
