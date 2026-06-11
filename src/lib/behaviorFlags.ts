// Behaviour-investigation engine (pure, no DB).
//
// A tool for the homegroup headteacher (and homeroom teacher / counselor) to
// catch behavioural PATTERNS early — the signal is the pattern, not the raw
// total. A single-period absence (present at school but missing one period) is
// a skip worth raising for investigation even though a totals view would bury
// it under "1 absence".
//
// The detectors return structured Flags; all user-facing wording lives in the
// page (i18n), so flags carry data (counts, course name, weekday) not prose.

export type AttStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export type AttRecord = {
  date: string; // ISO yyyy-mm-dd
  /** ISO weekday 1=Mon … 7=Sun. */
  dayOfWeek: number;
  period: number | null;
  courseId: string | null;
  courseName: string | null;
  status: AttStatus;
  /** Soft-erased (διαγραφή) — never counted. */
  waived: boolean;
  /** Auto-absent rolls into ABSENT for our purposes. */
  isAutoAbsent?: boolean;
};

export type ToiletRecord = {
  date: string; // ISO yyyy-mm-dd
  period: number | null;
  /** Minutes out of class; null while the break is still open. */
  minutes: number | null;
  courseId: string | null;
  courseName: string | null;
};

export type FlagCode =
  | "PARTIAL_DAY_ABSENCE"
  | "REPEATED_COURSE_SKIP"
  | "WEEKDAY_CLUSTER"
  | "LATENESS"
  | "TOILET_FREQUENT"
  | "TOILET_LONG"
  | "TOILET_SAME_LESSON";

export type Severity = "low" | "medium" | "high";

export type Flag = {
  code: FlagCode;
  severity: Severity;
  /** Primary magnitude (incidents / count). */
  count: number;
  /** Course name when the flag is about a specific lesson. */
  course?: string;
  /** ISO weekday 1=Mon … 7=Sun when the flag is about a weekday cluster. */
  weekday?: number;
};

// Tunable thresholds — exported so they can be reviewed / adjusted in one place.
export const THRESHOLDS = {
  /** Partial-day skips are raised EARLY: one is low, escalating with repeats. */
  partialDayMedium: 2,
  partialDayHigh: 3,
  /** Same course missed this many times → avoidance signal. */
  courseSkipMin: 3,
  courseSkipHigh: 5,
  /** Weekday clustering: at least this many absence-days on one weekday … */
  weekdayClusterMin: 3,
  /** … and that weekday holding at least this share of all absence-days. */
  weekdayClusterShare: 0.5,
  /** Repeated lateness. */
  latenessMin: 4,
  /** First-period lates that escalate lateness severity. */
  firstPeriodLateHigh: 3,
  /** Toilet breaks in a single day. */
  toiletPerDay: 3,
  /** A single toilet break running this long (minutes) is a welfare concern. */
  toiletLongMinutes: 10,
  /** Same lesson left this many times. */
  toiletSameLessonMin: 3,
};

const SEVERITY_WEIGHT: Record<Severity, number> = { low: 1, medium: 2, high: 3 };

/** Counts as an absence for pattern purposes (unexcused, on-record). */
function isAbsence(r: AttRecord): boolean {
  return !r.waived && (r.status === "ABSENT" || !!r.isAutoAbsent);
}

/** Was the student otherwise at school that period (present or merely late)? */
function isAtSchool(r: AttRecord): boolean {
  return !r.waived && (r.status === "PRESENT" || r.status === "LATE");
}

/**
 * Partial-day absences — a date where the student was ABSENT for ≥1 period but
 * PRESENT/LATE for ≥1 other period: at school, skipping isolated periods.
 * Raised early (one incident already flags, low severity).
 */
export function partialDayAbsences(att: AttRecord[]): Flag | null {
  const byDate = new Map<string, { absent: boolean; present: boolean }>();
  for (const r of att) {
    if (r.period == null) continue; // need period granularity
    let d = byDate.get(r.date);
    if (!d) {
      d = { absent: false, present: false };
      byDate.set(r.date, d);
    }
    if (isAbsence(r)) d.absent = true;
    else if (isAtSchool(r)) d.present = true;
  }
  let count = 0;
  for (const d of byDate.values()) if (d.absent && d.present) count += 1;
  if (count < 1) return null;
  const severity: Severity =
    count >= THRESHOLDS.partialDayHigh ? "high" : count >= THRESHOLDS.partialDayMedium ? "medium" : "low";
  return { code: "PARTIAL_DAY_ABSENCE", severity, count };
}

/**
 * Repeated same-lesson skips — a course absent ≥ courseSkipMin times.
 * One flag per offending course.
 */
export function repeatedCourseSkips(att: AttRecord[]): Flag[] {
  const byCourse = new Map<string, { name: string; count: number }>();
  for (const r of att) {
    if (!isAbsence(r) || !r.courseId) continue;
    let c = byCourse.get(r.courseId);
    if (!c) {
      c = { name: r.courseName ?? "—", count: 0 };
      byCourse.set(r.courseId, c);
    }
    c.count += 1;
  }
  const flags: Flag[] = [];
  for (const c of byCourse.values()) {
    if (c.count < THRESHOLDS.courseSkipMin) continue;
    flags.push({
      code: "REPEATED_COURSE_SKIP",
      severity: c.count >= THRESHOLDS.courseSkipHigh ? "high" : "medium",
      count: c.count,
      course: c.name,
    });
  }
  return flags.sort((a, b) => b.count - a.count);
}

/**
 * Weekday clustering — absence DAYS concentrated on one weekday (e.g. every
 * Friday). Uses distinct dates so a whole-day absence counts once.
 */
export function weekdayCluster(att: AttRecord[]): Flag | null {
  const datesByWeekday = new Map<number, Set<string>>();
  const allDates = new Set<string>();
  for (const r of att) {
    if (!isAbsence(r)) continue;
    allDates.add(r.date);
    let set = datesByWeekday.get(r.dayOfWeek);
    if (!set) {
      set = new Set();
      datesByWeekday.set(r.dayOfWeek, set);
    }
    set.add(r.date);
  }
  const total = allDates.size;
  if (total === 0) return null;
  let topWeekday = 0;
  let topCount = 0;
  for (const [wd, set] of datesByWeekday) {
    if (set.size > topCount) {
      topCount = set.size;
      topWeekday = wd;
    }
  }
  if (topCount < THRESHOLDS.weekdayClusterMin) return null;
  if (topCount / total < THRESHOLDS.weekdayClusterShare) return null;
  return {
    code: "WEEKDAY_CLUSTER",
    severity: topCount >= THRESHOLDS.weekdayClusterMin + 2 ? "high" : "medium",
    count: topCount,
    weekday: topWeekday,
  };
}

/** Repeated lateness — escalates when first-period lates dominate. */
export function latenessPattern(att: AttRecord[]): Flag | null {
  let total = 0;
  let firstPeriod = 0;
  for (const r of att) {
    if (r.waived || r.status !== "LATE") continue;
    total += 1;
    if (r.period === 1) firstPeriod += 1;
  }
  if (total < THRESHOLDS.latenessMin) return null;
  return {
    code: "LATENESS",
    severity: firstPeriod >= THRESHOLDS.firstPeriodLateHigh ? "high" : "medium",
    count: total,
  };
}

/** Toilet-break patterns — frequency, long durations, same-lesson repeats. */
export function toiletPatterns(breaks: ToiletRecord[]): Flag[] {
  const flags: Flag[] = [];

  // Frequent: most breaks in a single day.
  const perDay = new Map<string, number>();
  for (const b of breaks) perDay.set(b.date, (perDay.get(b.date) ?? 0) + 1);
  let maxPerDay = 0;
  for (const n of perDay.values()) if (n > maxPerDay) maxPerDay = n;
  if (maxPerDay >= THRESHOLDS.toiletPerDay) {
    flags.push({ code: "TOILET_FREQUENT", severity: maxPerDay >= THRESHOLDS.toiletPerDay + 2 ? "high" : "medium", count: maxPerDay });
  }

  // Long: breaks running over the threshold (welfare concern → high).
  const longCount = breaks.filter((b) => b.minutes != null && b.minutes > THRESHOLDS.toiletLongMinutes).length;
  if (longCount > 0) {
    flags.push({ code: "TOILET_LONG", severity: "high", count: longCount });
  }

  // Same lesson repeatedly left.
  const byCourse = new Map<string, { name: string; count: number }>();
  for (const b of breaks) {
    if (!b.courseId) continue;
    let c = byCourse.get(b.courseId);
    if (!c) {
      c = { name: b.courseName ?? "—", count: 0 };
      byCourse.set(b.courseId, c);
    }
    c.count += 1;
  }
  for (const c of byCourse.values()) {
    if (c.count >= THRESHOLDS.toiletSameLessonMin) {
      flags.push({ code: "TOILET_SAME_LESSON", severity: "medium", count: c.count, course: c.name });
    }
  }

  return flags;
}

export type StudentBehaviorInput = {
  attendance: AttRecord[];
  toilet: ToiletRecord[];
};

/** All flags for one student, severity-then-magnitude sorted. */
export function analyzeStudent(input: StudentBehaviorInput): Flag[] {
  const flags: Flag[] = [];
  const partial = partialDayAbsences(input.attendance);
  if (partial) flags.push(partial);
  flags.push(...repeatedCourseSkips(input.attendance));
  const cluster = weekdayCluster(input.attendance);
  if (cluster) flags.push(cluster);
  const late = latenessPattern(input.attendance);
  if (late) flags.push(late);
  flags.push(...toiletPatterns(input.toilet));
  return flags.sort(
    (a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || b.count - a.count
  );
}

/** Watchlist ranking score for a student from their flags. */
export function riskScore(flags: Flag[]): number {
  return flags.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
}
