import { db } from "@/server/db";
import { slotTeacherName } from "@/lib/staffName";
import { adHocCovers, markedKey, type AdHocCover } from "@/lib/coverMarked";

/**
 * The classes this teacher covered ad hoc («Αναπλήρωση τμήματος») between two
 * dates (inclusive): registers they took on someone else's lesson that no
 * finalized plan assigned. Keyed "YYYY-MM-DD:period" (the stored period).
 */
export async function loadAdHocCovers(staffId: string, from: Date, to: Date): Promise<Map<string, AdHocCover[]>> {
  const [rows, planEntries, added] = await Promise.all([
    db.attendance.findMany({
      where: {
        staffId,
        date: { gte: from, lte: to },
        timetableSlot: { removedAt: null, OR: [{ staffId: null }, { staffId: { not: staffId } }] },
      },
      distinct: ["timetableSlotId", "date"],
      select: {
        date: true,
        timetableSlot: {
          select: {
            id: true,
            period: true,
            staffId: true,
            staffName: true,
            groupId: true,
            group: { select: { name: true } },
            course: { select: { name: true } },
            staff: { select: { scheduleName: true, user: { select: { name: true } } } },
          },
        },
      },
    }),
    db.substitutionPlanEntry.findMany({
      where: { plan: { status: "FINAL", date: { gte: from, lte: to } }, timetableSlotId: { not: null } },
      select: { timetableSlotId: true, plan: { select: { date: true } } },
    }),
    // «Δικό μου μάθημα»: the lessons where I taught my own subject instead.
    db.addedLesson.findMany({
      where: { staffId, date: { gte: from, lte: to } },
      select: { timetableSlotId: true, date: true, course: { select: { name: true } } },
    }),
  ]);
  if (rows.length === 0) return new Map();

  const planSlots = new Set(planEntries.map((e) => markedKey(e.timetableSlotId!, e.plan.date)));
  const addedCourse = new Map(added.map((a) => [markedKey(a.timetableSlotId, a.date), a.course.name]));
  return adHocCovers(
    rows.flatMap(({ date, timetableSlot: s }) =>
      s
        ? [{
            date,
            slotId: s.id,
            slotStaffId: s.staffId,
            period: s.period,
            groupId: s.groupId,
            groupName: s.group.name,
            courseName: s.course.name,
            teacherName: slotTeacherName(s),
            addedCourseName: addedCourse.get(markedKey(s.id, date)),
          }]
        : [],
    ),
    staffId,
    planSlots,
  );
}
