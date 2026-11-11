import { db } from "@/server/db";
import { getSchoolYear } from "@/lib/schoolConfig";
import { schoolYearLabel } from "@/lib/ddk";
import { termOf, type SchoolYearRanges } from "@/lib/schoolYear";
import { localDateStr, utcMidnight } from "@/lib/dates";
import { carriedAppliesToWindow } from "@/lib/carriedAbsences";

/** The school-year key the numbers are kept under ("2026-2027"). */
export function carriedYearKey(ranges: Pick<SchoolYearRanges, "yearStart">): string {
  return schoolYearLabel(ranges.yearStart.getUTCFullYear());
}

/** Carried-over periods for these students in the given (default: current) school year. */
export async function carriedAbsenceMap(
  studentIds: readonly string[],
  ranges?: SchoolYearRanges,
): Promise<Map<string, number>> {
  if (studentIds.length === 0) return new Map();
  const schoolYear = carriedYearKey(ranges ?? (await getSchoolYear()));
  const rows = await db.carriedAbsence.findMany({
    where: { studentId: { in: [...studentIds] }, schoolYear },
    select: { studentId: true, periods: true },
  });
  return new Map(rows.map((r) => [r.studentId, r.periods]));
}

export async function carriedAbsenceFor(studentId: string, ranges?: SchoolYearRanges): Promise<number> {
  return (await carriedAbsenceMap([studentId], ranges)).get(studentId) ?? 0;
}

/** The numbers for a «Τμήμα μου» period; empty for a week or the last 30 days. */
export async function carriedAbsencesForWindow(
  studentIds: readonly string[],
  window: string,
): Promise<Map<string, number>> {
  const ranges = await getSchoolYear();
  const term = termOf(utcMidnight(localDateStr()), ranges);
  if (!carriedAppliesToWindow(window, term)) return new Map();
  return carriedAbsenceMap(studentIds, ranges);
}
