import { db } from "@/server/db";
import { utcMidnight } from "@/lib/dates";
import { getPeriodsPerDay, getSchoolYear } from "@/lib/schoolConfig";
import { configuredHolidayFor, type DateRange } from "@/lib/schoolYear";
import { dutyDowFor } from "@/lib/dutyRoster";
import type { SpecialDay, SpecialDayType } from "@/generated/prisma/client";

export type { SpecialDayType };

export function isHolidayType(type: SpecialDayType | null): boolean {
  return (
    type === "BANK_HOLIDAY" ||
    type === "CHRISTMAS" ||
    type === "EASTER" ||
    type === "OTHER_HOLIDAY"
  );
}

// Christmas/Easter are ministry dates kept in the termDates setting (Settings
// → School Year & Terms), not SpecialDay rows. They are merged into reads
// here as synthetic entries so week views, dashboards, and test scheduling
// treat them exactly like any other holiday.
function syntheticHoliday(type: "CHRISTMAS" | "EASTER", range: DateRange): SpecialDay {
  return {
    id: `config-${type.toLowerCase()}`,
    type,
    startDate: range.start,
    endDate: new Date(range.end.getTime() - 86_400_000), // exclusive → inclusive
    label: null,
    intercalaryMeetingPeriod: null,
    eventStartPeriod: null,
    eventEndPeriod: null,
    createdAt: range.start,
  };
}

async function configuredHolidays(): Promise<SpecialDay[]> {
  const ranges = await getSchoolYear();
  const out: SpecialDay[] = [];
  if (ranges.christmas) out.push(syntheticHoliday("CHRISTMAS", ranges.christmas));
  if (ranges.easter) out.push(syntheticHoliday("EASTER", ranges.easter));
  return out;
}

export async function getSpecialDaysInRange(start: Date, end: Date) {
  const [rows, holidays] = await Promise.all([
    db.specialDay.findMany({
      where: {
        startDate: { lte: end },
        endDate: { gte: start },
      },
      orderBy: { startDate: "asc" },
    }),
    configuredHolidays(),
  ]);
  const overlapping = holidays.filter((h) => h.startDate <= end && h.endDate >= start);
  return [...rows, ...overlapping].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime()
  );
}

export async function getSpecialDayForDate(date: Date): Promise<SpecialDayType | null> {
  const [day, ranges] = await Promise.all([
    db.specialDay.findFirst({
      where: {
        startDate: { lte: date },
        endDate: { gte: date },
      },
    }),
    getSchoolYear(),
  ]);
  return day?.type ?? configuredHolidayFor(date, ranges);
}

export async function isSchoolClosed(date: Date): Promise<boolean> {
  const type = await getSpecialDayForDate(date);
  return isHolidayType(type);
}

/**
 * Deputies on duty (Εφημερεύοντες Βοηθοί) for the given date — resolved from
 * the fixed weekly schedule. Empty on weekends. This is the single
 * integration point for routing duty events (referrals, exit permits, …).
 */
export async function getOnDutyDeputies(date: Date) {
  const dow = dutyDowFor(date);
  if (!dow) return [];
  return db.dutyRosterEntry.findMany({
    where: { dayOfWeek: dow },
    include: { staffProfile: { include: { user: { select: { id: true, name: true } } } } },
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
