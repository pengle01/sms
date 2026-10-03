import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { getToken } from "next-auth/jwt";
import { USE_SECURE_COOKIES, expiredSessionCookies } from "@/lib/sessionCookie";
import { sessionState, shouldRefresh } from "@/lib/sessionPolicy";
import { issueSessionCookie, claimsFromToken } from "@/lib/sessionToken";
import { getPortalForRole } from "@/lib/rbac";
import { loginPathForPortal } from "@/lib/loginRedirect";
import { publicOrigin } from "@/lib/redirect";
import type { Role } from "@/generated/prisma/client";

const intlMiddleware = createMiddleware(routing);

// Public routes that don't require authentication
const PUBLIC_PATHS = ["/login", "/register", "/activate", "/api/auth", "/api/logout"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.includes(p));
}

// API routes that manage the session themselves (sign-in, logout, the activity
// ping) — exempt from the expiry check below.
const SESSION_API = ["/api/auth", "/api/logout", "/api/session"];

function readToken(request: NextRequest) {
  return getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    // Without this getToken picks the name from NEXTAUTH_URL's protocol,
    // which is a different rule from the one authOptions uses.
    secureCookie: USE_SECURE_COOKIES,
  });
}

function clearSession(res: NextResponse) {
  // Expire with matching attributes — see expiredSessionCookies().
  for (const c of expiredSessionCookies()) res.cookies.set(c.name, c.value, c.options);
}

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Always allow API routes and genuine static assets. Match real asset
  // extensions only — a bare `.includes(".")` would let any dotted page path
  // (e.g. /teacher/x.y) skip the auth check.
  const STATIC_ASSET = /\.(png|jpe?g|gif|svg|ico|webp|avif|css|js|map|woff2?|ttf|eot|pdf|txt|xml|json|csv|webmanifest)$/i;
  if (pathname.startsWith("/_next/") || STATIC_ASSET.test(pathname)) {
    return NextResponse.next();
  }

  // API calls (tRPC, files, exports) do their own authorisation, but a session
  // that has ended must not keep working from a tab left open. They never count
  // as activity: the bell and messages poll every 15–30 s.
  if (pathname.startsWith("/api/")) {
    if (!SESSION_API.some((p) => pathname.startsWith(p))) {
      const token = await readToken(request);
      if (token && sessionState(token, Date.now()) !== "ok") {
        const res = NextResponse.json({ error: "SESSION_ENDED" }, { status: 401 });
        clearSession(res);
        return res;
      }
    }
    return NextResponse.next();
  }

  // Apply i18n middleware first
  const intlResponse = intlMiddleware(request);

  // If intl is doing a locale redirect (e.g. adding missing prefix), let it through
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  // Check auth for protected routes
  let refreshed: Awaited<ReturnType<typeof issueSessionCookie>> | null = null;
  if (!isPublicPath(pathname)) {
    const token = await readToken(request);
    const now = Date.now();
    const state = token ? sessionState(token, now) : null;

    // Idle (staff) or past the maximum length: back to the right login page,
    // saying why. See src/lib/sessionPolicy.ts.
    if (token && state !== "ok") {
      const loginUrl = new URL(loginPathForPortal(pathname), publicOrigin(request.headers, request.url));
      loginUrl.searchParams.set("reason", state!);
      loginUrl.searchParams.set("callbackUrl", pathname);
      const res = NextResponse.redirect(loginUrl);
      clearSession(res);
      return res;
    }

    // A page visit is activity: move lastSeen forward (at most once a minute).
    if (token && shouldRefresh(token.lastSeen, now)) {
      refreshed = await issueSessionCookie({ ...claimsFromToken(token), lastSeen: now }, now);
    }

    if (!token) {
      // Family portals → family login; staff portals (chaperone included) →
      // staff login. Built on the browser's address (forwarded headers), never
      // the reverse proxy's internal one, which sent users to localhost.
      const loginUrl = new URL(loginPathForPortal(pathname), publicOrigin(request.headers, request.url));
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Redirect to appropriate portal on root visit
    if (pathname === "/" || pathname === "/en" || pathname === "/el") {
      const portal = getPortalForRole(token.role as Role);
      const segments = pathname.split("/").filter(Boolean);
      const locale = segments[0] === "en" ? "en" : "el";
      return NextResponse.redirect(new URL(`/${locale}/${portal}`, publicOrigin(request.headers, request.url)));
    }
  }

  // Pass x-pathname as a REQUEST header so layouts can read it via headers().
  // response.headers.set() only sets response headers — headers() in server
  // components reads request headers, so we must use the request: { headers }
  // option on NextResponse.next() instead.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Forward ALL response headers from the intl middleware so that
  // next-intl's internal headers (locale cookie, x-middleware-request-*
  // for requestLocale, etc.) are preserved alongside our x-pathname header.
  intlResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      response.headers.append(key, value);
    } else {
      response.headers.set(key, value);
    }
  });
  if (refreshed) response.cookies.set(refreshed.name, refreshed.value, refreshed.options);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
