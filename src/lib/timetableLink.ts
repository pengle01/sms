// Pure logic for re-linking imported timetable slots to already-approved staff.
// No DB — unit-tested in src/test/unit/timetableLink.test.ts.

export type LinkSlot = { id: string; staffName: string | null; staffId: string | null };
export type LinkProfile = { id: string; scheduleName: string | null; userId: string | null };

/**
 * Decide which unclaimed timetable slots should be linked to which staff profile
 * after a (re-)import. A slot links to a profile when its raw import name
 * (`staffName`) equals the profile's `scheduleName` and the slot isn't already
 * claimed (`staffId` is null). This mirrors registration-approval linking so a
 * lesson ADDED to an already-approved teacher shows up in their portal (which
 * filters by `staffId`) without re-approval.
 *
 * Only profiles with a live login (`userId` set) can claim slots: a detached
 * profile (kept for history after user deletion) or a pre-seeded one keeps its
 * `scheduleName`, and letting it re-grab the slots deleteUser just freed would
 * make the name unclaimable at registration.
 *
 * Ambiguous names — a `scheduleName` shared by more than one profile — are
 * skipped: we never guess which teacher a slot belongs to.
 *
 * Returns the `{ slotId, profileId }` pairs to apply. Pure.
 */
export function slotLinkAssignments(
  slots: LinkSlot[],
  profiles: LinkProfile[],
): { slotId: string; profileId: string }[] {
  // scheduleName → profileId, or null once we see a second profile with that name.
  const byName = new Map<string, string | null>();
  for (const p of profiles) {
    if (!p.userId) continue; // no login → nothing to show in a portal
    const name = p.scheduleName?.trim();
    if (!name) continue;
    byName.set(name, byName.has(name) ? null : p.id);
  }

  const out: { slotId: string; profileId: string }[] = [];
  for (const s of slots) {
    if (s.staffId) continue; // already claimed — never overwrite
    const name = s.staffName?.trim();
    if (!name) continue;
    const profileId = byName.get(name);
    if (profileId) out.push({ slotId: s.id, profileId });
  }
  return out;
}

/** Timetable names compared trimmed with spaces collapsed (same as staffLink's normalizeStaffName). */
export const sameStaffName = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().replace(/\s+/g, " ") === b.trim().replace(/\s+/g, " ");

/**
 * Repair which account each lesson is attached to. A lesson belongs to the
 * account whose timetable name matches the lesson's: one attached to a profile
 * with a DIFFERENT name (e.g. an account later corrected to another name kept
 * its old lessons) is released, then every unclaimed lesson is linked by name
 * under the usual rules (login required, ambiguous names skipped). Lessons
 * already attached to the matching profile are never touched. Pure.
 */
export function slotRelinks(
  slots: LinkSlot[],
  profiles: LinkProfile[],
): { release: string[]; link: { slotId: string; profileId: string }[] } {
  const nameById = new Map(profiles.map((p) => [p.id, p.scheduleName]));
  const release = slots
    .filter((s) => s.staffId && !sameStaffName(nameById.get(s.staffId), s.staffName))
    .map((s) => s.id);
  const released = new Set(release);
  const link = slotLinkAssignments(
    slots.map((s) => (released.has(s.id) ? { ...s, staffId: null } : s)),
    profiles,
  );
  return { release, link };
}
