// Access-code helpers for student/parent self-service onboarding.
//
// Pure string helpers (normalize/validate) are safe for client + unit tests.
// The random generators use the Web Crypto API (available in Node 18+ and the
// edge/browser runtimes) and are only called server-side.

// Unambiguous alphabet — no 0/O, 1/I/L to avoid confusion when read aloud.
export const ACCESS_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ACCESS_CODE_LENGTH = 8;
export const OTP_LENGTH = 6;

// Default cap on guardian accounts per student. The live cap is admin-configurable
// (GlobalSetting "maxGuardiansPerStudent", read via getMaxGuardiansPerStudent) and
// passed into the helpers below; this constant is the fallback default.
export const MAX_GUARDIAN_CLAIMS = 2;

/**
 * Whether a guardian may (re)claim a student's access code. A guardian whose
 * account is already linked to the student is always allowed back in (e.g. to
 * reset their password via re-activation) — only *new* links count toward the
 * cap. `max` is the configured guardians-per-student limit.
 */
export function canAddGuardian(
  guardianClaims: number,
  alreadyLinked: boolean,
  max: number = MAX_GUARDIAN_CLAIMS,
): boolean {
  return alreadyLinked || guardianClaims < max;
}

/**
 * Which activation roles a code still offers — drives the role picker so only
 * available roles can be selected (student is one-shot; guardians are capped).
 * `max` is the configured guardians-per-student limit.
 */
export function roleAvailability(
  access: {
    studentClaimedAt: Date | string | null;
    guardianClaims: number;
  },
  max: number = MAX_GUARDIAN_CLAIMS,
): { student: boolean; guardian: boolean } {
  return {
    student: !access.studentClaimedAt,
    guardian: access.guardianClaims < max,
  };
}

/** Uppercase and strip spaces/dashes so "abcd-1234" matches "ABCD1234". */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** True if the (already-normalized) string is a plausible access code. */
export function isWellFormedCode(input: string): boolean {
  const c = normalizeCode(input);
  if (c.length !== ACCESS_CODE_LENGTH) return false;
  for (const ch of c) if (!ACCESS_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

function randomInts(count: number): Uint32Array {
  const arr = new Uint32Array(count);
  globalThis.crypto.getRandomValues(arr);
  return arr;
}

/** A new random access code, e.g. "K7M2QPRX". */
export function randomAccessCode(): string {
  const ints = randomInts(ACCESS_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < ACCESS_CODE_LENGTH; i++) {
    out += ACCESS_CODE_ALPHABET[ints[i]! % ACCESS_CODE_ALPHABET.length];
  }
  return out;
}

/** A new numeric one-time password, e.g. "048213". */
export function randomOtp(): string {
  const ints = randomInts(OTP_LENGTH);
  let out = "";
  for (let i = 0; i < OTP_LENGTH; i++) out += String(ints[i]! % 10);
  return out;
}

/**
 * Daily digest notification for super admins about guardian links made through
 * the self-service activation flow. One notification per admin per day: each
 * NEW link refreshes the day's digest (count + unread) instead of adding a row,
 * so a rollout wave of activations can't flood the board. Re-activations of an
 * already-linked guardian are just password resets and stay silent.
 */
export function guardianLinkDigest(count: number): {
  type: string;
  title: string;
  body: string;
  linkUrl: string;
} {
  return {
    type: "GUARDIAN_LINK",
    title: "Νέοι κηδεμόνες",
    body:
      count === 1
        ? "1 νέα σύνδεση κηδεμόνα σήμερα"
        : `${count} νέες συνδέσεις κηδεμόνων σήμερα`,
    linkUrl: "/admin/audit?action=account.activate.guardian",
  };
}
