// Συνοδοί (chaperones): the admin uploads a sheet pairing each chaperone's
// name with the registry number of a student they accompany; a chaperone
// account sees every student listed under its own name. Pure; tested in
// chaperone.test.ts.

import { stripDiacritics } from "@/lib/textSearch";

/**
 * A name as matched between the sheet and an account: accents, case, spacing
 * and word order ignored, so «Παπάς Γιώργος» is «ΓΙΩΡΓΟΣ ΠΑΠΑΣ».
 */
export function chaperoneNameKey(name: string | null | undefined): string {
  return stripDiacritics(name ?? "")
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

export type ChaperoneSheet =
  | { ok: true; entries: { name: string; registry: string }[]; skipped: number }
  | { ok: false; error: "empty" | "noRegistryColumn" | "noNameColumn" };

const norm = (h: string) => stripDiacritics(h).toLowerCase();

/**
 * The chaperone/student pairs in an uploaded sheet:
 *  - the student: the column whose header mentions «Μητρώο»;
 *  - the chaperone: the columns mentioning «Συνοδός» (one full-name column, or
 *    surname + name), or else plain «Επώνυμο» + «Όνομα» / «Ονοματεπώνυμο»; joined in
 *    column order.
 * Rows missing either side are skipped (counted); each pair is kept once.
 */
export function chaperoneEntriesFromRows(rows: readonly Record<string, unknown>[]): ChaperoneSheet {
  if (rows.length === 0) return { ok: false, error: "empty" };
  const headers = Object.keys(rows[0]!);
  const registryCol = headers.find((h) => /μητρ/.test(norm(h)));
  if (!registryCol) return { ok: false, error: "noRegistryColumn" };
  let nameCols = headers.filter((h) => /συνοδ/.test(norm(h)));
  if (nameCols.length === 0) {
    nameCols = headers.filter((h) => h !== registryCol && /^(επωνυμο|ονομα|ονοματεπωνυμο)$/.test(norm(h).trim()));
  }
  if (nameCols.length === 0) return { ok: false, error: "noNameColumn" };

  const seen = new Set<string>();
  const entries: { name: string; registry: string }[] = [];
  let skipped = 0;
  for (const r of rows) {
    const registry = String(r[registryCol] ?? "").trim();
    const name = nameCols
      .map((c) => String(r[c] ?? "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ");
    if (!registry || !name) {
      if (registry || name) skipped++;
      continue;
    }
    const key = `${chaperoneNameKey(name)}\u0000${registry}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ name, registry });
  }
  return { ok: true, entries, skipped };
}

/**
 * The names a chaperone may pick at sign-up: one per person on the list (its
 * first spelling), minus those that already have an account, sorted.
 */
export function availableChaperoneNames(
  entries: readonly { name: string; nameKey: string }[],
  takenKeys: ReadonlySet<string>,
): string[] {
  const byKey = new Map<string, string>();
  for (const e of entries) if (!takenKeys.has(e.nameKey) && !byKey.has(e.nameKey)) byKey.set(e.nameKey, e.name);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "el"));
}
