import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { getToken } from "next-auth/jwt";
import { getPortalForRole } from "@/lib/rbac";
import type { Role } from "@/generated/prisma";

const intlMiddleware = createMiddleware(routing);

// Public routes that don't require authentication
const PUBLIC_PATHS = ["/login", "/register", "/api/auth", "/api/logout"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.includes(p));
}

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Always allow API routes and static files
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Apply i18n middleware first
  const intlResponse = intlMiddleware(request);

  // If intl is doing a locale redirect (e.g. adding missing prefix), let it through
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  // Check auth for protected routes
  if (!isPublicPath(pathname)) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
      const segments = pathname.split("/").filter(Boolean);
      const locale = segments[0] === "en" ? "en" : "el";
      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Redirect to appropriate portal on root visit
    if (pathname === "/" || pathname === "/en" || pathname === "/el") {
      const portal = getPortalForRole(token.role as Role);
      const segments = pathname.split("/").filter(Boolean);
      const locale = segments[0] === "en" ? "en" : "el";
      return NextResponse.redirect(new URL(`/${locale}/${portal}`, request.url));
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

  // Forward any Set-Cookie headers from the intl middleware (e.g. locale cookie)
  for (const [key, value] of intlResponse.headers.entries()) {
    if (key.toLowerCase() === "set-cookie") {
      response.headers.append(key, value);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
