// Absences carried over from the school's previous system: one number of
// periods per student, for absences before the app started recording. Temporary
// by design — kept per school year, so it stops counting when the year changes.
// Pure rules; the DB side is src/server/carriedAbsences.ts.

/** The last day the previous system recorded absences (the app began on 19/10). */
export const CARRIED_UNTIL = "2026-10-18";

/** Staff see «12 + 22 = 34»; with nothing carried over, just the number. */
export function formatAbsenceTotal(carried: number, recorded: number): string {
  return carried > 0 ? `${carried} + ${recorded} = ${carried + recorded}` : String(recorded);
}

/**
 * Whether a «Τμήμα μου» period covers the carried-over absences: the school year
 * does; the term only while it is the Α΄ τετράμηνο (they all fall in it); a week
 * or the last 30 days never, since the number has no dates.
 */
export function carriedAppliesToWindow(window: string, currentTerm: "TERM1" | "TERM2" | null): boolean {
  if (window === "year") return true;
  if (window === "term") return currentTerm !== "TERM2";
  return false;
}

/** Whether a date range (ISO, inclusive) reaches back before the cut-off. */
export function carriedAppliesToRange(fromIso: string, toIso: string, yearStartIso: string): boolean {
  return fromIso <= CARRIED_UNTIL && toIso >= yearStartIso;
}

function plain(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export type CarriedSheet =
  | { ok: true; entries: { registry: string; periods: number }[] }
  | { ok: false; error: "empty" | "noRegistryColumn" | "noCountColumn" | "badRows"; rows?: string[] };

/**
 * The sheet: a «μητρώο» column and a count column («απουσίες», «περίοδοι» or
 * «αριθμός»), found by header ignoring accents. Any bad row refuses the file —
 * a missing or non-whole number, a negative one, or a student twice.
 */
export function parseCarriedAbsenceRows(rows: readonly Record<string, unknown>[]): CarriedSheet {
  if (rows.length === 0) return { ok: false, error: "empty" };
  const headers = Object.keys(rows[0]!);
  const registryCol = headers.find((h) => /μητρ/.test(plain(h)));
  if (!registryCol) return { ok: false, error: "noRegistryColumn" };
  const countCol = headers.find((h) => h !== registryCol && /(απουσ|περιοδ|αριθμ)/.test(plain(h)));
  if (!countCol) return { ok: false, error: "noCountColumn" };

  const entries: { registry: string; periods: number }[] = [];
  const bad: string[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const registry = String(r[registryCol] ?? "").trim();
    const raw = String(r[countCol] ?? "").trim();
    if (!registry && !raw) return;
    const periods = Number(raw);
    const line = `${i + 2}: ${registry || "—"} ${raw || "—"}`;
    if (!registry || raw === "" || !Number.isInteger(periods) || periods < 0 || seen.has(registry)) {
      bad.push(line);
      return;
    }
    seen.add(registry);
    entries.push({ registry, periods });
  });
  if (bad.length > 0) return { ok: false, error: "badRows", rows: bad };
  if (entries.length === 0) return { ok: false, error: "empty" };
  return { ok: true, entries };
}

/** What an upload changes: students gaining a number, changing it, or losing it (a 0). */
export function summarizeCarriedChanges(
  entries: readonly { registry: string; periods: number }[],
  existing: ReadonlyMap<string, number>,
): { added: number; changed: number; removed: number; unchanged: number } {
  const out = { added: 0, changed: 0, removed: 0, unchanged: 0 };
  for (const e of entries) {
    const before = existing.get(e.registry);
    if (e.periods === 0) {
      if (before != null) out.removed++;
      else out.unchanged++;
    } else if (before == null) out.added++;
    else if (before !== e.periods) out.changed++;
    else out.unchanged++;
  }
  return out;
}
