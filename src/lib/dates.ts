// Prisma's PrismaPg adapter stores @db.Date fields as UTC midnight.
// Always construct dates using toLocaleDateString("en-CA") + "T00:00:00.000Z"
// so the JavaScript Date value matches what Prisma reads from the DB.

// Normalize a YYYY-M-D-ish string to strict YYYY-MM-DD, or null when it isn't
// a parsable calendar date. Tolerates single-digit month/day ("2026-3-9").
export function normalizeIsoDate(value: string | undefined | null): string | null {
  const m = value?.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  return isNaN(new Date(iso + "T00:00:00.000Z").getTime()) ? null : iso;
}

// Returns the current date/time. When NEXT_PUBLIC_TEST_DATE is set (dev only),
// returns that date at the current local time so day-of-week logic still works.
// A malformed override falls back to the real date instead of poisoning every
// date-based query with Invalid Date.
export function getNow(): Date {
  const override = normalizeIsoDate(process.env.NEXT_PUBLIC_TEST_DATE);
  if (!override) return new Date();
  const real = new Date();
  const base = new Date(override + "T00:00:00");
  base.setHours(real.getHours(), real.getMinutes(), real.getSeconds(), real.getMilliseconds());
  return base;
}

export function localDateStr(date: Date = getNow()): string {
  return date.toLocaleDateString("en-CA"); // "YYYY-MM-DD" in local timezone
}

// Shifts a REAL timestamp (createdAt etc.) into the app's faked timeline when
// NEXT_PUBLIC_TEST_DATE is active, so "filed today" buckets under the faked
// today during testing. Identity in production (no override → zero offset).
export function toAppTimeline(date: Date): Date {
  return new Date(date.getTime() + appTimelineOffsetMs());
}

/** Inverse of toAppTimeline — maps an app-timeline instant back to real time
 *  (needed when querying real `createdAt` columns by app-timeline windows). */
export function fromAppTimeline(date: Date): Date {
  return new Date(date.getTime() - appTimelineOffsetMs());
}

function appTimelineOffsetMs(): number {
  const override = normalizeIsoDate(process.env.NEXT_PUBLIC_TEST_DATE);
  if (!override) return 0;
  const realKey = new Date().toLocaleDateString("en-CA");
  return (
    new Date(override + "T00:00:00.000Z").getTime() - new Date(realKey + "T00:00:00.000Z").getTime()
  );
}

// Returns UTC midnight for the given local date string ("YYYY-MM-DD" or a Date).
export function utcMidnight(dateOrStr: Date | string = getNow()): Date {
  const str = typeof dateOrStr === "string" ? dateOrStr : localDateStr(dateOrStr);
  return new Date(str + "T00:00:00.000Z");
}

// Formats a date for display as DD/MM/YY using UTC date components.
// Use for @db.Date fields (stored as UTC midnight) and general display.
export function fmtDisplayDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = String(d.getUTCFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

// Formats a timestamp for display as "DD/MM/YY HH:MM" using local time components.
// Use for createdAt / updatedAt fields (full timestamps, not @db.Date).
export function fmtDisplayDateTime(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(-2);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${h}:${m}`;
}

// Returns UTC midnight for the first day of the given month.
export function monthStart(year: number, month: number): Date {
  const str = `${year}-${String(month).padStart(2, "0")}-01`;
  return new Date(str + "T00:00:00.000Z");
}

// Returns UTC midnight for the last day of the given month (exclusive = first of next month).
export function monthEnd(year: number, month: number): Date {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return monthStart(nextYear, nextMonth);
}
