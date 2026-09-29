// Pure logic for attaching an approved user to a StaffProfile.
// No DB — unit-tested in src/test/unit/staffLink.test.ts.

export type PlanProfile = { id: string; scheduleName: string | null };

export type StaffProfilePlan =
  | { kind: "keep"; id: string }
  | { kind: "rename"; id: string }
  | { kind: "adopt"; id: string }
  | { kind: "create" };

/**
 * Decide how an approved user gets their StaffProfile for a claimed timetable
 * name. In order:
 *
 * 1. The user already owns a profile → keep it; adopt the timetable's coding
 *    as `scheduleName` if it differs ("rename").
 * 2. An unclaimed profile (userId null) already carries this scheduleName —
 *    a pre-seeded deputy (sp_headteacher_b_XX) or one detached by user
 *    deletion → "adopt" it. Creating a second profile with the same name
 *    would split the person's history and make the name ambiguous, which
 *    the timetable re-link then refuses to touch.
 * 3. Otherwise → "create" a fresh profile. Rare since the timetable import
 *    started writing a profile for every name in the Καθηγητής column; it
 *    still covers a name imported before that, or one dropped from a later
 *    workbook. Not dead code.
 */
export function staffProfilePlan(
  ownProfile: PlanProfile | null,
  unclaimedSameName: PlanProfile | null,
  staffName: string,
): StaffProfilePlan {
  if (ownProfile) {
    return ownProfile.scheduleName === staffName
      ? { kind: "keep", id: ownProfile.id }
      : { kind: "rename", id: ownProfile.id };
  }
  if (unclaimedSameName) return { kind: "adopt", id: unclaimedSameName.id };
  return { kind: "create" };
}

/** Timetable names compared the way the assignment import does: trimmed, spaces collapsed. */
export function normalizeStaffName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * The unclaimed profile carrying this name, ignoring stray spaces. An exact
 * match used to miss "Μ-ΑΛΦΑ  Α." vs "Μ-ΑΛΦΑ Α.", so approval created a second
 * profile and homegroup assignments made before sign-up stayed on the first.
 */
export function findUnclaimedByName<T extends PlanProfile>(unclaimed: T[], staffName: string): T | null {
  const want = normalizeStaffName(staffName);
  return unclaimed.find((p) => p.scheduleName !== null && normalizeStaffName(p.scheduleName) === want) ?? null;
}
