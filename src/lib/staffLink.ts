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
 * 3. Otherwise → "create" a fresh profile.
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
