import { describe, it, expect } from "vitest";
import { slotTeacherName, staffAuthorLabel, staffDisplayName } from "@/lib/staffName";

describe("staffDisplayName", () => {
  it("prefers the schedule coding over the account name", () => {
    expect(
      staffDisplayName({ scheduleName: "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ", user: { name: "ΜΑΣΙΑ Μ." } })
    ).toBe("ΗΥ-ΜΑΣΙΑ Μ. ΒΔ");
  });

  it("falls back to the account name when there is no schedule coding", () => {
    expect(staffDisplayName({ scheduleName: null, user: { name: "Sokratis" } })).toBe("Sokratis");
    expect(staffDisplayName({ user: { name: "Sokratis" } })).toBe("Sokratis");
  });

  it("falls back to the placeholder when nothing is known", () => {
    expect(staffDisplayName(null)).toBe("—");
    expect(staffDisplayName(undefined)).toBe("—");
    expect(staffDisplayName({ scheduleName: null, user: null })).toBe("—");
    expect(staffDisplayName({ user: { name: null } }, "?")).toBe("?");
  });
});

describe("slotTeacherName", () => {
  it("prefers the linked profile's schedule coding", () => {
    expect(
      slotTeacherName({
        staffName: "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ",
        staff: { scheduleName: "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ", user: { name: "ΜΑΣΙΑ Μ." } },
      })
    ).toBe("ΗΥ-ΜΑΣΙΑ Μ. ΒΔ");
  });

  it("uses the raw imported coding for unlinked slots", () => {
    expect(slotTeacherName({ staffName: "Θ-ΚΟΥΝΟΥΣΙΗΣ Γ.", staff: null })).toBe("Θ-ΚΟΥΝΟΥΣΙΗΣ Γ.");
  });

  it("falls back to the account name, then the placeholder", () => {
    expect(slotTeacherName({ staffName: null, staff: { user: { name: "Sokratis" } } })).toBe("Sokratis");
    expect(slotTeacherName({ staffName: null, staff: null })).toBe("—");
  });
});

describe("staffAuthorLabel", () => {
  const OFFICE = "Γραμματεία";

  it("signs the office as an institution, not a person", () => {
    expect(staffAuthorLabel({ role: "SCHOOL_ADMIN", name: "Μαρία Π." }, OFFICE)).toBe(OFFICE);
  });

  it("ignores a schedule name the office should not have anyway", () => {
    expect(staffAuthorLabel({ role: "SCHOOL_ADMIN", name: "Μαρία Π.", scheduleName: "Γ-ΠΑΠΑ Μ." }, OFFICE))
      .toBe(OFFICE);
  });

  it("prefers the schedule coding for an educator", () => {
    expect(staffAuthorLabel({ role: "HEADTEACHER_B", name: "Marina Masia", scheduleName: "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ" }, OFFICE))
      .toBe("ΗΥ-ΜΑΣΙΑ Μ. ΒΔ");
  });

  it("falls back to the account name, then the fallback", () => {
    expect(staffAuthorLabel({ role: "TEACHER", name: "Άννα Κ." }, OFFICE)).toBe("Άννα Κ.");
    expect(staffAuthorLabel({ role: "TEACHER" }, OFFICE)).toBe("—");
    expect(staffAuthorLabel(null, OFFICE)).toBe("—");
  });
});
