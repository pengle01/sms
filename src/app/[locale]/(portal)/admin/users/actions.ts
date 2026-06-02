"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { hasMinRole } from "@/lib/rbac";
import { getActiveAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import type { Role } from "@/generated/prisma";
import { Prisma } from "@/generated/prisma";

async function requireAdmin() {
  const auth = await getActiveAuth();
  if (!auth || !hasMinRole(auth.role, "HEADMASTER")) {
    redirect("/");
  }
  return auth;
}

export async function approveUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = formData.get("userId") as string;
  const role = formData.get("role") as Role;

  const VALID_ROLES: Role[] = ["TEACHER", "SCHOOL_ADMIN", "CHAPERONE", "STUDENT_COUNSELOR", "HEADTEACHER_A", "HEADTEACHER_B", "HEADMASTER"];
  if (!VALID_ROLES.includes(role)) return;

  if (role === "TEACHER") {
    // Approve user + create StaffProfile + link timetable slots + mark claim approved — all in one transaction
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
        await tx.timetableSlot.updateMany({
          where: { staffName, staffId: null },
          data: { staffId: profile.id },
        });
        await tx.teacherClaim.update({
          where: { userId },
          data: { status: "APPROVED" },
        });
      }
    });
  } else {
    await db.user.update({
      where: { id: userId, isActive: false },
      data: { isActive: true, role },
    });
  }

  await writeAudit({
    userId: admin.userId,
    action: "user.approve",
    resource: "User",
    resourceId: userId,
    details: { role },
    ...(await requestMeta()),
  });
  revalidatePath("/", "layout");
}

export async function rejectUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = formData.get("userId") as string;

  // Only delete if still pending
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.isActive) return;

  await db.user.delete({ where: { id: userId } });
  await writeAudit({
    userId: admin.userId,
    action: "user.reject",
    resource: "User",
    resourceId: userId,
    ...(await requestMeta()),
  });
  revalidatePath("/", "layout");
}
