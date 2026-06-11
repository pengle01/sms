import { db } from "@/server/db";
import type { SchoolYearRanges } from "@/lib/schoolYear";
import { fullAttendanceAward, ddkCategoryLabel, FULL_ATTENDANCE_CODE, FULL_ATTENDANCE_POINTS, type DerivedAward } from "@/lib/ddk";
import { staffDisplayName } from "@/lib/staffName";

// Official wording for the auto full-attendance entry (per the printed report).
export const FULL_ATTENDANCE_DESC =
  "Οι μαθητές/τριες δεν έχουν σημειώσει περισσότερες από 24 απουσίες.";

// One ΔΔΚ entry, enriched for the printed reports.
export interface DdkReportAward {
  categoryCode: string;
  points: number;
  description: string; // Περιγραφή — the activity/event
  date: Date | null; // Ημερομηνία
  recordedBy: string; // Καταχωρήθηκε από
  responsibleTeacher: string; // Υπ. Καθηγητής
  activityId: string | null;
}

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

// Enriched ΔΔΚ entries for the printed reports (stored awards + the auto
// full-attendance point), keyed by studentId.
export async function loadDdkAwardsForStudents(
  studentIds: string[],
  schoolYear: string,
  ranges: SchoolYearRanges
): Promise<Map<string, DdkReportAward[]>> {
  const out = new Map<string, DdkReportAward[]>();
  for (const id of studentIds) out.set(id, []);
  if (studentIds.length === 0) return out;

  const awards = await db.ddkAward.findMany({
    where: { studentId: { in: studentIds }, schoolYear },
    include: {
      activity: {
        select: {
          name: true,
          date: true,
          filer: { select: { scheduleName: true, user: { select: { name: true } } } },
        },
      },
      awardedBy: { select: { scheduleName: true, user: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const a of awards) {
    out.get(a.studentId)?.push({
      categoryCode: a.categoryCode,
      points: a.points,
      description: a.activity?.name ?? a.note ?? ddkCategoryLabel(a.categoryCode),
      date: a.activity?.date ?? a.createdAt,
      recordedBy: staffDisplayName(a.awardedBy, ""),
      responsibleTeacher: a.activity?.filer ? staffDisplayName(a.activity.filer, "") : "",
      activityId: a.activityId,
    });
  }

  // Inject the computed full-attendance point.
  const auto = await fullAttendanceAwards(studentIds, ranges);
  for (const id of studentIds) {
    if (auto.get(id)) {
      out.get(id)!.push({
        categoryCode: FULL_ATTENDANCE_CODE,
        points: FULL_ATTENDANCE_POINTS,
        description: FULL_ATTENDANCE_DESC,
        date: null,
        recordedBy: "",
        responsibleTeacher: "",
        activityId: null,
      });
    }
  }
  return out;
}
