"use server";

import { db } from "@/server/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Role } from "@/generated/prisma/client";
import { getPortalForRole } from "@/lib/rbac";
import { rateLimit, resetRateLimit } from "@/server/rateLimit";
import { issueSessionCookie } from "@/lib/sessionToken";
import { idleMinutesFor } from "@/lib/sessionPolicy";
import { getSessionIdleMinutes } from "@/lib/schoolConfig";

// The login carries its own start time, last activity and idle limit; the proxy
// ends it after idle minutes (staff) or the maximum length (see sessionPolicy).
async function createSession(userId: string, email: string, name: string | null, role: Role, image: string | null) {
  const now = Date.now();
  const cookie = await issueSessionCookie(
    {
      id: userId, email, name, role, picture: image,
      loginAt: now, lastSeen: now,
      idleMin: idleMinutesFor(role, await getSessionIdleMinutes()),
    },
    now,
  );
  // Name and flags come from sessionCookie.ts, the same source authOptions uses,
  // or getServerSession would look for a different cookie.
  (await cookies()).set(cookie.name, cookie.value, cookie.options);
}

// The two login portals share one credential check; each only admits its own
// audience. `errorPath` keeps failures on the page the user was actually on.
async function loginWith(
  formData: FormData,
  errorPath: string,
  roleAllowed: (role: Role) => boolean
) {
  const email = ((formData.get("email") as string) ?? "").toLowerCase().trim();
  const password = (formData.get("password") as string) ?? "";
  const locale = (formData.get("locale") as string) || "el";

  if (!email || !password) redirect(`/${locale}${errorPath}?error=MissingCredentials`);

  // Throttle password attempts per account to slow brute-forcing.
  if (!rateLimit(`login:${email}`, 10, 15 * 60 * 1000)) {
    redirect(`/${locale}${errorPath}?error=InvalidCredentials`);
  }

  const user = await db.user.findUnique({ where: { email } });

  // Generic error for every failure — never reveal whether an email exists
  // or which portal it belongs to.
  if (!user || !user.isActive || !user.passwordHash || !roleAllowed(user.role)) {
    redirect(`/${locale}${errorPath}?error=InvalidCredentials`);
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    redirect(`/${locale}${errorPath}?error=InvalidCredentials`);
  }

  resetRateLimit(`login:${email}`);
  await createSession(user.id, user.email, user.name, user.role, user.image);
  redirect(`/${locale}/${getPortalForRole(user.role)}`);
}

/** Parents & students — the family portal at /login. */
export async function familyLoginAction(formData: FormData) {
  await loginWith(formData, "/login", (role) => role === "PARENT" || role === "STUDENT");
}

/** Teachers, office, chaperones, admins — the staff portal at /login/staff. */
export async function staffLoginAction(formData: FormData) {
  await loginWith(formData, "/login/staff", (role) => role !== "PARENT" && role !== "STUDENT");
}
