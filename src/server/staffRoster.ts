import { db } from "@/server/db";
import { availableStaffNames } from "@/lib/staffRoster";

/**
 * Schedule names a person may still claim. Shared by the public sign-up page,
 * its server action, and the post-login claim pages, so a name can never be
 * offered by one and refused by another. See availableStaffNames for the rule.
 */
export async function loadAvailableStaffNames(): Promise<string[]> {
  const [profiles, slots, claims] = await Promise.all([
    db.staffProfile.findMany({
      where: { scheduleName: { not: null } },
      select: { scheduleName: true, userId: true },
    }),
    db.timetableSlot.findMany({
      where: { staffName: { not: null }, staffId: null },
      select: { staffName: true },
      distinct: ["staffName"],
    }),
    db.teacherClaim.findMany({
      where: { status: { not: "REJECTED" } },
      select: { staffName: true },
    }),
  ]);

  return availableStaffNames({
    profiles,
    slotNames: slots.map((s) => s.staffName),
    claimedNames: claims.map((c) => c.staffName),
  });
}

/**
 * Server-side re-check for a submitted name. Deliberately the same query as the
 * picker rather than a cheaper lookup: a second implementation would drift, and
 * this runs once per sign-up.
 */
export async function isStaffNameAvailable(name: string): Promise<boolean> {
  return (await loadAvailableStaffNames()).includes(name.trim());
}
