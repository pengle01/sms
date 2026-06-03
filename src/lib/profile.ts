// Pure helpers for staff self-service profile editing — unit-testable.

// Normalise a ΠΜΠ (personnel number): trim, strip inner spaces, empty → null.
export function normalizePmp(raw: string | null | undefined): string | null {
  const v = (raw ?? "").replace(/\s+/g, "");
  return v.length > 0 ? v : null;
}

// Permissive ΠΜΠ shape: 1–20 letters/digits (Greek or Latin).
export function isValidPmp(v: string): boolean {
  return /^[0-9A-Za-zΑ-Ωα-ω]{1,20}$/.test(v);
}

export interface ProfileInput {
  name: string;
  phone: string;
  department: string;
  pmp: string;
}

export type ProfileValidation =
  | { ok: true; name: string; phone: string | null; department: string | null; pmp: string | null }
  | { ok: false; error: "errName" | "errPmp" };

export function validateProfileInput(input: ProfileInput): ProfileValidation {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "errName" };

  const pmp = normalizePmp(input.pmp);
  if (pmp !== null && !isValidPmp(pmp)) return { ok: false, error: "errPmp" };

  const phone = input.phone.trim() || null;
  const department = input.department.trim() || null;

  return { ok: true, name, phone, department, pmp };
}
