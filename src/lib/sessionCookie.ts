/**
 * One definition of the session cookie.
 *
 * Four places touch it and, left to their defaults, each decides its name from
 * a DIFFERENT source:
 *
 *   - the custom login action, which wrote a hard-coded plain name;
 *   - getServerSession(authOptions), which derives it from useSecureCookies;
 *   - getToken() in the middleware, which derives it from whether NEXTAUTH_URL
 *     starts with https:// (and ignores useSecureCookies entirely);
 *   - the logout paths.
 *
 * When those disagree the failure is silent and confusing: the middleware finds
 * a valid session and waves the request through, the page finds nothing and
 * redirects to the login form, and the user bounces between the two without
 * ever seeing an error. Everything imports from here instead.
 *
 * Kept free of Prisma/NextAuth imports so the middleware can use it too.
 */

/**
 * Whether to use the __Secure- prefix, which browsers only accept over HTTPS.
 *
 * Tied to NODE_ENV rather than the request protocol on purpose: with
 * AUTH_TRUST_HOST=1 and no x-forwarded-proto, NextAuth infers HTTPS and would
 * set __Secure- names in development, which browsers then drop over plain HTTP
 * on the LAN (phone testing). The trade-off is that `next start` over plain
 * HTTP cannot hold a session either — run `npm run dev` locally, or put TLS in
 * front of it.
 */
export const USE_SECURE_COOKIES = process.env.NODE_ENV === "production";

/** The cookie name for a given secure setting. Exported for testing. */
export function sessionCookieName(secure: boolean): string {
  return secure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

export const SESSION_COOKIE = sessionCookieName(USE_SECURE_COOKIES);

/**
 * Both spellings. Logout clears each of them, so a cookie left behind by a
 * build with the other setting cannot keep a stale session alive.
 */
export const ALL_SESSION_COOKIES = [
  sessionCookieName(false),
  sessionCookieName(true),
] as const;
