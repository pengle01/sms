"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// The custom login action sets "next-auth.session-token" unconditionally.
// NextAuth itself also sets "__Secure-next-auth.session-token" in production.
// Delete both so a browser that somehow received both ends up clean.
const SESSION_COOKIES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export async function logoutAction(formData: FormData) {
  const locale = (formData.get("locale") as string) || "el";

  const store = await cookies();
  for (const name of SESSION_COOKIES) {
    if (store.has(name)) store.delete(name);
  }

  redirect(`/${locale}/login`);
}
