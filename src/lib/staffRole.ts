// What role a staff member holds — one rule instead of guessing from the
// timetable name in several places. Pure; unit-tested in staffRole.test.ts.
//
// The timetable codes deputies with a trailing ΒΔ / ΒΔΑ / Δ, but not always:
// some deputies have no marker, and a teacher can be given deputy duties. So:
//   1. an account's role (User.role) when there is an account;
//   2. else the role the admin planned for them (StaffProfile.plannedRole);
//   3. else the name marker, as a default.

import type { Role } from "@/generated/prisma/enums";
import { specialtyPrefix } from "@/lib/substitutions";

/** Roles a staff profile can hold (account or planned). */
export const STAFF_PROFILE_ROLES: Role[] = [
  "TEACHER",
  "STUDENT_COUNSELOR",
  "HEADTEACHER_B",
  "HEADTEACHER_A",
  "HEADMASTER",
];

const MARKER_ROLE: Record<string, Role> = { ΒΔ: "HEADTEACHER_B", ΒΔΑ: "HEADTEACHER_A", Δ: "HEADMASTER" };

/** The role the timetable name suggests. */
export function roleFromScheduleName(scheduleName: string | null | undefined): Role {
  const name = (scheduleName ?? "").trim();
  const parts = name.split(/\s+/);
  const marker = MARKER_ROLE[parts[parts.length - 1] ?? ""];
  if (marker) return marker;
  if (specialtyPrefix(name) === "ΣΕΑ") return "STUDENT_COUNSELOR";
  return "TEACHER";
}

export function effectiveStaffRole(p: {
  accountRole: Role | null | undefined;
  plannedRole: Role | null | undefined;
  scheduleName: string | null | undefined;
}): Role {
  return p.accountRole ?? p.plannedRole ?? roleFromScheduleName(p.scheduleName);
}

const MANAGEMENT: ReadonlySet<Role> = new Set<Role>(["HEADMASTER", "HEADTEACHER_A", "HEADTEACHER_B"]);

export function isManagementRole(role: Role | null | undefined): boolean {
  return !!role && MANAGEMENT.has(role);
}

export type RoleChangeError = "notStaffRole" | "self" | "noChange";

/**
 * May the admin change this account's role? Only between educator roles (the
 * secretary, chaperones, parents, students and the system admin are managed
 * elsewhere), never on one's own account.
 */
export function roleChangeError(input: {
  actorId: string;
  targetId: string;
  currentRole: Role;
  newRole: Role;
}): RoleChangeError | null {
  if (input.actorId === input.targetId) return "self";
  if (!STAFF_PROFILE_ROLES.includes(input.currentRole) || !STAFF_PROFILE_ROLES.includes(input.newRole)) return "notStaffRole";
  if (input.currentRole === input.newRole) return "noChange";
  return null;
}

/**
 * The role a sign-up is expected to choose for their timetable name, or null
 * when nothing points anywhere in particular (an unmarked name with no planned
 * role — any educator role is plausible). Drives the approvals warning only.
 */
export function expectedSignupRole(p: { plannedRole: Role | null | undefined; scheduleName: string | null | undefined }): Role | null {
  if (p.plannedRole) return p.plannedRole;
  const fromName = roleFromScheduleName(p.scheduleName);
  return fromName === "TEACHER" ? null : fromName;
}
