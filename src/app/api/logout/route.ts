import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { ALL_SESSION_COOKIES, USE_SECURE_COOKIES } from "@/lib/sessionCookie";

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") ?? "el";

  // Send each audience back to its own login portal (read before clearing).
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: USE_SECURE_COOKIES,
  });
  const isFamily = token?.role === "PARENT" || token?.role === "STUDENT";

  const store = await cookies();
  for (const name of ALL_SESSION_COOKIES) {
    if (store.has(name)) store.delete(name);
  }
  return NextResponse.redirect(new URL(`/${locale}/login${isFamily ? "" : "/staff"}`, request.url));
}
