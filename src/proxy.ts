import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { getToken } from "next-auth/jwt";
import { getPortalForRole } from "@/lib/rbac";
import type { Role } from "@/generated/prisma";

const intlMiddleware = createMiddleware(routing);

// Public routes that don't require authentication
const PUBLIC_PATHS = ["/login", "/api/auth"];

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

  return intlResponse ?? NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
