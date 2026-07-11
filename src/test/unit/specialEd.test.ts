import { describe, it, expect } from "vitest";
import { parseSupportGroup, canViewSpecialEdFull, specialEdCodesSeeded, splitKnownCodes, parseSpecialEdCodeInput } from "@/lib/specialEd";
import { specialEdLegend } from "@/server/specialEd";
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

describe("splitKnownCodes (only catalog codes may be attached)", () => {
  const catalog = new Set(["ΔΞ", "ΔΑΦ", "1", "3"]);

  it("splits into known catalog codes and unknown rest", () => {
    expect(splitKnownCodes(["ΔΞ", "ΧΧΧ"], catalog)).toEqual({ known: ["ΔΞ"], unknown: ["ΧΧΧ"] });
  });

  it("deduplicates repeated codes (e.g. across import columns)", () => {
    expect(splitKnownCodes(["ΔΞ", "ΔΞ", "ΧΧΧ", "ΧΧΧ"], catalog)).toEqual({
      known: ["ΔΞ"],
      unknown: ["ΧΧΧ"],
    });
  });

  it("handles empty input and an empty catalog (unseeded install)", () => {
    expect(splitKnownCodes([], catalog)).toEqual({ known: [], unknown: [] });
    expect(splitKnownCodes(["ΔΞ"], new Set())).toEqual({ known: [], unknown: ["ΔΞ"] });
  });
});

describe("specialEdCodesSeeded (import guard)", () => {
  it("is false only when BOTH lookup tables are empty (unseeded install)", () => {
    expect(specialEdCodesSeeded(0, 0)).toBe(false);
  });

  it("is true when either lookup table has codes", () => {
    expect(specialEdCodesSeeded(23, 18)).toBe(true);
    expect(specialEdCodesSeeded(23, 0)).toBe(true);
    expect(specialEdCodesSeeded(0, 18)).toBe(true);
    expect(specialEdCodesSeeded(1, 0)).toBe(true);
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

describe("specialEdLegend", () => {
  const mk = (problems: { code: string; label: string }[], accommodations: { code: string; label: string }[]) => ({
    studentId: "s", registryNo: "1", name: "x", group: null,
    remarks: null, frenchExempt: false, otherExemptions: null,
    problems, accommodations,
  });

  it("collects distinct codes across students with their labels", () => {
    const legend = specialEdLegend([
      mk([{ code: "ΔΞ", label: "Δυσλεξία" }], [{ code: "3", label: "Γραφέας" }]),
      mk([{ code: "ΔΞ", label: "Δυσλεξία" }, { code: "ΔΑΦ", label: "Αυτισμός" }], [{ code: "1", label: "Χρόνος" }]),
    ]);
    expect(legend.problems).toEqual([
      { code: "ΔΑΦ", label: "Αυτισμός" },
      { code: "ΔΞ", label: "Δυσλεξία" },
    ]);
    // accommodations sort numerically, not lexically (so "1" before "3")
    expect(legend.accommodations).toEqual([
      { code: "1", label: "Χρόνος" },
      { code: "3", label: "Γραφέας" },
    ]);
  });

  it("returns empty legends for an empty roster", () => {
    expect(specialEdLegend([])).toEqual({ problems: [], accommodations: [] });
  });
});

describe("parseSpecialEdCodeInput", () => {
  it("accepts and trims a valid code + label", () => {
    expect(parseSpecialEdCodeInput(" ΔΞ ", "  Δυσλεξία  ")).toEqual({ ok: true, code: "ΔΞ", label: "Δυσλεξία" });
  });

  it("collapses inner whitespace in the label", () => {
    expect(parseSpecialEdCodeInput("Χ", "α   β")).toEqual({ ok: true, code: "Χ", label: "α β" });
  });

  it("rejects empty or overlong codes", () => {
    expect(parseSpecialEdCodeInput("", "x")).toEqual({ ok: false, error: "code" });
    expect(parseSpecialEdCodeInput("Α".repeat(11), "x")).toEqual({ ok: false, error: "code" });
  });

  it("rejects empty or overlong labels", () => {
    expect(parseSpecialEdCodeInput("ΔΞ", "   ")).toEqual({ ok: false, error: "label" });
    expect(parseSpecialEdCodeInput("ΔΞ", "α".repeat(501))).toEqual({ ok: false, error: "label" });
  });
});
