import { describe, it, expect } from "vitest";
import {
  parseMissingFilter,
  homegroupWhere,
  isHomegroupWhere,
} from "@/lib/homegroupFilter";

describe("parseMissingFilter", () => {
  it("accepts the known filter values", () => {
    expect(parseMissingFilter("teacher")).toBe("teacher");
    expect(parseMissingFilter("headteacher")).toBe("headteacher");
    expect(parseMissingFilter("counselor")).toBe("counselor");
    expect(parseMissingFilter("any")).toBe("any");
  });

  it("returns null for unknown or empty values", () => {
    expect(parseMissingFilter("")).toBe(null);
    expect(parseMissingFilter(undefined)).toBe(null);
    expect(parseMissingFilter("bogus")).toBe(null);
  });
});

describe("homegroupWhere", () => {
  it("filters by a specific staff member", () => {
    expect(homegroupWhere({ teacher: "st_1", missing: null })).toEqual({
      homeroomTeacherId: "st_1",
    });
    expect(homegroupWhere({ counselor: "st_2", missing: null })).toEqual({
      counselorId: "st_2",
    });
  });

  it("builds an OR of nulls for missing=any", () => {
    expect(homegroupWhere({ missing: "any" })).toEqual({
      OR: [
        { homeroomTeacherId: null },
        { homeroomHeadteacherId: null },
        { counselorId: null },
      ],
    });
  });

  it("filters a single missing role", () => {
    expect(homegroupWhere({ missing: "teacher" })).toEqual({ homeroomTeacherId: null });
    expect(homegroupWhere({ missing: "headteacher" })).toEqual({ homeroomHeadteacherId: null });
    expect(homegroupWhere({ missing: "counselor" })).toEqual({ counselorId: null });
  });

  it("combines a staff filter with a missing filter (AND semantics)", () => {
    expect(homegroupWhere({ teacher: "st_1", missing: "counselor" })).toEqual({
      homeroomTeacherId: "st_1",
      counselorId: null,
    });
  });

  it("is empty with no filters", () => {
    expect(homegroupWhere({ missing: null })).toEqual({});
  });
});

describe("isHomegroupWhere", () => {
  it("matches groups with homeroom students or any homeroom staff", () => {
    expect(isHomegroupWhere()).toEqual({
      OR: [
        { students: { some: {} } },
        { homeroomTeacherId: { not: null } },
        { homeroomHeadteacherId: { not: null } },
        { counselorId: { not: null } },
      ],
    });
  });
});
