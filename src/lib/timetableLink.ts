// Pure logic for re-linking imported timetable slots to already-approved staff.
// No DB — unit-tested in src/test/unit/timetableLink.test.ts.

export type LinkSlot = { id: string; staffName: string | null; staffId: string | null };
export type LinkProfile = { id: string; scheduleName: string | null };

/**
 * Decide which unclaimed timetable slots should be linked to which staff profile
 * after a (re-)import. A slot links to a profile when its raw import name
 * (`staffName`) equals the profile's `scheduleName` and the slot isn't already
 * claimed (`staffId` is null). This mirrors registration-approval linking so a
 * lesson ADDED to an already-approved teacher shows up in their portal (which
 * filters by `staffId`) without re-approval.
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
