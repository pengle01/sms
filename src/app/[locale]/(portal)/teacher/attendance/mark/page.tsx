import { db } from "@/server/db";
import { staffDisplayName } from "@/lib/staffName";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { utcMidnight, localDateStr, fmtDisplayDate } from "@/lib/dates";
import { isDutyEligible } from "@/lib/dutyRoster";
import type { Role } from "@/generated/prisma/client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AttendanceMarkForm } from "./AttendanceMarkForm";
import { LessonNoteCard } from "../../lesson-notes/LessonNoteCard";
import { ClaimPicker, LessonSwitcher, ScrollIntoViewOnMount, type ClaimOption } from "./ClaimPicker";
import { myCoursesWithGroup, type TeachingSlot } from "@/lib/addedLesson";

export default async function TeacherMarkAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ groupId?: string; period?: string; date?: string; intercalary?: string; excursion?: string; claim?: string; claimGroupId?: string; courseId?: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);

  const { groupId, period: periodStr, date: dateParam, intercalary: intercalaryParam, excursion: excursionParam, claim, claimGroupId, courseId } = await searchParams;
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
          include: { user: { select: { name: true } }, group: { select: { name: true } } },
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
        include: { user: { select: { name: true } }, group: { select: { name: true } } },
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

  // ── Ad-hoc claim (Αναπλήρωση): cover/merge another group in the same period ──
  // The claim is an intentional act: a picker step lists the period's lessons
  // (with the scheduled teacher) and the records land on the claimed group's
  // own slot, marked in the claimer's name. On one of my own groups the picker
  // also offers «Δικό μου μάθημα»: same slot, but the subject taught is mine.
  const isClaiming = claim === "1" && !isIntercalary && !isExcursion && !!period;
  const claimDow = new Date(attendanceDateStr + "T12:00:00").getDay();
  // Offered on every lesson register — my own, a substitution, or a class I
  // already took over (from the dashboard or a previous pick).
  const showPicker = !isIntercalary && !isExcursion && !!period && (isClaiming || (!!groupId && !!slot) || !!claimGroupId);

  // Every lesson of mine (any day): which groups are mine, and my subjects with each.
  const mySlots: TeachingSlot[] =
    showPicker || claimGroupId
      ? (
          await db.timetableSlot.findMany({
            where: { staffId: staff.id },
            select: { staffId: true, groupId: true, courseId: true, course: { select: { name: true } } },
          })
        ).map((m) => ({ ...m, courseName: m.course.name }))
      : [];

  // Picker options: every lesson happening this day/period except the groups
  // already on the page
  const onPage = [groupId, claimGroupId].filter((g): g is string => !!g);
  const claimOptions: ClaimOption[] = showPicker
    ? (
        await db.timetableSlot.findMany({
          where: { period, dayOfWeek: claimDow, ...(onPage.length ? { groupId: { notIn: onPage } } : {}) },
          include: {
            group: { select: { id: true, name: true } },
            course: { select: { name: true } },
            staff: { select: { scheduleName: true, user: { select: { name: true } } } },
          },
          orderBy: { group: { name: "asc" } },
        })
      ).map((s) => ({
        slotId: s.id,
        groupId: s.group.id,
        groupName: s.group.name,
        courseName: s.course.name,
        teacherName: s.staff?.scheduleName ?? s.staffName ?? s.staff?.user?.name ?? "—",
        room: s.room,
        // «Δικό μου μάθημα» only replaces someone else's lesson
        myCourses: s.staffId === staff.id ? [] : myCoursesWithGroup(mySlots, staff.id, s.group.id),
      }))
    : [];

  // The claimed group's own slot + students + existing marks for that date
  let claimed: {
    slot: { id: string; room: string | null; course: { name: string } };
    groupName: string;
    teacherLabel: string | null;
    students: { id: string; user: { name: string | null }; studentId: string }[];
    existing: Record<string, { status: "PRESENT" | "ABSENT" | "LATE"; minutesDelayed: number }>;
    /** «Δικό μου μάθημα»: the subject of mine taught instead of the timetable's. */
    added: { id: string; name: string } | null;
    /** All my subjects with this group — to switch between them. */
    myCourses: { id: string; name: string }[];
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
      const [claimedStudents, claimedMarked, savedAdded] = await Promise.all([
        db.studentProfile.findMany({
          where: {
            OR: [{ groupId: claimGroupId }, { subjectGroups: { some: { groupId: claimGroupId } } }],
            user: { isActive: true },
          },
          include: { user: { select: { name: true } }, group: { select: { name: true } } },
          orderBy: { user: { name: "asc" } },
        }),
        db.attendance.findMany({
          where: { timetableSlotId: claimedSlot.id, date: attendanceDateObj },
          select: { studentId: true, status: true, minutesDelayed: true },
        }),
        db.addedLesson.findUnique({
          where: { timetableSlotId_date: { timetableSlotId: claimedSlot.id, date: attendanceDateObj } },
          select: { staffId: true, courseId: true },
        }),
      ]);
      // The subject chosen in the picker, else the one already saved by me —
      // only ever one of my subjects with this group, on someone else's lesson.
      const myCourses = claimedSlot.staffId === staff.id ? [] : myCoursesWithGroup(mySlots, staff.id, claimGroupId);
      const wanted = courseId ?? (savedAdded?.staffId === staff.id ? savedAdded.courseId : undefined);
      const added = myCourses.find((c) => c.id === wanted) ?? null;
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
        added,
        myCourses,
      };
    }
  }

  // Toilet breaks (WC) on this date: any still-open break + this period's
  // completed ones (past dates too, so the recorder can correct them), for every student on screen (own group and claimed).
  const allStudentIds = [...students.map((s) => s.id), ...(claimed?.students.map((s) => s.id) ?? [])];
  const toiletBreaks: Record<string, { id: string; leftAt: string; returnedAt: string | null; staffId: string }> = {};
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
          staffId: b.staffId,
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

  // The viewer's own private note for this lesson, if any.
  const lessonNote =
    groupId && period
      ? await db.lessonNote.findUnique({
          where: {
            authorId_groupId_period_date: {
              authorId: session.user.id,
              groupId,
              period,
              date: utcMidnight(attendanceDateStr),
            },
          },
          select: { body: true },
        })
      : null;

  // The register's group, for the printed sheet's header.
  const sheetGroupName = groupId
    ? (await db.group.findUnique({ where: { id: groupId }, select: { name: true } }))?.name ?? null
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 print:hidden">
        <Link
          href={`/${locale}/teacher/attendance/schedule`}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("backToSchedule")}
        </Link>
      </div>

      <div className="print:hidden">
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
          sheetGroupName={sheetGroupName}
          teacherName={staffDisplayName(staff)}
        />
      )}

      {/* Private lesson note — the teacher's own log for this lesson */}
      {groupId && period && students.length > 0 && (
        <div className="print:hidden">
        <LessonNoteCard
          locale={locale}
          groupId={groupId}
          period={period}
          date={attendanceDateStr}
          initial={lessonNote?.body ?? ""}
        />
        </div>
      )}

      {/* The claimed group — its own clearly-labelled marking sheet */}
      {claimed && (
        <ScrollIntoViewOnMount key={claimGroupId}>
        <div className={claimed.added
          ? "rounded-2xl border-2 border-emerald-200 overflow-hidden print:border-0 print:break-before-page"
          : "rounded-2xl border-2 border-amber-200 overflow-hidden print:border-0 print:break-before-page"}>
          {claimed.added ? (
            <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between gap-3 print:hidden">
              <div>
                <p className="text-sm font-semibold text-emerald-900">
                  {t("addedOf", { group: claimed.groupName })}
                  <span className="ml-2 font-normal text-emerald-700">{claimed.added.name}</span>
                </p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  {t("addedHint", { course: claimed.slot.course.name, teacher: claimed.teacherLabel ?? "—" })}
                </p>
                <div className="mt-2">
                  <LessonSwitcher
                    courses={claimed.myCourses}
                    current={claimed.added.id}
                    base={{
                      ...(groupId ? { groupId } : {}),
                      period: String(period),
                      date: attendanceDateStr,
                      claimGroupId: claimGroupId!,
                    }}
                  />
                </div>
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                {t("claimOwnLesson")}
              </span>
            </div>
          ) : (
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between gap-3 print:hidden">
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
          )}
          <div className="p-4 bg-white">
            <AttendanceMarkForm
              students={claimed.students}
              slot={claimed.added ? { ...claimed.slot, course: { name: claimed.added.name } } : claimed.slot}
              addedCourseId={claimed.added?.id}
              staffId={staff.id}
              selectedGroupId={claimGroupId}
              selectedPeriod={period}
              attendanceDate={attendanceDateStr}
              isToday={isToday}
              existingRecords={claimed.existing}
              toiletBreaks={toiletBreaks}
              sheetGroupName={claimed.groupName}
              teacherName={staffDisplayName(staff)}
            />
          </div>
        </div>
        </ScrollIntoViewOnMount>
      )}

      {/* «Προσθήκη τμήματος»: cover/merge another group in the same period —
          the picker opens in place; ?claim=1 opens it straight away. Picking
          another while one is shown replaces it on the page (its register
          stays saved). */}
      {showPicker && (
        <ClaimPicker
          options={claimOptions}
          base={{ ...(groupId ? { groupId } : {}), period: String(period), date: attendanceDateStr }}
          period={period}
          initialOpen={isClaiming}
        />
      )}
    </div>
  );
}
