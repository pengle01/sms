// Parsing/formatting for the DD/MM/YY date text field (DateInput component).
// Pure — no DB, no DOM.
import { fmtDisplayDate } from "@/lib/dates";

/**
 * Parse a user-typed date to ISO "YYYY-MM-DD", or null when invalid.
 * Accepts DD/MM/YY and DD/MM/YYYY (also single-digit day/month and "." or
 * "-" separators) plus ISO YYYY-MM-DD (paste). Two-digit years map to 20YY.
 */
export function parseDisplayDate(text: string): string | null {
  const s = text.trim();
  if (!s) return null;
  let d: number, m: number, y: number;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = s.match(/^(\d{1,2})([/.-])(\d{1,2})\2(\d{2}|\d{4})$/);
  if (iso) {
    y = +iso[1]!; m = +iso[2]!; d = +iso[3]!;
  } else if (dmy) {
    d = +dmy[1]!; m = +dmy[3]!; y = +dmy[4]!;
    if (dmy[4]!.length === 2) y += 2000;
  } else {
    return null;
  }
  // Round-trip through Date.UTC to reject impossible calendar dates (31/02…).
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** ISO "YYYY-MM-DD" → "DD/MM/YY" for display in the text field ("" otherwise). */
export function displayDateText(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return fmtDisplayDate(iso);
}
