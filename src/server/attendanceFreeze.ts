import { db } from "@/server/db";

/**
 * Called just before an import changes a lesson's subject or teacher: rows saved
 * before attendance kept these facts itself take them from the lesson as it still
 * is. Newer rows already hold theirs and are left alone.
 */
export async function freezeSlotAttendance(slot: {
  id: string;
  courseId: string;
  staffId: string | null;
  staffName: string | null;
  staff: { scheduleName: string | null } | null;
}) {
  const added = await db.addedLesson.findMany({
    where: { timetableSlotId: slot.id },
    select: { date: true, courseId: true, staffId: true },
  });
  for (const a of added) {
    await db.attendance.updateMany({
      where: { timetableSlotId: slot.id, date: a.date, staffId: a.staffId, courseId: null },
      data: { courseId: a.courseId, lessonKind: "LESSON" },
    });
  }
  await db.attendance.updateMany({
    where: { timetableSlotId: slot.id, courseId: null },
    data: { courseId: slot.courseId },
  });
  // Whose lesson it was, for registers someone else took.
  const lessonTeacher = slot.staff?.scheduleName ?? slot.staffName;
  if (lessonTeacher) {
    await db.attendance.updateMany({
      where: {
        timetableSlotId: slot.id,
        lessonTeacherName: null,
        permitPremarked: false,
        ...(slot.staffId ? { staffId: { not: slot.staffId } } : {}),
      },
      data: { lessonTeacherName: lessonTeacher },
    });
  }
  if (slot.staffId) {
    await db.attendance.updateMany({
      where: { timetableSlotId: slot.id, lessonKind: null, permitPremarked: false, staffId: slot.staffId },
      data: { lessonKind: "LESSON" },
    });
  }
  await db.attendance.updateMany({
    where: { timetableSlotId: slot.id, lessonKind: null, permitPremarked: false },
    data: { lessonKind: "SUBSTITUTION" },
  });
}
