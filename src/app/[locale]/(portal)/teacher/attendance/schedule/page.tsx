import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma";
import { db } from "@/server/db";
import { getNow, utcMidnight, localDateStr, fmtDisplayDate } from "@/lib/dates";
import { getSpecialDaysInRange, buildDayTypeMap, buildDayMeetingPeriodMap, isHolidayType } from "@/lib/calendar";
import Link from "next/link";
import { CheckCircle2, ClipboardList, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

type Slot = {
  id: string;
  dayOfWeek: number;
  period: number;
  room: string | null;
  groupId: string;
  course: { name: string };
  group: { name: string };
};

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

export default async function TeacherSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { locale } = await params;
  const { week: weekParam } = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(`/${locale}/login`);

  const tNav = await getTranslations("nav");
  const t = await getTranslations("attendance");
  const tCommon = await getTranslations("common");
  const tCal = await getTranslations("calendar");

  const staff = await db.staffProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      homeroomGroups: { select: { id: true, name: true } },
      homeroomHeadGroups: { select: { id: true, name: true } },
    },
  });
  if (!staff && (session.user.role as Role) === "TEACHER") redirect(`/${locale}/teacher/setup`);

  const homeroomGroup = staff
    ? ([...(staff.homeroomGroups ?? []), ...(staff.homeroomHeadGroups ?? [])].find(Boolean) ?? null)
    : null;

  const now = getNow();
  const todayStr = localDateStr(now);
  const todayDow = now.getDay();

  const weekOffset = weekParam ? parseInt(weekParam) : 0;

  const baseMon = getMondayOfWeek(now);
  baseMon.setDate(baseMon.getDate() + weekOffset * 7);

  const dowToDateStr: Record<number, string> = {};
  for (let d = 1; d <= 5; d++) {
    const dt = new Date(baseMon);
    dt.setDate(baseMon.getDate() + (d - 1));
    dowToDateStr[d] = localDateStr(dt);
  }

  const weekStartStr = dowToDateStr[1]!;
  const weekEndStr   = dowToDateStr[5]!;
  const isFutureWeek = weekStartStr > todayStr;
  const isCurrentWeek = weekOffset === 0;

  function isPastOrToday(dow: number) {
    return (dowToDateStr[dow] ?? "") <= todayStr;
  }

  const slots: Slot[] = staff
    ? await db.timetableSlot.findMany({
        where: { staffId: staff.id },
        include: { course: true, group: true },
        orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
      })
    : [];

  const slotMap: Record<number, Record<number, Slot>> = {};
  for (const s of slots) {
    slotMap[s.dayOfWeek] ??= {};
    slotMap[s.dayOfWeek]![s.period] = s;
  }

  const weekDates = [1, 2, 3, 4, 5].map((d) => utcMidnight(dowToDateStr[d]!));
  const specialDays = await getSpecialDaysInRange(weekDates[0]!, weekDates[4]!);
  const dayTypeMap = buildDayTypeMap(specialDays, weekDates);
  const dayMeetingPeriodMap = buildDayMeetingPeriodMap(specialDays, weekDates);

  const hasIntercalary = dayMeetingPeriodMap.size > 0;
  const normalMax = slots.reduce((m, s) => Math.max(m, s.period), 0);
  let maxPeriod = normalMax;
  if (hasIntercalary) {
    for (const m of dayMeetingPeriodMap.values()) {
      maxPeriod = Math.max(maxPeriod, m);
    }
  }
  const periods = maxPeriod > 0 ? Array.from({ length: maxPeriod }, (_, i) => i + 1) : [];

  const markedSet = new Set<string>();
  const intercalaryMarkedDates = new Set<string>();
  const excursionMarkedDates = new Set<string>();

  const hasExcursion = weekDates.some(
    (d) => dayTypeMap.get(d.toISOString().slice(0, 10)) === "EXCURSION"
  );

  if (!isFutureWeek) {
    const weekStart = utcMidnight(weekStartStr);
    const weekEnd   = utcMidnight(isCurrentWeek ? todayStr : weekEndStr);

    const queries: Promise<void>[] = [];

    if (slots.length > 0) {
      queries.push(
        db.attendance.findMany({
          where: {
            date: { gte: weekStart, lte: weekEnd },
            timetableSlotId: { in: slots.map((s) => s.id) },
          },
          select: { timetableSlotId: true, date: true },
        }).then((existing) => {
          for (const e of existing) {
            markedSet.add(`${e.timetableSlotId}::${e.date.toISOString().slice(0, 10)}`);
          }
        })
      );
    }

    if (hasIntercalary && homeroomGroup) {
      const intercalaryDates = weekDates.filter(
        (d) => dayTypeMap.get(d.toISOString().slice(0, 10)) === "INTERCALARY"
      );
      if (intercalaryDates.length > 0) {
        const checks = intercalaryDates.map((d) => {
          const iso = d.toISOString().slice(0, 10);
          const mPeriod = dayMeetingPeriodMap.get(iso) ?? 8;
          return db.attendance.findFirst({
            where: { intercalaryGroupId: homeroomGroup.id, intercalaryPeriod: mPeriod, date: d },
            select: { date: true },
          }).then((row) => { if (row) intercalaryMarkedDates.add(iso); });
        });
        queries.push(...checks);
      }
    }

    if (hasExcursion && homeroomGroup) {
      const excursionDates = weekDates.filter(
        (d) => dayTypeMap.get(d.toISOString().slice(0, 10)) === "EXCURSION"
      );
      if (excursionDates.length > 0) {
        const checks = excursionDates.map((d) => {
          const iso = d.toISOString().slice(0, 10);
          return db.attendance.findFirst({
            where: { intercalaryGroupId: homeroomGroup.id, intercalaryPeriod: 1, date: d },
            select: { date: true },
          }).then((row) => { if (row) excursionMarkedDates.add(iso); });
        });
        queries.push(...checks);
      }
    }

    await Promise.all(queries);
  }

  // Finalized substitution assignments for me in this week → key "date:period"
  const subAssignments = new Map<
    string,
    { groupId: string; groupName: string; courseName: string | null; newRoom: string | null; isHall: boolean }
  >();
  if (staff) {
    // Study halls are NOT injected into anyone's grid — headteachers see them
    // on the dashboard card instead.
    const weekEntries = await db.substitutionPlanEntry.findMany({
      where: {
        plan: { status: "FINAL", date: { gte: utcMidnight(weekStartStr), lte: utcMidnight(weekEndStr) } },
        kind: { in: ["COVER", "SWAP"] },
        substituteStaffId: staff.id,
      },
      include: {
        plan: { select: { date: true } },
        group: { select: { id: true, name: true } },
        timetableSlot: { include: { course: { select: { name: true } } } },
      },
    });
    for (const e of weekEntries) {
      if (e.period == null || !e.group) continue;
      subAssignments.set(`${e.plan.date.toISOString().slice(0, 10)}:${e.period}`, {
        groupId: e.group.id,
        groupName: e.group.name,
        courseName: e.timetableSlot?.course.name ?? null,
        newRoom: e.newRoom,
        isHall: e.kind === "STUDY_HALL",
      });
    }
  }

  const weekLabel = `${fmtDisplayDate(weekStartStr + "T00:00:00.000Z")} – ${fmtDisplayDate(weekEndStr + "T00:00:00.000Z")}`;

  const prevWeekHref = `?week=${weekOffset - 1}`;
  const nextWeekHref = `?week=${weekOffset + 1}`;
  const currentWeekHref = "?week=0";

  // Day label lookup using translations
  const dayLabel = (dow: number) => t(`daysShort.${dow}` as Parameters<typeof t>[0]);

  if (slots.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">{tNav("timetable")}</h2>
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {t("noSlots")}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header + week navigation */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-slate-900">{tNav("timetable")}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-slate-500 text-sm">{weekLabel}</p>
            {!isCurrentWeek && (
              <Link
                href={currentWeekHref}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                {t("thisWeek")}
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Link
            href={prevWeekHref}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
            title={t("previousWeek")}
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <Link
            href={nextWeekHref}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
            title={t("nextWeek")}
          >
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {isFutureWeek && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
          {t("futureWeek")}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[520px] text-sm border-collapse">
          <thead>
            <tr>
              <th className="w-10 border-b border-slate-100 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400" />
              {([1, 2, 3, 4, 5] as const).map((dow) => {
                const dateStr = dowToDateStr[dow]!;
                const isToday = dateStr === todayStr;
                const past = isPastOrToday(dow);
                const [, mm, dd] = dateStr.split("-");
                const specialType = dayTypeMap.get(dateStr) ?? null;
                const isHoliday = isHolidayType(specialType);
                const isExcursion = specialType === "EXCURSION";
                const isIntercalary = specialType === "INTERCALARY";
                return (
                  <th
                    key={dow}
                    className={`border-b border-slate-100 px-3 py-3 text-center text-xs font-semibold ${
                      isHoliday
                        ? "bg-red-50 text-red-400"
                        : isExcursion
                        ? "bg-blue-50 text-blue-600"
                        : isToday
                        ? "bg-emerald-50 text-emerald-700"
                        : past
                        ? "text-slate-600"
                        : "text-slate-300"
                    }`}
                  >
                    <span className="uppercase tracking-wide">{dayLabel(dow)}</span>
                    <span className={`ml-1.5 text-[11px] font-normal ${isHoliday ? "text-red-300" : isToday ? "text-emerald-600" : past ? "text-slate-400" : "text-slate-300"}`}>
                      {dd}/{mm}
                    </span>
                    {isToday && !isHoliday && (
                      <span className="ml-1.5 inline-block rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none align-middle">
                        {tCommon("today")}
                      </span>
                    )}
                    {isHoliday && (
                      <span className="block mt-1 text-[10px] font-medium text-red-400 normal-case">
                        {tCal("holiday")}
                      </span>
                    )}
                    {isExcursion && (
                      <span className="block mt-1 text-[10px] font-medium text-blue-500 normal-case">
                        {tCal("excursion")}
                      </span>
                    )}
                    {isIntercalary && (
                      <span className="block mt-1 text-[10px] font-medium text-purple-500 normal-case">
                        {tCal("intercalary")}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-2 text-center align-top text-xs font-semibold text-slate-400">
                  {period}
                </td>
                {([1, 2, 3, 4, 5] as const).map((dow) => {
                  const dateStr = dowToDateStr[dow]!;
                  const isToday = dateStr === todayStr;
                  const past = isPastOrToday(dow);
                  const specialType = dayTypeMap.get(dateStr) ?? null;
                  const isHoliday = isHolidayType(specialType);
                  const isDayIntercalary = specialType === "INTERCALARY";
                  const isDayExcursion = specialType === "EXCURSION";
                  const canMark = past && !isFutureWeek && !isHoliday;

                  // On intercalary days the meeting period is inserted, shifting slots below it down by 1
                  const meetingPeriod = dayMeetingPeriodMap.get(dateStr);
                  const dbPeriod =
                    isDayIntercalary && meetingPeriod !== undefined && period > meetingPeriod
                      ? period - 1
                      : period;
                  const slot =
                    isDayIntercalary && meetingPeriod === period
                      ? undefined
                      : slotMap[dow]?.[dbPeriod];

                  const marked = slot ? markedSet.has(`${slot.id}::${dateStr}`) : false;

                  // Intercalary meeting row — homegroup teachers can mark attendance here
                  if (period === meetingPeriod && isDayIntercalary && homeroomGroup) {
                    const intercalaryMarked = intercalaryMarkedDates.has(dateStr);
                    return (
                      <td key={dow} className={`px-2 py-2 align-top ${isToday && isCurrentWeek ? "bg-emerald-50/30" : ""}`}>
                        {canMark ? (
                          <Link
                            href={`/${locale}/teacher/attendance/mark?groupId=${homeroomGroup.id}&period=${meetingPeriod}&date=${dateStr}&intercalary=1`}
                            className="group block"
                          >
                            <div className={`rounded-lg px-3 py-2.5 border ${
                              intercalaryMarked
                                ? "border-purple-200 bg-purple-50"
                                : "border-purple-200 bg-purple-50/50 group-hover:border-purple-300"
                            }`}>
                              <p className="text-xs font-semibold leading-snug text-purple-900">{homeroomGroup.name}</p>
                              <p className="mt-0.5 text-xs text-purple-500">{tCal("intercalary")}</p>
                              <div className="mt-1.5 flex items-center gap-1">
                                {intercalaryMarked ? (
                                  <><CheckCircle2 className="w-3 h-3 text-purple-600" /><span className="text-xs font-medium text-purple-600">{t("done")}</span></>
                                ) : (
                                  <><ClipboardList className="w-3 h-3 text-purple-500" /><span className="text-xs font-medium text-purple-600">{t("mark")}</span></>
                                )}
                              </div>
                            </div>
                          </Link>
                        ) : (
                          <div className="rounded-lg px-3 py-2.5 border border-purple-100 bg-purple-50/30 opacity-40">
                            <p className="text-xs font-semibold leading-snug text-purple-800">{homeroomGroup.name}</p>
                            <p className="mt-0.5 text-xs text-purple-400">{tCal("intercalary")}</p>
                          </div>
                        )}
                      </td>
                    );
                  }

                  // Non-homegroup teachers see a passive indicator at the intercalary row
                  if (period === meetingPeriod && isDayIntercalary) {
                    return (
                      <td key={dow} className={`px-2 py-2 align-top ${isToday && isCurrentWeek ? "bg-emerald-50/30" : ""}`}>
                        <div className="rounded-lg px-3 py-2 border border-purple-100 bg-purple-50/20">
                          <p className="text-xs text-purple-400 text-center">{tCal("intercalary")}</p>
                        </div>
                      </td>
                    );
                  }

                  // Excursion day — normal schedule is suspended
                  if (isDayExcursion) {
                    const excursionMarked = excursionMarkedDates.has(dateStr);
                    // Period 1: homegroup teachers mark attendance; others see a passive indicator
                    if (period === 1 && homeroomGroup) {
                      return (
                        <td key={dow} className={`px-2 py-2 align-top ${isToday && isCurrentWeek ? "bg-blue-50/30" : ""}`}>
                          {canMark ? (
                            <Link
                              href={`/${locale}/teacher/attendance/mark?groupId=${homeroomGroup.id}&period=1&date=${dateStr}&excursion=1`}
                              className="group block"
                            >
                              <div className={`rounded-lg px-3 py-2.5 border ${
                                excursionMarked
                                  ? "border-blue-200 bg-blue-50"
                                  : "border-blue-200 bg-blue-50/50 group-hover:border-blue-300"
                              }`}>
                                <p className="text-xs font-semibold leading-snug text-blue-900">{homeroomGroup.name}</p>
                                <p className="mt-0.5 text-xs text-blue-500">{tCal("excursion")}</p>
                                <div className="mt-1.5 flex items-center gap-1">
                                  {excursionMarked ? (
                                    <><CheckCircle2 className="w-3 h-3 text-blue-600" /><span className="text-xs font-medium text-blue-600">{t("done")}</span></>
                                  ) : (
                                    <><ClipboardList className="w-3 h-3 text-blue-500" /><span className="text-xs font-medium text-blue-600">{t("mark")}</span></>
                                  )}
                                </div>
                              </div>
                            </Link>
                          ) : (
                            <div className="rounded-lg px-3 py-2.5 border border-blue-100 bg-blue-50/30 opacity-40">
                              <p className="text-xs font-semibold leading-snug text-blue-800">{homeroomGroup.name}</p>
                              <p className="mt-0.5 text-xs text-blue-400">{tCal("excursion")}</p>
                            </div>
                          )}
                        </td>
                      );
                    }
                    // Period 1 for non-homegroup teacher, or any other period: dimmed excursion cell
                    return (
                      <td key={dow} className="px-2 py-2 align-top bg-blue-50/10">
                        {period === 1 && (
                          <div className="rounded-lg px-3 py-2 border border-blue-100 bg-blue-50/20">
                            <p className="text-xs text-blue-400 text-center">{tCal("excursion")}</p>
                          </div>
                        )}
                      </td>
                    );
                  }

                  if (isHoliday) {
                    return (
                      <td key={dow} className="px-2 py-2 align-top bg-red-50/30">
                        {slot && (
                          <div className="rounded-lg px-3 py-2.5 border border-red-100 bg-red-50/40 opacity-40">
                            <p className="text-xs font-semibold leading-snug text-slate-400">{slot.course.name}</p>
                            <p className="mt-0.5 text-xs text-slate-400">{slot.group.name}</p>
                          </div>
                        )}
                      </td>
                    );
                  }

                  // A substitution/study-hall assigned to me this date+period
                  const assignment = !slot ? subAssignments.get(`${dateStr}:${period}`) : undefined;
                  if (assignment) {
                    return (
                      <td key={dow} className={`px-2 py-2 align-top ${isToday && isCurrentWeek ? "bg-emerald-50/30" : ""}`}>
                        {canMark ? (
                          <Link
                            href={`/${locale}/teacher/attendance/mark?groupId=${assignment.groupId}&period=${period}&date=${dateStr}`}
                            className="group block"
                          >
                            <div className="rounded-lg px-3 py-2.5 border border-sky-200 bg-sky-50 group-hover:border-sky-400">
                              <p className="text-xs font-semibold leading-snug text-slate-900">
                                {assignment.courseName ?? assignment.groupName}
                              </p>
                              <p className="mt-0.5 text-xs text-sky-600 font-medium">
                                {assignment.isHall ? "Φ/δι" : t("substitutionBadge")} · {assignment.groupName}
                              </p>
                              {assignment.newRoom && (
                                <p className="text-xs text-slate-400">Room {assignment.newRoom}</p>
                              )}
                              <div className="mt-1.5 flex items-center gap-1">
                                <ClipboardList className="w-3 h-3 text-sky-500" />
                                <span className="text-xs font-medium text-sky-600">{t("mark")}</span>
                              </div>
                            </div>
                          </Link>
                        ) : (
                          <div className="rounded-lg px-3 py-2.5 border border-sky-100 bg-sky-50/40">
                            <p className="text-xs font-semibold leading-snug text-slate-700">
                              {assignment.courseName ?? assignment.groupName}
                            </p>
                            <p className="mt-0.5 text-xs text-sky-500">
                              {assignment.isHall ? "Φ/δι" : t("substitutionBadge")} · {assignment.groupName}
                            </p>
                          </div>
                        )}
                      </td>
                    );
                  }

                  const cellContent = slot ? (
                    <div
                      className={`rounded-lg px-3 py-2.5 ${
                        canMark
                          ? marked
                            ? "border border-emerald-200 bg-emerald-50"
                            : isToday
                            ? "border border-emerald-300 bg-emerald-50 group-hover:border-emerald-400"
                            : "border border-amber-100 bg-amber-50/60 group-hover:border-amber-300"
                          : "border border-slate-100 bg-slate-50 opacity-40"
                      }`}
                    >
                      <p className="text-xs font-semibold leading-snug text-slate-900">{slot.course.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{slot.group.name}</p>
                      {slot.room && <p className="text-xs text-slate-400">Room {slot.room}</p>}
                      {canMark && marked && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span className="text-xs font-medium text-emerald-600">{t("done")}</span>
                        </div>
                      )}
                      {canMark && !marked && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <ClipboardList className={`w-3 h-3 ${isToday ? "text-emerald-500" : "text-amber-500"}`} />
                          <span className={`text-xs font-medium ${isToday ? "text-emerald-600" : "text-amber-600"}`}>
                            {isToday ? t("mark") : t("fillIn")}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : null;

                  return (
                    <td
                      key={dow}
                      className={`px-2 py-2 align-top ${isToday && isCurrentWeek ? "bg-emerald-50/30" : ""}`}
                    >
                      {slot && canMark ? (
                        <Link
                          href={`/${locale}/teacher/attendance/mark?groupId=${slot.groupId}&period=${slot.period}&date=${dateStr}`}
                          className="group block"
                        >
                          {cellContent}
                        </Link>
                      ) : (
                        cellContent
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
