// Εφημερεύοντες Βοηθοί (On-Duty Deputies) — pure helpers, no DB imports.
//
// The duty rotates on a FIXED WEEKLY schedule among the deputy heads: the
// super admin assigns deputies to weekdays (Settings page), and on that day
// the rostered headteacher assumes the on-duty role. Resolution from a date
// to the day's deputies lives in getOnDutyDeputies() (src/lib/calendar.ts).

import type { Role } from "@/generated/prisma";

/** The duty is filled by the headteachers. */
export const DUTY_ELIGIBLE_ROLES: Role[] = ["HEADTEACHER_A", "HEADTEACHER_B"];

export function isDutyEligible(role: Role): boolean {
  return DUTY_ELIGIBLE_ROLES.includes(role);
}

/**
 * Roster day-of-week (1 Mon – 5 Fri) for a date, or null on weekends.
 * Uses UTC like all date-only values in this codebase (see utcMidnight).
 */
export function dutyDowFor(date: Date): number | null {
  const dow = date.getUTCDay();
  return dow >= 1 && dow <= 5 ? dow : null;
}

/** Group roster entries into Mon–Fri buckets (every weekday key present). */
export function rosterByDay<T extends { dayOfWeek: number }>(
  entries: T[]
): Record<number, T[]> {
  const out: Record<number, T[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const e of entries) out[e.dayOfWeek]?.push(e);
  return out;
}

/** Whether the given staff profile is on duty on the given roster day. */
export function isOnDuty(
  entries: Array<{ dayOfWeek: number; staffProfileId: string }>,
  dow: number | null,
  staffProfileId: string | null | undefined
): boolean {
  if (!dow || !staffProfileId) return false;
  return entries.some(
    (e) => e.dayOfWeek === dow && e.staffProfileId === staffProfileId
  );
}
