// Prisma's PrismaPg adapter stores @db.Date fields as UTC midnight.
// Always construct dates using toLocaleDateString("en-CA") + "T00:00:00.000Z"
// so the JavaScript Date value matches what Prisma reads from the DB.

export function localDateStr(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA"); // "YYYY-MM-DD" in local timezone
}

// Returns UTC midnight for the given local date string ("YYYY-MM-DD" or a Date).
export function utcMidnight(dateOrStr: Date | string = new Date()): Date {
  const str = typeof dateOrStr === "string" ? dateOrStr : localDateStr(dateOrStr);
  return new Date(str + "T00:00:00.000Z");
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
