"use server";

import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { revalidatePath } from "next/cache";

export async function assignHomeroomTeacher(groupId: string, staffId: string | null) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "SUPER_ADMIN") throw new Error("Forbidden");

  await db.group.update({
    where: { id: groupId },
    data: { homeroomTeacherId: staffId },
  });

  revalidatePath("/[locale]/admin/groups", "page");
}

export async function assignHomeroomHeadteacher(groupId: string, staffId: string | null) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "SUPER_ADMIN") throw new Error("Forbidden");

  await db.group.update({
    where: { id: groupId },
    data: { homeroomHeadteacherId: staffId },
  });

  revalidatePath("/[locale]/admin/groups", "page");
}
