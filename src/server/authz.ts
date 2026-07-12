import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { effectiveRoles, isEffectiveSuperAdmin } from "@/lib/roleAssignment";
import type { Session } from "next-auth";
import type { Role } from "@/generated/prisma/client";

export interface ActiveAuth {
  session: Session;
  userId: string;
  /** Primary role — drives portals and features. */
  role: Role;
  /** Primary + extra roles (currently only SUPER_ADMIN is granted as extra). */
  roles: Role[];
}

/**
 * Returns the current session together with the user's *fresh* role and active
 * status read from the database. Returns null if there is no session or the
 * account has been deactivated. Use this in layouts/server actions instead of
 * trusting the (potentially stale) role baked into the JWT at login time.
 */
export async function getActiveAuth(): Promise<ActiveAuth | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, role: true, extraRoles: true },
  });
  if (!user || !user.isActive) return null;
  return {
    session,
    userId: session.user.id,
    role: user.role,
    roles: effectiveRoles(user.role, user.extraRoles),
  };
}

/**
 * Auth for SUPER_ADMIN-only pages and server actions. Accepts a primary
 * SUPER_ADMIN or an extra-role grant; always fresh from the DB, so promotions
 * and revocations take effect without re-login.
 */
export async function getSuperAdminAuth(): Promise<ActiveAuth | null> {
  const auth = await getActiveAuth();
  if (!auth || !isEffectiveSuperAdmin(auth.role, auth.roles)) return null;
  return auth;
}
