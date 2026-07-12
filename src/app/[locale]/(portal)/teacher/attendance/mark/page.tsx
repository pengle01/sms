import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { utcMidnight, localDateStr, fmtDisplayDate } from "@/lib/dates";
import { isDutyEligible } from "@/lib/dutyRoster";
import type { Role } from "@/generated/prisma/client";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AttendanceMarkForm } from "./AttendanceMarkForm";

export default async function TeacherMarkAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ groupId?: string; period?: string; date?: string; intercalary?: string; excursion?: string; claim?: string; claimGroupId?: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const { groupId, period: periodStr, date: dateParam, intercalary: intercalaryParam, excursion: excursionParam, claim, claimGroupId } = await searchParams;
  const period = periodStr ? parseInt(periodStr) : 1;
  const isIntercalary = intercalaryParam === "1";
  const isExcursion = excursionParam === "1";

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) redirect(`/${locale}/teacher/setup`);

  let students: { id: string; user: { name: string | null }; studentId: string }[] = [];
  let slot: { id: string; room: string | null; course: { name: string } } | null = null;
  let existingRecords: Record<string, { status: "PRESENT" | "ABSENT" | "LATE"; minutesDelayed: number }> = {};
  let studentLocations: Record<string, { type: "activity" | "support"; name: string }> = {};
  let exitPermits: Record<string, { reason: string; fromPeriod: number }> = {};
  let prevPeriodsRecords: Record<string, Record<number, { status: string; minutesDelayed: number; isAutoAbsent: boolean; exitPermit?: boolean }>> = {};
  let prevActivityPeriods: Record<string, number[]> = {};
  const prevPeriods = period > 1 ? Array.from({ length: period - 1 }, (_, i) => i + 1) : [];

  const attendanceDateStr = dateParam ?? localDateStr();
  const attendanceDateObj = utcMidnight(attendanceDateStr);
  const isToday = attendanceDateStr === localDateStr();

  if (groupId && period) {
    const attendanceDay = new Date(attendanceDateStr + "T12:00:00");
    const dayOfWeek = attendanceDay.getDay();
    const todayMidnight = attendanceDateObj;

    if (isIntercalary || isExcursion) {
      // Intercalary / excursion — no timetable slot; load homegroup students
      const [fetchedStudents, markedRows] = await Promise.all([
        db.studentProfile.findMany({
          where: { groupId, user: { isActive: true } },
          include: { user: { select: { name: true } } },
          orderBy: { user: { name: "asc" } },
        }),
        db.attendance.findMany({
          where: { intercalaryGroupId: groupId, intercalaryPeriod: period, date: todayMidnight },
          select: { studentId: true, status: true, minutesDelayed: true },
        }),
      ]);
      students = fetchedStudents;
      for (const r of markedRows) {
        existingRecords[r.studentId] = {
          status: (r.status === "EXCUSED" ? "ABSENT" : r.status) as "PRESENT" | "ABSENT" | "LATE",
          minutesDelayed: r.minutesDelayed,
        };
      }
    } else {
    const [fetchedStudents, fetchedSlot] = await Promise.all([
      db.studentProfile.findMany({
        where: {
          OR: [
            { groupId },
            { subjectGroups: { some: { groupId } } },
          ],
          user: { isActive: true },
        },
        include: { user: { select: { name: true } } },
        orderBy: { user: { name: "asc" } },
      }),
      db.timetableSlot.findFirst({
        where: { groupId, period, dayOfWeek, staffId: staff.id },
        include: { course: true },
      }),
    ]);
    students = fetchedStudents;
    slot = fetchedSlot;

    // Not my own slot? A finalized substitution plan may assign it to me for
    // this date — as the substitute (COVER/SWAP) or, for study halls, as a
    // headteacher (any headteacher may take the attendance of those groups).
    if (!slot) {
      const isHeadteacher = isDutyEligible(session.user.role as Role);
      const assignment = await db.substitutionPlanEntry.findFirst({
        where: {
          plan: { date: attendanceDateObj, status: "FINAL" },
          period,
          groupId,
          OR: [
            { kind: { in: ["COVER", "SWAP"] }, substituteStaffId: staff.id },
            ...(isHeadteacher ? [{ kind: "STUDY_HALL" as const }] : []),
          ],
        },
        include: { timetableSlot: { include: { course: true } } },
      });
      if (assignment?.timetableSlot) slot = assignment.timetableSlot;
    }

    const studentIds = students.map((s) => s.id);

    if (slot && studentIds.length > 0) {
      const marked = await db.attendance.findMany({
        where: {
          timetableSlotId: slot.id,
          date: todayMidnight,
          studentId: { in: studentIds },
        },
        select: { studentId: true, status: true, minutesDelayed: true },
      });
      for (const r of marked) {
        existingRecords[r.studentId] = {
          status: (r.status === "EXCUSED" ? "ABSENT" : r.status) as "PRESENT" | "ABSENT" | "LATE",
          minutesDelayed: r.minutesDelayed,
        };
      }
    }

    if (studentIds.length > 0) {
      // Support group slots: students enrolled in other groups with a slot at this period
      const subjectEnrollments = await db.studentGroup.findMany({
        where: { studentProfileId: { in: studentIds } },
        select: { studentProfileId: true, groupId: true },
      });

      const subjectGroupIds = [...new Set(subjectEnrollments.map((e) => e.groupId))];

      const [supportSlots, activityParticipants, prevAttendance, allDayActivities] = await Promise.all([
        subjectGroupIds.length > 0
          ? db.timetableSlot.findMany({
              where: { groupId: { in: subjectGroupIds }, period, dayOfWeek },
              include: { course: { select: { name: true } } },
            })
          : Promise.resolve([]),
        db.activityParticipant.findMany({
          where: {
            studentId: { in: studentIds },
            activity: {
              date: todayMidnight,
              startPeriod: { lte: period },
              endPeriod: { gte: period },
            },
          },
          include: { activity: { select: { name: true } } },
        }),
        prevPeriods.length > 0
          ? db.attendance.findMany({
              where: {
                date: todayMidnight,
                studentId: { in: studentIds },
                timetableSlot: { period: { in: prevPeriods } },
              },
              select: {
                studentId: true,
                status: true,
                minutesDelayed: true,
                isAutoAbsent: true,
                exitPermitId: true,
                timetableSlot: { select: { period: true } },
              },
            })
          : Promise.resolve([]),
        // All activities today for these students — used to mark previous-period activity dots
        db.activityParticipant.findMany({
          where: {
            studentId: { in: studentIds },
            activity: { date: todayMidnight },
          },
          select: {
            studentId: true,
            activity: { select: { startPeriod: true, endPeriod: true } },
          },
        }),
      ]);

      for (const r of prevAttendance) {
        if (!prevPeriodsRecords[r.studentId]) prevPeriodsRecords[r.studentId] = {};
        prevPeriodsRecords[r.studentId]![r.timetableSlot?.period ?? 0] = {
          status: r.status,
          minutesDelayed: r.minutesDelayed,
          isAutoAbsent: r.isAutoAbsent,
          exitPermit: !!r.exitPermitId,
        };
      }

      const slotByGroup = Object.fromEntries(supportSlots.map((s) => [s.groupId, s.course.name]));

      for (const e of subjectEnrollments) {
        const course = slotByGroup[e.groupId];
        if (course) studentLocations[e.studentProfileId] = { type: "support", name: course };
      }
      for (const ap of activityParticipants) {
        studentLocations[ap.studentId] = { type: "activity", name: ap.activity.name };
      }

      for (const ap of allDayActivities) {
        for (let p = ap.activity.startPeriod; p <= ap.activity.endPeriod; p++) {
          if (!prevPeriods.includes(p)) continue;
          if (!prevActivityPeriods[ap.studentId]) prevActivityPeriods[ap.studentId] = [];
          if (!prevActivityPeriods[ap.studentId]!.includes(p)) {
            prevActivityPeriods[ap.studentId]!.push(p);
          }
        }
      }
    }
    } // end else (non-intercalary)
  }

  // ── Ad-hoc claim (Κάλυψη): cover/merge another group in the same period ──
  // The claim is an intentional act: a picker step lists the period's lessons
  // (with the scheduled teacher) and the records land on the claimed group's
  // own slot, marked in the claimer's name.
  const isClaiming = claim === "1" && !isIntercalary && !isExcursion && !!period;
  const claimDow = new Date(attendanceDateStr + "T12:00:00").getDay();

  // Picker options: every lesson happening this day/period except my current group
  const claimOptions =
    isClaiming && !claimGroupId
      ? await db.timetableSlot.findMany({
          where: { period, dayOfWeek: claimDow, ...(groupId ? { groupId: { not: groupId } } : {}) },
          include: {
            group: { select: { id: true, name: true } },
            course: { select: { name: true } },
            staff: { select: { scheduleName: true, user: { select: { name: true } } } },
          },
          orderBy: { group: { name: "asc" } },
        })
      : [];

  // The claimed group's own slot + students + existing marks for that date
  let claimed: {
    slot: { id: string; room: string | null; course: { name: string } };
    groupName: string;
    teacherLabel: string | null;
    students: { id: string; user: { name: string | null }; studentId: string }[];
    existing: Record<string, { status: "PRESENT" | "ABSENT" | "LATE"; minutesDelayed: number }>;
  } | null = null;
  if (claimGroupId && !isIntercalary && !isExcursion && period) {
    const claimedSlot = await db.timetableSlot.findFirst({
      where: { groupId: claimGroupId, period, dayOfWeek: claimDow },
      include: {
        group: { select: { name: true } },
        course: { select: { name: true } },
        staff: { select: { scheduleName: true, user: { select: { name: true } } } },
      },
    });
    if (claimedSlot) {
      const [claimedStudents, claimedMarked] = await Promise.all([
        db.studentProfile.findMany({
          where: {
            OR: [{ groupId: claimGroupId }, { subjectGroups: { some: { groupId: claimGroupId } } }],
            user: { isActive: true },
          },
          include: { user: { select: { name: true } } },
          orderBy: { user: { name: "asc" } },
        }),
        db.attendance.findMany({
          where: { timetableSlotId: claimedSlot.id, date: attendanceDateObj },
          select: { studentId: true, status: true, minutesDelayed: true },
        }),
      ]);
      const existing: Record<string, { status: "PRESENT" | "ABSENT" | "LATE"; minutesDelayed: number }> = {};
      for (const r of claimedMarked) {
        existing[r.studentId] = {
          status: (r.status === "EXCUSED" ? "ABSENT" : r.status) as "PRESENT" | "ABSENT" | "LATE",
          minutesDelayed: r.minutesDelayed,
        };
      }
      claimed = {
        slot: claimedSlot,
        groupName: claimedSlot.group.name,
        teacherLabel: claimedSlot.staff?.scheduleName ?? claimedSlot.staffName ?? claimedSlot.staff?.user?.name ?? null,
        students: claimedStudents,
        existing,
      };
    }
  }

  // Toilet breaks (WC) for today: any still-open break + this period's
  // completed ones, for every student on screen (own group and claimed).
  const allStudentIds = [...students.map((s) => s.id), ...(claimed?.students.map((s) => s.id) ?? [])];
  const toiletBreaks: Record<string, { id: string; leftAt: string; returnedAt: string | null }> = {};
  if (allStudentIds.length > 0 && period && !isIntercalary && !isExcursion) {
    const rows = await db.toiletBreak.findMany({
      where: {
        studentId: { in: allStudentIds },
        date: attendanceDateObj,
        OR: [{ returnedAt: null }, { period }],
      },
      orderBy: { leftAt: "asc" },
    });
    for (const b of rows) {
      // an open break wins over an earlier completed one
      if (!toiletBreaks[b.studentId] || b.returnedAt === null) {
        toiletBreaks[b.studentId] = {
          id: b.id,
          leftAt: b.leftAt.toISOString(),
          returnedAt: b.returnedAt?.toISOString() ?? null,
        };
      }
    }
  }

  // Active exit permits (Άδεια Εξόδου) covering this date/period — shown in
  // yellow; the teacher still marks the student absent.
  if (students.length > 0) {
    const permits = await db.exitPermit.findMany({
      where: {
        date: attendanceDateObj,
        active: true,
        fromPeriod: { lte: period },
        studentId: { in: students.map((s) => s.id) },
      },
      select: { studentId: true, reason: true, fromPeriod: true },
    });
    for (const p of permits) {
      const existing = exitPermits[p.studentId];
      if (!existing || p.fromPeriod < existing.fromPeriod) {
        exitPermits[p.studentId] = { reason: p.reason, fromPeriod: p.fromPeriod };
      }
    }
  }

  const t = await getTranslations("attendance");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/teacher/attendance/schedule`}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("backToSchedule")}
        </Link>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("markAttendance")}</h2>
        <p className="text-slate-500 text-sm mt-1">
          {fmtDisplayDate(attendanceDateObj)}
          {!isToday && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {t("pastDate")}
            </span>
          )}
        </p>
      </div>

      {/* Own lesson */}
      {groupId && (
        <AttendanceMarkForm
          students={students}
          slot={slot}
          staffId={staff.id}
          selectedGroupId={groupId}
          selectedPeriod={period}
          prevPeriods={prevPeriods}
          attendanceDate={attendanceDateStr}
          isToday={isToday}
          existingRecords={existingRecords}
          studentLocations={studentLocations}
          exitPermits={exitPermits}
          toiletBreaks={toiletBreaks}
          prevPeriodsRecords={prevPeriodsRecords}
          prevActivityPeriods={prevActivityPeriods}
          intercalaryGroupId={isIntercalary || isExcursion ? groupId : undefined}
          isExcursion={isExcursion}
        />
      )}

      {/* Quiet entry to cover/merge a second group in the same period */}
      {groupId && slot && !isClaiming && !claimed && (
        <Link
          href={`?groupId=${groupId}&period=${period}&date=${attendanceDateStr}&claim=1`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t("claimAddSecond")}
        </Link>
      )}

      {/* The intention gate: pick which class to cover */}
      {isClaiming && !claimGroupId && (
        <div className="rounded-2xl border border-amber-200 bg-white overflow-hidden max-w-2xl">
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-100">
            <p className="text-sm font-semibold text-amber-900">
              {t("claimPickerTitle", { period })}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">{t("claimPickerHint")}</p>
          </div>
          {claimOptions.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-400">{t("claimNone")}</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {claimOptions.map((s) => (
                <Link
                  key={s.id}
                  href={`?${new URLSearchParams({
                    ...(groupId ? { groupId } : {}),
                    period: String(period),
                    date: attendanceDateStr,
                    claimGroupId: s.group.id,
                  }).toString()}`}
                  className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-amber-50/40 transition-colors"
                >
                  <span className="font-medium text-slate-900">{s.group.name}</span>
                  <span className="flex items-center gap-3 text-xs text-slate-500">
                    <span>{s.course.name}</span>
                    <span className="text-slate-400">
                      {s.staff?.scheduleName ?? s.staffName ?? s.staff?.user?.name ?? "—"}
                    </span>
                    {s.room && <span className="font-mono text-slate-400">{s.room}</span>}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* The claimed group — its own clearly-labelled marking sheet */}
      {claimed && (
        <div className="rounded-2xl border-2 border-amber-200 overflow-hidden">
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-amber-900">
              {t("claimOf", { group: claimed.groupName })}
              <span className="ml-2 font-normal text-amber-700">
                {claimed.slot.course.name}
                {claimed.teacherLabel && ` · ${claimed.teacherLabel}`}
              </span>
            </p>
            <span className="inline-flex items-center rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {t("claimBadge")}
            </span>
          </div>
          <div className="p-4 bg-white">
            <AttendanceMarkForm
              students={claimed.students}
              slot={claimed.slot}
              staffId={staff.id}
              selectedGroupId={claimGroupId}
              selectedPeriod={period}
              attendanceDate={attendanceDateStr}
              isToday={isToday}
              existingRecords={claimed.existing}
              toiletBreaks={toiletBreaks}
            />
          </div>
        </div>
      )}
    </div>
  );
}
