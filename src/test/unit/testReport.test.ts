import { describe, it, expect } from "vitest";
import {
  gradeBand, gradeBands, testDurationMinutes, gradingStatus, testGradeAccess, averageGrade,
} from "@/lib/testReport";

describe("gradeBand", () => {
  it("puts whole grades in their band", () => {
    expect(gradeBand(0)).toBe("1-9");
    expect(gradeBand(9)).toBe("1-9");
    expect(gradeBand(10)).toBe("10-12");
    expect(gradeBand(12)).toBe("10-12");
    expect(gradeBand(15)).toBe("13-15");
    expect(gradeBand(18)).toBe("16-18");
    expect(gradeBand(19)).toBe("19-20");
    expect(gradeBand(20)).toBe("19-20");
  });

  it("rounds half grades up", () => {
    expect(gradeBand(9.5)).toBe("10-12");
    expect(gradeBand(12.5)).toBe("13-15");
    expect(gradeBand(15.5)).toBe("16-18");
    expect(gradeBand(18.5)).toBe("19-20");
    expect(gradeBand(8.5)).toBe("1-9");
  });
});

describe("gradeBands", () => {
  it("counts per band and ignores blanks", () => {
    const r = gradeBands([5, 9.5, 11, null, 14, undefined, 17, 20, 19.5]);
    expect(r.counts).toEqual({ "1-9": 1, "10-12": 2, "13-15": 1, "16-18": 1, "19-20": 2 });
    expect(r.total).toBe(7);
  });

  it("is all zero for no grades", () => {
    expect(gradeBands([]).total).toBe(0);
    expect(gradeBands([null]).counts["1-9"]).toBe(0);
  });
});

describe("testDurationMinutes", () => {
  it("is 20 for a small test and 45 per period for a big one", () => {
    expect(testDurationMinutes("SMALL", 1)).toBe(20);
    expect(testDurationMinutes("BIG", 1)).toBe(45);
    expect(testDurationMinutes("BIG", 2)).toBe(90);
  });
});

describe("gradingStatus", () => {
  it("says nothing before the test", () => {
    expect(gradingStatus(0, 20, false)).toEqual({ kind: "upcoming" });
  });
  it("reports none, partial and done", () => {
    expect(gradingStatus(0, 20, true)).toEqual({ kind: "none" });
    expect(gradingStatus(12, 20, true)).toEqual({ kind: "partial", graded: 12, total: 20 });
    expect(gradingStatus(20, 20, true)).toEqual({ kind: "done", graded: 20, total: 20 });
  });
});

describe("testGradeAccess", () => {
  const students = [
    { id: "s1", groupId: "A1" },
    { id: "s2", groupId: "A2" },
    { id: "s3", groupId: null },
  ];
  it("gives the owner full access", () => {
    expect(testGradeAccess({ viewerStaffId: "t", testStaffId: "t", headGroupIds: [], students })).toEqual({ mode: "owner" });
  });
  it("gives a deputy only their homegroups' students", () => {
    expect(testGradeAccess({ viewerStaffId: "d", testStaffId: "t", headGroupIds: ["A2", "B9"], students }))
      .toEqual({ mode: "deputy", studentIds: ["s2"] });
  });
  it("refuses a deputy of an unrelated homegroup", () => {
    expect(testGradeAccess({ viewerStaffId: "d", testStaffId: "t", headGroupIds: ["B9"], students })).toEqual({ mode: "none" });
  });
  it("refuses a plain teacher", () => {
    expect(testGradeAccess({ viewerStaffId: "x", testStaffId: "t", headGroupIds: [], students })).toEqual({ mode: "none" });
  });
});

describe("averageGrade", () => {
  it("averages non-blank values to one decimal", () => {
    expect(averageGrade([10, 15, null, 12])).toBe(12.3);
    expect(averageGrade([null])).toBeNull();
  });
});
