import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getNow, utcMidnight } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { StudentList, type DayRow } from "./StudentList";
import { getPeriodsPerDay, periodsForDow } from "@/lib/schoolConfig";
import { getTranslations } from "next-intl/server";

export default async function TeacherLocatePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ groupId?: string; grade?: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const t = await getTranslations("locate");

  const { groupId, grade } = await searchParams;

  const now = getNow();

  const gradeNum = grade ? parseInt(grade) : undefined;

  const today = utcMidnight(now);
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const schoolDow = isWeekend ? 1 : dayOfWeek;

  const periodsConfig = await getPeriodsPerDay();
  const todayPeriods = periodsForDow(periodsConfig, schoolDow);
  const maxPeriod = todayPeriods.length;

  const startHour = 8;
  const minutesSinceStart = (now.getHours() - startHour) * 60 + now.getMinutes();
  const currentPeriod = Math.min(maxPeriod, Math.max(1, Math.ceil(minutesSinceStart / 45)));

  // Homeroom groups only
  const homeroomGroups = gradeNum
    ? await db.group.findMany({
        where: { grade: gradeNum, students: { some: {} } },
        orderBy: [{ grade: "asc" }, { name: "asc" }],
      })
    : [];

  // Students in selected group
  const students = groupId
    ? await db.studentProfile.findMany({
        where: { groupId, user: { isActive: true } },
        include: {
          user: { select: { name: true } },
          attendance: {
            where: { date: today, timetableSlot: { period: { lte: currentPeriod } } },
            include: { timetableSlot: { select: { period: true } } },
          },
        },
        orderBy: { user: { name: "asc" } },
      })
    : [];

  // Per-student, per-period attendance map
  const periodAttendance: Record<string, Record<number, string>> = {};
  for (const s of students) {
    periodAttendance[s.id] = {};
    for (const a of s.attendance) {
      periodAttendance[s.id]![a.timetableSlot?.period ?? a.intercalaryPeriod ?? 0] = a.status;
    }
  }

  // Activity and schedule data — pre-fetched for all students so client expand is instant
  const activityPeriodSets: Record<string, Set<number>> = {};
  const schedules: Record<string, DayRow[]> = {};

  if (students.length > 0 && !isWeekend) {
    const studentIds = students.map((s) => s.id);

    const [subjectEnrollments, dayActivities] = await Promise.all([
      db.studentGroup.findMany({
        where: { studentProfileId: { in: studentIds } },
        select: { studentProfileId: true, groupId: true },
      }),
      db.activity.findMany({
        where: { date: today, participants: { some: { studentId: { in: studentIds } } } },
        include: { participants: { select: { studentId: true } } },
        orderBy: { startPeriod: "asc" },
      }),
    ]);

    for (const act of dayActivities) {
      for (const p of act.participants) {
        if (!activityPeriodSets[p.studentId]) activityPeriodSets[p.studentId] = new Set();
        for (let period = act.startPeriod; period <= act.endPeriod; period++) {
          activityPeriodSets[p.studentId]!.add(period);
        }
      }
    }

    const allGroupIds = [
      ...new Set([
        ...students.map((s) => s.groupId).filter(Boolean),
        ...subjectEnrollments.map((e) => e.groupId),
      ]),
    ] as string[];

    const daySlots = allGroupIds.length > 0
      ? await db.timetableSlot.findMany({
          where: { groupId: { in: allGroupIds }, dayOfWeek: schoolDow },
          include: {
            course: { select: { name: true } },
            staff: { include: { user: { select: { name: true } } } },
          },
        })
      : [];

    const slotsByGroup: Record<string, typeof daySlots> = {};
    for (const slot of daySlots) {
      if (!slotsByGroup[slot.groupId]) slotsByGroup[slot.groupId] = [];
      slotsByGroup[slot.groupId]!.push(slot);
    }

    const subjectsByStudent: Record<string, string[]> = {};
    for (const e of subjectEnrollments) {
      if (!subjectsByStudent[e.studentProfileId]) subjectsByStudent[e.studentProfileId] = [];
      subjectsByStudent[e.studentProfileId]!.push(e.groupId);
    }

    const actByPeriodByStudent: Record<string, Record<number, string>> = {};
    for (const act of dayActivities) {
      for (const p of act.participants) {
        if (!actByPeriodByStudent[p.studentId]) actByPeriodByStudent[p.studentId] = {};
        for (let period = act.startPeriod; period <= act.endPeriod; period++) {
          actByPeriodByStudent[p.studentId]![period] = act.name;
        }
      }
    }

    for (const s of students) {
      const periodMap: Record<number, typeof daySlots[0]> = {};
      for (const slot of slotsByGroup[s.groupId ?? ""] ?? []) periodMap[slot.period] = slot;
      for (const gId of subjectsByStudent[s.id] ?? []) {
        for (const slot of slotsByGroup[gId] ?? []) periodMap[slot.period] = slot;
      }
      const actByPeriod = actByPeriodByStudent[s.id] ?? {};
      schedules[s.id] = todayPeriods.map((p) => ({
        period: p,
        courseName: periodMap[p]?.course.name ?? null,
        room: periodMap[p]?.room ?? null,
        staffName: periodMap[p]?.staffName ?? periodMap[p]?.staff?.user?.name ?? null,
        isActivity: !!actByPeriod[p],
        activityName: actByPeriod[p],
      }));
    }
  }

  // Serialize Sets → arrays for client component
  const activityPeriods: Record<string, number[]> = {};
  for (const [id, ps] of Object.entries(activityPeriodSets)) {
    activityPeriods[id] = Array.from(ps);
  }

  const selectedGroup = groupId ? homeroomGroups.find((g) => g.id === groupId) ?? null : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        {!isWeekend && (
          <p className="text-slate-500 text-sm mt-1">
            {t("currentPeriod", { period: currentPeriod, time: now.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" }) })}
          </p>
        )}
      </div>

      {/* Step 1 — Year */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("year")}</p>
        <div className="flex gap-2 flex-wrap">
          {[1, 2, 3].map((g) => (
            <Link
              key={g}
              href={`?grade=${g}`}
              className={cn(
                "h-10 px-6 rounded-xl text-sm font-medium transition-colors border",
                gradeNum === g
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700"
              )}
            >
              {t("yearN", { n: g })}
            </Link>
          ))}
        </div>
      </div>

      {/* Step 2 — Homegroup */}
      {gradeNum && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("homegroup")}</p>
          <div className="flex gap-2 flex-wrap">
            {homeroomGroups.map((g) => (
              <Link
                key={g.id}
                href={`?grade=${gradeNum}&groupId=${g.id}`}
                className={cn(
                  "h-10 px-5 rounded-xl text-sm font-medium transition-colors border",
                  groupId === g.id
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800"
                )}
              >
                {g.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Step 3 — Students */}
      {groupId && selectedGroup && (
        <StudentList
          students={students.map((s) => ({ id: s.id, user: { name: s.user?.name } }))}
          groupName={selectedGroup.name}
          schedules={schedules}
          periodAttendance={periodAttendance}
          activityPeriods={activityPeriods}
          currentPeriod={currentPeriod}
          isWeekend={isWeekend}
          locale={locale}
        />
      )}

      {!gradeNum && <p className="text-sm text-slate-400">{t("selectYear")}</p>}
      {gradeNum && !groupId && homeroomGroups.length === 0 && (
        <p className="text-sm text-slate-400">{t("noHomegroups", { n: gradeNum })}</p>
      )}
    </div>
  );
}
