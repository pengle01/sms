"use server";

import { db } from "@/server/db";
import { encode } from "next-auth/jwt";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Role } from "@/generated/prisma";
import { getPortalForRole } from "@/lib/rbac";

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

export async function staffLoginAction(formData: FormData) {
  const email = ((formData.get("email") as string) ?? "").toLowerCase().trim();
  const locale = (formData.get("locale") as string) || "el";

  if (!email) redirect(`/${locale}/login?error=MissingEmail`);

  const user = await db.user.findUnique({ where: { email } });

  if (!user || !user.isActive || user.role === "PARENT") {
    redirect(`/${locale}/login?error=Unauthorized`);
  }

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
