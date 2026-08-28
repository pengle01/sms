import { describe, it, expect } from "vitest";
import {
  sessionCookieName,
  SESSION_COOKIE,
  ALL_SESSION_COOKIES,
  USE_SECURE_COOKIES,
} from "@/lib/sessionCookie";

// Regression cover for a silent auth failure: the login action wrote
// "next-auth.session-token" while getServerSession looked for
// "__Secure-next-auth.session-token", so the middleware saw a valid session and
// the page did not, bouncing every request back to the login form.
describe("session cookie naming", () => {
  it("uses the __Secure- prefix only when secure cookies are on", () => {
    expect(sessionCookieName(true)).toBe("__Secure-next-auth.session-token");
    expect(sessionCookieName(false)).toBe("next-auth.session-token");
  });

  it("matches the name NextAuth derives for the same setting", () => {
    // NextAuth builds `${useSecureCookies ? "__Secure-" : ""}next-auth.session-token`
    // (core/lib/cookie.js) and getToken uses the identical pair. Encoding that
    // here means a NextAuth upgrade that changes it fails a test rather than
    // silently logging everyone out.
    for (const secure of [true, false]) {
      expect(sessionCookieName(secure)).toBe(
        `${secure ? "__Secure-" : ""}next-auth.session-token`,
      );
    }
  });

  it("exports the name that matches the current environment", () => {
    expect(SESSION_COOKIE).toBe(sessionCookieName(USE_SECURE_COOKIES));
  });

  it("is not secure under test/dev, so a browser on plain HTTP keeps it", () => {
    expect(USE_SECURE_COOKIES).toBe(false);
    expect(SESSION_COOKIE).toBe("next-auth.session-token");
  });

  it("clears both spellings on logout", () => {
    expect(ALL_SESSION_COOKIES).toHaveLength(2);
    expect(ALL_SESSION_COOKIES).toContain("next-auth.session-token");
    expect(ALL_SESSION_COOKIES).toContain("__Secure-next-auth.session-token");
  });

  it("names are distinct, so clearing one cannot clear the other", () => {
    expect(new Set(ALL_SESSION_COOKIES).size).toBe(2);
  });
});
