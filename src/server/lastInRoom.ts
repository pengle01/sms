import { db } from "@/server/db";
import { lastLessonRoom } from "@/lib/lastInRoom";

/**
 * The room a lesson is the last one in on this date (after the day's final
 * substitution plan), or null. Lessons have a weekday; the plan has a date.
 */
export async function lastInRoomFor(slotId: string, date: Date): Promise<string | null> {
  const slot = await db.timetableSlot.findUnique({ where: { id: slotId }, select: { dayOfWeek: true } });
  if (!slot) return null;
  const [lessons, plan] = await Promise.all([
    db.timetableSlot.findMany({
      where: { dayOfWeek: slot.dayOfWeek },
      select: { id: true, groupId: true, period: true, room: true },
    }),
    db.substitutionPlan.findFirst({
      where: { date, status: "FINAL" },
      select: { entries: { select: { kind: true, period: true, groupId: true, timetableSlotId: true, newRoom: true } } },
    }),
  ]);
  return lastLessonRoom(slotId, lessons, plan?.entries ?? []);
}
