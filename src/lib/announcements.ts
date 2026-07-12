// Daily announcements — pure helpers (no DB imports).
//
// Announcements are pushed by management (headteachers/headmaster) and shown on
// the teacher dashboard while still "pinned" (pinnedUntil >= today).

import type { Role } from "@/generated/prisma/client";
import { isManagement } from "@/lib/rbac";
import { normalizeIsoDate, utcMidnight } from "@/lib/dates";

/** Only management (headmaster / headteachers) may post or remove announcements. */
export function canManageAnnouncements(roles: Role[]): boolean {
  return roles.some((r) => isManagement(r));
}

/**
 * Resolve the "show until" date from a form value.
 * Empty/invalid → today (today-only). A past date is clamped up to today so an
 * announcement is always visible at least for the day it was posted.
 */
export function resolvePinnedUntil(input: string | null | undefined, today: Date): Date {
  const iso = normalizeIsoDate(input);
  const todayMidnight = utcMidnight(today);
  if (!iso) return todayMidnight;
  const picked = utcMidnight(iso);
  return picked < todayMidnight ? todayMidnight : picked;
}
