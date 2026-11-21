// Pure helpers for a student's activities list (parents' and students' portals).

export interface StudentActivityRow {
  id: string;
  name: string;
  date: Date;
  startPeriod: number;
  endPeriod: number;
  location: string | null;
  /** The teacher who filed it. */
  teacher: string | null;
}

/**
 * Split into upcoming (today included; soonest first) and past (latest first).
 * `today` is a UTC-midnight date, as activity dates are.
 */
export function splitActivities<T extends { date: Date; startPeriod: number }>(
  rows: readonly T[],
  today: Date,
): { upcoming: T[]; past: T[] } {
  const asc = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime() || a.startPeriod - b.startPeriod);
  return {
    upcoming: asc.filter((r) => r.date >= today),
    past: asc.filter((r) => r.date < today).reverse(),
  };
}

/** «Π3» or «Π3–5» (P in English). */
export function activityPeriods(startPeriod: number, endPeriod: number, locale: string): string {
  const p = locale === "el" ? "Π" : "P";
  return endPeriod > startPeriod ? `${p}${startPeriod}–${endPeriod}` : `${p}${startPeriod}`;
}
