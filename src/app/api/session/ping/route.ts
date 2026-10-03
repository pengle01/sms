import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { USE_SECURE_COOKIES } from "@/lib/sessionCookie";
import { sessionState, idleMinutesFor, absoluteEnd } from "@/lib/sessionPolicy";
import { issueSessionCookie, claimsFromToken } from "@/lib/sessionToken";
import { getSessionIdleMinutes } from "@/lib/schoolConfig";

// The idle timer behind <SessionTimeout/>.
//   GET  — how long this session has left; never extends it (the client asks
//          before logging out, and asking must not count as activity).
//   POST — the user is active (typing, clicking) without changing page:
//          move lastSeen forward and pick up the admin's current idle minutes.

async function current(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET, secureCookie: USE_SECURE_COOKIES });
  return token;
}

function body(claims: { role: string; loginAt: number; lastSeen: number; idleMin: number | null }, now: number) {
  return {
    state: "ok" as const,
    serverNow: now,
    lastSeen: claims.lastSeen,
    idleMin: claims.idleMin,
    absoluteEnd: absoluteEnd(claims),
  };
}

export async function GET(request: NextRequest) {
  const token = await current(request);
  const now = Date.now();
  if (!token) return NextResponse.json({ state: "none" }, { status: 401 });
  const state = sessionState(token, now);
  if (state !== "ok") return NextResponse.json({ state }, { status: 401 });
  return NextResponse.json(body(claimsFromToken(token), now));
}

export async function POST(request: NextRequest) {
  const token = await current(request);
  const now = Date.now();
  if (!token) return NextResponse.json({ state: "none" }, { status: 401 });
  const state = sessionState(token, now);
  if (state !== "ok") return NextResponse.json({ state }, { status: 401 });

  const old = claimsFromToken(token);
  const claims = { ...old, lastSeen: now, idleMin: idleMinutesFor(old.role, await getSessionIdleMinutes()) };
  const cookie = await issueSessionCookie(claims, now);
  const res = NextResponse.json(body(claims, now));
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
