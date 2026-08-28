"use server";

import { cookies } from "next/headers";
import { ALL_SESSION_COOKIES } from "@/lib/sessionCookie";
import { redirect } from "next/navigation";

export async function logoutAction(formData: FormData) {
  const locale = (formData.get("locale") as string) || "el";

  const store = await cookies();
  for (const name of ALL_SESSION_COOKIES) {
    if (store.has(name)) store.delete(name);
  }

  redirect(`/${locale}/login`);
}
