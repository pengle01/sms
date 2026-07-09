// Accent- and case-insensitive text matching for user-facing search boxes.
// Greek input often omits tonos accents ("μαθημ" should match "Μαθηματικά"),
// so we strip combining diacritics and fold final sigma before comparing.

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Strip combining diacritics (tonos / dialytika, …) so Greek text can be
 * compared accent-insensitively — e.g. "Διευκόλυνση" → "Διευκολυνση". NFD
 * splits each accented letter into base + combining mark; we drop the marks.
 * Used by search matching here and by spreadsheet-header matching in imports.
 */
export function stripDiacritics(s: string): string {
  return (s ?? "").normalize("NFD").replace(COMBINING_MARKS, "");
}

export function normalizeSearch(s: string): string {
  return stripDiacritics(s).toLowerCase().replace(/ς/g, "σ").trim();
}

/** True when `haystack` contains `q` (normalized). An empty query matches all. */
export function matchesSearch(haystack: string | null | undefined, q: string): boolean {
  const query = normalizeSearch(q);
  if (!query) return true;
  return normalizeSearch(haystack ?? "").includes(query);
}

/**
 * Distinct, Greek-sorted suggestion values for a search box `<datalist>` —
 * built from the same rows the search filters, so every suggestion is a value
 * that actually exists for this user.
 */
export function suggestionList(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => !!v && v.trim() !== ""))].sort((a, b) =>
    a.localeCompare(b, "el")
  );
}
