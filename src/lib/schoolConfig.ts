import { db } from "@/server/db";
import { DEFAULT_PERIODS_PER_DAY, type PeriodsPerDay } from "@/lib/periods";

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

export const DEFAULT_MAX_TESTS_PER_WEEK = 4;

export async function getMaxTestsPerWeek(): Promise<number> {
  const setting = await db.globalSetting.findUnique({ where: { key: "maxTestsPerWeek" } });
  if (!setting) return DEFAULT_MAX_TESTS_PER_WEEK;
  const n = parseInt(setting.value);
  return isNaN(n) ? DEFAULT_MAX_TESTS_PER_WEEK : n;
}
