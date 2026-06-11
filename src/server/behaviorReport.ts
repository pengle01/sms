// Server loader for the behaviour-investigation report (backlog #4).
// Resolves a staff member's homegroup scope and assembles per-student records,
// then runs the pure engine in src/lib/behaviorFlags.ts.

import { db } from "@/server/db";
import { localDateStr } from "@/lib/dates";
import {
  analyzeStudent,
  riskScore,
  type AttRecord,
  type ToiletRecord,
  type Flag,
} from "@/lib/behaviorFlags";

/** A test grade below this (out of 20) is reported as a low grade. */
export const PASS_MARK = 10;

export type GroupRole = "head" | "teacher" | "counselor";

export type AccessibleGroup = {
  id: string;
  name: string;
  grade: number;
  roles: GroupRole[]; // a staff member can hold several roles for one group
};

/** Groups the staff member may investigate, with the role(s) they hold. */
export async function groupsForStaff(userId: string): Promise<AccessibleGroup[]> {
  const staff = await db.staffProfile.findUnique({
    where: { userId },
    select: {
      homeroomGroups: { select: { id: true, name: true, grade: true } },
      homeroomHeadGroups: { select: { id: true, name: true, grade: true } },
      homeroomCounselorGroups: { select: { id: true, name: true, grade: true } },
    },
  });
  if (!staff) return [];
  const map = new Map<string, AccessibleGroup>();
  const add = (g: { id: string; name: string; grade: number }, role: GroupRole) => {
    const existing = map.get(g.id);
    if (existing) existing.roles.push(role);
    else map.set(g.id, { ...g, roles: [role] });
  };
  staff.homeroomHeadGroups.forEach((g) => add(g, "head"));
  staff.homeroomGroups.forEach((g) => add(g, "teacher"));
  staff.homeroomCounselorGroups.forEach((g) => add(g, "counselor"));
  return [...map.values()].sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, "el"));
}

/** ISO weekday 1=Mon … 7=Sun from a @db.Date (UTC-midnight) value. */
function isoWeekday(d: Date): number {
  return ((d.getUTCDay() + 6) % 7) + 1;
}

export type BehaviorTotals = {
  absences: number; // ABSENT periods (incl. auto), excl. waived/excused
  partialDays: number; // dates mixing an absence with a present period
  lates: number;
  referrals: number;
  toilet: number;
  lowGrades: number;
};

export type StudentBehaviorRow = {
  studentProfileId: string;
  studentName: string;
  studentId: string; // registry number
  flags: Flag[];
  totals: BehaviorTotals;
  riskScore: number;
};

export type GroupBehavior = {
  groupName: string;
  students: StudentBehaviorRow[];
};

/**
 * Assemble behaviour data for one homegroup over a window.
 * @param since  start boundary (UTC midnight, inclusive); null = all time.
 */
export async function loadGroupBehavior(groupId: string, since: Date | null): Promise<GroupBehavior> {
  const group = await db.group.findUnique({ where: { id: groupId }, select: { name: true } });

  const students = await db.studentProfile.findMany({
    where: { groupId, user: { isActive: true } },
    select: { id: true, studentId: true, user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const studentIds = students.map((s) => s.id);

  if (studentIds.length === 0) {
    return { groupName: group?.name ?? "—", students: [] };
  }

  const dateFilter = since ? { gte: since } : undefined;

  const [attendance, toiletBreaks, referralCounts, lowGradeCounts] = await Promise.all([
    db.attendance.findMany({
      where: { studentId: { in: studentIds }, ...(dateFilter ? { date: dateFilter } : {}) },
      select: {
        studentId: true,
        date: true,
        status: true,
        waived: true,
        isAutoAbsent: true,
        intercalaryPeriod: true,
        timetableSlot: {
          select: { period: true, dayOfWeek: true, courseId: true, course: { select: { nameEl: true, name: true } } },
        },
      },
    }),
    db.toiletBreak.findMany({
      where: { studentId: { in: studentIds }, ...(dateFilter ? { date: dateFilter } : {}) },
      select: { studentId: true, date: true, period: true, groupId: true, leftAt: true, returnedAt: true },
    }),
    db.referralStudent.groupBy({
      by: ["studentId"],
      where: {
        studentId: { in: studentIds },
        referral: { isDraft: false, ...(since ? { date: { gte: since } } : {}) },
      },
      _count: { _all: true },
    }),
    db.testGrade.groupBy({
      by: ["studentId"],
      where: {
        studentId: { in: studentIds },
        value: { lt: PASS_MARK },
        ...(since ? { testSchedule: { date: { gte: since } } } : {}),
      },
      _count: { _all: true },
    }),
  ]);

  // Map a toilet break's (group, weekday, period) to its lesson via the timetable.
  const toiletGroupIds = [...new Set(toiletBreaks.map((b) => b.groupId).filter(Boolean))] as string[];
  const slotCourse = new Map<string, { id: string; name: string }>();
  if (toiletGroupIds.length) {
    const slots = await db.timetableSlot.findMany({
      where: { groupId: { in: toiletGroupIds } },
      select: { groupId: true, dayOfWeek: true, period: true, courseId: true, course: { select: { nameEl: true, name: true } } },
    });
    for (const s of slots) {
      slotCourse.set(`${s.groupId}:${s.dayOfWeek}:${s.period}`, {
        id: s.courseId,
        name: s.course.nameEl || s.course.name,
      });
    }
  }

  const referralMap = new Map(referralCounts.map((r) => [r.studentId, r._count._all]));
  const lowGradeMap = new Map(lowGradeCounts.map((g) => [g.studentId, g._count._all]));

  // Bucket attendance + toilet records per student.
  const attByStudent = new Map<string, AttRecord[]>();
  for (const a of attendance) {
    const period = a.timetableSlot?.period ?? a.intercalaryPeriod ?? null;
    const rec: AttRecord = {
      date: localDateStr(a.date),
      dayOfWeek: a.timetableSlot?.dayOfWeek ?? isoWeekday(a.date),
      period,
      courseId: a.timetableSlot?.courseId ?? null,
      courseName: a.timetableSlot ? a.timetableSlot.course.nameEl || a.timetableSlot.course.name : null,
      status: a.status,
      waived: a.waived,
      isAutoAbsent: a.isAutoAbsent,
    };
    const arr = attByStudent.get(a.studentId);
    if (arr) arr.push(rec);
    else attByStudent.set(a.studentId, [rec]);
  }

  const toiletByStudent = new Map<string, ToiletRecord[]>();
  for (const b of toiletBreaks) {
    const minutes = b.returnedAt ? Math.round((b.returnedAt.getTime() - b.leftAt.getTime()) / 60000) : null;
    const course = b.groupId && b.period != null
      ? slotCourse.get(`${b.groupId}:${isoWeekday(b.date)}:${b.period}`)
      : undefined;
    const rec: ToiletRecord = {
      date: localDateStr(b.date),
      period: b.period,
      minutes,
      courseId: course?.id ?? null,
      courseName: course?.name ?? null,
    };
    const arr = toiletByStudent.get(b.studentId);
    if (arr) arr.push(rec);
    else toiletByStudent.set(b.studentId, [rec]);
  }

  const rows: StudentBehaviorRow[] = students.map((s) => {
    const att = attByStudent.get(s.id) ?? [];
    const toilet = toiletByStudent.get(s.id) ?? [];
    const flags = analyzeStudent({ attendance: att, toilet });

    // Reported totals (independent of flags).
    const absences = att.filter((r) => !r.waived && (r.status === "ABSENT" || r.isAutoAbsent)).length;
    const lates = att.filter((r) => !r.waived && r.status === "LATE").length;
    const partialDays = flags.find((f) => f.code === "PARTIAL_DAY_ABSENCE")?.count ?? 0;

    return {
      studentProfileId: s.id,
      studentName: s.user?.name ?? "—",
      studentId: s.studentId,
      flags,
      totals: {
        absences,
        partialDays,
        lates,
        referrals: referralMap.get(s.id) ?? 0,
        toilet: toilet.length,
        lowGrades: lowGradeMap.get(s.id) ?? 0,
      },
      riskScore: riskScore(flags),
    };
  });

  return { groupName: group?.name ?? "—", students: rows };
}
