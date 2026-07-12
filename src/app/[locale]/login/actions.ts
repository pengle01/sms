"use server";

import { db } from "@/server/db";
import { encode } from "next-auth/jwt";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Role } from "@/generated/prisma/client";
import { getPortalForRole } from "@/lib/rbac";
import { rateLimit, resetRateLimit } from "@/server/rateLimit";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds
// Must match the cookie name getToken() looks for in the middleware.
// getToken() uses __Secure- prefix only when NEXTAUTH_URL starts with https:// or VERCEL is set.
// Neither is true in dev, so we use the plain name.
const SESSION_COOKIE = "next-auth.session-token";

async function createSession(userId: string, email: string, name: string | null, role: Role, image: string | null) {
  const token = await encode({
    token: { id: userId, email, name, role, picture: image },
    secret: process.env.NEXTAUTH_SECRET!,
    maxAge: SESSION_MAX_AGE,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
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
