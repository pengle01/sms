import { db } from "@/server/db";
import { slotTeacherName } from "@/lib/staffName";
import { adHocCovers, markedKey, type AdHocCover } from "@/lib/coverMarked";

/**
 * The classes this teacher covered ad hoc («Κάλυψη τμήματος») between two
 * dates (inclusive): registers they took on someone else's lesson that no
 * finalized plan assigned. Keyed "YYYY-MM-DD:period" (the stored period).
 */
export async function loadAdHocCovers(staffId: string, from: Date, to: Date): Promise<Map<string, AdHocCover[]>> {
  const [rows, planEntries] = await Promise.all([
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
  ]);
  if (rows.length === 0) return new Map();

  const planSlots = new Set(planEntries.map((e) => markedKey(e.timetableSlotId!, e.plan.date)));
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
          }]
        : [],
    ),
    staffId,
    planSlots,
  );
}
