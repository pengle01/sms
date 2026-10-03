// Issue the session cookie — one place for the login action, the proxy's
// lastSeen refresh and the activity ping. No Prisma, so the proxy can import it.

import { encode, type JWT } from "next-auth/jwt";
import { SESSION_COOKIE, USE_SECURE_COOKIES } from "@/lib/sessionCookie";
import { absoluteEnd } from "@/lib/sessionPolicy";

export interface SessionClaims {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  picture: string | null;
  /** ms since epoch */
  loginAt: number;
  /** ms since epoch — last activity */
  lastSeen: number;
  /** idle minutes for staff; null for families */
  idleMin: number | null;
}

export interface IssuedCookie {
  name: string;
  value: string;
  options: { httpOnly: true; sameSite: "lax"; path: "/"; secure: boolean; maxAge: number };
}

/**
 * Encode the claims; the cookie (and the token's own expiry) end with the login,
 * so the browser drops it at the absolute limit too.
 */
export async function issueSessionCookie(claims: SessionClaims, now: number): Promise<IssuedCookie> {
  const end = absoluteEnd(claims) ?? now;
  const maxAge = Math.max(1, Math.floor((end - now) / 1000));
  const value = await encode({
    token: { ...claims, sub: claims.id } as unknown as JWT,
    secret: process.env.NEXTAUTH_SECRET!,
    maxAge,
  });
  return {
    name: SESSION_COOKIE,
    value,
    options: { httpOnly: true, sameSite: "lax", path: "/", secure: USE_SECURE_COOKIES, maxAge },
  };
}

/** The claims of a decoded token, ready to re-issue (drops iat/exp/jti). */
export function claimsFromToken(t: Record<string, unknown>): SessionClaims {
  return {
    id: String(t.id ?? t.sub ?? ""),
    email: (t.email as string | null) ?? null,
    name: (t.name as string | null) ?? null,
    role: String(t.role ?? ""),
    picture: (t.picture as string | null) ?? null,
    loginAt: Number(t.loginAt),
    lastSeen: Number(t.lastSeen),
    idleMin: typeof t.idleMin === "number" ? t.idleMin : null,
  };
}
