// The lessons a student misses while expelled (αποβολή) — listed on the
// printed disciplinary decision, date by date and period by period, so the
// secretary knows which lessons are affected and the student whose work to
// catch up. Pure (no DB) so the rule is unit-tested.

export interface ExpulsionSlot {
  dayOfWeek: number;
  period: number;
  courseName: string;
  teacherName: string;
  /** A subject/support group's lesson — it replaces the homegroup's lesson in that period. */
  subjectGroup?: boolean;
}

/** An expulsion date: the whole day, or periods fromPeriod–toPeriod. */
export type ExpulsionDate = Date | string | { date: Date | string; fromPeriod?: number | null; toPeriod?: number | null };

export interface MissedDay {
  iso: string;
  /** No school that day (holiday): nothing is missed. */
  noSchool: boolean;
  lessons: { period: number; courseName: string; teacherName: string }[];
}

/**
 * Each expulsion date (in date order) with the lessons of the student's
 * timetable on it — only the expelled periods on a partial day — one lesson per
 * period, a subject group's lesson over the homegroup's (as on the student's
 * own timetable). Holidays are kept, flagged, with no lessons; weekends dropped.
 */
export function missedLessonsByDay(
  slots: ExpulsionSlot[],
  expulsionDates: ExpulsionDate[],
  noSchoolIsos: Set<string> = new Set(),
): MissedDay[] {
  const days: MissedDay[] = [];
  for (const raw of expulsionDates) {
    const d = typeof raw === "string" || raw instanceof Date ? { date: raw } : raw;
    const iso = typeof d.date === "string" ? d.date.slice(0, 10) : d.date.toISOString().slice(0, 10);
    const dow = new Date(iso + "T12:00:00.000Z").getUTCDay();
    if (dow < 1 || dow > 5) continue;
    if (noSchoolIsos.has(iso)) {
      days.push({ iso, noSchool: true, lessons: [] });
      continue;
    }
    const from = "fromPeriod" in d ? d.fromPeriod : null;
    const to = "toPeriod" in d ? d.toPeriod : null;
    const partial = from != null && to != null;
    const byPeriod = new Map<number, ExpulsionSlot>();
    for (const s of slots) {
      if (s.dayOfWeek !== dow) continue;
      if (partial && (s.period < from || s.period > to)) continue;
      const held = byPeriod.get(s.period);
      if (!held || (s.subjectGroup && !held.subjectGroup)) byPeriod.set(s.period, s);
    }
    days.push({
      iso,
      noSchool: false,
      lessons: [...byPeriod.values()]
        .sort((a, b) => a.period - b.period)
        .map((s) => ({ period: s.period, courseName: s.courseName, teacherName: s.teacherName })),
    });
  }
  return days.sort((a, b) => a.iso.localeCompare(b.iso));
}
