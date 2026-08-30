// Daily announcements — pure helpers (no DB imports).
//
// Announcements are pushed by management (headteachers/headmaster) and shown on
// the teacher dashboard while still "pinned" (pinnedUntil >= today).

import type { Role } from "@/generated/prisma/client";
import { isManagement, isOfficeAdmin } from "@/lib/rbac";
import { normalizeIsoDate, utcMidnight } from "@/lib/dates";

/**
 * Management (headmaster / headteachers) and the school office may post or
 * remove announcements. The office is included because the secretary's own
 * board — Notices — is read by nobody outside the office and admin portals, so
 * an announcement is her only way to tell the teaching staff anything.
 */
export function canManageAnnouncements(roles: Role[]): boolean {
  return roles.some((r) => isManagement(r) || isOfficeAdmin(r));
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

/**
 * Who may remove an announcement: its author, or management.
 *
 * Management keeps the peer rule it always had — a headteacher may clear any
 * announcement. The office is new to posting, so it gets only its own back:
 * widening "may post" must not hand the secretary the power to take down the
 * headmaster's note.
 */
export function canDeleteAnnouncement(
  roles: Role[],
  authorId: string,
  viewerId: string | null | undefined,
): boolean {
  if (!viewerId || !canManageAnnouncements(roles)) return false;
  return authorId === viewerId || roles.some((r) => isManagement(r));
}

/** Announcement errors the composer may report, as an allowlist. */
const ANNOUNCEMENT_ERRORS = ["body", "attachment"] as const;
export type AnnouncementError = (typeof ANNOUNCEMENT_ERRORS)[number];

/**
 * Normalise an untrusted `?error=` value. The banner resolves it with a dynamic
 * `t(...)` lookup, so an unknown value would throw a missing-key error at a
 * reader who did nothing worse than edit the URL.
 */
export function announcementErrorKey(raw: string | null | undefined): AnnouncementError | null {
  return (ANNOUNCEMENT_ERRORS as readonly string[]).includes(raw ?? "")
    ? (raw as AnnouncementError)
    : null;
}
