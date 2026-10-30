// «Τμήμα μου» → «Εβδομάδα»: the roster and patterns for one Monday–Sunday
// week. Pure; tested in behaviorWeek.test.ts.

import { addDaysIso } from "@/lib/attendanceLock";
import { isRealDate } from "@/lib/substitutionImport";

/** The Monday of the week a day falls in. */
export function weekMonday(iso: string): string {
  const dow = new Date(`${iso}T00:00:00.000Z`).getUTCDay(); // 0 Sun … 6 Sat
  return addDaysIso(iso, -((dow + 6) % 7));
}

/** The week to show: its Monday — a valid day's week, never past this week; default this week. */
export function parseBehaviorWeek(raw: string | null | undefined, todayIso: string): string {
  const thisWeek = weekMonday(todayIso);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || !isRealDate(raw)) return thisWeek;
  const monday = weekMonday(raw);
  return monday > thisWeek ? thisWeek : monday;
}

/** The week's days: Monday through Sunday, inclusive. */
export function weekRange(monday: string): { from: string; to: string } {
  return { from: monday, to: addDaysIso(monday, 6) };
}
