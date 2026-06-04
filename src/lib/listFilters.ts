// Pure helper for carrying list-page filters through a detail-page round
// trip: the list appends its current filters to each row link, and the detail
// page rebuilds the "back" href from them — so pills/search/page survive
// opening a record and coming back. No DB imports; unit-testable.

/**
 * Serialize the given params (in `keys` order) to a `?…` query string, or ""
 * when none are set.
 */
export function pickQueryString(
  params: Record<string, string | undefined>,
  keys: readonly string[]
): string {
  const sp = new URLSearchParams();
  for (const k of keys) {
    const v = params[k];
    if (v) sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
