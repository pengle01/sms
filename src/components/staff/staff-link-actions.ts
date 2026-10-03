"use server";

import { db } from "@/server/db";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { getSuperAdminAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import {
  EMPTY_DETAILS,
  detailsForLink,
  hasAnyDetails,
  parseStaffDetails,
  pickDetails,
} from "@/lib/staffDetails";

async function requireSuperAdmin() {
  const auth = await getSuperAdminAuth();
  if (!auth) throw new Error("Forbidden");
  return auth;
}

const detailsSelect = { id: true, userId: true, phone: true, department: true, pmp: true } as const;

/**
 * Detach the account from this staff record. The person's own details (phone,
 * specialty, ΠΜΠ) go with them — kept on the account until it's linked again —
 * and the record keeps none, so whoever is linked to it next starts clean.
 */
export async function unlinkStaffUser(staffProfileId: string) {
  const admin = await requireSuperAdmin();
  let moved = false;
  await db.$transaction(async (tx) => {
    const profile = await tx.staffProfile.findUnique({ where: { id: staffProfileId }, select: detailsSelect });
    if (!profile) return;
    const details = pickDetails(profile);
    moved = hasAnyDetails(details);
    if (profile.userId && moved) {
      await tx.user.update({ where: { id: profile.userId }, data: { staffDetails: { ...details } } });
    }
    await tx.staffProfile.update({
      where: { id: staffProfileId },
      data: { userId: null, ...EMPTY_DETAILS },
    });
  });
  await writeAudit({
    userId: admin.userId,
    action: "staff.unlinkUser",
    resource: "StaffProfile",
    resourceId: staffProfileId,
    details: { moved },
    ...(await requestMeta()),
  });
  revalidatePath("/[locale]/(portal)/admin/users", "page");
}

/**
 * Link the account to this staff record. Its details come along — from the
 * record it was on, or from the stash an earlier unlink left — and replace
 * whatever the target held (that belonged to its previous holder). The record's
 * unclaimed timetable lessons are attached too, as approval does, so the
 * teacher sees their timetable straight away.
 */
export async function linkStaffUser(staffProfileId: string, userId: string) {
  const admin = await requireSuperAdmin();
  let moved = false;
  await db.$transaction(async (tx) => {
    const [target, oldProfile, user] = await Promise.all([
      tx.staffProfile.findUnique({ where: { id: staffProfileId }, select: { id: true, scheduleName: true } }),
      tx.staffProfile.findUnique({ where: { userId }, select: detailsSelect }),
      tx.user.findUnique({ where: { id: userId }, select: { staffDetails: true } }),
    ]);
    if (!target || !user) return;

    const fromOld = oldProfile && oldProfile.id !== staffProfileId ? pickDetails(oldProfile) : null;
    const details =
      oldProfile?.id === staffProfileId
        ? pickDetails(oldProfile) // already linked here: keep what's there
        : detailsForLink({ fromOldProfile: fromOld, stash: parseStaffDetails(user.staffDetails) });
    moved = hasAnyDetails(details);

    // Free the account's old record first (userId is unique), leaving it no details.
    if (oldProfile && oldProfile.id !== staffProfileId) {
      await tx.staffProfile.update({ where: { id: oldProfile.id }, data: { userId: null, ...EMPTY_DETAILS } });
    }
    await tx.staffProfile.update({ where: { id: staffProfileId }, data: { userId, ...details } });
    await tx.user.update({ where: { id: userId }, data: { staffDetails: Prisma.DbNull } });

    if (target.scheduleName) {
      await tx.timetableSlot.updateMany({
        where: { staffName: target.scheduleName, staffId: null },
        data: { staffId: staffProfileId },
      });
    }
  });
  await writeAudit({
    userId: admin.userId,
    action: "staff.linkUser",
    resource: "StaffProfile",
    resourceId: staffProfileId,
    details: { linkedUserId: userId, moved },
    ...(await requestMeta()),
  });
  revalidatePath("/[locale]/(portal)/admin/users", "page");
}
