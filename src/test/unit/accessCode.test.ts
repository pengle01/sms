import { describe, it, expect } from "vitest";
import {
  normalizeCode,
  isWellFormedCode,
  randomAccessCode,
  randomOtp,
  ACCESS_CODE_ALPHABET,
  ACCESS_CODE_LENGTH,
  OTP_LENGTH,
} from "@/lib/accessCode";
import { canManageAccessCode } from "@/lib/rbac";

describe("normalizeCode", () => {
  it("uppercases and strips separators", () => {
    expect(normalizeCode("abcd-1234")).toBe("ABCD1234");
    expect(normalizeCode("  k7m2 qprx ")).toBe("K7M2QPRX");
  });
});

describe("isWellFormedCode", () => {
  it("accepts codes of the right length and alphabet", () => {
    expect(isWellFormedCode("K7M2QPRX")).toBe(true);
    expect(isWellFormedCode("k7m2-qprx")).toBe(true);
  });
  it("rejects wrong length or ambiguous/invalid chars", () => {
    expect(isWellFormedCode("K7M2QPR")).toBe(false); // too short
    expect(isWellFormedCode("K7M2QPRXY")).toBe(false); // too long
    expect(isWellFormedCode("K7M2QPR0")).toBe(false); // 0 not in alphabet
    expect(isWellFormedCode("K7M2QPRI")).toBe(false); // I not in alphabet
  });
});

describe("randomAccessCode", () => {
  it("produces a well-formed code from the alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const c = randomAccessCode();
      expect(c).toHaveLength(ACCESS_CODE_LENGTH);
      expect(isWellFormedCode(c)).toBe(true);
      for (const ch of c) expect(ACCESS_CODE_ALPHABET).toContain(ch);
    }
  });
});

describe("randomOtp", () => {
  it("produces a numeric OTP of the right length", () => {
    for (let i = 0; i < 50; i++) {
      const o = randomOtp();
      expect(o).toHaveLength(OTP_LENGTH);
      expect(/^\d+$/.test(o)).toBe(true);
    }
  });
});

describe("canManageAccessCode", () => {
  const group = { homeroomTeacherId: "staff_home", homeroomHeadteacherId: "staff_head" };

  it("always allows system and office admins", () => {
    expect(canManageAccessCode("SUPER_ADMIN", null, null)).toBe(true);
    expect(canManageAccessCode("SCHOOL_ADMIN", null, null)).toBe(true);
  });

  it("allows the student's homeroom teacher and headteacher", () => {
    expect(canManageAccessCode("TEACHER", "staff_home", group)).toBe(true);
    expect(canManageAccessCode("HEADTEACHER_B", "staff_head", group)).toBe(true);
  });

  it("denies other staff and unrelated homerooms", () => {
    expect(canManageAccessCode("TEACHER", "staff_other", group)).toBe(false);
    expect(canManageAccessCode("TEACHER", null, group)).toBe(false);
    expect(canManageAccessCode("HEADMASTER", "staff_other", group)).toBe(false);
    expect(canManageAccessCode("STUDENT", "staff_home", group)).toBe(false);
  });
});
