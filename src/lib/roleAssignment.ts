// Secondary-role (extra SUPER_ADMIN) and special-education designation logic.
// Pure — no DB imports.
//
// The system keeps a single primary role per user; `User.extraRoles` can
// additionally carry SUPER_ADMIN so that e.g. a teacher who administers the
// system keeps the full teacher portal. The primary role is never changed
// here — only the extra grant is managed.

import type { Role } from "@/generated/prisma/client";

/** Primary + extra roles, deduplicated, primary first. */
export function effectiveRoles(primary: Role, extra: Role[]): Role[] {
  return [primary, ...extra.filter((r) => r !== primary)];
}

export function isEffectiveSuperAdmin(primary: Role, extra: Role[]): boolean {
  return primary === "SUPER_ADMIN" || extra.includes("SUPER_ADMIN");
}

export type GrantError = "errSelf" | "errAlreadyAdmin" | "errInactive";
export type RevokeError = "errSelf" | "errPrimaryAdmin" | "errNotGranted" | "errLastSuperAdmin";
export type DeleteError = "errSelf" | "errLastSuperAdmin";

/** May the actor grant an extra SUPER_ADMIN role to the target? */
export function validateAdminGrant(p: {
  actorId: string;
  targetId: string;
  targetPrimary: Role;
  targetExtra: Role[];
  targetActive: boolean;
}): { ok: true } | { ok: false; error: GrantError } {
  if (p.actorId === p.targetId) return { ok: false, error: "errSelf" };
  if (!p.targetActive) return { ok: false, error: "errInactive" };
  if (isEffectiveSuperAdmin(p.targetPrimary, p.targetExtra)) {
    return { ok: false, error: "errAlreadyAdmin" };
  }
  return { ok: true };
}

/**
 * May the actor revoke the target's extra SUPER_ADMIN role?
 * `effectiveSuperAdmins` counts ACTIVE users whose primary or extra roles
 * include SUPER_ADMIN — the system must never drop to zero.
 */
export function validateAdminRevoke(p: {
  actorId: string;
  targetId: string;
  targetPrimary: Role;
  targetExtra: Role[];
  effectiveSuperAdmins: number;
}): { ok: true } | { ok: false; error: RevokeError } {
  if (p.actorId === p.targetId) return { ok: false, error: "errSelf" };
  if (p.targetPrimary === "SUPER_ADMIN") return { ok: false, error: "errPrimaryAdmin" };
  if (!p.targetExtra.includes("SUPER_ADMIN")) return { ok: false, error: "errNotGranted" };
  if (p.effectiveSuperAdmins <= 1) return { ok: false, error: "errLastSuperAdmin" };
  return { ok: true };
}

/**
 * May the actor permanently delete the target user?
 * Never delete yourself, and never delete the last active SUPER_ADMIN (by
 * primary or extra role) — the system must always keep one administrator.
 * `effectiveSuperAdmins` counts ACTIVE super admins (primary or extra).
 */
export function validateUserDelete(p: {
  actorId: string;
  targetId: string;
  targetPrimary: Role;
  targetExtra: Role[];
  effectiveSuperAdmins: number;
}): { ok: true } | { ok: false; error: DeleteError } {
  if (p.actorId === p.targetId) return { ok: false, error: "errSelf" };
  if (isEffectiveSuperAdmin(p.targetPrimary, p.targetExtra) && p.effectiveSuperAdmins <= 1) {
    return { ok: false, error: "errLastSuperAdmin" };
  }
  return { ok: true };
}
