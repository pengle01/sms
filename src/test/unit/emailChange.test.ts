import { describe, it, expect } from "vitest";
import { normalizeEmail, validateEmailChange, isStaffSelfServiceRole } from "@/lib/emailChange";

describe("email change", () => {
  it("normalizes like login does", () => {
    expect(normalizeEmail("  Maria.P@School.CY ")).toBe("maria.p@school.cy");
  });

  it("refuses a malformed address", () => {
    for (const bad of ["", "maria", "maria@", "@school.cy", "maria@school", "ma ria@school.cy"]) {
      expect(validateEmailChange({ current: "a@b.cy", next: bad })).toBe("errInvalid");
    }
  });

  it("refuses the same address, ignoring case and spaces", () => {
    expect(validateEmailChange({ current: "maria@school.cy", next: " MARIA@school.cy " })).toBe("errSame");
  });

  it("accepts a new valid address", () => {
    expect(validateEmailChange({ current: "maria@school.cy", next: "maria@new.cy" })).toBeNull();
    expect(validateEmailChange({ current: null, next: "maria@new.cy" })).toBeNull();
  });

  it("lets staff change their own, not families", () => {
    for (const r of ["TEACHER", "HEADMASTER", "HEADTEACHER_A", "HEADTEACHER_B", "STUDENT_COUNSELOR", "SCHOOL_ADMIN", "CHAPERONE", "SUPER_ADMIN"]) {
      expect(isStaffSelfServiceRole(r)).toBe(true);
    }
    expect(isStaffSelfServiceRole("PARENT")).toBe(false);
    expect(isStaffSelfServiceRole("STUDENT")).toBe(false);
    expect(isStaffSelfServiceRole(null)).toBe(false);
  });
});
