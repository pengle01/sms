import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { logger, errInfo } from "@/server/logger";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Admin password bootstrap, run once at server startup.
 *
 * When `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` are both set, the
 * matching user's password is (re)set from the env var. This breaks the
 * chicken-and-egg where a fresh deploy (or an admin whose password is unknown)
 * cannot log in to set one — now that staff sign-in requires a password.
 *
 * It is idempotent: leaving the vars in place just re-applies the same hash on
 * each boot. Set them to seed/recover an admin, then REMOVE them. The password
 * is never logged.
 */
export async function bootstrapAdminPassword(): Promise<void> {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password) return;

  if (password.length < MIN_PASSWORD_LENGTH) {
    logger.warn(
      { event: "admin.bootstrap", reason: "password_too_short" },
      "ADMIN_BOOTSTRAP_PASSWORD is too short — skipped",
    );
    return;
  }

  try {
    const user = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });
    if (!user) {
      logger.warn(
        { event: "admin.bootstrap", reason: "user_not_found" },
        "ADMIN_BOOTSTRAP_EMAIL has no matching user — skipped",
      );
      return;
    }
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password, 12), isActive: true },
    });
    logger.info(
      { event: "admin.bootstrap", userId: user.id, role: user.role },
      "Admin password set from ADMIN_BOOTSTRAP_* env — remove the vars after first login",
    );
  } catch (e) {
    logger.error({ event: "admin.bootstrap", err: errInfo(e) }, "Admin password bootstrap failed");
  }
}
