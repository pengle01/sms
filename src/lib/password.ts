// The one definition of what counts as an acceptable password, and the rules
// for changing your own. Pure; unit-tested; no bcrypt, no DB.

/**
 * Minimum length, in characters.
 *
 * Was declared separately in six modules (activation, registration, the admin
 * set-password action, the student account card, the admin bootstrap) and
 * hardcoded as a literal `8` in three form buttons, so a policy change would
 * have had to find all nine. Everything imports this instead.
 */
export const PASSWORD_MIN_LENGTH = 8;

export function isAcceptablePassword(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH;
}

/** Why a change was refused. These are i18n keys under `account`. */
export type PasswordChangeProblem =
  | "errCurrentRequired"
  | "errTooShort"
  | "errMismatch"
  | "errSameAsCurrent";

export interface PasswordChangeInput {
  current: string;
  next: string;
  confirm: string;
}

/**
 * Check a self-service password change, before any hashing happens.
 *
 * The current password is required even though the session already proves who
 * you are: a session is not the same as presence. Someone at an unlocked
 * machine could otherwise change the password and lock the owner out of their
 * own account, and for a parent that account is the only way back to their
 * child's record.
 *
 * Whether the current password is *correct* is not decided here — that needs
 * bcrypt and the stored hash. This only rejects the cases that are wrong on
 * their face, so the caller does not hash a password it is going to discard.
 */
export function validatePasswordChange(input: PasswordChangeInput): PasswordChangeProblem | null {
  if (!input.current) return "errCurrentRequired";
  if (!isAcceptablePassword(input.next)) return "errTooShort";
  if (input.next !== input.confirm) return "errMismatch";
  // Not a security control — a no-op change is harmless — but silently
  // "succeeding" at it makes someone think they have rotated a password they
  // have not.
  if (input.next === input.current) return "errSameAsCurrent";
  return null;
}
