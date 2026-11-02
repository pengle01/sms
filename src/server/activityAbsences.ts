import { db } from "@/server/db";
import { utcMidnight } from "@/lib/dates";
import { buildActivityIndex, type ActivityIndex } from "@/lib/activities";

/**
 * The activities between two dates (inclusive), indexed by student and day —
 * for labelling absences «Δραστηριότητα» in the reports. `studentIds` narrows
 * the participants when the report's students are known.
 */
export async function loadActivityIndex(
  from: string | Date,
  to: string | Date,
  studentIds?: readonly string[],
): Promise<ActivityIndex> {
  const activities = await db.activity.findMany({
    where: { date: { gte: utcMidnight(from), lte: utcMidnight(to) } },
    select: {
      name: true,
      date: true,
      startPeriod: true,
      endPeriod: true,
      participants: {
        where: studentIds ? { studentId: { in: [...studentIds] } } : undefined,
        select: { studentId: true },
      },
    },
  });
  return buildActivityIndex(
    activities.map((a) => ({ ...a, studentIds: a.participants.map((p) => p.studentId) })),
  );
}

/** The activity index covering these attendance rows' students and dates. */
export async function activityIndexFor(rows: readonly { studentId: string; date: Date }[]): Promise<ActivityIndex> {
  if (rows.length === 0) return new Map();
  const times = rows.map((r) => r.date.getTime());
  return loadActivityIndex(
    new Date(Math.min(...times)).toISOString().slice(0, 10),
    new Date(Math.max(...times)).toISOString().slice(0, 10),
    [...new Set(rows.map((r) => r.studentId))],
  );
}
