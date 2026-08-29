// Pure logic for "which schedule names may someone claim at sign-up".
// No DB — unit-tested in src/test/unit/staffRoster.test.ts.

const byGreekName = (a: string, b: string) => a.localeCompare(b, "el");

export type RosterProfile = { scheduleName: string | null; userId: string | null };

/**
 * The names offered in the sign-up and claim pickers.
 *
 * Two sources, unioned:
 *
 * 1. `StaffProfile.scheduleName` with no `userId` — the roster the timetable
 *    import writes. Authoritative, and the only place someone with no teaching
 *    hours (a counselor) can appear at all.
 * 2. `TimetableSlot.staffName` with no `staffId` — how this list used to be
 *    built. Kept so the pickers still work on a database whose timetable was
 *    imported before the roster existed; once an import has run it is a subset
 *    of the first.
 *
 * Minus, in both cases, a name already spoken for: held by a profile with a
 * live login, or carrying a claim that has not been rejected.
 */
export function availableStaffNames(input: {
  profiles: RosterProfile[];
  slotNames: (string | null)[];
  claimedNames: Iterable<string>;
}): string[] {
  const taken = new Set<string>();
  for (const raw of input.claimedNames) {
    const name = raw?.trim();
    if (name) taken.add(name);
  }
  // A name whose profile has a login belongs to that person, even if some slot
  // still carries it unlinked (the profile was attached by an admin by hand, or
  // a later import added a lesson the re-link has not picked up yet).
  for (const p of input.profiles) {
    const name = p.scheduleName?.trim();
    if (name && p.userId) taken.add(name);
  }

  const out = new Set<string>();
  const offer = (raw: string | null) => {
    const name = raw?.trim();
    if (name && !taken.has(name)) out.add(name);
  };
  for (const p of input.profiles) if (!p.userId) offer(p.scheduleName);
  for (const n of input.slotNames) offer(n);

  return [...out].sort(byGreekName);
}
