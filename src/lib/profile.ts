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

// Compose a display full name from its parts ("first last"), collapsing whitespace.
export function composeFullName(firstName: string, lastName: string): string {
  return [firstName, lastName]
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(" ");
}

// Best-effort split of an existing single-field name into first + surname, used
// only to seed the edit form for accounts created before the split. The first
// whitespace-separated token is the first name; the remainder is the surname.
export function splitFullName(full: string | null | undefined): { firstName: string; lastName: string } {
  const v = (full ?? "").trim().replace(/\s+/g, " ");
  if (!v) return { firstName: "", lastName: "" };
  const idx = v.indexOf(" ");
  if (idx === -1) return { firstName: v, lastName: "" };
  return { firstName: v.slice(0, idx), lastName: v.slice(idx + 1) };
}

/**
 * True while a staff member still owes first-login profile completion:
 * name parts, phone, department and ΠΜΠ must ALL be filled. Single source of
 * truth for the dashboard redirect, the profile page banner, and the
 * portal-wide ProfileGuard overlay.
 */
export function profileIncomplete(p: {
  pmp: string | null;
  phone: string | null;
  department: string | null;
  firstName: string | null;
  lastName: string | null;
}): boolean {
  return !p.pmp || !p.phone || !p.department || !p.firstName || !p.lastName;
}

export interface ProfileInput {
  firstName: string;
  lastName: string;
  phone: string;
  department: string;
  pmp: string;
}

export type ProfileValidation =
  | {
      ok: true;
      firstName: string;
      lastName: string;
      name: string;
      phone: string | null;
      department: string | null;
      pmp: string | null;
    }
  | {
      ok: false;
      error: "errFirstName" | "errLastName" | "errPmp" | "errPhone" | "errDepartment" | "errPmpRequired";
    };

/**
 * Validate the staff self-service profile. When `requireStaffFields` is true
 * (the user has a StaffProfile, e.g. first-login completion) phone, department
 * and ΠΜΠ are all mandatory alongside the always-required first/last name.
 */
export function validateProfileInput(input: ProfileInput, requireStaffFields = false): ProfileValidation {
  const firstName = input.firstName.trim().replace(/\s+/g, " ");
  if (firstName.length < 2) return { ok: false, error: "errFirstName" };

  const lastName = input.lastName.trim().replace(/\s+/g, " ");
  if (lastName.length < 2) return { ok: false, error: "errLastName" };

  const pmp = normalizePmp(input.pmp);
  if (pmp !== null && !isValidPmp(pmp)) return { ok: false, error: "errPmp" };

  const phone = input.phone.trim() || null;
  const department = input.department.trim() || null;

  if (requireStaffFields) {
    if (phone === null) return { ok: false, error: "errPhone" };
    if (department === null) return { ok: false, error: "errDepartment" };
    if (pmp === null) return { ok: false, error: "errPmpRequired" };
  }

  return { ok: true, firstName, lastName, name: composeFullName(firstName, lastName), phone, department, pmp };
}
