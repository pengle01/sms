import { describe, it, expect } from "vitest";
import {
  DDK_CATALOG,
  CONVERTIBLE_CATALOG,
  findDdkCategory,
  ddkCategoryLabel,
  defaultPoints,
  pointsBounds,
  clampPoints,
  pointSpecLabel,
  pointSpecReasoning,
  ddkTotal,
  ddkRating,
  schoolYearLabel,
  summarizeBySection,
  fullAttendanceAward,
  FULL_ATTENDANCE_CODE,
} from "@/lib/ddk";

describe("ΔΔΚ catalog", () => {
  it("has unique category codes", () => {
    const codes = DDK_CATALOG.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("only uses known section keys", () => {
    const known = new Set(["A", "B", "C", "D", "E", "Z", "H", "T"]);
    for (const c of DDK_CATALOG) expect(known.has(c.section)).toBe(true);
  });

  it("finds a category by code", () => {
    expect(findDdkCategory("A4a")?.label).toContain("Πρωταγωνιστικός");
    expect(findDdkCategory("nope")).toBeUndefined();
  });

  it("falls back to the raw code for an unknown label", () => {
    expect(ddkCategoryLabel("A4a")).toContain("Θέατρο");
    expect(ddkCategoryLabel("xyz")).toBe("xyz");
  });
});

describe("defaultPoints", () => {
  it("uses the fixed value", () => {
    expect(defaultPoints({ kind: "fixed", value: 3 })).toBe(3);
  });
  it("uses the minimum of a range", () => {
    expect(defaultPoints({ kind: "range", min: 1, max: 3 })).toBe(1);
  });
  it("uses the per-participation value", () => {
    expect(defaultPoints({ kind: "per", value: 1 })).toBe(1);
  });
});

describe("pointsBounds", () => {
  it("pins fixed specs to a single value", () => {
    expect(pointsBounds({ kind: "fixed", value: 2 })).toEqual({ min: 2, max: 2 });
  });
  it("returns range bounds", () => {
    expect(pointsBounds({ kind: "range", min: 2, max: 5 })).toEqual({ min: 2, max: 5 });
  });
  it("pins per-participation to its value (only the guide's points allowed)", () => {
    expect(pointsBounds({ kind: "per", value: 1 })).toEqual({ min: 1, max: 1 });
  });
});

describe("clampPoints", () => {
  const range = { kind: "range" as const, min: 1, max: 3 };
  it("clamps below the minimum", () => {
    expect(clampPoints(range, 0)).toBe(1);
  });
  it("clamps above the maximum", () => {
    expect(clampPoints(range, 9)).toBe(3);
  });
  it("keeps a value inside the range", () => {
    expect(clampPoints(range, 2)).toBe(2);
  });
  it("forces a fixed spec to its value regardless of input", () => {
    expect(clampPoints({ kind: "fixed", value: 2 }, 5)).toBe(2);
  });
  it("pins a per-participation spec to its value", () => {
    expect(clampPoints({ kind: "per", value: 1 }, 4)).toBe(1);
  });
  it("rounds and floors non-finite input to the minimum", () => {
    expect(clampPoints(range, NaN)).toBe(1);
    expect(clampPoints(range, 2.4)).toBe(2);
  });
});

describe("pointSpecLabel", () => {
  it("renders fixed, range and per specs", () => {
    expect(pointSpecLabel({ kind: "fixed", value: 2 })).toBe("2");
    expect(pointSpecLabel({ kind: "range", min: 1, max: 3 })).toBe("1-3");
    expect(pointSpecLabel({ kind: "per", value: 1 })).toBe("1 ανά συμμετοχή");
  });
});

describe("pointSpecReasoning", () => {
  it("explains fixed points", () => {
    expect(pointSpecReasoning({ kind: "fixed", value: 1 })).toContain("Σταθερές 1 μονάδα");
    expect(pointSpecReasoning({ kind: "fixed", value: 3 })).toContain("3 μονάδες");
  });
  it("explains per-participation points", () => {
    expect(pointSpecReasoning({ kind: "per", value: 1 })).toContain("για κάθε συμμετοχή");
  });
  it("explains ranges with the ανάλογα reasoning", () => {
    const r = pointSpecReasoning({ kind: "range", min: 1, max: 3 });
    expect(r).toContain("Από 1 έως 3");
    expect(r).toContain("ανάλογα");
  });
});

describe("ddkTotal", () => {
  it("sums points", () => {
    expect(ddkTotal([{ points: 2 }, { points: 3 }])).toBe(5);
  });
  it("is zero for no awards", () => {
    expect(ddkTotal([])).toBe(0);
  });
});

describe("ddkRating", () => {
  it("returns empty for zero or negative", () => {
    expect(ddkRating(0)).toBe("");
    expect(ddkRating(-1)).toBe("");
  });
  it("maps totals to the guide's bands", () => {
    expect(ddkRating(1)).toBe("Μέτρια");
    expect(ddkRating(3)).toBe("Μέτρια");
    expect(ddkRating(4)).toBe("Ικανοποιητική");
    expect(ddkRating(6)).toBe("Ικανοποιητική");
    expect(ddkRating(7)).toBe("Καλή");
    expect(ddkRating(9)).toBe("Καλή");
    expect(ddkRating(10)).toBe("Πολύ καλή");
    expect(ddkRating(13)).toBe("Πολύ καλή");
    expect(ddkRating(14)).toBe("Πάρα πολύ καλή");
    expect(ddkRating(18)).toBe("Πάρα πολύ καλή");
    expect(ddkRating(19)).toBe("Εξαιρετική");
    expect(ddkRating(40)).toBe("Εξαιρετική");
  });
});

describe("schoolYearLabel", () => {
  it("formats the start year as a span", () => {
    expect(schoolYearLabel(2025)).toBe("2025-2026");
  });
});

describe("CONVERTIBLE_CATALOG", () => {
  it("excludes auto-only categories (Πλήρης Φοίτηση)", () => {
    expect(CONVERTIBLE_CATALOG.some((c) => c.code === FULL_ATTENDANCE_CODE)).toBe(false);
    expect(CONVERTIBLE_CATALOG.every((c) => !c.autoOnly)).toBe(true);
  });
  it("is smaller than the full catalog", () => {
    expect(CONVERTIBLE_CATALOG.length).toBeLessThan(DDK_CATALOG.length);
  });
});

describe("fullAttendanceAward", () => {
  it("awards 2 points below the 24-absence threshold", () => {
    const a = fullAttendanceAward(0);
    expect(a).not.toBeNull();
    expect(a!.points).toBe(2);
    expect(a!.categoryCode).toBe(FULL_ATTENDANCE_CODE);
  });
  it("returns null at or above the threshold", () => {
    expect(fullAttendanceAward(24)).toBeNull();
    expect(fullAttendanceAward(30)).toBeNull();
  });
  it("awards just under the threshold", () => {
    expect(fullAttendanceAward(23)?.points).toBe(2);
  });
  it("pluralises the absence note", () => {
    expect(fullAttendanceAward(1)?.note).toBe("1 απουσία");
    expect(fullAttendanceAward(5)?.note).toBe("5 απουσίες");
  });
});

describe("summarizeBySection", () => {
  it("groups awards by section in catalog order and totals each", () => {
    const summary = summarizeBySection([
      { categoryCode: "A4a", points: 3 },
      { categoryCode: "H2a", points: 2 },
      { categoryCode: "A5", points: 1 },
    ]);
    expect(summary.map((s) => s.section.key)).toEqual(["A", "H"]);
    expect(summary[0]!.points).toBe(4); // A4a + A5
    expect(summary[1]!.points).toBe(2); // H2a
  });

  it("omits sections with no awards", () => {
    const summary = summarizeBySection([{ categoryCode: "Z1a", points: 2 }]);
    expect(summary).toHaveLength(1);
    expect(summary[0]!.section.key).toBe("Z");
  });
});
