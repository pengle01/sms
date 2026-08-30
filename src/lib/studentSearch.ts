// Pure helpers for the student locator tabbed search. No DB imports so these
// can be unit-tested and imported from client components safely.

export type LocateTab = "group" | "name" | "id";

/** Normalize an untrusted `tab` query param to a known locate tab. */
export function parseLocateTab(value: string | undefined | null): LocateTab {
  return value === "name" || value === "id" ? value : "group";
}

/**
 * Build the Prisma `where` clause for a name/ID student search, or `null` when
 * the query is empty (caller should then show the "type to search" hint rather
 * than run a query that matches everything).
 */
export function studentSearchWhere(tab: "name" | "id", q: string) {
  const term = q.trim();
  if (!term) return null;
  return tab === "name"
    ? { user: { name: { contains: term, mode: "insensitive" as const }, isActive: true } }
    : { studentId: { contains: term, mode: "insensitive" as const }, user: { isActive: true } };
}

/**
 * Combined name-OR-studentId search for the admin locator's single search box.
 * Returns `null` when the query is empty (same contract as studentSearchWhere).
 */
export function studentNameOrIdWhere(q: string) {
  const term = q.trim();
  if (!term) return null;
  return {
    OR: [
      { user: { name: { contains: term, mode: "insensitive" as const } } },
      { studentId: { contains: term, mode: "insensitive" as const } },
    ],
    user: { isActive: true },
  };
}

/**
 * The params a locator carries. One list so the row links (via pickQueryString)
 * and the filter links (via locateHref) can never serialise different sets and
 * drop each other's state on the way back from a detail page.
 */
export const LOCATE_KEYS = ["tab", "grade", "groupId", "q"] as const;

export interface LocateParams {
  tab?: string;
  grade?: string;
  groupId?: string;
  q?: string;
}

/**
 * Build a locator href that keeps the currently-set filters and applies the
 * given overrides on top. Pass `undefined` in overrides to drop a param (e.g.
 * clear the selected group when switching grade). Empty values are omitted.
 */
export function locateHref(current: LocateParams, overrides: Partial<LocateParams>): string {
  const merged = { ...current, ...overrides };
  const sp = new URLSearchParams();
  for (const key of LOCATE_KEYS) {
    const v = merged[key];
    if (v) sp.set(key, v);
  }
  return `?${sp.toString()}`;
}
/**
 * Which tab a locator opens on.
 *
 * A bare `?q=…` link predates the tabs — an office bookmark, or a shared URL —
 * and would otherwise land on the empty group tab with the search it carries
 * invisible. Treat a query with no tab as a name search.
 */
export function initialLocateTab(
  tab: string | undefined | null,
  q: string | undefined | null,
): LocateTab {
  if (!tab && q?.trim()) return "name";
  return parseLocateTab(tab);
}
