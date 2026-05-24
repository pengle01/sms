"use server";

import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { revalidatePath } from "next/cache";

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "SUPER_ADMIN") throw new Error("Forbidden");
}

export async function unlinkStaffUser(staffProfileId: string) {
  await requireSuperAdmin();
  await db.staffProfile.update({
    where: { id: staffProfileId },
    data: { userId: null },
  });
  revalidatePath("/[locale]/admin/staff", "page");
}

export async function linkStaffUser(staffProfileId: string, userId: string) {
  await requireSuperAdmin();
  // Unlink the user from any existing profile first
  await db.staffProfile.updateMany({
    where: { userId },
    data: { userId: null },
  });
  await db.staffProfile.update({
    where: { id: staffProfileId },
    data: { userId },
  });
  revalidatePath("/[locale]/admin/staff", "page");
}
