"use server";

import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { revalidatePath } from "next/cache";
import { writeAudit, requestMeta } from "@/server/audit";

export type FixResult = { ok: true } | { ok: false; error: string };

async function requireSuperAdmin(): Promise<string | null> {
  const auth = await getSuperAdminAuth();
  return auth?.userId ?? null;
}

function revalidateAffected() {
  revalidatePath("/[locale]/(portal)/admin/checks", "page");
  revalidatePath("/[locale]/(portal)/admin/dashboard", "page");
}

// Move the student to a different homegroup (or clear it with null).
export async function setStudentHomegroup(
  studentProfileId: string,
  groupId: string | null
): Promise<FixResult> {
  const adminId = await requireSuperAdmin();
  if (!adminId) return { ok: false, error: "Forbidden" };

  if (groupId) {
    const group = await db.group.findUnique({ where: { id: groupId }, select: { id: true } });
    if (!group) return { ok: false, error: "Group not found" };
  }

  await db.studentProfile.update({
    where: { id: studentProfileId },
    data: { groupId },
  });

  const meta = await requestMeta();
  await writeAudit({
    userId: adminId,
    action: "student.setHomegroup",
    resource: "StudentProfile",
    resourceId: studentProfileId,
    details: { groupId },
    ...meta,
  });

  revalidateAffected();
  return { ok: true };
}

// Enrol the student in a subject group.
export async function addStudentToGroup(
  studentProfileId: string,
  groupId: string
): Promise<FixResult> {
  const adminId = await requireSuperAdmin();
  if (!adminId) return { ok: false, error: "Forbidden" };

  const group = await db.group.findUnique({ where: { id: groupId }, select: { id: true } });
  if (!group) return { ok: false, error: "Group not found" };

  await db.studentGroup.upsert({
    where: { studentProfileId_groupId: { studentProfileId, groupId } },
    create: { studentProfileId, groupId },
    update: {},
  });

  const meta = await requestMeta();
  await writeAudit({
    userId: adminId,
    action: "student.addToGroup",
    resource: "StudentProfile",
    resourceId: studentProfileId,
    details: { groupId },
    ...meta,
  });

  revalidateAffected();
  return { ok: true };
}

// Delete every StudentGroup row that just duplicates the student's own
// homegroup (import artifact) — coverage is unaffected, the data gets clean.
export async function removeRedundantMemberships(): Promise<
  FixResult | { ok: true; removed: number }
> {
  const adminId = await requireSuperAdmin();
  if (!adminId) return { ok: false, error: "Forbidden" };

  const rows = await db.studentGroup.findMany({
    select: { id: true, groupId: true, studentProfile: { select: { groupId: true } } },
  });
  const redundantIds = rows
    .filter((r) => r.groupId === r.studentProfile.groupId)
    .map((r) => r.id);

  if (redundantIds.length > 0) {
    await db.studentGroup.deleteMany({ where: { id: { in: redundantIds } } });
  }

  const meta = await requestMeta();
  await writeAudit({
    userId: adminId,
    action: "student.removeRedundantMemberships",
    resource: "StudentGroup",
    resourceId: `removed:${redundantIds.length}`,
    details: { removed: redundantIds.length },
    ...meta,
  });

  revalidateAffected();
  return { ok: true, removed: redundantIds.length };
}

// Remove the student from a subject group.
export async function removeStudentFromGroup(
  studentProfileId: string,
  groupId: string
): Promise<FixResult> {
  const adminId = await requireSuperAdmin();
  if (!adminId) return { ok: false, error: "Forbidden" };

  await db.studentGroup.deleteMany({ where: { studentProfileId, groupId } });

  const meta = await requestMeta();
  await writeAudit({
    userId: adminId,
    action: "student.removeFromGroup",
    resource: "StudentProfile",
    resourceId: studentProfileId,
    details: { groupId },
    ...meta,
  });

  revalidateAffected();
  return { ok: true };
}
