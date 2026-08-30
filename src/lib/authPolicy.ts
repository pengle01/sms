// Who may sign in with an email and a password. Pure; unit-tested; no DB.

/** Why a password sign-in was refused. `null` from the check means "allowed". */
export type PasswordLoginDenial = "no_account" | "no_password" | "inactive";

export interface PasswordLoginCandidate {
  isActive: boolean;
  passwordHash: string | null;
}

/**
 * May this account sign in with a password?
 *
 * Everyone may, staff included. There used to be a role gate here that allowed
 * only PARENT / STUDENT / CHAPERONE outside development, because staff were
 * meant to arrive through Microsoft Entra SSO and a password would have been a
 * way around it. Entra is deferred indefinitely (the Ministry tenant never
 * materialised) and the app is hosted on-site, so that gate no longer kept
 * anyone honest — it only guaranteed that the first production deployment would
 * lock out every teacher, the office and the super admin, with no account left
 * that could sign in to undo it.
 *
 * What is left is the same bar families already clear: the account exists, it
 * has a password set, and an admin has activated it. Registration writes the
 * hash and leaves `isActive` false until approval, so an unapproved sign-up
 * still cannot get in.
 *
 * Returns the reason for a refusal so the caller can log it without leaking
 * which of the three it was to the person at the form.
 */
export function passwordLoginDenial(
  user: PasswordLoginCandidate | null | undefined,
): PasswordLoginDenial | null {
  if (!user) return "no_account";
  if (!user.passwordHash) return "no_password";
  if (!user.isActive) return "inactive";
  return null;
}

/**
 * The same policy as a type predicate, so a caller that passes the check can
 * use `passwordHash` without re-asserting that it is set.
 */
export function mayPasswordLogin<T extends PasswordLoginCandidate>(
  user: T | null | undefined,
): user is T & { passwordHash: string } {
  return passwordLoginDenial(user) === null;
}
