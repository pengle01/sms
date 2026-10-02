import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { ALL_SESSION_COOKIES, USE_SECURE_COOKIES } from "@/lib/sessionCookie";
import { loginPathFor } from "@/lib/loginRedirect";
import { redirectTo } from "@/lib/redirect";

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale");

  // Send each audience back to its own login portal (read before clearing).
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: USE_SECURE_COOKIES,
  });

  const store = await cookies();
  for (const name of ALL_SESSION_COOKIES) {
    if (store.has(name)) store.delete(name);
  }
  // Relative Location: behind the reverse proxy request.url is the internal
  // address, and an absolute redirect built from it sent users to localhost.
  return redirectTo(loginPathFor(token?.role, locale));
}
