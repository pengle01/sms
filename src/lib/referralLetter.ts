// The parent letter («Γραπτή ενημέρωση γονέων/κηδεμόνων για επιβολή
// παιδαγωγικών μέτρων») printed after a referral is resolved. Pure helpers.

const ACTION_LABEL: Record<string, string> = {
  DETENTION: "Αποβολή",
  PEDAGOGICAL_DIALOGUE: "Παιδαγωγικός Διάλογος",
  WRITTEN_AGREEMENT: "Γραπτή Συμφωνία",
  WARNING: "Προειδοποίηση",
  OTHER: "Άλλο",
};

/** «1 μέρα αποβολή» / «3 μέρες αποβολή»; other measures: their label, then the deputy's details. */
export function measureSummary(action: string, expulsionDays: number, actionDetails: string | null | undefined): string {
  if (action === "DETENTION" && expulsionDays > 0) {
    return `${expulsionDays} ${expulsionDays === 1 ? "μέρα" : "μέρες"} αποβολή`;
  }
  const label = ACTION_LABEL[action] ?? action;
  const details = actionDetails?.trim();
  return details ? `${label}: ${details}` : label;
}

/** Where the student spends an expulsion: 2+ days at home, 1 day at school; none without one. */
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
