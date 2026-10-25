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

/** One expulsion day: the whole day, or periods fromPeriod–toPeriod (inclusive). */
export interface ExpulsionDayInput {
  date: Date | string;
  fromPeriod?: number | null;
  toPeriod?: number | null;
}

/** The weekday (0 Sun … 6 Sat) of a date-only value — Date or "YYYY-MM-DD". */
function dowOf(d: Date | string): number {
  const date = d instanceof Date ? d : new Date(d + "T12:00:00");
  return date.getDay();
}

const asDay = (d: Date | string | ExpulsionDayInput): ExpulsionDayInput =>
  typeof d === "string" || d instanceof Date ? { date: d } : d;

/** Is this day only part of the day (a period range)? */
export function isPartialDay(d: { fromPeriod?: number | null; toPeriod?: number | null }): boolean {
  return d.fromPeriod != null && d.toPeriod != null;
}

/**
 * The periods one expulsion day counts: the whole day's periods, or the size
 * of its range (clamped to the day). Weekends count zero.
 */
export function expulsionDayPeriods(config: PeriodsPerDay, day: Date | string | ExpulsionDayInput): number {
  const d = asDay(day);
  const dow = dowOf(d.date);
  if (dow < 1 || dow > 5) return 0;
  const n = config[dow] ?? 7;
  if (!isPartialDay(d)) return n;
  const from = Math.max(1, d.fromPeriod!);
  const to = Math.min(n, d.toPeriod!);
  return to >= from ? to - from + 1 : 0;
}

// Total school periods across a set of expulsion days — whole days or period
// ranges. Weekend days contribute zero. Accepts Dates, ISO date strings or day objects.
export function totalPeriodsForDays(
  config: PeriodsPerDay,
  days: (Date | string | ExpulsionDayInput)[]
): number {
  return days.reduce<number>((sum, d) => sum + expulsionDayPeriods(config, d), 0);
}

/**
 * Is a day's range valid? Whole day (neither end) or both ends set, within the
 * day's 1…periodsOfDay, from ≤ to.
 */
export function validExpulsionDay(
  d: { fromPeriod?: number | null; toPeriod?: number | null },
  periodsOfDay: number,
): boolean {
  const hasFrom = d.fromPeriod != null;
  const hasTo = d.toPeriod != null;
  if (!hasFrom && !hasTo) return true;
  if (hasFrom !== hasTo) return false;
  const from = d.fromPeriod!;
  const to = d.toPeriod!;
  return Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to <= periodsOfDay && from <= to;
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
