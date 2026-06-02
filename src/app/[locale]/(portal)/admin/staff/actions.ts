"use server";

import { db } from "@/server/db";
import { revalidatePath } from "next/cache";
import { getActiveAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";

async function requireSuperAdmin() {
  const auth = await getActiveAuth();
  if (!auth || auth.role !== "SUPER_ADMIN") throw new Error("Forbidden");
  return auth;
}

export async function unlinkStaffUser(staffProfileId: string) {
  const admin = await requireSuperAdmin();
  await db.staffProfile.update({
    where: { id: staffProfileId },
    data: { userId: null },
  });
  await writeAudit({
    userId: admin.userId,
    action: "staff.unlinkUser",
    resource: "StaffProfile",
    resourceId: staffProfileId,
    ...(await requestMeta()),
  });
  revalidatePath("/[locale]/admin/staff", "page");
}

export async function linkStaffUser(staffProfileId: string, userId: string) {
  const admin = await requireSuperAdmin();
  // Unlink the user from any existing profile first
  await db.staffProfile.updateMany({
    where: { userId },
    data: { userId: null },
  });
  await db.staffProfile.update({
    where: { id: staffProfileId },
    data: { userId },
  });
  await writeAudit({
    userId: admin.userId,
    action: "staff.linkUser",
    resource: "StaffProfile",
    resourceId: staffProfileId,
    details: { linkedUserId: userId },
    ...(await requestMeta()),
  });
  revalidatePath("/[locale]/admin/staff", "page");
}
