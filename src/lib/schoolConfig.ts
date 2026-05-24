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
