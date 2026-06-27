import { describe, it, expect } from "vitest";
import {
  normalizeCode,
  isWellFormedCode,
  randomAccessCode,
  randomOtp,
  canAddGuardian,
  roleAvailability,
  ACCESS_CODE_ALPHABET,
  ACCESS_CODE_LENGTH,
  OTP_LENGTH,
  MAX_GUARDIAN_CLAIMS,
} from "@/lib/accessCode";
import { canViewAccessCode, canGenerateAccessCode } from "@/lib/rbac";

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

describe("canAddGuardian", () => {
  it("allows new guardians below the cap", () => {
    expect(canAddGuardian(0, false)).toBe(true);
    expect(canAddGuardian(1, false)).toBe(true);
  });

  it("blocks a new guardian at or above the cap", () => {
    expect(canAddGuardian(MAX_GUARDIAN_CLAIMS, false)).toBe(false);
    expect(canAddGuardian(MAX_GUARDIAN_CLAIMS + 1, false)).toBe(false);
  });

  it("always lets an already-linked guardian re-activate", () => {
    expect(canAddGuardian(MAX_GUARDIAN_CLAIMS, true)).toBe(true);
    expect(canAddGuardian(MAX_GUARDIAN_CLAIMS + 5, true)).toBe(true);
  });

  it("caps at exactly two guardians by default", () => {
    expect(MAX_GUARDIAN_CLAIMS).toBe(2);
  });

  it("honours a configured cap passed in", () => {
    expect(canAddGuardian(2, false, 3)).toBe(true); // raised cap admits a 3rd guardian
    expect(canAddGuardian(3, false, 3)).toBe(false);
    expect(canAddGuardian(1, false, 1)).toBe(false); // lowered cap blocks a 2nd
    expect(canAddGuardian(1, true, 1)).toBe(true); // already-linked re-activation still exempt
  });
});

describe("roleAvailability", () => {
  it("offers both roles on a fresh code", () => {
    expect(roleAvailability({ studentClaimedAt: null, guardianClaims: 0 })).toEqual({
      student: true,
      guardian: true,
    });
  });

  it("withdraws the student role once claimed", () => {
    expect(roleAvailability({ studentClaimedAt: new Date(), guardianClaims: 0 })).toEqual({
      student: false,
      guardian: true,
    });
  });

  it("withdraws the guardian role at the cap", () => {
    expect(roleAvailability({ studentClaimedAt: null, guardianClaims: MAX_GUARDIAN_CLAIMS })).toEqual({
      student: true,
      guardian: false,
    });
  });

  it("offers nothing on a fully claimed code", () => {
    expect(roleAvailability({ studentClaimedAt: new Date(), guardianClaims: MAX_GUARDIAN_CLAIMS })).toEqual({
      student: false,
      guardian: false,
    });
  });

  it("respects a configured cap", () => {
    // With a cap of 3, two existing guardians still leave the role open.
    expect(roleAvailability({ studentClaimedAt: null, guardianClaims: 2 }, 3)).toMatchObject({ guardian: true });
    // With a cap of 1, a single existing guardian closes it.
    expect(roleAvailability({ studentClaimedAt: null, guardianClaims: 1 }, 1)).toMatchObject({ guardian: false });
  });
});

describe("canViewAccessCode", () => {
  const group = { homeroomTeacherId: "staff_home", homeroomHeadteacherId: "staff_head" };

  it("always allows system and office admins", () => {
    expect(canViewAccessCode("SUPER_ADMIN", null, null)).toBe(true);
    expect(canViewAccessCode("SCHOOL_ADMIN", null, null)).toBe(true);
  });

  it("allows the student's homeroom teacher and headteacher", () => {
    expect(canViewAccessCode("TEACHER", "staff_home", group)).toBe(true);
    expect(canViewAccessCode("HEADTEACHER_B", "staff_head", group)).toBe(true);
  });

  it("denies other staff and unrelated homerooms", () => {
    expect(canViewAccessCode("TEACHER", "staff_other", group)).toBe(false);
    expect(canViewAccessCode("TEACHER", null, group)).toBe(false);
    expect(canViewAccessCode("HEADMASTER", "staff_other", group)).toBe(false);
    expect(canViewAccessCode("STUDENT", "staff_home", group)).toBe(false);
  });
});

describe("canGenerateAccessCode", () => {
  it("only the system admin may generate codes", () => {
    expect(canGenerateAccessCode("SUPER_ADMIN")).toBe(true);
    expect(canGenerateAccessCode("SCHOOL_ADMIN")).toBe(false);
    expect(canGenerateAccessCode("TEACHER")).toBe(false);
    expect(canGenerateAccessCode("HEADTEACHER_B")).toBe(false);
    expect(canGenerateAccessCode("HEADMASTER")).toBe(false);
  });
});
