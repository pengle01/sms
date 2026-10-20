import { db } from "@/server/db";
import type { ActiveAuth } from "@/server/authz";

const FULL_ACCESS_ROLES = ["SUPER_ADMIN", "HEADMASTER", "HEADTEACHER_A", "STUDENT_COUNSELOR"];

/**
 * May this user read (and print) the referral's documents? Full-access roles,
 * the teacher who filed it, or a headteacher of one of its students' groups.
 * Effective roles, so an admin-granted SUPER_ADMIN counts like a primary one.
 */
export async function canReadReferral(
  auth: ActiveAuth,
  referral: { filerId: string; students: { groupId: string | null }[] },
): Promise<boolean> {
  if (auth.roles.some((r) => FULL_ACCESS_ROLES.includes(r))) return true;
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { id: true, homeroomHeadGroups: { select: { id: true } } },
  });
  if (!staff) return false;
  if (referral.filerId === staff.id) return true;
  const headGroupIds = new Set(staff.homeroomHeadGroups.map((g) => g.id));
  return referral.students.some((rs) => !!rs.groupId && headGroupIds.has(rs.groupId));
}
