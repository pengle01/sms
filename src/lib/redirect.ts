import { NextResponse } from "next/server";

/**
 * Redirect with a RELATIVE Location ("/el/login/staff"). The browser resolves it
 * against the address it actually used. Building an absolute URL from
 * request.url instead leaks the app's internal address behind the reverse proxy
 * (Caddy → app:3000), which sent logged-out users to http://localhost:3000.
 */
export function redirectTo(path: string, status: 302 | 303 | 307 = 307): NextResponse {
  return new NextResponse(null, { status, headers: { Location: path } });
}

/**
 * The address the browser used, for redirects that must be absolute (Next's
 * proxy/middleware refuses a relative Location). Behind Caddy the request URL
 * is the app's internal address, so the forwarded headers win: X-Forwarded-Host
 * / Host and X-Forwarded-Proto. Falls back to the request URL's own origin.
 */
export function publicOrigin(headers: Pick<Headers, "get">, requestUrl: string): string {
  const fallback = new URL(requestUrl);
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? fallback.host).split(",")[0]!.trim();
  const proto = (headers.get("x-forwarded-proto") ?? fallback.protocol.replace(":", "")).split(",")[0]!.trim();
  return `${proto}://${host}`;
}
