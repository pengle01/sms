import { db } from "@/server/db";
import type { Role } from "@/generated/prisma/client";
import type { ReferralViewer } from "@/lib/referralLevels";

/**
 * Who is deciding referrals (see src/lib/referralLevels.ts): their roles, the
 * groups they are homegroup headteacher (Β.Δ.) of, and whether they are the
 * «Πειθαρχικό Συμβούλιο» headteacher. Null without a staff profile.
 */
export async function loadReferralViewer(
  userId: string,
  roles: readonly Role[],
): Promise<(ReferralViewer & { staffId: string }) | null> {
  const staff = await db.staffProfile.findUnique({
    where: { userId },
    select: { id: true, disciplinaryCouncil: true, homeroomHeadGroups: { select: { id: true } } },
  });
  if (!staff) return null;
  return {
    staffId: staff.id,
    roles,
    headGroupIds: staff.homeroomHeadGroups.map((g) => g.id),
    isCouncil: staff.disciplinaryCouncil,
  };
}
