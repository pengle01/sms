import type { Prisma } from "@/generated/prisma/client";
import { staffProfilePlan } from "@/lib/staffLink";

type Db = Prisma.TransactionClient;

/**
 * Attach an approved user to the StaffProfile for a claimed timetable name and
 * link the name's unclaimed slots to it. Shared by registration approval and
 * teacher-claim approval so both resolve profiles the same way — in particular
 * both ADOPT an existing unclaimed profile (pre-seeded deputy or one detached
 * by user deletion) instead of creating a duplicate. See staffProfilePlan.
 */
export async function linkStaffProfile(tx: Db, userId: string, staffName: string) {
  const [own, unclaimed] = await Promise.all([
    tx.staffProfile.findUnique({
      where: { userId },
      select: { id: true, scheduleName: true },
    }),
    tx.staffProfile.findFirst({
      where: { scheduleName: staffName, userId: null },
      select: { id: true, scheduleName: true },
    }),
  ]);

  const plan = staffProfilePlan(own, unclaimed, staffName);
  const profile =
    plan.kind === "keep"
      ? { id: plan.id }
      : plan.kind === "rename"
        ? // scheduleName: the timetable's coding becomes the canonical display name.
          await tx.staffProfile.update({ where: { id: plan.id }, data: { scheduleName: staffName } })
        : plan.kind === "adopt"
          ? await tx.staffProfile.update({ where: { id: plan.id }, data: { userId } })
          : await tx.staffProfile.create({
              data: { userId, scheduleName: staffName } as Prisma.StaffProfileUncheckedCreateInput,
            });

  await tx.timetableSlot.updateMany({
    where: { staffName, staffId: null },
    data: { staffId: profile.id },
  });
  return profile;
}
