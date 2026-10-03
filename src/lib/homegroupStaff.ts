// Who can be offered as a homegroup's teacher, headteacher (deputy B) and
// counselor on Admin → Τμήματα. Pure — unit-tested in homegroupStaff.test.ts.
//
// The assignment points at the StaffProfile, so someone who has not signed up
// yet can be assigned; when they sign up and are approved, linkStaffProfile
// adopts that same profile and the assignment carries over. Their role is not
// known until then (it lives on the account), so an unlinked profile is placed
// by the admin's planned role, else its timetable name ("… ΒΔ", "ΣΕΑ-…").

import type { Role } from "@/generated/prisma/enums";
import { effectiveStaffRole } from "@/lib/staffRole";
import { matchesSearch } from "@/lib/textSearch";

export interface HomegroupProfile {
  id: string;
  scheduleName: string | null;
  /** The account's role, or null when the profile has no account yet. */
  role: Role | null;
  /** The role the admin planned before sign-up (StaffProfile.plannedRole). */
  plannedRole?: Role | null;
  leftTimetable: boolean;
}

export type HomegroupCandidate = HomegroupProfile & { hasAccount: boolean };

/**
 * Split the roster into the three dropdowns by each person's role — the
 * account's, else the admin's planned role, else the timetable-name marker
 * (effectiveStaffRole). A deputy whose name lacks «ΒΔ» is therefore offered as
 * headteacher once their account or planned role says so.
 */
export function homegroupCandidates(profiles: HomegroupProfile[]): {
  teachers: HomegroupCandidate[];
  headteachers: HomegroupCandidate[];
  counselors: HomegroupCandidate[];
} {
  const teachers: HomegroupCandidate[] = [];
  const headteachers: HomegroupCandidate[] = [];
  const counselors: HomegroupCandidate[] = [];
  for (const p of profiles) {
    const hasAccount = p.role !== null;
    // Without an account: only current timetable names; teachers who left aren't offered.
    if (!hasAccount && (!p.scheduleName?.trim() || p.leftTimetable)) continue;
    const role = effectiveStaffRole({ accountRole: p.role, plannedRole: p.plannedRole, scheduleName: p.scheduleName });
    const c = { ...p, hasAccount };
    if (role === "TEACHER") teachers.push(c);
    else if (role === "HEADTEACHER_B") headteachers.push(c);
    else if (role === "STUDENT_COUNSELOR") counselors.push(c);
    // The headmaster and deputy A are not homegroup staff.
  }
  return { teachers, headteachers, counselors };
}

export interface HomegroupAssignments {
  teacherOf: string[];
  headteacherOf: string[];
  counselorOf: string[];
}

/**
 * The account role a sign-up needs for the homegroup posts already assigned to
 * their profile, or null when any educator role will do. Access follows the
 * approved role, so a counselor approved as TEACHER keeps the assignment but
 * gets no counselor access.
 */
export function roleNeededFor(a: HomegroupAssignments): Role | null {
  if (a.counselorOf.length > 0) return "STUDENT_COUNSELOR";
  if (a.headteacherOf.length > 0) return "HEADTEACHER_B";
  return null;
}

export interface HomegroupStaffRow {
  groupName: string;
  teacher: string | null;
  headteacher: string | null;
  counselor: string | null;
}

/**
 * Rows of the teachers' «Υπεύθυνοι τμημάτων» list matching the search box:
 * by class or by any of the three names, accent- and case-insensitive.
 */
export function filterHomegroupRows<T extends HomegroupStaffRow>(rows: T[], q: string): T[] {
  if (!q.trim()) return rows;
  return rows.filter((r) => [r.groupName, r.teacher, r.headteacher, r.counselor].some((v) => matchesSearch(v, q)));
}
