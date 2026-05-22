"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { canManageClaims } from "@/lib/rbac";
import { db } from "@/server/db";
import type { Role } from "@/generated/prisma";
import { Prisma } from "@/generated/prisma";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canManageClaims(session.user.role as Role)) redirect("/");
  return session;
}

const VALID_ROLES: Role[] = [
  "TEACHER", "SCHOOL_ADMIN", "CHAPERONE", "STUDENT_COUNSELOR",
  "HEADTEACHER_A", "HEADTEACHER_B", "HEADMASTER",
];

export async function approveRegistrationAction(userId: string, role: Role) {
  await requireAdmin();
  if (!VALID_ROLES.includes(role)) return;

  if (role === "TEACHER") {
    await db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId, isActive: false },
        data: { isActive: true, role },
        include: { teacherClaim: true },
      });
      const staffName = user.teacherClaim?.staffName;
      if (staffName) {
        const createData: Prisma.StaffProfileUncheckedCreateInput = { userId };
        const profile = await tx.staffProfile.create({ data: createData });
        await tx.timetableSlot.updateMany({ where: { staffName, staffId: null }, data: { staffId: profile.id } });
        await tx.teacherClaim.update({ where: { userId }, data: { status: "APPROVED" } });
      }
    });
  } else {
    await db.user.update({ where: { id: userId, isActive: false }, data: { isActive: true, role } });
  }
  revalidatePath("/", "layout");
}

export async function rejectRegistrationAction(userId: string) {
  await requireAdmin();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.isActive) return;
  await db.user.delete({ where: { id: userId } });
  revalidatePath("/", "layout");
}

export async function approveTeacherClaimAction(claimId: string) {
  await requireAdmin();
  const claim = await db.teacherClaim.findUnique({ where: { id: claimId }, include: { user: true } });
  if (!claim || claim.status !== "PENDING") return;

  let profile = await db.staffProfile.findUnique({ where: { userId: claim.userId } });
  if (!profile) {
    const createData: Prisma.StaffProfileUncheckedCreateInput = { userId: claim.userId };
    profile = await db.staffProfile.create({ data: createData });
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
