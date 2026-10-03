"use server";

import { cookies } from "next/headers";
import { expiredSessionCookies } from "@/lib/sessionCookie";
import { redirect } from "next/navigation";

export async function logoutAction(formData: FormData) {
  const locale = (formData.get("locale") as string) || "el";

  const store = await cookies();
  // Expire with matching attributes — see expiredSessionCookies().
  for (const c of expiredSessionCookies()) store.set(c.name, c.value, c.options);

  redirect(`/${locale}/login`);
}
