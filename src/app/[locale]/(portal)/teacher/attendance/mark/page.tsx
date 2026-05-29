import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { utcMidnight, localDateStr, fmtDisplayDate } from "@/lib/dates";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AttendanceMarkForm } from "./AttendanceMarkForm";

export default async function TeacherMarkAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ groupId?: string; period?: string; date?: string; intercalary?: string; excursion?: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const { groupId, period: periodStr, date: dateParam, intercalary: intercalaryParam, excursion: excursionParam } = await searchParams;
  const period = periodStr ? parseInt(periodStr) : 1;
  const isIntercalary = intercalaryParam === "1";
  const isExcursion = excursionParam === "1";

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) redirect(`/${locale}/teacher/setup`);

  let students: { id: string; user: { name: string | null }; studentId: string }[] = [];
  let slot: { id: string; room: string | null; course: { name: string } } | null = null;
  let existingRecords: Record<string, { status: "PRESENT" | "ABSENT" | "LATE"; minutesDelayed: number }> = {};
  let studentLocations: Record<string, { type: "activity" | "support"; name: string }> = {};
  let prevPeriodsRecords: Record<string, Record<number, { status: string; minutesDelayed: number; isAutoAbsent: boolean }>> = {};
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

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/teacher/attendance/schedule`}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          My Schedule
        </Link>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-slate-900">Mark Attendance</h2>
        <p className="text-slate-500 text-sm mt-1">
          {fmtDisplayDate(attendanceDateObj)}
          {!isToday && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Past date
            </span>
          )}
        </p>
      </div>

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
        prevPeriodsRecords={prevPeriodsRecords}
        prevActivityPeriods={prevActivityPeriods}
        intercalaryGroupId={isIntercalary || isExcursion ? groupId : undefined}
        isExcursion={isExcursion}
      />
    </div>
  );
}
