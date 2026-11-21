"use server";

import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { revalidatePath } from "next/cache";
import { utcMidnight } from "@/lib/dates";
import { studentGroupIds } from "@/lib/studentTests";
import { getActiveTermInfo, getMaxTestsPerWeek } from "@/lib/schoolConfig";
import { isSchoolClosed } from "@/lib/calendar";
import { TestType } from "@/generated/prisma/client";
import { fmtDisplayDate } from "@/lib/dates";
import { logger, errInfo } from "@/server/logger";
import { transcriberTestLine } from "@/lib/transcribers";
import { specialEdDeputyUserIds, transcriberStudentsForGroup } from "@/server/transcribers";

export type TestConflict = {
  studentName: string;
  reason: "BIG_SAME_DAY" | "WEEKLY_LIMIT";
  /**
   * Tests that caused the conflict (existing ones on that day or week).
   * Raw values, not sentences: the client component that renders them holds
   * the reader's locale and formats the date and period itself.
   */
  existingTests: Array<{
    courseName: string;
    groupName: string;
    type: "BIG" | "SMALL";
    /** ISO date, YYYY-MM-DD. */
    date: string;
    period: number;
    periodCount: number;
  }>;
};

/**
  * Why a test could not be scheduled, as a `tests.*` message key. The action
  * returns the key rather than the sentence: the form that renders it is a
  * client component that already holds the reader's locale, so there is no
  * second place where the locale has to be resolved.
  */
export type ScheduleTestError =
  | "errGeneric"
  | "errSchoolClosed"
  | "errNoActiveTerm"
  | "errAfterDeadline"
  | "errNoLesson"
  | "errNoConsecutive"
  | "errNoStudents";

export type ScheduleTestResult =
  | { success: true }
  /** `period` is the second period a 2-period test would need (errNoConsecutive). */
  | { success: false; error: ScheduleTestError; period?: number }
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

export async function scheduleTest(data: {
  groupId: string;
  courseId: string;
  date: string;
  period: number;
  periodCount: number;
  type: TestType;
}): Promise<ScheduleTestResult> {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "errGeneric" };

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) return { success: false, error: "errGeneric" };

  const targetDate = utcMidnight(data.date);
  const { weekStart, weekEnd } = weekBounds(targetDate);
  const maxTests = await getMaxTestsPerWeek();

  // Reject school holidays and non-term dates
  const [schoolClosed, activeTerm] = await Promise.all([
    isSchoolClosed(targetDate),
    getActiveTermInfo(targetDate),
  ]);
  if (schoolClosed) return { success: false, error: "errSchoolClosed" };
  if (!activeTerm) return { success: false, error: "errNoActiveTerm" };
  if (targetDate > activeTerm.testDeadline) return { success: false, error: "errAfterDeadline" };

  // Validate that this teacher has a timetable slot for the chosen period on this day
  const dayOfWeek = targetDate.getUTCDay(); // 1=Mon…5=Fri matches TimetableSlot.dayOfWeek
  const slot = await db.timetableSlot.findFirst({
    where: { staffId: staff.id, groupId: data.groupId, courseId: data.courseId, dayOfWeek, period: data.period },
  });
  if (!slot) {
    return { success: false, error: "errNoLesson" };
  }
  if (data.type === "BIG" && data.periodCount === 2) {
    const slot2 = await db.timetableSlot.findFirst({
      where: { staffId: staff.id, groupId: data.groupId, courseId: data.courseId, dayOfWeek, period: data.period + 1 },
    });
    if (!slot2) {
      return { success: false, error: "errNoConsecutive", period: data.period + 1 };
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

  if (students.length === 0) return { success: false, error: "errNoStudents" };

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
    const groups = studentGroupIds(s.groupId, s.subjectGroups.map((sg) => sg.groupId));
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
            date: t.date.toISOString().slice(0, 10),
            period: t.period,
            periodCount: t.periodCount,
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
          date: t.date.toISOString().slice(0, 10),
          period: t.period,
          periodCount: t.periodCount,
        })),
      });
    }
  }

  if (conflicts.length > 0) return { success: false, conflicts };

  const created = await db.testSchedule.create({
    data: {
      groupId: data.groupId,
      courseId: data.courseId,
      staffId: staff.id,
      date: targetDate,
      period: data.period,
      periodCount: data.type === "BIG" ? data.periodCount : 1,
      type: data.type,
    },
    include: { course: { select: { name: true } }, group: { select: { name: true } } },
  });

  // Students entitled to a transcriber: the deputy responsible for special
  // education must pick one. Best effort — never undoes the test.
  try {
    const entitled = await transcriberStudentsForGroup(created.groupId);
    const deputies = entitled.length > 0 ? await specialEdDeputyUserIds() : [];
    if (deputies.length > 0) {
      const line = transcriberTestLine({
        dateLabel: fmtDisplayDate(created.date),
        period: created.period,
        periodCount: created.periodCount,
        courseName: created.course.name,
        groupName: created.group.name,
      });
      await db.notification.createMany({
        data: deputies.map((userId) => ({
          userId,
          senderId: session.user.id,
          type: "TRANSCRIBER_NEEDED",
          title: "Διαγώνισμα: χρειάζεται μεταγραφέας",
          body: `${line} · ${entitled.map((s) => s.user?.name ?? "").join(", ")}`,
          linkUrl: "/teacher/special-ed/transcribers",
          read: false,
        })),
      });
    }
  } catch (e) {
    logger.error({ event: "transcriber.notifyFailed", err: errInfo(e) }, "Transcriber notification failed");
  }

  revalidatePath("/[locale]/teacher/tests", "page");
  return { success: true };
}

export async function deleteTest(testId: string): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session) throw new Error("Unauthenticated");

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) throw new Error("No staff profile");

  // Read the transcribers before the cascade removes them, to tell them.
  const test = await db.testSchedule.findFirst({
    where: { id: testId, staffId: staff.id },
    select: {
      date: true,
      period: true,
      periodCount: true,
      course: { select: { name: true } },
      group: { select: { name: true } },
      transcribers: { select: { staff: { select: { userId: true } }, student: { select: { user: { select: { name: true } } } } } },
    },
  });

  await db.testSchedule.delete({
    where: { id: testId, staffId: staff.id },
  });

  if (test && test.transcribers.length > 0) {
    try {
      const line = transcriberTestLine({
        dateLabel: fmtDisplayDate(test.date),
        period: test.period,
        periodCount: test.periodCount,
        courseName: test.course.name,
        groupName: test.group.name,
      });
      await db.notification.createMany({
        data: test.transcribers.flatMap((a) =>
          a.staff.userId
            ? [
                {
                  userId: a.staff.userId,
                  senderId: session.user.id,
                  type: "TRANSCRIBER_CANCELLED",
                  title: "Το διαγώνισμα ακυρώθηκε: δεν χρειάζεται μεταγραφέας",
                  body: `${line} · ${a.student.user?.name ?? ""}`,
                  linkUrl: "/teacher/dashboard",
                  read: false,
                },
              ]
            : [],
        ),
      });
    } catch (e) {
      logger.error({ event: "transcriber.notifyFailed", err: errInfo(e) }, "Transcriber notification failed");
    }
  }

  revalidatePath("/[locale]/teacher/tests", "page");
}
