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
