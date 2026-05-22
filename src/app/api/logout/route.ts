import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The custom login action sets "next-auth.session-token" unconditionally.
// NextAuth itself sets "__Secure-next-auth.session-token" in production.
const SESSION_COOKIES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") ?? "el";
  const store = await cookies();
  for (const name of SESSION_COOKIES) {
    if (store.has(name)) store.delete(name);
  }
  return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
}
