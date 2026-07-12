import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// The custom login action sets "next-auth.session-token" unconditionally.
// NextAuth itself sets "__Secure-next-auth.session-token" in production.
const SESSION_COOKIES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") ?? "el";

  // Send each audience back to its own login portal (read before clearing).
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const isFamily = token?.role === "PARENT" || token?.role === "STUDENT";

  const store = await cookies();
  for (const name of SESSION_COOKIES) {
    if (store.has(name)) store.delete(name);
  }
  return NextResponse.redirect(new URL(`/${locale}/login${isFamily ? "" : "/staff"}`, request.url));
}
