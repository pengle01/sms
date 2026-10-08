// Staff sign-up form helpers — pure, unit-tested in registerForm.test.ts.

/** The fields given back to the form after a refused sign-up. Never the passwords. */
export interface RegisterValues {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  staffName: string;
}

export type RegisterState = { error: string; values: RegisterValues } | null;

/** False only once the confirmation is typed and differs — an empty one isn't a mismatch yet. */
export function passwordsMatch(password: string, confirm: string): boolean {
  return confirm === "" || password === confirm;
}

/** What to echo back into the form so nothing has to be retyped (passwords excluded). */
export function registerValues(form: { get(name: string): FormDataEntryValue | null }): RegisterValues {
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  return {
    firstName: str("firstName"),
    lastName: str("lastName"),
    email: str("email"),
    role: str("role"),
    staffName: str("staffName"),
  };
}
