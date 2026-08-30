import { describe, it, expect } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  isAcceptablePassword,
  validatePasswordChange,
} from "@/lib/password";

const long = "a".repeat(PASSWORD_MIN_LENGTH);

describe("isAcceptablePassword", () => {
  it("accepts a password at the minimum length", () => {
    expect(isAcceptablePassword(long)).toBe(true);
  });

  it("rejects one character short", () => {
    expect(isAcceptablePassword("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(isAcceptablePassword("")).toBe(false);
  });

  it("counts Greek characters like any other", () => {
    expect(isAcceptablePassword("κωδικός1")).toBe(true);
    expect(isAcceptablePassword("κωδικό")).toBe(false);
  });
});

describe("validatePasswordChange", () => {
  const ok = { current: "oldpassword", next: "newpassword", confirm: "newpassword" };

  it("accepts a well-formed change", () => {
    expect(validatePasswordChange(ok)).toBeNull();
  });

  it("requires the current password", () => {
    expect(validatePasswordChange({ ...ok, current: "" })).toBe("errCurrentRequired");
  });

  it("rejects a new password below the minimum", () => {
    const short = "a".repeat(PASSWORD_MIN_LENGTH - 1);
    expect(validatePasswordChange({ ...ok, next: short, confirm: short })).toBe("errTooShort");
  });

  it("rejects a mistyped confirmation", () => {
    expect(validatePasswordChange({ ...ok, confirm: "newpasswordd" })).toBe("errMismatch");
  });

  it("rejects reusing the current password", () => {
    expect(validatePasswordChange({ current: long, next: long, confirm: long })).toBe(
      "errSameAsCurrent",
    );
  });

  it("reports the missing current password before anything else", () => {
    // Every field is wrong; the first thing to fix should be named.
    expect(validatePasswordChange({ current: "", next: "x", confirm: "y" })).toBe(
      "errCurrentRequired",
    );
  });

  it("reports the length before the mismatch", () => {
    expect(validatePasswordChange({ current: "old", next: "x", confirm: "y" })).toBe("errTooShort");
  });

  it("does not trim — a password may legitimately start or end with a space", () => {
    const padded = ` ${long} `;
    expect(validatePasswordChange({ current: "old", next: padded, confirm: padded })).toBeNull();
    expect(validatePasswordChange({ current: "old", next: padded, confirm: long })).toBe(
      "errMismatch",
    );
  });
});
