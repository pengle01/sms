// Changing a login email — pure rules, unit-tested in emailChange.test.ts.

import { isFamilyRole } from "@/lib/sessionPolicy";

export type EmailChangeProblem = "errInvalid" | "errSame";

/** Trimmed and lower-cased — the form login and registration store. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shape and "is it actually different" — uniqueness is the database's job. */
export function validateEmailChange(o: { current: string | null; next: string }): EmailChangeProblem | null {
  const next = normalizeEmail(o.next);
  if (!EMAIL_SHAPE.test(next) || next.length > 254) return "errInvalid";
  if (o.current && normalizeEmail(o.current) === next) return "errSame";
  return null;
}

/** Staff change their own login email; parents and students ask the school. */
export function isStaffSelfServiceRole(role: string | null | undefined): boolean {
  return !!role && !isFamilyRole(role);
}
