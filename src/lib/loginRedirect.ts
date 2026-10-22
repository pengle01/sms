// Which login page someone belongs on. Pure (no Next/Prisma imports) so the
// proxy can use it too; unit-tested in loginRedirect.test.ts.
//
// Three login pages, three audiences: parents at /login/parent, students at
// /login/student, and staff — teachers, deputies, counselor, secretary, admin
// and chaperones — at /login/staff. Each page only admits its own audience;
// /login itself is a chooser between the three.

export type AppLocale = "el" | "en";

export function toLocale(v: string | null | undefined): AppLocale {
  return v === "en" ? "en" : "el";
}

/** The login page for a role. No role (an expired session) → the staff login, as before. */
export function loginPathFor(role: string | null | undefined, locale: string | null | undefined): string {
  const l = toLocale(locale);
  if (role === "PARENT") return `/${l}/login/parent`;
  if (role === "STUDENT") return `/${l}/login/student`;
  return `/${l}/login/staff`;
}

/**
 * The login page for a logged-out visitor, from the portal in the URL:
 * the bare site address → the chooser at /login; /parent → parent login,
 * /student → student login; every other portal (teacher, admin, office,
 * chaperone) → staff login.
 */
export function loginPathForPortal(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const hasLocale = segments[0] === "el" || segments[0] === "en";
  const locale = toLocale(hasLocale ? segments[0] : undefined);
  const portal = hasLocale ? segments[1] : segments[0];
  // The bare site address (/, /el, /en): no portal yet → the chooser.
  if (!portal) return `/${locale}/login`;
  if (portal === "parent") return `/${locale}/login/parent`;
  if (portal === "student") return `/${locale}/login/student`;
  return `/${locale}/login/staff`;
}
