// Pure period helpers — no DB imports, safe for client components.

export type PeriodsPerDay = Record<number, number>; // DOW 1–5 → period count

export const DEFAULT_PERIODS_PER_DAY: PeriodsPerDay = { 1: 7, 2: 7, 3: 7, 4: 7, 5: 7 };

// Short period label, localised: "Π1" in Greek, "P1" otherwise.
export function periodLabel(period: number, locale: string): string {
  return `${locale === "el" ? "Π" : "P"}${period}`;
}

export function periodsForDow(config: PeriodsPerDay, dow: number): number[] {
  const count = config[dow] ?? 7;
  return Array.from({ length: count }, (_, i) => i + 1);
}

export function maxPeriodCount(config: PeriodsPerDay): number {
  return Math.max(...Object.values(config));
}

// Returns the expulsion days (YYYY-MM-DD) that fall before `todayIso`.
// Date-only strings compare lexicographically the same as chronologically.
export function expulsionDaysInPast(days: string[], todayIso: string): string[] {
  return days.filter((d) => d < todayIso);
}

// Total school periods across a set of expulsion days.
// Weekend days (Sat/Sun) contribute zero. Accepts Date objects or ISO date strings.
export function totalPeriodsForDays(
  config: PeriodsPerDay,
  days: (Date | string)[]
): number {
  return days.reduce<number>((sum, d) => {
    const date = d instanceof Date ? d : new Date(d + "T12:00:00");
    const dow = date.getDay(); // 0=Sun … 6=Sat
    return sum + (dow >= 1 && dow <= 5 ? (config[dow] ?? 7) : 0);
  }, 0);
}

/**
 * Lessons per period, keeping EVERY lesson: a teacher can have two in one
 * period (combined groups), and a map keyed by period alone silently dropped
 * all but the last. Each list is ordered by class name.
 */
export function groupByPeriod<T extends { period: number; group?: { name: string } | null }>(slots: T[]): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const s of slots) out.set(s.period, [...(out.get(s.period) ?? []), s]);
  for (const list of out.values()) {
    list.sort((a, b) => (a.group?.name ?? "").localeCompare(b.group?.name ?? "", "el", { numeric: true }));
  }
  return out;
}
