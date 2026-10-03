import { describe, it, expect } from "vitest";
import {
  parseMissingFilter,
  homegroupWhere,
  isHomegroupWhere,
  groupRemoval,
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
        { students: { some: { user: { isActive: true } } } },
        { homeroomTeacherId: { not: null } },
        { homeroomHeadteacherId: { not: null } },
        { counselorId: { not: null } },
      ],
    });
  });
});

describe("groupRemoval", () => {
  const unused = {
    activeStudents: 0, inactiveStudents: 0, studentGroups: 0, courseAssignments: 0, timetableSlots: 0,
    referrals: 0, referralStudents: 0, testSchedules: 0, substitutionRequests: 0,
    substitutionPlanEntries: 0, toiletBreaks: 0, attendanceExports: 0, intercalaryAttendance: 0,
  };

  it("deletes a group nothing points at", () => {
    expect(groupRemoval(unused)).toBe("delete");
  });

  it("refuses a class with active students", () => {
    expect(groupRemoval({ ...unused, activeStudents: 3 })).toBe("refuse");
  });

  it("only clears homegroup staff when anything else still uses it", () => {
    expect(groupRemoval({ ...unused, inactiveStudents: 12 })).toBe("unassign");
    expect(groupRemoval({ ...unused, timetableSlots: 1 })).toBe("unassign");
    expect(groupRemoval({ ...unused, referralStudents: 1 })).toBe("unassign");
    expect(groupRemoval({ ...unused, intercalaryAttendance: 1 })).toBe("unassign");
  });
});
