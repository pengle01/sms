import type { Role } from "@/generated/prisma/client";

// Ordered from highest to lowest clearance
const ROLE_HIERARCHY: Role[] = [
  "SUPER_ADMIN",
  "HEADMASTER",
  "HEADTEACHER_A",
  "HEADTEACHER_B",
  "STUDENT_COUNSELOR",
  "SCHOOL_ADMIN",
  "TEACHER",
  "STUDENT",
  "PARENT",
];

// All roles that work directly with students — share the /teacher portal
export const EDUCATOR_ROLES: Role[] = [
  "HEADMASTER",
  "HEADTEACHER_A",
  "HEADTEACHER_B",
  "STUDENT_COUNSELOR",
  "TEACHER",
];

// Educator roles that carry school management responsibilities
export const MANAGEMENT_ROLES: Role[] = [
  "HEADMASTER",
  "HEADTEACHER_A",
  "HEADTEACHER_B",
];

// Educator roles a person can self-register for at sign-up by claiming their
// timetable name (admin approves → StaffProfile created). Membership here is
// what makes approval call linkStaffProfile(), so a role that needs a
// StaffProfile — STUDENT_COUNSELOR does, to be assignable as a homegroup
// counselor — must be listed. Self-selection grants nothing on its own: every
// registration stays inactive until an admin approves it.
export const SELF_REGISTER_EDUCATOR_ROLES: Role[] = [
  "TEACHER",
  "STUDENT_COUNSELOR",
  "HEADTEACHER_B",
  "HEADTEACHER_A",
  "HEADMASTER",
];

// Office administration — /office portal
export const OFFICE_ROLES: Role[] = ["SCHOOL_ADMIN"];

// System administration — /admin portal (security boundary)
export const ADMIN_ROLES: Role[] = ["SUPER_ADMIN"];

export const STAFF_ROLES: Role[] = [
  ...EDUCATOR_ROLES,
  ...OFFICE_ROLES,
  ...ADMIN_ROLES,
];

export function isAdminStaff(role: Role): boolean {
  return ADMIN_ROLES.includes(role);
}

export function isOfficeAdmin(role: Role): boolean {
  return OFFICE_ROLES.includes(role);
}

export function isEducator(role: Role): boolean {
  return EDUCATOR_ROLES.includes(role);
}

export function isManagement(role: Role): boolean {
  return MANAGEMENT_ROLES.includes(role);
}

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

/**
 * Who may look up a colleague's phone number in the staff directory:
 * management, the office and the system admin.
 *
 * Narrower than "any member of staff" on purpose. A teacher's number is their
 * personal one, given to the school so it can reach them — the people whose job
 * involves reaching them are the headmaster, the deputies and the secretariat.
 * An ordinary teacher who needs a colleague has the staff-notification inbox and
 * the timetable; a counselor's work is with students, not staffing. If the
 * school later decides the whole staffroom should have the list, this is the one
 * line to change.
 *
 * Takes effective roles so an admin-granted SUPER_ADMIN counts, for the same
 * reason canAnyRoleViewAccessCode does.
 */
export function canViewStaffDirectory(roles: Role[]): boolean {
  return roles.some((r) => isManagement(r) || isOfficeAdmin(r) || isAdminStaff(r));
}

/**
 * Who may view a student's access code: the system admin, the office admin,
 * and the student's own homeroom teacher or homeroom headteacher.
 * `group` is the student's homeroom (its homeroomTeacherId / homeroomHeadteacherId);
 * `viewerStaffId` is the requesting staff member's StaffProfile id (if any).
 */
export function canViewAccessCode(
  role: Role,
  viewerStaffId: string | null | undefined,
  group: { homeroomTeacherId: string | null; homeroomHeadteacherId: string | null } | null
): boolean {
  if (role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN") return true;
  if (!isEducator(role) || !viewerStaffId || !group) return false;
  return (
    group.homeroomTeacherId === viewerStaffId ||
    group.homeroomHeadteacherId === viewerStaffId
  );
}

/**
 * The same rule for a user's full set of effective roles.
 *
 * A staff member can hold an admin-granted extra role on top of their primary
 * one (see effectiveRoles in roleAssignment.ts). Checking only the primary role
 * means a teacher with a SUPER_ADMIN grant is refused data the grant is
 * supposed to give them, on a page the same grant already let them open.
 */
export function canAnyRoleViewAccessCode(
  roles: Role[],
  viewerStaffId: string | null | undefined,
  group: { homeroomTeacherId: string | null; homeroomHeadteacherId: string | null } | null
): boolean {
  return roles.some((role) => canViewAccessCode(role, viewerStaffId, group));
}

/**
 * Who may remove a notice: the person who posted it, or the system admin.
 *
 * Notices are school-wide and cannot be edited, so deletion is the only way to
 * withdraw a mistake — but one staff member must not be able to take down
 * another's. Takes effective roles, so an admin-granted SUPER_ADMIN counts like
 * a primary one.
 */
export function canDeleteNotice(
  roles: Role[],
  authorId: string,
  viewerId: string | null | undefined,
): boolean {
  if (!viewerId) return false;
  return authorId === viewerId || roles.some(isAdminStaff);
}

// Only the system admin may generate or regenerate access codes;
// everyone else with access can merely view them.
export function canGenerateAccessCode(role: Role): boolean {
  return role === "SUPER_ADMIN";
}

// Only the system admin approves registrations and role assignments
export function canManageClaims(role: Role): boolean {
  return role === "SUPER_ADMIN";
}

// Check if role has at least the same clearance as required role
export function hasMinRole(userRole: Role, minRole: Role): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) <= ROLE_HIERARCHY.indexOf(minRole);
}

// Counselor notes are only visible to counselor and headmaster
export function canViewCounselorNotes(role: Role): boolean {
  return role === "STUDENT_COUNSELOR" || role === "HEADMASTER" || role === "SUPER_ADMIN";
}

// Which roles can view ALL referrals
export function canViewAllReferrals(role: Role): boolean {
  return (
    role === "SUPER_ADMIN" ||
    role === "HEADMASTER" ||
    role === "HEADTEACHER_A" ||
    role === "HEADTEACHER_B" ||
    role === "STUDENT_COUNSELOR"
  );
}

export function getPortalForRole(role: Role): "admin" | "teacher" | "office" | "student" | "parent" | "chaperone" {
  if (role === "PARENT") return "parent";
  if (role === "STUDENT") return "student";
  if (role === "CHAPERONE") return "chaperone";
  if (role === "SCHOOL_ADMIN") return "office";
  if (role === "SUPER_ADMIN") return "admin";
  return "teacher"; // HEADMASTER, HEADTEACHER_A, HEADTEACHER_B, STUDENT_COUNSELOR, TEACHER
}

// Routes that require specific minimum roles (admin portal)
export const PROTECTED_ROUTES: Record<string, Role> = {
  "/admin/settings": "SUPER_ADMIN",
  "/admin/audit-log": "SUPER_ADMIN",
};
