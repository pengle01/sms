// How long a login lasts. Pure (no Next/Prisma) so the proxy can use it;
// unit-tested in sessionPolicy.test.ts.
//
// Shared classroom and staffroom PCs make a 30-day login a hazard: a teacher who
// walks away leaves grades, referrals and student records open to the next
// person. So:
//   - staff: logged out after `idleMin` minutes without activity (set by the
//     admin, GlobalSetting session_idle_minutes) and at most 12 h after login;
//   - parents and students (own phones): no idle limit, at most 7 days.
// The times travel in the session token (loginAt / lastSeen / idleMin, in ms
// and minutes); the proxy checks them on every request.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const STAFF_MAX_MS = 12 * HOUR;
export const FAMILY_MAX_MS = 7 * DAY;
export const SESSION_IDLE_KEY = "session_idle_minutes";
export const DEFAULT_IDLE_MINUTES = 30;
export const MIN_IDLE_MINUTES = 5;
export const MAX_IDLE_MINUTES = 240;
/** lastSeen is re-issued at most this often — not on every request. */
export const REFRESH_EVERY_MS = MINUTE;
/** The warning shows this long before an idle logout. */
export const WARN_BEFORE_MS = MINUTE;

export function isFamilyRole(role: string | null | undefined): boolean {
  return role === "PARENT" || role === "STUDENT";
}

export function maxSessionMs(role: string | null | undefined): number {
  return isFamilyRole(role) ? FAMILY_MAX_MS : STAFF_MAX_MS;
}

/** The admin's idle minutes: default 30, kept within 5–240. */
export function parseIdleMinutes(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return DEFAULT_IDLE_MINUTES;
  return Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, Math.round(n)));
}

/** idleMin to put in a new token: the admin setting for staff, none for families. */
export function idleMinutesFor(role: string | null | undefined, adminMinutes: number): number | null {
  return isFamilyRole(role) ? null : adminMinutes;
}

export interface SessionTimes {
  role?: unknown;
  loginAt?: unknown;
  lastSeen?: unknown;
  idleMin?: unknown;
}

export type SessionState = "ok" | "idle" | "expired";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Is this session still good? A token without the times (issued before this
 * rule existed) is "expired", so everyone signs in once more after the update.
 */
export function sessionState(t: SessionTimes, now: number): SessionState {
  const loginAt = num(t.loginAt);
  const lastSeen = num(t.lastSeen);
  if (loginAt === null || lastSeen === null) return "expired";
  const role = typeof t.role === "string" ? t.role : null;
  if (now - loginAt > maxSessionMs(role)) return "expired";
  const idleMin = num(t.idleMin);
  if (idleMin !== null && !isFamilyRole(role) && now - lastSeen > idleMin * MINUTE) return "idle";
  return "ok";
}

/** Re-issue the token with a new lastSeen? At most once a minute. */
export function shouldRefresh(lastSeen: unknown, now: number): boolean {
  const ls = num(lastSeen);
  return ls === null || now - ls >= REFRESH_EVERY_MS;
}

/** When the login ends regardless of activity (ms since epoch). */
export function absoluteEnd(t: SessionTimes): number | null {
  const loginAt = num(t.loginAt);
  return loginAt === null ? null : loginAt + maxSessionMs(typeof t.role === "string" ? t.role : null);
}

/** Cookie lifetime for a new login, in seconds. */
export function cookieMaxAgeSeconds(role: string | null | undefined): number {
  return Math.floor(maxSessionMs(role) / 1000);
}

export type LogoutReason = "idle" | "expired";

export function toLogoutReason(v: string | null | undefined): LogoutReason | null {
  return v === "idle" || v === "expired" ? v : null;
}
