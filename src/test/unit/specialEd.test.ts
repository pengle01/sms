import { describe, it, expect } from "vitest";
import {
  canManageSpecialEdRegister,
  canViewSpecialEdFull,
  cohortAccommodations,
  cohortCodes,
  filterCohort,
  parseSpecialEdCodeInput,
  parseSupportGroup,
  specialEdCodesSeeded,
  splitKnownCodes,
} from "@/lib/specialEd";
import { specialEdLegend } from "@/server/specialEd";
import type { Role } from "@/generated/prisma/client";

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

describe("canManageSpecialEdRegister", () => {
  it("allows the deputy responsible for special education", () => {
    expect(canManageSpecialEdRegister(["HEADTEACHER_B"], true)).toBe(true);
  });

  it("allows the headmaster and the system admin as a fallback", () => {
    expect(canManageSpecialEdRegister(["HEADMASTER"], false)).toBe(true);
    expect(canManageSpecialEdRegister(["SUPER_ADMIN"], false)).toBe(true);
  });

  it("does NOT allow the counselor, who may read the whole dossier", () => {
    // The register belongs to the deputy: an import rewrites codes for the
    // entire cohort, and reading it is not the same as owning it.
    expect(canViewSpecialEdFull(["STUDENT_COUNSELOR"], false)).toBe(true);
    expect(canManageSpecialEdRegister(["STUDENT_COUNSELOR"], false)).toBe(false);
  });

  it("does not allow a deputy without the designation, or a plain teacher", () => {
    expect(canManageSpecialEdRegister(["HEADTEACHER_B"], false)).toBe(false);
    expect(canManageSpecialEdRegister(["HEADTEACHER_A"], false)).toBe(false);
    expect(canManageSpecialEdRegister(["TEACHER"], false)).toBe(false);
    expect(canManageSpecialEdRegister([], false)).toBe(false);
  });
});

describe("filterCohort", () => {
  const rows = [
    { name: "Ανδρέου Μαρία", registryNo: "1001", grade: 1, group: "ΕΓ1", problemCodes: ["ΔΑΦ", "ΓΜΔ"], accommodationCodes: ["1", "10"] },
    { name: "Γεωργίου Νίκος", registryNo: "1002", grade: 2, group: "ΘΒΣ2", problemCodes: ["ΔΕΠ/Υ"], accommodationCodes: ["2"] },
    { name: "Παπαδόπουλος Ηλίας", registryNo: "1003", grade: 1, group: "ΕΔ1", problemCodes: [], accommodationCodes: [] },
  ];

  it("returns everything when nothing is set", () => {
    expect(filterCohort(rows, {})).toHaveLength(3);
  });

  it("filters by year", () => {
    expect(filterCohort(rows, { grade: 1 }).map((r) => r.registryNo)).toEqual(["1001", "1003"]);
    expect(filterCohort(rows, { grade: 3 })).toEqual([]);
  });

  it("filters by problem code, and a student with none never matches one", () => {
    expect(filterCohort(rows, { code: "ΔΑΦ" }).map((r) => r.registryNo)).toEqual(["1001"]);
    expect(filterCohort(rows, { code: "ΓΜΔ" }).map((r) => r.registryNo)).toEqual(["1001"]);
    expect(filterCohort(rows, { code: "ΔΕΠ/Υ" }).map((r) => r.registryNo)).toEqual(["1002"]);
  });

  it("searches the name accent- and case-insensitively", () => {
    expect(filterCohort(rows, { q: "ανδρεου" }).map((r) => r.registryNo)).toEqual(["1001"]);
    expect(filterCohort(rows, { q: "ΜΑΡΙΑ" }).map((r) => r.registryNo)).toEqual(["1001"]);
  });

  it("searches the registry number too", () => {
    expect(filterCohort(rows, { q: "1002" }).map((r) => r.name)).toEqual(["Γεωργίου Νίκος"]);
  });

  it("filters by accommodation (διευκόλυνση)", () => {
    expect(filterCohort(rows, { accommodation: "10" }).map((r) => r.registryNo)).toEqual(["1001"]);
    expect(filterCohort(rows, { accommodation: "2" }).map((r) => r.registryNo)).toEqual(["1002"]);
    expect(filterCohort(rows, { accommodation: "18" })).toEqual([]);
  });

  it("does not confuse accommodation 1 with 10", () => {
    // Codes are strings "1".."18"; a prefix match would fold these together.
    expect(filterCohort(rows, { accommodation: "1" }).map((r) => r.registryNo)).toEqual(["1001"]);
    expect(filterCohort([rows[1]!], { accommodation: "1" })).toEqual([]);
  });

  it("combines filters", () => {
    expect(filterCohort(rows, { grade: 1, code: "ΔΑΦ" }).map((r) => r.registryNo)).toEqual(["1001"]);
    expect(filterCohort(rows, { grade: 2, code: "ΔΑΦ" })).toEqual([]);
    expect(filterCohort(rows, { code: "ΔΑΦ", accommodation: "10" }).map((r) => r.registryNo)).toEqual(["1001"]);
    expect(filterCohort(rows, { code: "ΔΕΠ/Υ", accommodation: "10" })).toEqual([]);
  });

  it("ignores a blank or whitespace-only search", () => {
    expect(filterCohort(rows, { q: "   " })).toHaveLength(3);
    expect(filterCohort(rows, { q: "" })).toHaveLength(3);
  });
});

describe("cohortCodes", () => {
  it("lists the distinct codes present, sorted", () => {
    expect(
      cohortCodes([
        { name: "a", registryNo: "1", grade: 1, group: null, problemCodes: ["ΔΑΦ", "ΓΜΔ"], accommodationCodes: [] },
        { name: "b", registryNo: "2", grade: 1, group: null, problemCodes: ["ΓΜΔ"], accommodationCodes: [] },
        { name: "c", registryNo: "3", grade: 1, group: null, problemCodes: [], accommodationCodes: [] },
      ]),
    ).toEqual(["ΓΜΔ", "ΔΑΦ"]);
  });

  it("is empty for an empty cohort", () => {
    expect(cohortCodes([])).toEqual([]);
  });
});

describe("cohortAccommodations", () => {
  const row = (codes: string[]) => ({
    name: "x", registryNo: "1", grade: 1, group: null, problemCodes: [], accommodationCodes: codes,
  });

  it("sorts numerically, not lexically", () => {
    // "10" must not come before "2".
    expect(cohortAccommodations([row(["10", "2"]), row(["1"])])).toEqual(["1", "2", "10"]);
  });

  it("lists each code once and copes with an empty cohort", () => {
    expect(cohortAccommodations([row(["3"]), row(["3"])])).toEqual(["3"]);
    expect(cohortAccommodations([])).toEqual([]);
  });
});

describe("special-ed read vs write, in one place", () => {
  // The counselor reads the whole dossier and changes none of it. These two
  // predicates are the entire boundary, so pin them against each other.
  const cases: { who: string; roles: Role[]; deputy: boolean; view: boolean; write: boolean }[] = [
    { who: "special-ed deputy",      roles: ["HEADTEACHER_B"],     deputy: true,  view: true,  write: true },
    { who: "counselor",              roles: ["STUDENT_COUNSELOR"], deputy: false, view: true,  write: false },
    { who: "headmaster",             roles: ["HEADMASTER"],        deputy: false, view: true,  write: true },
    { who: "system admin",           roles: ["SUPER_ADMIN"],       deputy: false, view: true,  write: true },
    { who: "deputy without the flag", roles: ["HEADTEACHER_B"],    deputy: false, view: false, write: false },
    { who: "plain teacher",          roles: ["TEACHER"],           deputy: false, view: false, write: false },
  ];

  for (const c of cases) {
    it(`${c.who}: view=${c.view} write=${c.write}`, () => {
      expect(canViewSpecialEdFull(c.roles, c.deputy)).toBe(c.view);
      expect(canManageSpecialEdRegister(c.roles, c.deputy)).toBe(c.write);
    });
  }

  it("never grants write without read", () => {
    for (const c of cases) if (c.write) expect(c.view).toBe(true);
  });
});
