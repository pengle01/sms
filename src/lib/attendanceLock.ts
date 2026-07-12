// Attendance-completion lock: when enabled by the super admin, a teacher with
// unmarked PAST lessons (within the configured window) is blocked from the rest
// of the teacher portal until they record them. Pure helpers only — no DB.

export type AttendanceLockWindow = "day" | "week" | "term" | "year";

// A `type` (not `interface`) so it gets an implicit index signature and stays
// assignable to Prisma's JSON input types (audit details, GlobalSetting).
export type AttendanceLockConfig = {
  enabled: boolean;
  window: AttendanceLockWindow;
};

export const ATTENDANCE_LOCK_KEY = "attendance_lock";
export const ATTENDANCE_LOCK_WINDOWS: AttendanceLockWindow[] = ["day", "week", "term", "year"];
export const DEFAULT_ATTENDANCE_LOCK: AttendanceLockConfig = { enabled: false, window: "week" };

/** Parse the stored GlobalSetting JSON, tolerating anything malformed. */
export function parseAttendanceLock(value: string | null | undefined): AttendanceLockConfig {
  if (!value) return { ...DEFAULT_ATTENDANCE_LOCK };
  try {
    const o = JSON.parse(value) as Partial<AttendanceLockConfig>;
    const window = ATTENDANCE_LOCK_WINDOWS.includes(o?.window as AttendanceLockWindow)
      ? (o!.window as AttendanceLockWindow)
      : DEFAULT_ATTENDANCE_LOCK.window;
    return { enabled: o?.enabled === true, window };
  } catch {
    return { ...DEFAULT_ATTENDANCE_LOCK };
  }
}

/** Add (or subtract) whole days to a YYYY-MM-DD string, staying in UTC. */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Inclusive start date (YYYY-MM-DD) of the lock window. "day"/"week" both look
 * back 7 calendar days from today (the caller trims "day" to the single most
 * recent school day); "term"/"year" use the configured boundaries.
 */
export function attendanceLockStartIso(
  window: AttendanceLockWindow,
  todayIso: string,
  yearStartIso: string,
  termStartIso: string,
): string {
  switch (window) {
    case "year":
      return yearStartIso;
    case "term":
      return termStartIso;
    case "week":
    case "day":
      return addDaysIso(todayIso, -7);
  }
}

/**
 * Mon–Fri ISO dates in [startIso, endIsoExclusive). Weekends are dropped; the
 * end (today) is excluded because a lesson can only be "missed" once its day
 * has fully passed (there are no bell times to judge mid-day).
 */
export function schoolWeekdaysBetween(startIso: string, endIsoExclusive: string): string[] {
  const out: string[] = [];
  if (!startIso || !endIsoExclusive || startIso >= endIsoExclusive) return out;
  let cur = startIso;
  let guard = 0;
  while (cur < endIsoExclusive && guard++ < 1000) {
    const dow = new Date(cur + "T00:00:00.000Z").getUTCDay(); // 0 Sun … 6 Sat
    if (dow >= 1 && dow <= 5) out.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return out;
}
