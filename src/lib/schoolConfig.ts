import { db } from "@/server/db";

export type PeriodsPerDay = Record<number, number>; // DOW 1–5 → period count

export const DEFAULT_PERIODS_PER_DAY: PeriodsPerDay = { 1: 7, 2: 7, 3: 7, 4: 7, 5: 7 };

export async function getPeriodsPerDay(): Promise<PeriodsPerDay> {
  const setting = await db.globalSetting.findUnique({ where: { key: "periodsPerDay" } });
  if (!setting) return DEFAULT_PERIODS_PER_DAY;
  try {
    return { ...DEFAULT_PERIODS_PER_DAY, ...(JSON.parse(setting.value) as PeriodsPerDay) };
  } catch {
    return DEFAULT_PERIODS_PER_DAY;
  }
}

export function periodsForDow(config: PeriodsPerDay, dow: number): number[] {
  const count = config[dow] ?? 7;
  return Array.from({ length: count }, (_, i) => i + 1);
}

export function maxPeriodCount(config: PeriodsPerDay): number {
  return Math.max(...Object.values(config));
}

// Pure: total school periods across a set of expulsion days.
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

export const DEFAULT_MAX_TESTS_PER_WEEK = 4;

export async function getMaxTestsPerWeek(): Promise<number> {
  const setting = await db.globalSetting.findUnique({ where: { key: "maxTestsPerWeek" } });
  if (!setting) return DEFAULT_MAX_TESTS_PER_WEEK;
  const n = parseInt(setting.value);
  return isNaN(n) ? DEFAULT_MAX_TESTS_PER_WEEK : n;
}
