// Access-code helpers for student/parent self-service onboarding.
//
// Pure string helpers (normalize/validate) are safe for client + unit tests.
// The random generators use the Web Crypto API (available in Node 18+ and the
// edge/browser runtimes) and are only called server-side.

// Unambiguous alphabet — no 0/O, 1/I/L to avoid confusion when read aloud.
export const ACCESS_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ACCESS_CODE_LENGTH = 8;
export const OTP_LENGTH = 6;

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
