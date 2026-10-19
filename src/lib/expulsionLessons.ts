// The lessons a student misses while expelled (αποβολή) — listed on the
// printed disciplinary decision so the student knows whose work to catch up.
// Pure (no DB) so the rule is unit-tested.

export interface ExpulsionSlot {
  dayOfWeek: number;
  courseName: string;
  teacherName: string;
}

/**
 * The distinct lessons (subject + teacher) on the expulsion days: the student's
 * timetable slots on those weekdays, skipping days with no school (holidays).
 * Each subject/teacher pair is listed once, sorted by subject, then teacher.
 */
export function missedLessons(
  slots: ExpulsionSlot[],
  expulsionDates: (Date | string)[],
  noSchoolIsos: Set<string> = new Set(),
): { courseName: string; teacherName: string }[] {
  const days = new Set<number>();
  for (const d of expulsionDates) {
    const iso = typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
    if (noSchoolIsos.has(iso)) continue;
    const dow = new Date(iso + "T12:00:00.000Z").getUTCDay();
    if (dow >= 1 && dow <= 5) days.add(dow);
  }
  const seen = new Map<string, { courseName: string; teacherName: string }>();
  for (const s of slots) {
    if (!days.has(s.dayOfWeek)) continue;
    const key = `${s.courseName}\u0000${s.teacherName}`;
    if (!seen.has(key)) seen.set(key, { courseName: s.courseName, teacherName: s.teacherName });
  }
  return [...seen.values()].sort(
    (a, b) =>
      a.courseName.localeCompare(b.courseName, "el") || a.teacherName.localeCompare(b.teacherName, "el"),
  );
}
