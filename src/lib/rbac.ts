import type { Role } from "@/generated/prisma";

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
 * Who may view/generate a student's access code: the system admin, the office
 * admin, and the student's own homeroom teacher or homeroom headteacher.
 * `group` is the student's homeroom (its homeroomTeacherId / homeroomHeadteacherId);
 * `viewerStaffId` is the requesting staff member's StaffProfile id (if any).
 */
export function canManageAccessCode(
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
