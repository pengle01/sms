import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import type { Session } from "next-auth";
import type { Role } from "@/generated/prisma";

/**
 * Returns the current session together with the user's *fresh* role and active
 * status read from the database. Returns null if there is no session or the
 * account has been deactivated. Use this in layouts/server actions instead of
 * trusting the (potentially stale) role baked into the JWT at login time.
 */
export async function getActiveAuth(): Promise<
  { session: Session; userId: string; role: Role } | null
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, role: true },
  });
  if (!user || !user.isActive) return null;
  return { session, userId: session.user.id, role: user.role };
}
