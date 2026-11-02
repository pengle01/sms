import { describe, it, expect } from "vitest";
import { weeklyOccurrences, buildActivityIndex, activityForAbsence } from "@/lib/activities";

describe("weeklyOccurrences", () => {
  it("returns just the start date when there is no repeat-until", () => {
    expect(weeklyOccurrences("2026-03-16", null)).toEqual(["2026-03-16"]);
  });

  it("returns just the start date when until is before the start", () => {
    expect(weeklyOccurrences("2026-03-16", "2026-03-09")).toEqual(["2026-03-16"]);
  });

  it("returns just the start date when until equals the start", () => {
    expect(weeklyOccurrences("2026-03-16", "2026-03-16")).toEqual(["2026-03-16"]);
  });

  it("steps weekly on the same weekday, inclusive of the end", () => {
    expect(weeklyOccurrences("2026-03-16", "2026-04-06")).toEqual([
      "2026-03-16",
      "2026-03-23",
      "2026-03-30",
      "2026-04-06",
    ]);
  });

  it("stops before an end date that falls mid-week", () => {
    expect(weeklyOccurrences("2026-03-16", "2026-03-31")).toEqual([
      "2026-03-16",
      "2026-03-23",
      "2026-03-30",
    ]);
  });
});

import { conflictsForSelection } from "@/lib/activities";

describe("conflictsForSelection", () => {
  const tests = [
    { id: "t1", courseName: "Μαθηματικά", groupName: "Α1", staffName: "ΠΑΠΑΣ", type: "BIG" as const, periodLabel: "P3", studentIds: ["s1", "s2", "s3"] },
    { id: "t2", courseName: "Φυσική", groupName: "Β2", staffName: null, type: "SMALL" as const, periodLabel: "P4", studentIds: ["s9"] },
  ];

  it("counts only the selected students a test concerns", () => {
    expect(conflictsForSelection(tests, ["s1", "s3", "s7"])).toEqual([
      { id: "t1", courseName: "Μαθηματικά", groupName: "Α1", staffName: "ΠΑΠΑΣ", type: "BIG", periodLabel: "P3", affectedCount: 2 },
    ]);
  });

  it("lists every test some selected student sits", () => {
    expect(conflictsForSelection(tests, ["s2", "s9"]).map((t) => [t.id, t.affectedCount])).toEqual([
      ["t1", 1],
      ["t2", 1],
    ]);
  });

  it("is empty when nobody is selected", () => {
    expect(conflictsForSelection(tests, [])).toEqual([]);
  });
});

import { copyDefaults } from "@/lib/activities";

describe("copyDefaults", () => {
  const source = { name: "Χορωδία", startPeriod: 6, endPeriod: 7, location: "Αίθουσα Μουσικής" };

  it("uses the copied activity when the URL is empty", () => {
    expect(copyDefaults(source, {})).toEqual({ name: "Χορωδία", startPeriod: "6", endPeriod: "7", location: "Αίθουσα Μουσικής" });
  });

  it("lets confirmed URL values win", () => {
    expect(copyDefaults(source, { name: "Χορωδία Β", startPeriod: "3" })).toEqual({
      name: "Χορωδία Β",
      startPeriod: "3",
      endPeriod: "7",
      location: "Αίθουσα Μουσικής",
    });
  });

  it("gives the plain values without a source", () => {
    expect(copyDefaults(null, {})).toEqual({ name: undefined, startPeriod: undefined, endPeriod: undefined, location: undefined });
  });

  it("never carries a date", () => {
    expect(Object.keys(copyDefaults(source, {}))).not.toContain("date");
  });
});

describe("absences due to an activity", () => {
  const index = buildActivityIndex([
    { name: "Εκδρομή", date: new Date("2026-03-16T00:00:00.000Z"), startPeriod: 3, endPeriod: 5, studentIds: ["s1", "s2"] },
    { name: "Αγώνας", date: "2026-03-16", startPeriod: 1, endPeriod: 2, studentIds: ["s1"] },
  ]);

  it("matches an absence inside the activity's periods", () => {
    expect(activityForAbsence(index, "s1", "2026-03-16", 4)).toBe("Εκδρομή");
    expect(activityForAbsence(index, "s2", "2026-03-16", 3)).toBe("Εκδρομή");
    expect(activityForAbsence(index, "s1", "2026-03-16", 1)).toBe("Αγώνας");
  });

  it("does not match another period, day or student, or a row without a period", () => {
    expect(activityForAbsence(index, "s2", "2026-03-16", 6)).toBeNull();
    expect(activityForAbsence(index, "s1", "2026-03-17", 4)).toBeNull();
    expect(activityForAbsence(index, "s3", "2026-03-16", 4)).toBeNull();
    expect(activityForAbsence(index, "s1", "2026-03-16", null)).toBeNull();
  });
});
