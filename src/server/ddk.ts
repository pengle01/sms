import { db } from "@/server/db";
import type { SchoolYearRanges } from "@/lib/schoolYear";
import { fullAttendanceAward, type DerivedAward } from "@/lib/ddk";

// The automatic Πλήρης Φοίτηση (full-attendance) ΔΔΚ point is derived from a
// student's absences for the school year — not stored, so it always reflects
// current attendance. Absences = ABSENT periods on record, excluding soft-erased
// (waived) ones; LATE and EXCUSED do not count.

function absenceWhere(ranges: SchoolYearRanges) {
  return {
    status: "ABSENT" as const,
    waived: false,
    date: { gte: ranges.yearStart, lt: ranges.yearEnd },
  };
}

/** Auto full-attendance award for one student (or null when not eligible). */
export async function fullAttendanceAwardForStudent(
  studentId: string,
  ranges: SchoolYearRanges
): Promise<DerivedAward | null> {
  const absences = await db.attendance.count({
    where: { studentId, ...absenceWhere(ranges) },
  });
  return fullAttendanceAward(absences);
}

/** Auto full-attendance awards for many students, keyed by studentId. Students
 *  with no absence rows still get the award (0 absences < 24). */
export async function fullAttendanceAwards(
  studentIds: string[],
  ranges: SchoolYearRanges
): Promise<Map<string, DerivedAward | null>> {
  const result = new Map<string, DerivedAward | null>();
  if (studentIds.length === 0) return result;

  const grouped = await db.attendance.groupBy({
    by: ["studentId"],
    where: { studentId: { in: studentIds }, ...absenceWhere(ranges) },
    _count: { _all: true },
  });
  const counts = new Map(grouped.map((g) => [g.studentId, g._count._all]));

  for (const id of studentIds) {
    result.set(id, fullAttendanceAward(counts.get(id) ?? 0));
  }
  return result;
}
