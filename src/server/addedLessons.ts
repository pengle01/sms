import { db } from "@/server/db";
import { markedKey } from "@/lib/coverMarked";

/**
 * «Δικό μου μάθημα» lessons among attendance rows: for each (slot, date) a
 * teacher held their own subject on, the subject's name and who held it —
 * keyed markedKey(slot, date). Wherever a record names its lesson, the subject
 * actually taught replaces the timetable's.
 */
export async function addedLessonsFor(
  rows: readonly { timetableSlotId: string | null; date: Date }[],
): Promise<Map<string, { courseName: string; courseNameEl: string; staffId: string }>> {
  const slotIds = [...new Set(rows.flatMap((r) => (r.timetableSlotId ? [r.timetableSlotId] : [])))];
  if (slotIds.length === 0) return new Map();
  const dates = rows.map((r) => r.date.getTime());
  const added = await db.addedLesson.findMany({
    where: {
      timetableSlotId: { in: slotIds },
      date: { gte: new Date(Math.min(...dates)), lte: new Date(Math.max(...dates)) },
    },
    select: { timetableSlotId: true, date: true, staffId: true, course: { select: { name: true, nameEl: true } } },
  });
  return new Map(
    added.map((a) => [
      markedKey(a.timetableSlotId, a.date),
      { courseName: a.course.name, courseNameEl: a.course.nameEl, staffId: a.staffId },
    ]),
  );
}

/**
 * The same attendance rows with each «Δικό μου μάθημα» lesson's course
 * replaced by the subject actually taught — for pages that list a student's
 * records by subject. Other rows come back unchanged.
 */
export async function withTaughtCourses<
  T extends { timetableSlotId: string | null; date: Date; timetableSlot: { course: { name: string } } | null },
>(rows: T[]): Promise<T[]> {
  const added = await addedLessonsFor(rows);
  if (added.size === 0) return rows;
  return rows.map((r) => {
    const own = r.timetableSlotId ? added.get(markedKey(r.timetableSlotId, r.date)) : undefined;
    if (!own || !r.timetableSlot) return r;
    const course = { ...r.timetableSlot.course, name: own.courseName };
    if ("nameEl" in course) (course as { nameEl: string }).nameEl = own.courseNameEl;
    return { ...r, timetableSlot: { ...r.timetableSlot, course } };
  });
}
