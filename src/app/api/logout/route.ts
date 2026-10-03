import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { USE_SECURE_COOKIES, expiredSessionCookies } from "@/lib/sessionCookie";
import { loginPathFor } from "@/lib/loginRedirect";
import { redirectTo } from "@/lib/redirect";
import { toLogoutReason } from "@/lib/sessionPolicy";

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale");

  // Send each audience back to its own login portal (read before clearing).
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: USE_SECURE_COOKIES,
  });

  const store = await cookies();
  // Expire with matching attributes — see expiredSessionCookies().
  for (const c of expiredSessionCookies()) store.set(c.name, c.value, c.options);
  // Relative Location: behind the reverse proxy request.url is the internal
  // address, and an absolute redirect built from it sent users to localhost.
  // ?reason=idle|expired (the idle timer) is shown on the login page.
  const reason = toLogoutReason(request.nextUrl.searchParams.get("reason"));
  return redirectTo(loginPathFor(token?.role, locale) + (reason ? `?reason=${reason}` : ""));
}
