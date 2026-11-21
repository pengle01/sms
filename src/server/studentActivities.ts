import { db } from "@/server/db";
import { getSchoolYear } from "@/lib/schoolConfig";
import type { StudentActivityRow } from "@/lib/studentActivities";

/** The activities a student takes part in this school year, past and upcoming. */
export async function loadStudentActivities(studentId: string): Promise<StudentActivityRow[]> {
  const year = await getSchoolYear();
  const rows = await db.activityParticipant.findMany({
    where: { studentId, activity: { date: { gte: year.yearStart, lt: year.yearEnd } } },
    select: {
      activity: {
        select: {
          id: true,
          name: true,
          date: true,
          startPeriod: true,
          endPeriod: true,
          location: true,
          filer: { select: { scheduleName: true, user: { select: { name: true } } } },
        },
      },
    },
  });
  return rows.map(({ activity: a }) => ({
    id: a.id,
    name: a.name,
    date: a.date,
    startPeriod: a.startPeriod,
    endPeriod: a.endPeriod,
    location: a.location,
    teacher: a.filer.user?.name ?? a.filer.scheduleName ?? null,
  }));
}
