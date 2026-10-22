"use server";

import { db } from "@/server/db";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { getSuperAdminAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { relinkTimetableSlots } from "@/server/staffLink";
import { staffDeleteBlockers, type StaffDeleteBlocker } from "@/lib/staffDelete";
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

    // Attach the record's lessons by name — and release any lesson an earlier
    // link left on an account with another timetable name.
    await relinkTimetableSlots(tx);
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

export type DeleteStaffProfileResult = { ok: true } | { ok: false; reasons: StaffDeleteBlocker[] | ["notFound"] };

/**
 * Remove a timetable person from Χρήστες — only when nothing uses it (no
 * account, no lesson current or removed, no homegroup, no history, no
 * designation). Meant for names a wrong timetable import added.
 */
export async function deleteStaffProfile(staffProfileId: string): Promise<DeleteStaffProfileResult> {
  const admin = await requireSuperAdmin();

  const sp = await db.staffProfile.findUnique({
    where: { id: staffProfileId },
    select: {
      scheduleName: true,
      userId: true,
      specialEducation: true,
      substitutionCoordinator: true,
      ddkCoordinator: true,
      itMaintenance: true,
      itManager: true,
      _count: {
        select: {
          homeroomGroups: true, homeroomHeadGroups: true, homeroomCounselorGroups: true,
          courseAssignments: true, filedReferrals: true, attendanceRecords: true, issuedPermits: true,
          filedActivities: true, testSchedules: true, grades: true, dutyDays: true,
          substitutionRequests: true, substitutionAbsences: true, substitutionAssignments: true,
          toiletBreaks: true, ddkAwards: true, conversations: true, roomsMaintained: true,
        },
      },
    },
  });
  if (!sp) return { ok: false, reasons: ["notFound"] };

  // Lessons by record OR by name, removed ones included (naming removedAt opts
  // out of the current-timetable filter in db.ts).
  const lessons = await db.timetableSlot.count({
    where: {
      removedAt: undefined,
      OR: [{ staffId: staffProfileId }, ...(sp.scheduleName ? [{ staffName: sp.scheduleName }] : [])],
    },
  });
  const c = sp._count;
  const reasons = staffDeleteBlockers({
    hasAccount: !!sp.userId,
    lessons,
    homegroups: c.homeroomGroups + c.homeroomHeadGroups + c.homeroomCounselorGroups,
    historyCounts: [
      c.courseAssignments, c.filedReferrals, c.attendanceRecords, c.issuedPermits, c.filedActivities,
      c.testSchedules, c.grades, c.dutyDays, c.substitutionRequests, c.substitutionAbsences,
      c.substitutionAssignments, c.toiletBreaks, c.ddkAwards, c.conversations, c.roomsMaintained,
    ],
    designations: [sp.specialEducation, sp.substitutionCoordinator, sp.ddkCoordinator, sp.itMaintenance, sp.itManager],
  });
  if (reasons.length > 0) return { ok: false, reasons };

  // Any reference missed above makes the database refuse the delete.
  await db.staffProfile.delete({ where: { id: staffProfileId } });
  await writeAudit({
    userId: admin.userId,
    action: "staff.deleteProfile",
    resource: "StaffProfile",
    resourceId: staffProfileId,
    details: { scheduleName: sp.scheduleName },
    ...(await requestMeta()),
  });
  revalidatePath("/[locale]/(portal)/admin/users", "page");
  return { ok: true };
}
