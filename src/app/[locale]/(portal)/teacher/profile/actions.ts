"use server";

import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { revalidatePath } from "next/cache";
import { isEducator } from "@/lib/rbac";
import { validateProfileInput, type ProfileInput } from "@/lib/profile";
import { writeAudit, requestMeta } from "@/server/audit";
import type { Role } from "@/generated/prisma";

export type UpdateProfileResult = { ok: true } | { ok: false; error: string };

// Educators update their OWN personal information only — the session decides
// whose record is touched, never the client.
export async function updateMyProfile(input: ProfileInput): Promise<UpdateProfileResult> {
  const session = await getServerSession(authOptions);
  if (!session || !isEducator(session.user.role as Role)) {
    return { ok: false, error: "errForbidden" };
  }

  // Staff accounts must complete every field (phone/department/ΠΜΠ included).
  const staff = await db.staffProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  const v = validateProfileInput(input, staff != null);
  if (!v.ok) return { ok: false, error: v.error };

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: session.user.id },
      // `name` stays the composed full name so every existing display/search site
      // keeps working; firstName/lastName hold the split parts.
      data: { firstName: v.firstName, lastName: v.lastName, name: v.name },
    });
    if (staff) {
      await tx.staffProfile.update({
        where: { id: staff.id },
        data: { phone: v.phone, department: v.department, pmp: v.pmp },
      });
    }
  });

  const meta = await requestMeta();
  await writeAudit({
    userId: session.user.id,
    action: "profile.update",
    resource: "StaffProfile",
    resourceId: staff?.id ?? session.user.id,
    ...meta,
  });

  revalidatePath("/[locale]/(portal)/teacher/profile", "page");
  return { ok: true };
}
