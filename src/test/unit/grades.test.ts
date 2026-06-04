import { describe, it, expect } from "vitest";
import {
  parseGradePeriod,
  isGradePeriod,
  isValidGradeValue,
  parseGradeInput,
  gradeColorClass,
  GRADE_PERIODS,
  parseGradesUnlocked,
} from "@/lib/grades";

describe("grade periods", () => {
  it("recognises the grading periods", () => {
    expect(GRADE_PERIODS).toEqual(["TERM1", "TERM2"]);
    expect(isGradePeriod("TERM1")).toBe(true);
    expect(isGradePeriod("TERM2")).toBe(true);
    expect(isGradePeriod("FINAL")).toBe(false);
    expect(isGradePeriod("TERM3")).toBe(false);
    expect(isGradePeriod(undefined)).toBe(false);
  });

  it("defaults unknown values to TERM1", () => {
    expect(parseGradePeriod(undefined)).toBe("TERM1");
    expect(parseGradePeriod("bogus")).toBe("TERM1");
    expect(parseGradePeriod("TERM2")).toBe("TERM2");
  });
});

describe("isValidGradeValue", () => {
  it("accepts 0–20 inclusive", () => {
    expect(isValidGradeValue(0)).toBe(true);
    expect(isValidGradeValue(20)).toBe(true);
    expect(isValidGradeValue(13.5)).toBe(true);
  });
  it("rejects out-of-range and non-finite", () => {
    expect(isValidGradeValue(-1)).toBe(false);
    expect(isValidGradeValue(20.1)).toBe(false);
    expect(isValidGradeValue(NaN)).toBe(false);
    expect(isValidGradeValue(Infinity)).toBe(false);
  });
});

describe("parseGradeInput", () => {
  it("treats empty/whitespace as clearing the grade", () => {
    expect(parseGradeInput("")).toEqual({ ok: true, value: null });
    expect(parseGradeInput("   ")).toEqual({ ok: true, value: null });
  });
  it("parses valid numbers", () => {
    expect(parseGradeInput("15")).toEqual({ ok: true, value: 15 });
    expect(parseGradeInput(" 18.5 ")).toEqual({ ok: true, value: 18.5 });
    expect(parseGradeInput("0")).toEqual({ ok: true, value: 0 });
  });
  it("rejects invalid input", () => {
    expect(parseGradeInput("21")).toEqual({ ok: false });
    expect(parseGradeInput("-2")).toEqual({ ok: false });
    expect(parseGradeInput("abc")).toEqual({ ok: false });
  });
});

describe("gradeColorClass", () => {
  it("maps grade bands to colours", () => {
    expect(gradeColorClass(18)).toBe("text-green-700");
    expect(gradeColorClass(14)).toBe("text-emerald-700");
    expect(gradeColorClass(11)).toBe("text-amber-700");
    expect(gradeColorClass(8)).toBe("text-red-700");
  });
});

describe("parseGradesUnlocked", () => {
  it("defaults to all terms locked", () => {
    expect(parseGradesUnlocked(null)).toEqual({ TERM1: false, TERM2: false });
    expect(parseGradesUnlocked(undefined)).toEqual({ TERM1: false, TERM2: false });
    expect(parseGradesUnlocked("")).toEqual({ TERM1: false, TERM2: false });
  });

  it("reads the stored unlock flags", () => {
    expect(parseGradesUnlocked('{"TERM1":true,"TERM2":false}')).toEqual({ TERM1: true, TERM2: false });
    expect(parseGradesUnlocked('{"TERM1":true,"TERM2":true}')).toEqual({ TERM1: true, TERM2: true });
  });

  it("ignores junk values and unknown keys", () => {
    expect(parseGradesUnlocked('{"TERM1":"yes","TERM3":true}')).toEqual({ TERM1: false, TERM2: false });
    expect(parseGradesUnlocked("not json")).toEqual({ TERM1: false, TERM2: false });
  });
});
