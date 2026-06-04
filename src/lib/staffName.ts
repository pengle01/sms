// Staff display names — the project-wide convention is the timetable's coding
// (e.g. "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ": specialty prefix, surname + initial, ΒΔ for deputy B).
// It is stored on StaffProfile.scheduleName when a profile is linked to the
// schedule (claim approval), and falls back to the account name otherwise.

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
