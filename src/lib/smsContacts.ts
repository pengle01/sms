// SMS recipient helpers: phone normalisation + default-number validation.
// The student import file provides a dedicated SMS number per student; it must
// belong to one of the student's parents/guardians, otherwise we flag the
// student for the office to review.

/** Reduce a phone to its significant digits: drop +, spaces, punctuation, the
 *  Cyprus country code (357) and any leading zeros, so "+357 99 123456",
 *  "0099123456" and "99123456" all compare equal. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("357") && d.length > 8) d = d.slice(3);
  d = d.replace(/^0+/, "");
  return d;
}

export type SmsFlagReason = "EMPTY" | "NO_MATCH";

export interface SmsDefaultEvaluation {
  flagged: boolean;
  reason: SmsFlagReason | null;
}

/** The default SMS number must match one of the parent/guardian numbers.
 *  Empty → flagged EMPTY; present but unmatched → flagged NO_MATCH. */
export function evaluateDefaultSms(
  smsPhone: string | null | undefined,
  parentGuardianPhones: (string | null | undefined)[]
): SmsDefaultEvaluation {
  const target = normalizePhone(smsPhone);
  if (!target) return { flagged: true, reason: "EMPTY" };
  const known = new Set(parentGuardianPhones.map(normalizePhone).filter(Boolean));
  if (!known.has(target)) return { flagged: true, reason: "NO_MATCH" };
  return { flagged: false, reason: null };
}

export const SMS_FLAG_REASON_EL: Record<SmsFlagReason, string> = {
  EMPTY: "Δεν δόθηκε αριθμός SMS στο αρχείο.",
  NO_MATCH: "Ο αριθμός SMS δεν αντιστοιχεί σε γονέα ή κηδεμόνα.",
};

/** The import's name for the file's «τηλέφωνο SMS» contact. */
export const SMS_PLACEHOLDER_NAME = "SMS";
/** The import's name for «Τηλέφωνο (1)» when the row names no guardian. */
export const HOME_PHONE_NAME = "Τηλέφωνο οικίας";
/** Name given to a parent's number when the file leaves the parent's name empty. */
const ROLE_NAME: Record<string, string> = { FATHER: "Πατέρας", MOTHER: "Μητέρα", GUARDIAN: "Κηδεμόνας" };

type ContactRole = "FATHER" | "MOTHER" | "GUARDIAN" | "OTHER";

export function isSmsPlaceholder(c: { name: string; role: string }): boolean {
  return c.name.trim() === SMS_PLACEHOLDER_NAME && c.role === "OTHER";
}

export function isHomePhone(c: { name: string; role: string }): boolean {
  return c.name.trim() === HOME_PHONE_NAME && c.role === "OTHER";
}

export interface ImportedContact {
  name: string;
  phone: string;
  role: ContactRole;
}

/**
 * The contacts one row of the student import file yields — every phone column,
 * once per number (compared normalised), in file order:
 * father's and mother's mobiles (named after the parent, or «Πατέρας»/«Μητέρα»
 * when the file leaves the name empty), «Τηλέφωνο (1)» (the guardian's when the
 * row names one, else «Τηλέφωνο οικίας»), then «τηλέφωνο SMS» («SMS»).
 */
export function importContactsFromRow(row: {
  fatherName: string;
  fatherPhone: string;
  motherName: string;
  motherPhone: string;
  guardianName: string;
  homePhone: string;
  smsPhone: string;
}): ImportedContact[] {
  const out: ImportedContact[] = [];
  const seen = new Set<string>();
  const add = (name: string, phone: string, role: ContactRole) => {
    const p = phone.trim();
    const norm = normalizePhone(p);
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    out.push({ name: name.trim() || ROLE_NAME[role] || name, phone: p, role });
  };
  add(row.fatherName, row.fatherPhone, "FATHER");
  add(row.motherName, row.motherPhone, "MOTHER");
  if (row.guardianName.trim()) add(row.guardianName, row.homePhone, "GUARDIAN");
  else add(HOME_PHONE_NAME, row.homePhone, "OTHER");
  add(SMS_PLACEHOLDER_NAME, row.smsPhone, "OTHER");
  return out;
}

/** The numbers an exit-permit deputy can call and pick as "who agreed" — every
 *  contact on record. The import's «SMS» contact is folded into the parent with
 *  the same number (however formatted), who takes over its default flag; an
 *  «SMS» number that matches nobody stays, listed last. Active or not doesn't
 *  matter: "active" picks who receives SMS, not who the deputy may phone.
 *  Order: the default, then people, then the home phone and the SMS number. */
export function permitContactChoices<
  T extends { name: string; phone: string; role: string; isDefault: boolean },
>(contacts: T[]): T[] {
  const others = contacts.filter((c) => !isSmsPlaceholder(c));
  const otherPhones = new Set(others.map((c) => normalizePhone(c.phone)));
  const defaultPhones = new Set(
    contacts.filter((c) => isSmsPlaceholder(c) && c.isDefault).map((c) => normalizePhone(c.phone)).filter(Boolean)
  );
  const unmatchedSms = contacts.filter((c) => isSmsPlaceholder(c) && !otherPhones.has(normalizePhone(c.phone)));
  const rank = (c: T) => (c.isDefault ? 0 : isHomePhone(c) ? 2 : isSmsPlaceholder(c) ? 3 : 1);
  return [
    ...others.map((c) => (defaultPhones.has(normalizePhone(c.phone)) && !c.isDefault ? { ...c, isDefault: true } : c)),
    ...unmatchedSms,
  ].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "el"));
}
