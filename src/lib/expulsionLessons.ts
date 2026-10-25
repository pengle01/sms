// The lessons a student misses while expelled (αποβολή) — listed on the
// printed disciplinary decision so the student knows whose work to catch up.
// Pure (no DB) so the rule is unit-tested.

export interface ExpulsionSlot {
  dayOfWeek: number;
  /** The slot's period — needed when a day is only part of the day. */
  period?: number;
  courseName: string;
  teacherName: string;
}

/** An expulsion date: the whole day, or periods fromPeriod–toPeriod. */
export type ExpulsionDate = Date | string | { date: Date | string; fromPeriod?: number | null; toPeriod?: number | null };

/**
 * The distinct lessons (subject + teacher) on the expulsion days: the student's
 * timetable slots on those weekdays — only the expelled periods on a partial
 * day — skipping days with no school (holidays). Each subject/teacher pair is
 * listed once, sorted by subject, then teacher.
 */
export function missedLessons(
  slots: ExpulsionSlot[],
  expulsionDates: ExpulsionDate[],
  noSchoolIsos: Set<string> = new Set(),
): { courseName: string; teacherName: string }[] {
  // Weekday → "all" its periods, or the set of expelled periods.
  const days = new Map<number, "all" | Set<number>>();
  for (const raw of expulsionDates) {
    const d = typeof raw === "string" || raw instanceof Date ? { date: raw } : raw;
    const iso = typeof d.date === "string" ? d.date.slice(0, 10) : d.date.toISOString().slice(0, 10);
    if (noSchoolIsos.has(iso)) continue;
    const dow = new Date(iso + "T12:00:00.000Z").getUTCDay();
    if (dow < 1 || dow > 5) continue;
    const from = "fromPeriod" in d ? d.fromPeriod : null;
    const to = "toPeriod" in d ? d.toPeriod : null;
    if (from == null || to == null || days.get(dow) === "all") {
      days.set(dow, "all");
      continue;
    }
    const set = (days.get(dow) as Set<number> | undefined) ?? new Set<number>();
    for (let p = from; p <= to; p++) set.add(p);
    days.set(dow, set);
  }
  const covers = (s: ExpulsionSlot) => {
    const day = days.get(s.dayOfWeek);
    if (!day) return false;
    return day === "all" || (s.period !== undefined && day.has(s.period));
  };
  const seen = new Map<string, { courseName: string; teacherName: string }>();
  for (const s of slots) {
    if (!covers(s)) continue;
    const key = `${s.courseName}\u0000${s.teacherName}`;
    if (!seen.has(key)) seen.set(key, { courseName: s.courseName, teacherName: s.teacherName });
  }
  return [...seen.values()].sort(
    (a, b) =>
      a.courseName.localeCompare(b.courseName, "el") || a.teacherName.localeCompare(b.teacherName, "el"),
  );
}
