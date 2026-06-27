"use server";

import { db } from "@/server/db";
import { encode } from "next-auth/jwt";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Role } from "@/generated/prisma";
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

// Staff / student sign-in with email + password (same in dev and prod). Parents
// use parentLoginAction; Microsoft SSO is the alternative on the same card.
export async function staffLoginAction(formData: FormData) {
  const email = ((formData.get("email") as string) ?? "").toLowerCase().trim();
  const password = (formData.get("password") as string) ?? "";
  const locale = (formData.get("locale") as string) || "el";

  if (!email || !password) redirect(`/${locale}/login?error=MissingCredentials`);

  // Throttle password attempts per account to slow brute-forcing.
  if (!rateLimit(`login:${email}`, 10, 15 * 60 * 1000)) {
    redirect(`/${locale}/login?error=InvalidCredentials`);
  }

  const user = await db.user.findUnique({ where: { email } });

  // Generic error for every failure — never reveal whether an email exists.
  if (!user || !user.isActive || user.role === "PARENT" || !user.passwordHash) {
    redirect(`/${locale}/login?error=InvalidCredentials`);
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    redirect(`/${locale}/login?error=InvalidCredentials`);
  }

  resetRateLimit(`login:${email}`);
  await createSession(user.id, user.email, user.name, user.role, user.image);
  const portal = getPortalForRole(user.role as Role);
  redirect(`/${locale}/${portal}`);
}

export async function parentLoginAction(formData: FormData) {
  const email = ((formData.get("email") as string) ?? "").toLowerCase().trim();
  const password = (formData.get("password") as string) ?? "";
  const locale = (formData.get("locale") as string) || "el";

  if (!email || !password) redirect(`/${locale}/login?error=MissingCredentials`);

  const user = await db.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash || !user.isActive) {
    redirect(`/${locale}/login?error=InvalidCredentials`);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) redirect(`/${locale}/login?error=InvalidCredentials`);

  await createSession(user.id, user.email, user.name, user.role, user.image);
  redirect(`/${locale}/parent`);
}
