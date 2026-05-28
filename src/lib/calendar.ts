import { db } from "@/server/db";
import { utcMidnight } from "@/lib/dates";
import { getPeriodsPerDay } from "@/lib/schoolConfig";
import type { SpecialDayType } from "@/generated/prisma";

export type { SpecialDayType };

export function isHolidayType(type: SpecialDayType | null): boolean {
  return (
    type === "BANK_HOLIDAY" ||
    type === "CHRISTMAS" ||
    type === "EASTER" ||
    type === "OTHER_HOLIDAY"
  );
}

export async function getSpecialDaysInRange(start: Date, end: Date) {
  return db.specialDay.findMany({
    where: {
      startDate: { lte: end },
      endDate: { gte: start },
    },
    orderBy: { startDate: "asc" },
  });
}

export async function getSpecialDayForDate(date: Date): Promise<SpecialDayType | null> {
  const day = await db.specialDay.findFirst({
    where: {
      startDate: { lte: date },
      endDate: { gte: date },
    },
  });
  return day?.type ?? null;
}

export async function isSchoolClosed(date: Date): Promise<boolean> {
  const type = await getSpecialDayForDate(date);
  return isHolidayType(type);
}

export async function getActiveTerm(date: Date) {
  return db.schoolTerm.findFirst({
    where: {
      startDate: { lte: date },
      endDate: { gte: date },
    },
  });
}

export async function getPeriodsForDate(date: Date, dow: number): Promise<number> {
  const type = await getSpecialDayForDate(date);
  if (type === "INTERCALARY") return 8;
  const config = await getPeriodsPerDay();
  return config[dow] ?? 7;
}

/** Build a date-string → SpecialDayType map for a whole week (Mon–Fri).
 *  Expands multi-day ranges into individual day entries.
 */
export function buildDayTypeMap(
  specialDays: Awaited<ReturnType<typeof getSpecialDaysInRange>>,
  weekDates: Date[]
): Map<string, SpecialDayType> {
  const map = new Map<string, SpecialDayType>();
  for (const sd of specialDays) {
    for (const d of weekDates) {
      const iso = d.toISOString().slice(0, 10);
      if (d >= sd.startDate && d <= sd.endDate) {
        map.set(iso, sd.type);
      }
    }
  }
  return map;
}

/** Build a date-string → meeting period map for INTERCALARY days in a week.
 *  Defaults to 8 if the admin did not configure a specific period.
 */
export function buildDayMeetingPeriodMap(
  specialDays: Awaited<ReturnType<typeof getSpecialDaysInRange>>,
  weekDates: Date[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const sd of specialDays) {
    if (sd.type !== "INTERCALARY") continue;
    for (const d of weekDates) {
      if (d >= sd.startDate && d <= sd.endDate) {
        map.set(d.toISOString().slice(0, 10), sd.intercalaryMeetingPeriod ?? 8);
      }
    }
  }
  return map;
}
