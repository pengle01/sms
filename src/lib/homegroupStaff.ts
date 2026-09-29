// Who can be offered as a homegroup's teacher, headteacher (deputy B) and
// counselor on Admin → Τμήματα. Pure — unit-tested in homegroupStaff.test.ts.
//
// The assignment points at the StaffProfile, so someone who has not signed up
// yet can be assigned; when they sign up and are approved, linkStaffProfile
// adopts that same profile and the assignment carries over. Their role is not
// known until then (it lives on the account), so an unlinked profile is placed
// by its timetable name: "… ΒΔ" is deputy B, "ΣΕΑ-…" the counselor.

import type { Role } from "@/generated/prisma/enums";
import { isManagementName, specialtyPrefix } from "@/lib/substitutions";

export interface HomegroupProfile {
  id: string;
  scheduleName: string | null;
  /** The account's role, or null when the profile has no account yet. */
  role: Role | null;
  leftTimetable: boolean;
}

export type HomegroupCandidate = HomegroupProfile & { hasAccount: boolean };

const COUNSELOR_PREFIX = "ΣΕΑ";

function lastToken(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? "";
}

export function homegroupCandidates(profiles: HomegroupProfile[]): {
  teachers: HomegroupCandidate[];
  headteachers: HomegroupCandidate[];
  counselors: HomegroupCandidate[];
} {
  const teachers: HomegroupCandidate[] = [];
  const headteachers: HomegroupCandidate[] = [];
  const counselors: HomegroupCandidate[] = [];
  for (const p of profiles) {
    if (p.role) {
      // With an account: by role, as before.
      const c = { ...p, hasAccount: true };
      if (p.role === "TEACHER") teachers.push(c);
      else if (p.role === "HEADTEACHER_B") headteachers.push(c);
      else if (p.role === "STUDENT_COUNSELOR") counselors.push(c);
      continue;
    }
    // No account: by timetable name. Teachers who left the timetable are not offered.
    const name = p.scheduleName?.trim();
    if (!name || p.leftTimetable) continue;
    const c = { ...p, hasAccount: false };
    if (specialtyPrefix(name) === COUNSELOR_PREFIX) counselors.push(c);
    else if (lastToken(name) === "ΒΔ") headteachers.push(c);
    else if (!isManagementName(name)) teachers.push(c);
    // Δ (headmaster) and ΒΔΑ (deputy A) are not homegroup staff.
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
