// Staff display names — the project-wide convention is the timetable's coding
// (e.g. "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ": specialty prefix, surname + initial, ΒΔ for deputy B).
// It is stored on StaffProfile.scheduleName when a profile is linked to the
// schedule (claim approval), and falls back to the account name otherwise.

import type { Role } from "@/generated/prisma/client";
import { isOfficeAdmin } from "@/lib/rbac";

export interface StaffNameish {
  scheduleName?: string | null;
  user?: { name?: string | null } | null;
}

/** Display name for a staff profile: schedule coding first, account name as fallback. */
export function staffDisplayName(
  staff: StaffNameish | null | undefined,
  fallback = "—"
): string {
  return staff?.scheduleName ?? staff?.user?.name ?? fallback;
}

/**
 * Teacher name for a timetable slot. Unlinked slots only carry the raw
 * imported coding (staffName); linked ones prefer the profile's scheduleName.
 */
export function slotTeacherName(
  slot: { staffName?: string | null; staff?: StaffNameish | null },
  fallback = "—"
): string {
  return slot.staff?.scheduleName ?? slot.staffName ?? slot.staff?.user?.name ?? fallback;
}

/**
 * Byline for something the whole school reads — an announcement, or the
 * signature on a staff notification.
 *
 * The office signs as an institution rather than as a person: a teacher needs
 * to know a note came from the secretariat, not which clerk typed it, and the
 * individual is still in the audit log either way. It also sidesteps the fact
 * that a SCHOOL_ADMIN has no StaffProfile and so no schedule coding to show.
 */
export function staffAuthorLabel(
  author: { role: Role; name?: string | null; scheduleName?: string | null } | null | undefined,
  officeLabel: string,
  fallback = "—",
): string {
  if (!author) return fallback;
  if (isOfficeAdmin(author.role)) return officeLabel;
  return author.scheduleName ?? author.name ?? fallback;
}
