import { db } from "@/server/db";
import type { ActiveAuth } from "@/server/authz";

const FULL_ACCESS_ROLES = ["SUPER_ADMIN", "HEADMASTER", "HEADTEACHER_A", "STUDENT_COUNSELOR"];

/**
 * May this user read (and print) the referral's documents? Full-access roles,
 * the teacher who filed it, a headteacher of one of its students' groups, or
 * the «Πειθαρχικό Συμβούλιο» headteacher once a student is referred to the council.
 * Effective roles, so an admin-granted SUPER_ADMIN counts like a primary one.
 */
export async function canReadReferral(
  auth: ActiveAuth,
  referral: { id: string; filerId: string; students: { groupId: string | null }[] },
): Promise<boolean> {
  if (auth.roles.some((r) => FULL_ACCESS_ROLES.includes(r))) return true;
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { id: true, disciplinaryCouncil: true, homeroomHeadGroups: { select: { id: true } } },
  });
  if (!staff) return false;
  if (referral.filerId === staff.id) return true;
  const headGroupIds = new Set(staff.homeroomHeadGroups.map((g) => g.id));
  if (referral.students.some((rs) => !!rs.groupId && headGroupIds.has(rs.groupId))) return true;
  // Referred to the council at some point (the student returns to the
  // homegroup headteacher once the council has chosen the measure).
  if (staff.disciplinaryCouncil) {
    const referred = await db.referralEscalation.findFirst({
      where: { toLevel: "COUNCIL", referralStudent: { referralId: referral.id } },
      select: { id: true },
    });
    return !!referred;
  }
  return false;
}
