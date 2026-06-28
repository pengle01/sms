"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageClaims, SELF_REGISTER_EDUCATOR_ROLES } from "@/lib/rbac";
import { getActiveAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { db } from "@/server/db";
import type { Role } from "@/generated/prisma";
import { Prisma } from "@/generated/prisma";

async function requireAdmin() {
  const auth = await getActiveAuth();
  // Effective roles: extra SUPER_ADMIN grants count.
  if (!auth || !auth.roles.some(canManageClaims)) redirect("/");
  return auth;
}

const VALID_ROLES: Role[] = [
  "TEACHER", "SCHOOL_ADMIN", "CHAPERONE", "STUDENT_COUNSELOR",
  "HEADTEACHER_A", "HEADTEACHER_B", "HEADMASTER",
];

export async function approveRegistrationAction(userId: string, role: Role) {
  const admin = await requireAdmin();
  if (!VALID_ROLES.includes(role)) return;

  if (SELF_REGISTER_EDUCATOR_ROLES.includes(role)) {
    await db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId, isActive: false },
        data: { isActive: true, role },
        include: { teacherClaim: true },
      });
      const staffName = user.teacherClaim?.staffName;
      if (staffName) {
        // scheduleName: the timetable's coding becomes the canonical display name.
        const createData: Prisma.StaffProfileUncheckedCreateInput = { userId, scheduleName: staffName };
        const profile = await tx.staffProfile.create({ data: createData });
        await tx.timetableSlot.updateMany({ where: { staffName, staffId: null }, data: { staffId: profile.id } });
        await tx.teacherClaim.update({ where: { userId }, data: { status: "APPROVED" } });
      }
    });
  } else {
    await db.user.update({ where: { id: userId, isActive: false }, data: { isActive: true, role } });
  }
  await writeAudit({
    userId: admin.userId,
    action: "registration.approve",
    resource: "User",
    resourceId: userId,
    details: { role },
    ...(await requestMeta()),
  });
  revalidatePath("/", "layout");
}

export async function rejectRegistrationAction(userId: string) {
  const admin = await requireAdmin();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.isActive) return;
  await db.user.delete({ where: { id: userId } });
  await writeAudit({
    userId: admin.userId,
    action: "registration.reject",
    resource: "User",
    resourceId: userId,
    ...(await requestMeta()),
  });
  revalidatePath("/", "layout");
}

export async function approveTeacherClaimAction(claimId: string) {
  await requireAdmin();
  const claim = await db.teacherClaim.findUnique({ where: { id: claimId }, include: { user: true } });
  if (!claim || claim.status !== "PENDING") return;

  let profile = await db.staffProfile.findUnique({ where: { userId: claim.userId } });
  if (!profile) {
    const createData: Prisma.StaffProfileUncheckedCreateInput = { userId: claim.userId, scheduleName: claim.staffName };
    profile = await db.staffProfile.create({ data: createData });
  } else if (profile.scheduleName !== claim.staffName) {
    // Existing profile claiming a schedule name: adopt the timetable's coding.
    profile = await db.staffProfile.update({ where: { id: profile.id }, data: { scheduleName: claim.staffName } });
  }
  await db.timetableSlot.updateMany({ where: { staffName: claim.staffName, staffId: null }, data: { staffId: profile.id } });
  await db.teacherClaim.update({ where: { id: claimId }, data: { status: "APPROVED" } });
  revalidatePath("/", "layout");
}

export async function rejectTeacherClaimAction(claimId: string) {
  await requireAdmin();
  await db.teacherClaim.update({ where: { id: claimId, status: "PENDING" }, data: { status: "REJECTED" } });
  revalidatePath("/", "layout");
}

export async function approveChaperoneRequestAction(requestId: string) {
  await requireAdmin();
  await db.chaperoneRequest.update({ where: { id: requestId, status: "PENDING" }, data: { status: "APPROVED" } });
  revalidatePath("/", "layout");
}

export async function rejectChaperoneRequestAction(requestId: string) {
  await requireAdmin();
  await db.chaperoneRequest.update({ where: { id: requestId, status: "PENDING" }, data: { status: "REJECTED" } });
  revalidatePath("/", "layout");
}
