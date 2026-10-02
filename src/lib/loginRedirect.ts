// Which login page someone belongs on. Pure (no Next/Prisma imports) so the
// proxy can use it too; unit-tested in loginRedirect.test.ts.
//
// Two login pages, two audiences: families (parents, students) at /login, and
// staff — teachers, deputies, counselor, secretary, admin and chaperones — at
// /login/staff. Each page only admits its own audience.

export type AppLocale = "el" | "en";

export function toLocale(v: string | null | undefined): AppLocale {
  return v === "en" ? "en" : "el";
}

const FAMILY_ROLES = new Set(["PARENT", "STUDENT"]);
const FAMILY_PORTALS = new Set(["parent", "student"]);

/** The login page for a role. No role (an expired session) → the staff login, as before. */
export function loginPathFor(role: string | null | undefined, locale: string | null | undefined): string {
  const l = toLocale(locale);
  return role && FAMILY_ROLES.has(role) ? `/${l}/login` : `/${l}/login/staff`;
}

/**
 * The login page for a logged-out visitor, from the portal in the URL:
 * /parent and /student → family login; every other portal (teacher, admin,
 * office, chaperone) → staff login.
 */
export function loginPathForPortal(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const hasLocale = segments[0] === "el" || segments[0] === "en";
  const locale = toLocale(hasLocale ? segments[0] : undefined);
  const portal = hasLocale ? segments[1] : segments[0];
  return portal && FAMILY_PORTALS.has(portal) ? `/${locale}/login` : `/${locale}/login/staff`;
}
