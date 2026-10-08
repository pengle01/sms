import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { staffProfilePlan, findUnclaimedByName } from "@/lib/staffLink";
import { slotRelinks, sameStaffName } from "@/lib/timetableLink";

type Db = Prisma.TransactionClient;

/**
 * Attach an approved user to the StaffProfile for a claimed timetable name and
 * link the name's unclaimed slots to it. Shared by registration approval and
 * teacher-claim approval so both resolve profiles the same way — in particular
 * both ADOPT an existing unclaimed profile (pre-seeded deputy or one detached
 * by user deletion) instead of creating a duplicate. See staffProfilePlan.
 */
export async function linkStaffProfile(tx: Db, userId: string, staffName: string) {
  const [own, unclaimedProfiles] = await Promise.all([
    tx.staffProfile.findUnique({
      where: { userId },
      select: { id: true, scheduleName: true },
    }),
    // Unclaimed profiles, matched below ignoring stray spaces (see findUnclaimedByName).
    tx.staffProfile.findMany({
      where: { userId: null, scheduleName: { not: null } },
      select: { id: true, scheduleName: true },
    }),
  ]);
  const unclaimed = findUnclaimedByName(unclaimedProfiles, staffName);

  const plan = staffProfilePlan(own, unclaimed, staffName);
  // Switching the account to another timetable name: its lessons under the old
  // name aren't its lessons any more — release them before attaching the new
  // name's (they'd otherwise show on this teacher's dashboard for good).
  if (plan.kind === "rename") {
    const attached = await tx.timetableSlot.findMany({
      where: { staffId: plan.id },
      select: { id: true, staffName: true },
    });
    const stale = attached.filter((s) => !sameStaffName(s.staffName, staffName)).map((s) => s.id);
    if (stale.length > 0) {
      await tx.timetableSlot.updateMany({ where: { id: { in: stale } }, data: { staffId: null } });
    }
  }

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

/**
 * Make every current lesson's account match its timetable name (see
 * slotRelinks): release lessons attached to an account with another name, then
 * attach unclaimed ones by name. Runs after each timetable import, after an
 * admin link/unlink, and from «Έλεγχοι». Pass a transaction to run inside it.
 */
export async function relinkTimetableSlots(client: Db = db as unknown as Db): Promise<{ released: number; linked: number }> {
  const [slots, profiles] = await Promise.all([
    client.timetableSlot.findMany({ select: { id: true, staffName: true, staffId: true } }),
    client.staffProfile.findMany({ select: { id: true, scheduleName: true, userId: true } }),
  ]);
  const { release, link } = slotRelinks(slots, profiles);
  if (release.length > 0) {
    await client.timetableSlot.updateMany({ where: { id: { in: release } }, data: { staffId: null } });
  }
  const byProfile = new Map<string, string[]>();
  for (const { slotId, profileId } of link) byProfile.set(profileId, [...(byProfile.get(profileId) ?? []), slotId]);
  let linked = 0;
  for (const [profileId, slotIds] of byProfile) {
    const r = await client.timetableSlot.updateMany({ where: { id: { in: slotIds } }, data: { staffId: profileId } });
    linked += r.count;
  }
  return { released: release.length, linked };
}

/** Lessons attached to an account whose timetable name differs — for «Έλεγχοι». */
export async function misattachedSlots() {
  const [slots, profiles] = await Promise.all([
    db.timetableSlot.findMany({ where: { staffId: { not: null } }, select: { id: true, staffName: true, staffId: true } }),
    db.staffProfile.findMany({ select: { id: true, scheduleName: true, userId: true } }),
  ]);
  const { release } = slotRelinks(slots, profiles);
  if (release.length === 0) return [];
  return db.timetableSlot.findMany({
    where: { id: { in: release } },
    select: {
      id: true,
      dayOfWeek: true,
      period: true,
      staffName: true,
      group: { select: { name: true } },
      course: { select: { name: true } },
      staff: { select: { scheduleName: true, user: { select: { name: true } } } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
  });
}
