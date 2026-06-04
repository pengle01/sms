"use server";

import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { revalidatePath } from "next/cache";

export async function assignHomeroomTeacher(groupId: string, staffId: string | null) {
  const auth = await getSuperAdminAuth();
  if (!auth) throw new Error("Forbidden");

  await db.group.update({
    where: { id: groupId },
    data: { homeroomTeacherId: staffId },
  });

  revalidatePath(`/[locale]/admin/groups/${groupId}`, "page");
}
