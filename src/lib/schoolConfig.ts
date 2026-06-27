import { db } from "@/server/db";
import { MAX_GUARDIAN_CLAIMS } from "@/lib/accessCode";
import { DEFAULT_PERIODS_PER_DAY, type PeriodsPerDay } from "@/lib/periods";
import { GRADES_UNLOCKED_KEY, parseGradesUnlocked, type GradesUnlocked } from "@/lib/grades";
import { ATTENDANCE_LOCK_KEY, parseAttendanceLock, type AttendanceLockConfig } from "@/lib/attendanceLock";
import { getNow } from "@/lib/dates";
import {
  activeTermFor,
  resolveSchoolYear,
  type ActiveTermInfo,
  type SchoolYearRanges,
  type TermDatesConfig,
} from "@/lib/schoolYear";

// Re-export pure helpers so existing server-side imports keep working.
export {
  DEFAULT_PERIODS_PER_DAY,
  periodsForDow,
  maxPeriodCount,
  totalPeriodsForDays,
} from "@/lib/periods";
export type { PeriodsPerDay } from "@/lib/periods";

export async function getPeriodsPerDay(): Promise<PeriodsPerDay> {
  const setting = await db.globalSetting.findUnique({ where: { key: "periodsPerDay" } });
  if (!setting) return DEFAULT_PERIODS_PER_DAY;
  try {
    return { ...DEFAULT_PERIODS_PER_DAY, ...(JSON.parse(setting.value) as PeriodsPerDay) };
  } catch {
    return DEFAULT_PERIODS_PER_DAY;
  }
}

// ── Grade entry locking ──────────────────────────────────────────────────────

export async function getGradesUnlocked(): Promise<GradesUnlocked> {
  const setting = await db.globalSetting.findUnique({ where: { key: GRADES_UNLOCKED_KEY } });
  return parseGradesUnlocked(setting?.value);
}

/** Attendance-completion lock config (enabled + look-back window). */
export async function getAttendanceLockConfig(): Promise<AttendanceLockConfig> {
  const setting = await db.globalSetting.findUnique({ where: { key: ATTENDANCE_LOCK_KEY } });
  return parseAttendanceLock(setting?.value);
}

export const DEFAULT_MAX_TESTS_PER_WEEK = 4;

export async function getMaxTestsPerWeek(): Promise<number> {
  const setting = await db.globalSetting.findUnique({ where: { key: "maxTestsPerWeek" } });
  if (!setting) return DEFAULT_MAX_TESTS_PER_WEEK;
  const n = parseInt(setting.value);
  return isNaN(n) ? DEFAULT_MAX_TESTS_PER_WEEK : n;
}

// ── Guardian accounts per student ────────────────────────────────────────────

export const DEFAULT_MAX_GUARDIANS_PER_STUDENT = MAX_GUARDIAN_CLAIMS;

/** Admin-configured cap on how many guardian accounts may redeem a student's code. */
export async function getMaxGuardiansPerStudent(): Promise<number> {
  const setting = await db.globalSetting.findUnique({ where: { key: "maxGuardiansPerStudent" } });
  if (!setting) return DEFAULT_MAX_GUARDIANS_PER_STUDENT;
  const n = parseInt(setting.value);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_MAX_GUARDIANS_PER_STUDENT;
}

// ── School name ─────────────────────────────────────────────────────────────

/** Admin-configured school name, or null to fall back to the app name. */
export async function getSchoolName(): Promise<string | null> {
  const setting = await db.globalSetting.findUnique({ where: { key: "school_name" } });
  const name = setting?.value.trim();
  return name || null;
}

// ── School year / term dates ────────────────────────────────────────────────

/** The raw admin-configured term dates, or null when nothing is stored. */
export async function getTermDatesConfig(): Promise<TermDatesConfig | null> {
  const setting = await db.globalSetting.findUnique({ where: { key: "termDates" } });
  if (!setting) return null;
  try {
    return JSON.parse(setting.value) as TermDatesConfig;
  } catch {
    return null;
  }
}

/** Resolved school-year ranges: admin-configured dates, defaults as fallback. */
export async function getSchoolYear(): Promise<SchoolYearRanges> {
  return resolveSchoolYear(getNow(), await getTermDatesConfig());
}

/**
 * The term containing `date` and its test deadline (from the termDates
 * setting), or null when the date falls outside the school year.
 */
export async function getActiveTermInfo(date: Date): Promise<ActiveTermInfo | null> {
  const config = await getTermDatesConfig();
  return activeTermFor(date, resolveSchoolYear(getNow(), config), config);
}
