import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import type { Role } from "@/generated/prisma/client";
import { getNow, utcMidnight, fmtDisplayDate } from "@/lib/dates";
import { profileIncomplete } from "@/lib/profile";
import { getSpecialDayForDate, getOnDutyDeputies, getHomegroupMeetingForDate } from "@/lib/calendar";
import { rowsForDay, storedPeriodAt, isMeetingRow, isLessonCancelled } from "@/lib/homegroupPeriod";
import { getHomegroupOptions, ownHomegroups } from "@/server/homegroupPeriod";
import { getPeriodsPerDay } from "@/lib/schoolConfig";
import { HomegroupPicker } from "@/components/attendance/HomegroupPicker";
import { getDayOverrides } from "@/server/substitutions";
import { getActiveAnnouncements } from "@/server/announcements";
import { AnnouncementsCard } from "@/components/announcements/AnnouncementsCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, CalendarRange, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { groupByPeriod } from "@/lib/periods";
import { getTranslations } from "next-intl/server";
import { RefreshAfterAttendance } from "@/components/attendance/RefreshAfterAttendance";

function resolveFirstName(...candidates: (string | null | undefined)[]): string {
  for (const raw of candidates) {
    if (!raw) continue;
    if (raw.includes("@")) continue; // skip email-looking values
    const first = raw.trim().split(/\s+/)[0];
    if (first) return first;
  }
  // last resort: use the local part of the first email-looking candidate
  for (const raw of candidates) {
    if (raw?.includes("@")) return raw.split("@")[0]!;
  }
  return "";
}

export default async function TeacherDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);

  const t = await getTranslations("dashboard");

  const staff = await db.staffProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      homeroomGroups: { select: { id: true, name: true } },
      homeroomHeadGroups: { select: { id: true, name: true } },
      user: { select: { name: true, nameEl: true, firstName: true, lastName: true } },
    },
  });
  if (!staff && (session.user.role as Role) === "TEACHER") redirect(`/${locale}/teacher/setup`);
  // Staff must complete their profile on first sign-in — keep the completion
  // form forced until name, phone, department AND ΠΜΠ are all filled.
  // (Portal-wide enforcement lives in <ProfileGuard/>; this redirect just
  // lands first-time sign-ins on the right page.)
  if (
    staff &&
    profileIncomplete({
      pmp: staff.pmp,
      phone: staff.phone,
      department: staff.department,
      firstName: staff.user?.firstName ?? null,
      lastName: staff.user?.lastName ?? null,
    })
  ) {
    redirect(`/${locale}/teacher/profile?required=1`);
  }

  const homeroomGroup = staff
    ? ([...(staff.homeroomGroups ?? []), ...(staff.homeroomHeadGroups ?? [])].find(Boolean) ?? null)
    : null;

  const now = getNow();
  const todayDow = now.getDay();
  const isWeekend = todayDow === 0 || todayDow === 6;
  const today = utcMidnight();

  const todaySpecialDay = !isWeekend ? await getSpecialDayForDate(today) : null;
  const isTodayExcursion = todaySpecialDay === "EXCURSION";

  // «Υπευθυνότητα Τμήματος» today: inserted (Εμβόλιμη) or replacing a period.
  const meeting = !isWeekend ? await getHomegroupMeetingForDate(today) : null;
  const myHomegroups = ownHomegroups(staff);

  const [allSlots, markedRaw, meetingMarkedRows, excursionMarkedRow, todayActivitiesRaw, homegroupOptions] = await Promise.all([
    staff
      ? db.timetableSlot.findMany({
          where: { staffId: staff.id },
          include: { course: true, group: true },
          orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
        })
      : Promise.resolve([]),
    staff && !isWeekend && !isTodayExcursion
      ? db.attendance.findMany({
          where: { date: today, timetableSlot: { staffId: staff.id } },
          select: { timetableSlotId: true },
          distinct: ["timetableSlotId"],
        })
      : Promise.resolve([]),
    meeting && myHomegroups.length > 0
      ? db.attendance.findMany({
          where: { intercalaryGroupId: { in: myHomegroups.map((g) => g.id) }, intercalaryPeriod: meeting.period, date: today },
          select: { intercalaryGroupId: true },
          distinct: ["intercalaryGroupId"],
        })
      : Promise.resolve([]),
    isTodayExcursion && homeroomGroup
      ? db.attendance.findFirst({
          where: { intercalaryGroupId: homeroomGroup.id, intercalaryPeriod: 1, date: today },
          select: { id: true },
        })
      : Promise.resolve(null),
    // Today's activities, with each participant's group memberships — so we can
    // surface only the ones whose students this teacher actually teaches today.
    staff && !isWeekend
      ? db.activity.findMany({
          where: { date: today },
          include: {
            participants: {
              include: {
                student: {
                  include: {
                    user: { select: { name: true } },
                    group: { select: { id: true, name: true } },
                    subjectGroups: { select: { groupId: true } },
                  },
                },
              },
            },
          },
          orderBy: { startPeriod: "asc" },
        })
      : Promise.resolve([]),
    meeting && myHomegroups.length === 0 ? getHomegroupOptions() : Promise.resolve([]),
  ]);

  const todaySlots = allSlots.filter((s) => s.dayOfWeek === todayDow);
  const markedSlotIds = new Set(markedRaw.map((r) => r.timetableSlotId));

  // Substitution overrides for today (finalized plan only): lessons I cover
  // and my own lessons that are covered/released. Study-hall groups are NOT
  // injected into anyone's schedule — headteachers get a dedicated card
  // listing every group per period that needs attendance taken.
  const overrides = staff && !isWeekend ? await getDayOverrides(today) : null;
  const coverByPeriod = new Map<number, NonNullable<typeof overrides>["entries"][number]>();
  const absentByPeriod = new Map<number, NonNullable<typeof overrides>["entries"][number]>();
  if (overrides && staff) {
    for (const e of overrides.forSubstitute(staff.id)) {
      if (e.period != null) coverByPeriod.set(e.period, e);
    }
    for (const e of overrides.forAbsent(staff.id)) {
      if (e.period != null) absentByPeriod.set(e.period, e);
    }
  }
  const meetingMarked = new Set(meetingMarkedRows.map((r) => r.intercalaryGroupId));
  const excursionMarked = excursionMarkedRow !== null;

  // Every period of the school day (Settings → periods per day), not just up
  // to the teacher's last lesson; plus the homegroup period when inserted.
  const periodsConfig = await getPeriodsPerDay();
  const dayLength = Math.max(periodsConfig[todayDow] ?? 7, ...todaySlots.map((s) => s.period));
  const maxPeriod = isWeekend ? 0 : rowsForDay(dayLength, meeting);

  const slotsByPeriod = groupByPeriod(todaySlots);

  // Today's activities relevant to me: those with a participant I teach today
  // (in any group I have a lesson with today). Each shows my affected students.
  const teacherTodayGroupIds = new Set(todaySlots.map((s) => s.groupId));
  const relevantActivities = todayActivitiesRaw
    .map((a) => ({
      id: a.id,
      name: a.name,
      startPeriod: a.startPeriod,
      endPeriod: a.endPeriod,
      location: a.location,
      affected: a.participants.filter((p) => {
        const ids = [p.student.groupId, ...p.student.subjectGroups.map((sg) => sg.groupId)].filter(
          Boolean
        ) as string[];
        return ids.some((gid) => teacherTodayGroupIds.has(gid));
      }),
    }))
    .filter((r) => r.affected.length > 0);

  const dateLabel = fmtDisplayDate(now);

  // On-duty deputies for today + active announcements (pushed by management;
  // composed under Ειδοποιήσεις, shown read-only here).
  const [onDuty, announcements] = await Promise.all([
    isWeekend ? Promise.resolve([]) : getOnDutyDeputies(today),
    getActiveAnnouncements(today),
  ]);

  return (
    <div className="space-y-6">
      <RefreshAfterAttendance />
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          {t("welcome", { name: resolveFirstName(staff?.user?.nameEl, staff?.user?.name, session.user?.name) })}
        </h2>
        <p className="text-slate-500 mt-1">{dateLabel}</p>
      </div>

      <AnnouncementsCard announcements={announcements} />

      {allSlots.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {t("noTimetableSlots")}
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("todaySchedule")}</CardTitle>
              <Link
                href={`/${locale}/teacher/attendance/schedule`}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                {t("fullWeek")}
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isWeekend ? (
              <p className="px-5 py-6 text-sm text-slate-400">{t("noSchoolToday")}</p>
            ) : isTodayExcursion ? (
              <div className="divide-y divide-slate-50">
                {homeroomGroup ? (
                  <Link
                    href={`/${locale}/teacher/attendance/mark?groupId=${homeroomGroup.id}&period=1&excursion=1`}
                    className={`flex items-center gap-4 px-5 py-3 transition-colors hover:bg-blue-50/40 ${excursionMarked ? "bg-blue-50/30" : ""}`}
                  >
                    <span className="w-5 flex-shrink-0 text-center text-sm font-bold text-blue-300">1</span>
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-blue-900">{homeroomGroup.name}</span>
                      <span className="text-xs text-blue-400">{t("excursion")}</span>
                    </div>
                    {excursionMarked ? (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-blue-500" />
                    ) : (
                      <span className="text-xs font-medium text-blue-600 flex-shrink-0">{t("markAttendance")}</span>
                    )}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-5 py-4 text-sm text-blue-500">
                    <span>{t("excursion")}</span>
                  </div>
                )}
              </div>
            ) : maxPeriod === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">{t("noTimetableSlots")}</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((period) => {
                  // «Υπευθυνότητα Τμήματος»: own homegroups + any other via the picker
                  if (meeting && isMeetingRow(period, meeting)) {
                    return (
                      <div key={period} className="flex items-start gap-4 px-5 py-3 bg-purple-50/30">
                        <span className="w-5 flex-shrink-0 text-center text-sm font-bold text-purple-300 pt-1">
                          {period}
                        </span>
                        <div className="flex-1 min-w-0 space-y-2">
                          <p className="text-sm font-medium text-purple-900">{t("homegroupPeriod")}</p>
                          {myHomegroups.map((g) => (
                            <Link
                              key={g.id}
                              href={`/${locale}/teacher/attendance/mark?groupId=${g.id}&period=${meeting.period}&intercalary=1`}
                              className="flex items-center gap-2 rounded-lg border border-purple-200 bg-white px-3 py-2 hover:border-purple-400 transition-colors"
                            >
                              <span className="text-sm font-medium text-purple-900">{g.name}</span>
                              <span className="ml-auto">
                                {meetingMarked.has(g.id) ? (
                                  <CheckCircle2 className="w-4 h-4 text-purple-500" />
                                ) : (
                                  <span className="text-xs font-medium text-purple-600">{t("markAttendance")}</span>
                                )}
                              </span>
                            </Link>
                          ))}
                          {/* Teachers without a homegroup may take any homegroup's register */}
                          {myHomegroups.length === 0 && (
                            <HomegroupPicker locale={locale} period={meeting.period} groups={homegroupOptions} />
                          )}
                        </div>
                      </div>
                    );
                  }

                  // Lessons keep their timetable period; on an inserted day the
                  // rows after the meeting show the lesson one period earlier.
                  const dbPeriod = storedPeriodAt(period, meeting);
                  // Every lesson of this period (combined groups can share one),
                  // each on its own row.
                  const periodSlots = slotsByPeriod.get(dbPeriod) ?? [];
                  const renderRow = (slot: (typeof todaySlots)[number] | undefined, rowKey: string | number) => {
                    const marked = slot ? markedSlotIds.has(slot.id) : false;

                    // Replaced by the homegroup period: no lesson today
                    if (slot && isLessonCancelled(dbPeriod, meeting)) {
                      return (
                        <div key={rowKey} className="flex items-center gap-4 px-5 py-3 opacity-60">
                          <span className="w-5 flex-shrink-0 text-center text-sm font-semibold text-slate-300">
                            {period}
                          </span>
                          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-slate-500 line-through">{slot.course.name}</span>
                            <span className="text-sm text-slate-400">{slot.group.name}</span>
                            <span className="text-xs font-medium text-purple-600">{t("cancelledHomegroup")}</span>
                          </div>
                        </div>
                      );
                    }

                    // My own lesson is covered/released today (I am absent)
                    const absence = absentByPeriod.get(dbPeriod);
                    if (slot && absence) {
                      return (
                        <div key={rowKey} className="flex items-center gap-4 px-5 py-3 opacity-60">
                          <span className="w-5 flex-shrink-0 text-center text-sm font-semibold text-slate-300">
                            {period}
                          </span>
                          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-slate-500 line-through">{slot.course.name}</span>
                            <span className="text-sm text-slate-400">{slot.group.name}</span>
                            <span className="text-xs font-medium text-amber-600">{t("coveredToday")}</span>
                          </div>
                        </div>
                      );
                    }

                    // A substitution assigned to me today
                    const assigned = coverByPeriod.get(dbPeriod);
                    if (!slot && assigned?.groupId) {
                      const isHall = assigned.kind === "STUDY_HALL";
                      return (
                        <Link
                          key={rowKey}
                          href={`/${locale}/teacher/attendance/mark?groupId=${assigned.groupId}&period=${assigned.period}`}
                          className="flex items-center gap-4 px-5 py-3 transition-colors bg-sky-50/40 hover:bg-sky-50"
                        >
                          <span className="w-5 flex-shrink-0 text-center text-sm font-bold text-sky-400">
                            {period}
                          </span>
                          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-900">
                              {assigned.timetableSlot?.course.name ?? t("substitution")}
                            </span>
                            <span className="text-sm text-slate-400">{assigned.group?.name}</span>
                            <span className="text-xs font-semibold text-sky-600">
                              {isHall ? t("studyHall") : t("substitution")}
                            </span>
                            {assigned.newRoom && (
                              <span className="text-xs text-slate-400 font-mono">{t("room", { room: assigned.newRoom })}</span>
                            )}
                          </div>
                          <span className="text-xs font-medium text-emerald-600 flex-shrink-0">
                            {t("markAttendance")}
                          </span>
                        </Link>
                      );
                    }

                    if (!slot) {
                      return (
                        <div key={rowKey} className="flex items-center gap-4 px-5 py-3">
                          <span className="w-5 flex-shrink-0 text-center text-sm font-semibold text-slate-200">
                            {period}
                          </span>
                          <span className="text-sm italic text-slate-300">{t("freePeriod")}</span>
                          {/* quiet entry to spontaneously cover a class this period */}
                          <Link
                            href={`/${locale}/teacher/attendance/mark?period=${dbPeriod}&claim=1`}
                            className="ml-auto text-xs text-slate-300 hover:text-emerald-600 transition-colors flex-shrink-0"
                          >
                            {t("claimCta")}
                          </Link>
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={rowKey}
                        href={`/${locale}/teacher/attendance/mark?groupId=${slot.groupId}&period=${slot.period}`}
                        className={`flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50 ${marked ? "bg-emerald-50/40" : ""}`}
                      >
                        <span className="w-5 flex-shrink-0 text-center text-sm font-bold text-slate-400">
                          {period}
                        </span>
                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-900">{slot.course.name}</span>
                          <span className="text-sm text-slate-400">{slot.group.name}</span>
                          {slot.room && (
                            <span className="text-xs text-slate-400 font-mono">{t("room", { room: slot.room })}</span>
                          )}
                        </div>
                        {marked ? (
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-500" />
                        ) : (
                          <span className="text-xs font-medium text-emerald-600 flex-shrink-0">
                            {t("markAttendance")}
                          </span>
                        )}
                      </Link>
                    );
                  };
                  if (periodSlots.length > 1) {
                    return <Fragment key={period}>{periodSlots.map((s) => renderRow(s, `${period}-${s.id}`))}</Fragment>;
                  }
                  return renderRow(periodSlots[0], period);
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Today's activities affecting my students */}
      {relevantActivities.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-emerald-800">
              <CalendarRange className="w-4 h-4" />
              {t("activitiesToday")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-emerald-100">
            {relevantActivities.map((a) => (
              <Link
                key={a.id}
                href={`/${locale}/teacher/activities/${a.id}`}
                className="block px-5 py-3 hover:bg-emerald-50/60 transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-900">{a.name}</span>
                  <span className="text-xs text-slate-500">
                    {a.startPeriod === a.endPeriod
                      ? `Περίοδος ${a.startPeriod}`
                      : `Περίοδοι ${a.startPeriod}–${a.endPeriod}`}
                  </span>
                  {a.location && <span className="text-xs text-slate-400">· {a.location}</span>}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {a.affected
                    .map((p) => `${p.student.user?.name}${p.student.group ? ` (${p.student.group.name})` : ""}`)
                    .join(", ")}
                </p>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Εφημερεύοντες Βοηθοί on duty today */}
      {!isWeekend && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-500" />
              {t("onDutyToday")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {onDuty.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {onDuty.map((d) => (
                  <Badge key={d.id} variant="secondary" className="text-sm">
                    {d.staffProfile.scheduleName ?? d.staffProfile.user?.name ?? "—"}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">{t("noDutyToday")}</p>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
