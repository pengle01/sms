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
