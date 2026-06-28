// School-year, term (τετράμηνο), and ministry-holiday date ranges. Pure — no
// DB imports.
//
// The ministry announces these dates early each school year; the super admin
// enters them under Settings → School Year & Terms (GlobalSetting "termDates"):
//   Α΄ τετράμηνο: start, end, last test date
//   Β΄ τετράμηνο: start, end, last test date
//   Christmas and Easter holidays: start and end
// The computed defaults below are only the fallback when nothing is
// configured. All boundaries are UTC midnights, matching how Attendance.date
// is stored (see utcMidnight in src/lib/dates.ts).

/** A date range; `start` inclusive, `end` EXCLUSIVE. */
export interface DateRange {
  start: Date;
  end: Date;
}

export interface SchoolYearRanges {
  /** First day of the school year / Α΄ τετράμηνο. */
  yearStart: Date;
  /** Exclusive end of Α΄ τετράμηνο (day after its last day). */
  term1End: Date;
  /** First day of Β΄ τετράμηνο. */
  term2Start: Date;
  /** Exclusive end of Β΄ τετράμηνο and of the school year. */
  yearEnd: Date;
  /** Ministry holiday ranges, when configured. */
  christmas: DateRange | null;
  easter: DateRange | null;
}

/** Default ranges containing `today` (year flips on 1 Sep; Β΄ starts 1 Feb). */
export function schoolYearRanges(today: Date): SchoolYearRanges {
  const y = today.getUTCFullYear();
  const startYear = today.getUTCMonth() >= 8 ? y : y - 1; // month 8 = September
  const term2Start = new Date(Date.UTC(startYear + 1, 1, 1)); // 1 February
  return {
    yearStart: new Date(Date.UTC(startYear, 8, 1)),
    term1End: term2Start, // no gap by default
    term2Start,
    yearEnd: new Date(Date.UTC(startYear + 1, 8, 1)),
    christmas: null,
    easter: null,
  };
}

/**
 * Which term a (UTC-midnight) date falls into, or null when outside both
 * (before the year, after it, or in the gap between the terms).
 */
export function termOf(date: Date, ranges: SchoolYearRanges): "TERM1" | "TERM2" | null {
  if (date >= ranges.yearStart && date < ranges.term1End) return "TERM1";
  if (date >= ranges.term2Start && date < ranges.yearEnd) return "TERM2";
  return null;
}

/**
 * True when a (UTC-midnight) date falls inside a term of the school year —
 * i.e. not before the year, not after it, and not in the gap between the two
 * terms. Use this to reject attendance/records dated outside the school year.
 */
export function isWithinSchoolYear(date: Date, ranges: SchoolYearRanges): boolean {
  return termOf(date, ranges) !== null;
}

// ── Admin-configured dates (GlobalSetting "termDates") ──────────────────────

export interface TermDatesConfig {
  /** First day of Α΄ τετράμηνο, "YYYY-MM-DD". */
  term1Start?: string | null;
  /** LAST day of Α΄ τετράμηνο (inclusive). */
  term1End?: string | null;
  /** Last day tests may be scheduled in Α΄ τετράμηνο (inclusive). */
  testDeadline1?: string | null;
  /** First day of Β΄ τετράμηνο. */
  term2Start?: string | null;
  /** LAST day of Β΄ τετράμηνο / the school year (inclusive). */
  term2End?: string | null;
  /** Last day tests may be scheduled in Β΄ τετράμηνο (inclusive). */
  testDeadline2?: string | null;
  /** Christmas holidays, first and last day (inclusive). */
  christmasStart?: string | null;
  christmasEnd?: string | null;
  /** Easter holidays, first and last day (inclusive). */
  easterStart?: string | null;
  easterEnd?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a "YYYY-MM-DD" config value to a UTC midnight, or null if invalid. */
export function parseConfigDate(v: string | null | undefined): Date | null {
  if (!v || !DATE_RE.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Inclusive start/end strings → DateRange (end exclusive), or null. */
function configRange(start?: string | null, end?: string | null): DateRange | null {
  const s = parseConfigDate(start);
  const e = parseConfigDate(end);
  if (!s || !e || e < s) return null;
  return { start: s, end: addDays(e, 1) };
}

/**
 * Resolve the school-year ranges from the admin-configured dates, falling
 * back to the computed defaults for anything missing or invalid. Configured
 * end dates are inclusive and become exclusive boundaries internally. A
 * config whose term dates are out of order is ignored entirely (holidays are
 * still applied — each pair stands on its own).
 */
export function resolveSchoolYear(now: Date, config: TermDatesConfig | null): SchoolYearRanges {
  const defaults = schoolYearRanges(now);
  const yearStart = parseConfigDate(config?.term1Start) ?? defaults.yearStart;
  const term2Start = parseConfigDate(config?.term2Start) ?? defaults.term2Start;
  const term1EndIncl = parseConfigDate(config?.term1End);
  const term1End = term1EndIncl ? addDays(term1EndIncl, 1) : term2Start;
  const term2EndIncl = parseConfigDate(config?.term2End);
  const yearEnd = term2EndIncl ? addDays(term2EndIncl, 1) : defaults.yearEnd;

  const holidays = {
    christmas: configRange(config?.christmasStart, config?.christmasEnd),
    easter: configRange(config?.easterStart, config?.easterEnd),
  };

  const ordered = yearStart < term1End && term1End <= term2Start && term2Start < yearEnd;
  if (!ordered) return { ...defaults, ...holidays };
  return { yearStart, term1End, term2Start, yearEnd, ...holidays };
}

/** "CHRISTMAS"/"EASTER" when the date falls in a configured holiday range. */
export function configuredHolidayFor(
  date: Date,
  ranges: SchoolYearRanges
): "CHRISTMAS" | "EASTER" | null {
  if (ranges.christmas && date >= ranges.christmas.start && date < ranges.christmas.end) {
    return "CHRISTMAS";
  }
  if (ranges.easter && date >= ranges.easter.start && date < ranges.easter.end) {
    return "EASTER";
  }
  return null;
}

export interface ActiveTermInfo {
  term: "TERM1" | "TERM2";
  /** Last day a test may be scheduled (inclusive). Falls back to term end. */
  testDeadline: Date;
}

/**
 * The term a date falls into plus its test deadline, or null when the date is
 * outside both terms. Without a configured deadline, the whole term is open
 * for tests (deadline = last day of the term).
 */
export function activeTermFor(
  date: Date,
  ranges: SchoolYearRanges,
  config: TermDatesConfig | null
): ActiveTermInfo | null {
  const term = termOf(date, ranges);
  if (!term) return null;
  const configured = parseConfigDate(
    term === "TERM1" ? config?.testDeadline1 : config?.testDeadline2
  );
  const termEnd = term === "TERM1" ? addDays(ranges.term1End, -1) : addDays(ranges.yearEnd, -1);
  return { term, testDeadline: configured ?? termEnd };
}
