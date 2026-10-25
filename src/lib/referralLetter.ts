// The parent letter («Γραπτή ενημέρωση γονέων/κηδεμόνων για επιβολή
// παιδαγωγικών μέτρων») printed after a referral is resolved. Pure helpers.

import { actionLabel, lengthLabel } from "@/lib/referralLabels";

const daysPhrase = (n: number) => `${n} ${n === 1 ? "μέρα" : "μέρες"}`;
const periodsPhrase = (n: number) => `${n} ${n === 1 ? "περίοδος" : "περίοδοι"}`;

/**
 * The «Μέτρο» line of the letter:
 *  • an expulsion — «3 μέρες αποβολή», «1 μέρα και 3 περίοδοι αποβολή», «3 περίοδοι αποβολή»;
 *  • a suspended expulsion — «Αποβολή με Αναστολή (2 ημέρες)», then the details;
 *  • any other measure — its label, then the deputy's details.
 * `length`: whole days (a number) or whole days plus periods.
 */
export function measureSummary(
  action: string,
  length: number | { days: number; periods: number },
  actionDetails: string | null | undefined,
): string {
  const { days, periods } = typeof length === "number" ? { days: length, periods: 0 } : length;
  const details = actionDetails?.trim();
  if (action === "DETENTION" && (days > 0 || periods > 0)) {
    const parts = [days > 0 ? daysPhrase(days) : null, periods > 0 ? periodsPhrase(periods) : null].filter(Boolean);
    return `${parts.join(" και ")} αποβολή`;
  }
  const label =
    action === "SUSPENDED_EXPULSION" && (days > 0 || periods > 0)
      ? `${actionLabel(action)} (${lengthLabel(days, periods)})`
      : actionLabel(action);
  return details ? `${label}: ${details}` : label;
}

/**
 * Where the student spends an expulsion, by its WHOLE days: 2+ at home, 1 at
 * school; none without one. A periods-only expulsion is served at school
 * (call with 1); a suspended one has none (call with 0).
 */
export function expulsionWhere(days: number): "Σπίτι" | "Σχολείο" | null {
  if (days >= 2) return "Σπίτι";
  if (days >= 1) return "Σχολείο";
  return null;
}

/** «Παράπτωμα»: the referral's title, or its description for referrals filed before titles existed. */
export function letterOffence(title: string | null | undefined, description: string): string {
  return title?.trim() || description.trim();
}

const ROLE_ORDER: Record<string, number> = { FATHER: 0, MOTHER: 1, GUARDIAN: 2 };
const ROLE_LABEL: Record<string, string> = { FATHER: "Πατέρας", MOTHER: "Μητέρα", GUARDIAN: "Κηδεμόνας" };

/** The parents' lines: «Πατέρας: Όνομα — 99…», father, mother, guardian; others and repeats left out. */
export function parentLines(contacts: { role: string; name: string | null; phone: string | null }[]): string[] {
  const seen = new Set<string>();
  return contacts
    .filter((c) => c.role in ROLE_ORDER)
    .sort((a, b) => ROLE_ORDER[a.role]! - ROLE_ORDER[b.role]!)
    .flatMap((c) => {
      const name = c.name?.trim() ?? "";
      const phone = c.phone?.trim() ?? "";
      const key = `${c.role}|${name}|${phone}`;
      if (seen.has(key) || (!name && !phone)) return [];
      seen.add(key);
      return [`${ROLE_LABEL[c.role]}: ${[name, phone].filter(Boolean).join(" — ")}`];
    });
}

const GREEK_DAY_SHORT = ["Κυρ", "Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ"];

/** «Δευ, 19/10/2026» in Cyprus time — the letter's date. */
export function letterDate(d: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Nicosia", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday!);
  return `${GREEK_DAY_SHORT[dow]}, ${parts.day}/${parts.month}/${parts.year}`;
}
