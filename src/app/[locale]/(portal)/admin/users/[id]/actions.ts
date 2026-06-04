"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { validateAdminGrant, validateAdminRevoke } from "@/lib/roleAssignment";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateUsers() {
  revalidatePath("/[locale]/(portal)/admin/users", "page");
  revalidatePath("/[locale]/(portal)/admin/users/[id]", "page");
}

/** Count of ACTIVE users who are super admins by primary or extra role. */
async function countEffectiveSuperAdmins(): Promise<number> {
  return db.user.count({
    where: {
      isActive: true,
      OR: [{ role: "SUPER_ADMIN" }, { extraRoles: { has: "SUPER_ADMIN" } }],
    },
  });
}

/** Grant SUPER_ADMIN as an EXTRA role — the user's primary role stays as is. */
export async function grantSuperAdmin(targetUserId: string): Promise<ActionResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Forbidden" };

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { role: true, extraRoles: true, isActive: true },
  });
  if (!target) return { ok: false, error: "User not found" };

  const check = validateAdminGrant({
    actorId: auth.userId,
    targetId: targetUserId,
    targetPrimary: target.role,
    targetExtra: target.extraRoles,
    targetActive: target.isActive,
  });
  if (!check.ok) return { ok: false, error: GRANT_ERRORS[check.error] };

  await db.user.update({
    where: { id: targetUserId },
    data: { extraRoles: { push: "SUPER_ADMIN" } },
  });
  await writeAudit({
    userId: auth.userId,
    action: "user.grantSuperAdmin",
    resource: "User",
    resourceId: targetUserId,
    details: { primaryRole: target.role },
    ...(await requestMeta()),
  });
  revalidateUsers();
  return { ok: true };
}

/** Revoke an extra SUPER_ADMIN role. Primary roles are never changed here. */
export async function revokeSuperAdmin(targetUserId: string): Promise<ActionResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Forbidden" };

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { role: true, extraRoles: true },
  });
  if (!target) return { ok: false, error: "User not found" };

  const check = validateAdminRevoke({
    actorId: auth.userId,
    targetId: targetUserId,
    targetPrimary: target.role,
    targetExtra: target.extraRoles,
    effectiveSuperAdmins: await countEffectiveSuperAdmins(),
  });
  if (!check.ok) return { ok: false, error: REVOKE_ERRORS[check.error] };

  await db.user.update({
    where: { id: targetUserId },
    data: { extraRoles: { set: target.extraRoles.filter((r) => r !== "SUPER_ADMIN") } },
  });
  await writeAudit({
    userId: auth.userId,
    action: "user.revokeSuperAdmin",
    resource: "User",
    resourceId: targetUserId,
    details: { primaryRole: target.role },
    ...(await requestMeta()),
  });
  revalidateUsers();
  return { ok: true };
}

/** Toggle the "deputy B responsible for special education" designation. */
export async function setSpecialEducation(
  targetUserId: string,
  value: boolean
): Promise<ActionResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Forbidden" };

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { staffProfile: { select: { id: true } } },
  });
  if (!target?.staffProfile) return { ok: false, error: "No staff profile linked" };

  await db.staffProfile.update({
    where: { id: target.staffProfile.id },
    data: { specialEducation: value },
  });
  await writeAudit({
    userId: auth.userId,
    action: "staff.specialEducation",
    resource: "StaffProfile",
    resourceId: target.staffProfile.id,
    details: { value },
    ...(await requestMeta()),
  });
  revalidateUsers();
  return { ok: true };
}

const GRANT_ERRORS: Record<string, string> = {
  errSelf: "You cannot change your own access.",
  errAlreadyAdmin: "This user is already a system administrator.",
  errInactive: "Inactive accounts cannot be granted admin access.",
};

const REVOKE_ERRORS: Record<string, string> = {
  errSelf: "You cannot change your own access.",
  errPrimaryAdmin: "This user's primary role is Super Admin — it cannot be revoked here.",
  errNotGranted: "This user has no granted admin access.",
  errLastSuperAdmin: "This is the last active system administrator — access cannot be revoked.",
};
