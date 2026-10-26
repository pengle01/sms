// The parent letter («Γραπτή ενημέρωση γονέων/κηδεμόνων για επιβολή
// παιδαγωγικών μέτρων») printed after a referral is resolved. Pure helpers.

import { actionLabel, expulsionLength, lengthLabel } from "@/lib/referralLabels";

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

/**
 * An expulsion served at school (one whole day, or periods only). Its dates
 * stay off the parent letter and SMS — a student who reads them might stay home.
 */
export function expulsionAtSchool(days: { fromPeriod?: number | null; toPeriod?: number | null }[]): boolean {
  const l = expulsionLength(days);
  return expulsionWhere(l.days > 0 ? l.days : l.periods > 0 ? 1 : 0) === "Σχολείο";
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

/** An expulsion day on the letter: «Τρι, 27/10/2026» and «Όλη η μέρα» / «Περίοδοι 3–5». */
export function letterExpulsionDay(d: { date: Date; fromPeriod?: number | null; toPeriod?: number | null }): {
  date: string;
  span: string;
} {
  return {
    date: letterDate(d.date),
    span: d.fromPeriod != null && d.toPeriod != null ? `Περίοδοι ${d.fromPeriod}–${d.toPeriod}` : "Όλη η μέρα",
  };
}

/**
 * The letter's «Παιδαγωγικό μέτρο» section: the measure, its length, the
 * expulsion days (only when served at home), where it is served, a note for a suspended expulsion and
 * the deputy's description. Empty fields are null / [].
 */
export function letterPunishment(res: {
  action: string;
  actionDetails?: string | null;
  suspendedDays?: number | null;
  suspendedPeriods?: number | null;
  expulsionDays: { date: Date; fromPeriod?: number | null; toPeriod?: number | null }[];
}): {
  measure: string;
  length: string | null;
  days: { date: string; span: string }[];
  where: "Σπίτι" | "Σχολείο" | null;
  note: string | null;
  details: string | null;
} {
  const details = res.actionDetails?.trim() || null;
  if (res.action === "DETENTION") {
    const l = expulsionLength(res.expulsionDays);
    const days = [...res.expulsionDays].sort((a, b) => a.date.getTime() - b.date.getTime());
    const atSchool = expulsionAtSchool(res.expulsionDays);
    return {
      measure: actionLabel(res.action),
      length: lengthLabel(l.days, l.periods) || null,
      days: atSchool ? [] : days.map(letterExpulsionDay),
      // By whole days; periods only → at school.
      where: expulsionWhere(l.days > 0 ? l.days : l.periods > 0 ? 1 : 0),
      note: null,
      details,
    };
  }
  if (res.action === "SUSPENDED_EXPULSION") {
    return {
      measure: actionLabel(res.action),
      length: lengthLabel(res.suspendedDays ?? 0, res.suspendedPeriods ?? 0) || null,
      days: [],
      where: null,
      note: "Η αποβολή δεν εκτίεται άμεσα· εκτίεται μόνο σε περίπτωση νέου παραπτώματος.",
      details,
    };
  }
  return { measure: actionLabel(res.action), length: null, days: [], where: null, note: null, details };
}
