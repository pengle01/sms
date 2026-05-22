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

export const STAFF_ROLES: Role[] = [
  "SUPER_ADMIN",
  "HEADMASTER",
  "HEADTEACHER_A",
  "HEADTEACHER_B",
  "STUDENT_COUNSELOR",
  "SCHOOL_ADMIN",
  "TEACHER",
];

export const ADMIN_ROLES: Role[] = [
  "SUPER_ADMIN",
  "HEADMASTER",
  "HEADTEACHER_A",
  "HEADTEACHER_B",
  "STUDENT_COUNSELOR",
  "SCHOOL_ADMIN",
];

export function isAdminStaff(role: Role): boolean {
  return ADMIN_ROLES.includes(role);
}

export const MANAGEMENT_ROLES: Role[] = [
  "SUPER_ADMIN",
  "HEADMASTER",
  "HEADTEACHER_A",
  "HEADTEACHER_B",
];

// Check if role has at least the same clearance as required role
export function hasMinRole(userRole: Role, minRole: Role): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) <= ROLE_HIERARCHY.indexOf(minRole);
}

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

export function isManagement(role: Role): boolean {
  return MANAGEMENT_ROLES.includes(role);
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

// Which roles get the admin/staff portal
export function getPortalForRole(role: Role): "admin" | "teacher" | "student" | "parent" | "chaperone" {
  if (role === "PARENT") return "parent";
  if (role === "STUDENT") return "student";
  if (role === "CHAPERONE") return "chaperone";
  if (role === "TEACHER") return "teacher";
  return "admin";
}

// Routes that require specific minimum roles
export const PROTECTED_ROUTES: Record<string, Role> = {
  "/admin/settings": "SUPER_ADMIN",
  "/admin/audit-log": "HEADMASTER",
  "/admin/staff": "HEADMASTER",
  "/admin/groups": "SCHOOL_ADMIN",
  "/admin/referrals": "HEADTEACHER_A",
};
