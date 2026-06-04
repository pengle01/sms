// Access-code helpers for student/parent self-service onboarding.
//
// Pure string helpers (normalize/validate) are safe for client + unit tests.
// The random generators use the Web Crypto API (available in Node 18+ and the
// edge/browser runtimes) and are only called server-side.

// Unambiguous alphabet — no 0/O, 1/I/L to avoid confusion when read aloud.
export const ACCESS_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ACCESS_CODE_LENGTH = 8;
export const OTP_LENGTH = 6;

// At most this many guardian accounts may redeem a student's code.
export const MAX_GUARDIAN_CLAIMS = 2;

/**
 * Whether a guardian may (re)claim a student's access code. A guardian whose
 * account is already linked to the student is always allowed back in (e.g. to
 * reset their password via re-activation) — only *new* links count toward the
 * cap.
 */
export function canAddGuardian(guardianClaims: number, alreadyLinked: boolean): boolean {
  return alreadyLinked || guardianClaims < MAX_GUARDIAN_CLAIMS;
}

/**
 * Which activation roles a code still offers — drives the role picker so only
 * available roles can be selected (student is one-shot; guardians are capped).
 */
export function roleAvailability(access: {
  studentClaimedAt: Date | string | null;
  guardianClaims: number;
}): { student: boolean; guardian: boolean } {
  return {
    student: !access.studentClaimedAt,
    guardian: access.guardianClaims < MAX_GUARDIAN_CLAIMS,
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
