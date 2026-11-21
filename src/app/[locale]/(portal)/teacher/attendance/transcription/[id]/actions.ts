"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { utcMidnight } from "@/lib/dates";
import { dutyDowFor } from "@/lib/dutyRoster";
import { getSchoolYear } from "@/lib/schoolConfig";
import { isWithinSchoolYear } from "@/lib/schoolYear";
import { lessonTeacherNameFor } from "@/lib/attendanceLesson";
import { permitByStudent, permitLinkFor } from "@/lib/exitPermit";
import { testPeriods } from "@/lib/transcribers";
import { sendAbsenceSms } from "@/server/absenceSms";

export type TranscriptionMark = { period: number; status: "PRESENT" | "ABSENT" | "LATE"; minutesDelayed: number };
export type TranscriptionSaveResult = { ok: true } | { ok: false; error: "notYours" | "future" | "outOfYear" | "noLesson" };

/**
 * The transcriber's register: the one student they sit a test with, for the
 * test's period(s). The rows land on the class's own lesson, so the absence
 * counts in that subject, but flagged — they never make the class register
 * «taken», which stays the teacher's to take for everyone else.
 */
export async function saveTranscriptionAttendance(id: string, marks: TranscriptionMark[]): Promise<TranscriptionSaveResult> {
  const session = await getServerSession(authOptions);
  if (!session) return { ok: false, error: "notYours" };
  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id }, select: { id: true } });
  const row = await db.testTranscriber.findUnique({
    where: { id },
    select: { staffId: true, studentId: true, test: { select: { groupId: true, date: true, period: true, periodCount: true } } },
  });
  if (!staff || !row || row.staffId !== staff.id) return { ok: false, error: "notYours" };

  const { test, studentId } = row;
  if (test.date > utcMidnight()) return { ok: false, error: "future" };
  if (!isWithinSchoolYear(test.date, await getSchoolYear())) return { ok: false, error: "outOfYear" };

  const periods = testPeriods(test.period, test.periodCount);
  const dow = dutyDowFor(test.date);
  const slots = dow
    ? await db.timetableSlot.findMany({
        where: { groupId: test.groupId, dayOfWeek: dow, period: { in: periods } },
        select: { id: true, period: true, courseId: true, staffId: true, staffName: true, staff: { select: { scheduleName: true } } },
      })
    : [];
  const wanted = marks.filter((m) => periods.includes(m.period));
  if (wanted.length === 0 || wanted.some((m) => !slots.some((s) => s.period === m.period))) {
    return { ok: false, error: "noLesson" };
  }

  const [thresholdSetting, permits] = await Promise.all([
    db.globalSetting.findUnique({ where: { key: "delay_threshold_minutes" } }),
    db.exitPermit.findMany({ where: { date: test.date, active: true, studentId } }),
  ]);
  const threshold = thresholdSetting ? parseInt(thresholdSetting.value) : 15;

  const saved = await db.$transaction(
    wanted.map((m) => {
      const slot = slots.find((s) => s.period === m.period)!;
      const minutesDelayed = m.status === "LATE" ? Math.max(0, Math.floor(m.minutesDelayed)) : 0;
      const isAutoAbsent = minutesDelayed > threshold;
      const status = isAutoAbsent ? "ABSENT" : m.status;
      const data = {
        staffId: staff.id,
        status,
        minutesDelayed,
        isAutoAbsent,
        exitPermitId: permitLinkFor(status, permitByStudent(permits, test.date, m.period)[studentId]),
        courseId: slot.courseId,
        lessonKind: "LESSON" as const,
        lessonTeacherName: lessonTeacherNameFor({
          markerStaffId: staff.id,
          slotStaffId: slot.staffId,
          slotStaffName: slot.staffName,
          linkedScheduleName: slot.staff?.scheduleName,
        }),
        permitPremarked: false,
        transcriberMarked: true,
      };
      return db.attendance.upsert({
        where: { studentId_timetableSlotId_date: { studentId, timetableSlotId: slot.id, date: test.date } },
        create: { studentId, timetableSlotId: slot.id, date: test.date, ...data },
        update: data,
      });
    }),
  );

  // Parents hear of a first-period absence, as with the class register.
  if (wanted.some((m) => m.period === 1)) await sendAbsenceSms(saved, session.user.id);

  revalidatePath("/[locale]/teacher/dashboard", "page");
  return { ok: true };
}
