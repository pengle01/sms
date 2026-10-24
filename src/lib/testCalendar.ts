// The month calendar of tests — for students (their own tests) and teachers
// («Διαγωνίσματα των μαθητών μου»). School days only (Monday–Friday). Pure:
// the month arithmetic and the day grouping are unit-tested; the grid is
// src/components/tests/TestsCalendar.tsx. All dates are UTC midnight.

export interface YearMonth {
  year: number;
  /** 1–12 */
  month: number;
}

/** "2026-11" → that month; anything else → the month of `today`. */
export function parseMonth(param: string | null | undefined, today: Date): YearMonth {
  const m = (param ?? "").match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) return { year, month };
  }
  return { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
}

export function monthParam(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, "0")}`;
}

export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const i = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

/** First and last day of the month (UTC midnight), for the database query. */
export function monthBounds(ym: YearMonth): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(ym.year, ym.month - 1, 1)),
    to: new Date(Date.UTC(ym.year, ym.month, 0)),
  };
}

export interface CalendarDay {
  date: Date;
  iso: string;
  /** False for the days of the neighbouring months that fill the first/last week. */
  inMonth: boolean;
}

/**
 * The month as weeks of school days (Monday–Friday). The first week starts on
 * the Monday on or before the 1st, the last ends on the Friday on or after the
 * last day; weeks with no day of the month (a month starting on a weekend) are
 * left out.
 */
export function monthWeeks(ym: YearMonth): CalendarDay[][] {
  const { from, to } = monthBounds(ym);
  const day = 86_400_000;
  const mondayOffset = (from.getUTCDay() + 6) % 7; // Mon 0 … Sun 6
  let cursor = new Date(from.getTime() - mondayOffset * day);
  const weeks: CalendarDay[][] = [];
  while (cursor <= to) {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(cursor.getTime() + i * day);
      week.push({ date: d, iso: d.toISOString().slice(0, 10), inMonth: d.getUTCMonth() === ym.month - 1 });
    }
    if (week.some((d) => d.inMonth)) weeks.push(week);
    cursor = new Date(cursor.getTime() + 7 * day);
  }
  return weeks;
}

/** Items by day ("YYYY-MM-DD"), each day's in the given order. */
export function byDay<T>(items: T[], dateOf: (t: T) => Date): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const key = dateOf(it).toISOString().slice(0, 10);
    const list = out.get(key);
    if (list) list.push(it);
    else out.set(key, [it]);
  }
  return out;
}

/** The days a set of special days marks as closed (holidays), as "YYYY-MM-DD". */
export function closedDays(ranges: { startDate: Date; endDate: Date }[], from: Date, to: Date): Set<string> {
  const out = new Set<string>();
  const day = 86_400_000;
  for (const r of ranges) {
    const start = Math.max(r.startDate.getTime(), from.getTime());
    const end = Math.min(r.endDate.getTime(), to.getTime());
    for (let t = start; t <= end; t += day) out.add(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
