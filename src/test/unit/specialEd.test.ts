import { describe, it, expect } from "vitest";
import { parseSupportGroup, canViewSpecialEdFull } from "@/lib/specialEd";
import type { Role } from "@/generated/prisma";

describe("parseSupportGroup", () => {
  it("classifies group support (ΣΤ_) and extracts the subject", () => {
    expect(parseSupportGroup("ΣΤ_ΕΓ2_ΜΑΘ1")).toEqual({ kind: "GROUP", subjectCode: "ΜΑΘ1" });
    expect(parseSupportGroup("ΣΤ_ΗΕ1+ΗΥ1_ΕΛΛ2")).toEqual({ kind: "GROUP", subjectCode: "ΕΛΛ2" });
  });

  it("classifies atomic support (ΑΣΤ_) — and is not confused by the ΣΤ inside ΑΣΤ", () => {
    expect(parseSupportGroup("ΑΣΤ_ΑΝ_ΜΕ2_ΦΥΣ")).toEqual({ kind: "ATOMIC", subjectCode: "ΦΥΣ" });
    expect(parseSupportGroup("ΑΣΤ_ΜΘ_ΞΕ3γ_ΑΓΓ")).toEqual({ kind: "ATOMIC", subjectCode: "ΑΓΓ" });
  });

  it("returns null for ordinary (non-support) groups", () => {
    expect(parseSupportGroup("ΕΓ2")).toBeNull();
    expect(parseSupportGroup("ΗΥ1")).toBeNull();
    expect(parseSupportGroup("")).toBeNull();
  });
});

describe("canViewSpecialEdFull", () => {
  const only = (r: Role) => canViewSpecialEdFull([r], false);

  it("grants full access to counselor, headmaster and super admin", () => {
    expect(only("STUDENT_COUNSELOR")).toBe(true);
    expect(only("HEADMASTER")).toBe(true);
    expect(only("SUPER_ADMIN")).toBe(true);
  });

  it("grants full access to the special-ed deputy regardless of role", () => {
    expect(canViewSpecialEdFull(["TEACHER"], true)).toBe(true);
    expect(canViewSpecialEdFull(["HEADTEACHER_B"], true)).toBe(true);
  });

  it("denies plain teachers and headteachers without the deputy designation", () => {
    expect(only("TEACHER")).toBe(false);
    expect(only("HEADTEACHER_A")).toBe(false);
    expect(only("HEADTEACHER_B")).toBe(false);
  });

  it("honours an extra SUPER_ADMIN grant in the roles array", () => {
    expect(canViewSpecialEdFull(["TEACHER", "SUPER_ADMIN"], false)).toBe(true);
  });
});
