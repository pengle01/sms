"use server";

import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { writeAudit, requestMeta } from "@/server/audit";
import { logger } from "@/server/logger";
import { rateLimit, resetRateLimit } from "@/server/rateLimit";
import { validatePasswordChange, type PasswordChangeProblem } from "@/lib/password";

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: PasswordChangeProblem | "errCurrentWrong" | "errNoPassword" | "errRateLimited" | "errUnknown" };

/**
 * Change your own password.
 *
 * Available to every role that signs in with one — staff, parents, students and
 * chaperones all reach the same action from their own portal.
 *
 * Note what this does NOT do: the session strategy is JWT, so existing tokens on
 * other devices stay valid until they expire. Changing a password here stops
 * anyone signing in *again* with the old one; it does not sign out a session
 * that is already open elsewhere.
 */
export async function changeOwnPassword(
  current: string,
  next: string,
  confirm: string,
): Promise<ChangePasswordResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { ok: false, error: "errUnknown" };
  const userId = session.user.id;

  // Shape first, so a typo never costs a bcrypt comparison.
  const problem = validatePasswordChange({ current, next, confirm });
  if (problem) return { ok: false, error: problem };

  // The current password is a guessable secret being checked in a loop-friendly
  // endpoint, so it gets the same throttle as the login form.
  if (!rateLimit(`pwchange:${userId}`, 10, 15 * 60 * 1000)) {
    logger.warn({ event: "account.passwordChangeRateLimited", userId }, "Password change rate-limited");
    return { ok: false, error: "errRateLimited" };
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) return { ok: false, error: "errUnknown" };
  // No hash means this account has never had a password (it would have to have
  // been created by some other means). There is nothing to verify against, so
  // the safe answer is to refuse rather than to set one unchallenged.
  if (!user.passwordHash) return { ok: false, error: "errNoPassword" };

  if (!(await bcrypt.compare(current, user.passwordHash))) {
    logger.warn({ event: "account.passwordChangeFailed", reason: "bad_current", userId }, "Password change failed");
    return { ok: false, error: "errCurrentWrong" };
  }

  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(next, 12) },
  });
  resetRateLimit(`pwchange:${userId}`);

  // Never log the password itself — only that one was changed, and by whom.
  await writeAudit({
    userId,
    action: "user.changePassword",
    resource: "User",
    resourceId: userId,
    ...(await requestMeta()),
  });
  logger.info({ event: "account.passwordChanged", userId }, "Password changed");

  return { ok: true };
}
