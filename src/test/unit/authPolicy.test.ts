import { describe, it, expect } from "vitest";
import { passwordLoginDenial, mayPasswordLogin } from "@/lib/authPolicy";

const account = (over: Partial<{ isActive: boolean; passwordHash: string | null }> = {}) => ({
  isActive: true,
  passwordHash: "$2a$12$hash",
  ...over,
});

describe("passwordLoginDenial", () => {
  it("allows an active account with a password", () => {
    expect(passwordLoginDenial(account())).toBeNull();
  });

  it("refuses an address with no account", () => {
    expect(passwordLoginDenial(null)).toBe("no_account");
    expect(passwordLoginDenial(undefined)).toBe("no_account");
  });

  it("refuses an account with no password set", () => {
    expect(passwordLoginDenial(account({ passwordHash: null }))).toBe("no_password");
  });

  it("refuses a registration an admin has not approved yet", () => {
    expect(passwordLoginDenial(account({ isActive: false }))).toBe("inactive");
  });

  it("reports the missing password before the inactive flag", () => {
    // Both are wrong; the log should name the more fundamental one.
    expect(passwordLoginDenial(account({ passwordHash: null, isActive: false }))).toBe("no_password");
  });

  it("lets staff in — the role is not part of the policy", () => {
    // The gate this replaced allowed only PARENT/STUDENT/CHAPERONE outside
    // development, which would have locked every teacher, the office and the
    // super admin out of the first production deployment.
    for (const role of [
      "SUPER_ADMIN", "HEADMASTER", "HEADTEACHER_A", "HEADTEACHER_B",
      "STUDENT_COUNSELOR", "TEACHER", "SCHOOL_ADMIN", "CHAPERONE", "STUDENT", "PARENT",
    ]) {
      const withRole = { ...account(), role };
      expect(passwordLoginDenial(withRole)).toBeNull();
    }
  });
});

describe("mayPasswordLogin", () => {
  it("agrees with the denial check", () => {
    expect(mayPasswordLogin(account())).toBe(true);
    expect(mayPasswordLogin(null)).toBe(false);
    expect(mayPasswordLogin(account({ passwordHash: null }))).toBe(false);
    expect(mayPasswordLogin(account({ isActive: false }))).toBe(false);
  });

  it("narrows passwordHash to a string once it passes", () => {
    const user = account() as { isActive: boolean; passwordHash: string | null };
    if (mayPasswordLogin(user)) {
      // Compiles only because the predicate narrows — this is the assertion.
      const hash: string = user.passwordHash;
      expect(hash).toBe("$2a$12$hash");
    } else {
      throw new Error("expected the account to pass");
    }
  });
});
