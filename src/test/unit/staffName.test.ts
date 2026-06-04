import { describe, it, expect } from "vitest";
import { staffDisplayName, slotTeacherName } from "@/lib/staffName";

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
