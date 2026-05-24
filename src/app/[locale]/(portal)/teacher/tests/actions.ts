"use server";

import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { revalidatePath } from "next/cache";
import { utcMidnight } from "@/lib/dates";
import { getMaxTestsPerWeek } from "@/lib/schoolConfig";
import { TestType } from "@/generated/prisma";

export type TestConflict = {
  studentName: string;
  reason: "BIG_SAME_DAY" | "WEEKLY_LIMIT";
  /** Tests that caused the conflict (existing ones on that day or week) */
  existingTests: Array<{
    courseName: string;
    groupName: string;
    type: "BIG" | "SMALL";
    dateStr: string;
    periodLabel: string;
  }>;
};

export type ScheduleTestResult =
  | { success: true }
  | { success: false; message: string }
  | { success: false; conflicts: TestConflict[] };

function weekBounds(date: Date): { weekStart: Date; weekEnd: Date } {
  const dow = date.getUTCDay(); // 0=Sun
  const daysToMonday = (dow + 6) % 7;
  const weekStart = new Date(date.getTime());
  weekStart.setUTCDate(date.getUTCDate() - daysToMonday);
  const weekEnd = new Date(weekStart.getTime());
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  return { weekStart, weekEnd };
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtDate(d: Date) {
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

function fmtPeriod(period: number, periodCount: number) {
  return periodCount > 1 ? `P${period}–${period + periodCount - 1}` : `P${period}`;
}

export async function scheduleTest(data: {
  groupId: string;
  courseId: string;
  date: string;
  period: number;
  periodCount: number;
  type: TestType;
}): Promise<ScheduleTestResult> {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, message: "Unauthenticated" };

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) return { success: false, message: "No staff profile" };

  const targetDate = utcMidnight(data.date);
  const { weekStart, weekEnd } = weekBounds(targetDate);
  const maxTests = await getMaxTestsPerWeek();

  // Validate that this teacher has a timetable slot for the chosen period on this day
  const dayOfWeek = targetDate.getUTCDay(); // 1=Mon…5=Fri matches TimetableSlot.dayOfWeek
  const slot = await db.timetableSlot.findFirst({
    where: { staffId: staff.id, groupId: data.groupId, courseId: data.courseId, dayOfWeek, period: data.period },
  });
  if (!slot) {
    return { success: false, message: "You do not have a lesson in this period on the selected date." };
  }
  if (data.type === "BIG" && data.periodCount === 2) {
    const slot2 = await db.timetableSlot.findFirst({
      where: { staffId: staff.id, groupId: data.groupId, courseId: data.courseId, dayOfWeek, period: data.period + 1 },
    });
    if (!slot2) {
      return { success: false, message: `You do not have a lesson in period ${data.period + 1} on this day — a 2-period test requires consecutive slots.` };
    }
  }

  // Students in the target group (homeroom or subject enrolled)
  const students = await db.studentProfile.findMany({
    where: {
      OR: [
        { groupId: data.groupId },
        { subjectGroups: { some: { groupId: data.groupId } } },
      ],
    },
    include: {
      user: { select: { name: true } },
      subjectGroups: { select: { groupId: true } },
    },
  });

  if (students.length === 0) return { success: false, message: "No students in this group" };

  // All groups these students belong to
  const allGroupIds = [
    ...new Set(
      students.flatMap((s) => [
        ...(s.groupId ? [s.groupId] : []),
        ...s.subjectGroups.map((sg) => sg.groupId),
      ])
    ),
  ];

  // Fetch existing tests for this week across all relevant groups
  const weekTests = await db.testSchedule.findMany({
    where: {
      date: { gte: weekStart, lte: weekEnd },
      groupId: { in: allGroupIds },
    },
    include: {
      course: { select: { name: true } },
      group: { select: { name: true } },
    },
  });

  // Index by groupId for fast lookup
  const testsByGroupId = new Map<string, typeof weekTests>();
  for (const t of weekTests) {
    if (!testsByGroupId.has(t.groupId)) testsByGroupId.set(t.groupId, []);
    testsByGroupId.get(t.groupId)!.push(t);
  }

  const conflicts: TestConflict[] = [];

  for (const s of students) {
    const groups = [
      ...(s.groupId ? [s.groupId] : []),
      ...s.subjectGroups.map((sg) => sg.groupId),
    ];
    const studentWeekTests = groups.flatMap((gId) => testsByGroupId.get(gId) ?? []);
    const studentDayTests = studentWeekTests.filter(
      (t) => t.date.getTime() === targetDate.getTime()
    );

    // Rule 1: only 1 big test per day
    if (data.type === "BIG" && studentDayTests.some((t) => t.type === "BIG")) {
      conflicts.push({
        studentName: s.user?.name ?? s.id,
        reason: "BIG_SAME_DAY",
        existingTests: studentDayTests
          .filter((t) => t.type === "BIG")
          .map((t) => ({
            courseName: t.course.name,
            groupName: t.group.name,
            type: t.type,
            dateStr: fmtDate(t.date),
            periodLabel: fmtPeriod(t.period, t.periodCount),
          })),
      });
      continue;
    }

    // Rule 2: max tests per week
    if (studentWeekTests.length >= maxTests) {
      conflicts.push({
        studentName: s.user?.name ?? s.id,
        reason: "WEEKLY_LIMIT",
        existingTests: studentWeekTests.map((t) => ({
          courseName: t.course.name,
          groupName: t.group.name,
          type: t.type,
          dateStr: fmtDate(t.date),
          periodLabel: fmtPeriod(t.period, t.periodCount),
        })),
      });
    }
  }

  if (conflicts.length > 0) return { success: false, conflicts };

  await db.testSchedule.create({
    data: {
      groupId: data.groupId,
      courseId: data.courseId,
      staffId: staff.id,
      date: targetDate,
      period: data.period,
      periodCount: data.type === "BIG" ? data.periodCount : 1,
      type: data.type,
    },
  });

  revalidatePath("/[locale]/teacher/tests", "page");
  return { success: true };
}

export async function deleteTest(testId: string): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) throw new Error("No staff profile");

  await db.testSchedule.delete({
    where: { id: testId, staffId: staff.id },
  });

  revalidatePath("/[locale]/teacher/tests", "page");
}
