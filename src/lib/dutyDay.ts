// «Εφημερίες»: one day for the whole page. Today is live (issue permits,
// record break duty, take registers); a past day is read-only history; a
// future day only has a substitution plan. Pure; tested in dutyDay.test.ts.

import { addDaysIso } from "@/lib/attendanceLock";
import { isRealDate } from "@/lib/substitutionImport";

export type DutyDayMode = "today" | "past" | "future";

/** The page's tabs, in order. */
export const DUTY_VIEWS = ["permits", "attendance", "breakDuty", "toilet", "plan"] as const;
export type DutyView = (typeof DUTY_VIEWS)[number];

/** A valid YYYY-MM-DD day, else today. */
export function parseDutyDay(raw: string | null | undefined, todayIso: string): string {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && isRealDate(raw) ? raw : todayIso;
}

export function dutyDayMode(dayIso: string, todayIso: string): DutyDayMode {
  return dayIso === todayIso ? "today" : dayIso < todayIso ? "past" : "future";
}

/** The previous / next weekday (weekends skipped). */
export function shiftSchoolDay(iso: string, dir: 1 | -1): string {
  let d = addDaysIso(iso, dir);
  for (let i = 0; i < 2; i++) {
    const dow = new Date(`${d}T00:00:00.000Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) break;
    d = addDaysIso(d, dir);
  }
  return d;
}

/** The open tab: `view`, else the older `tab=plan|breakDuty` links. */
export function parseDutyView(view: string | null | undefined, legacyTab?: string | null): DutyView | undefined {
  const v = view ?? (legacyTab === "plan" || legacyTab === "breakDuty" ? legacyTab : undefined);
  return (DUTY_VIEWS as readonly string[]).includes(v ?? "") ? (v as DutyView) : undefined;
}

/** How far back the permit search looks by default. */
export const PERMIT_SEARCH_DAYS = 30;

/**
 * The permit search's date range: valid days, oldest first; by default the
 * last 30 days up to today.
 */
export function permitSearchRange(
  from: string | null | undefined,
  to: string | null | undefined,
  todayIso: string,
): { from: string; to: string } {
  const end = parseDutyDay(to, todayIso);
  const start = parseDutyDay(from, addDaysIso(end, -PERMIT_SEARCH_DAYS));
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

/**
 * The permit search's student filter: name or «Αρ. Μητρώου», former students
 * included (old permits stay findable). Null for an empty query.
 */
export function permitStudentWhere(q: string | null | undefined) {
  const term = (q ?? "").trim();
  if (!term) return null;
  return {
    OR: [
      { user: { name: { contains: term, mode: "insensitive" as const } } },
      { studentId: { contains: term, mode: "insensitive" as const } },
    ],
  };
}
