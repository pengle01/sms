import { describe, it, expect } from "vitest";
import {
  homegroupMeeting,
  shownPeriod,
  storedPeriodAt,
  isMeetingRow,
  isLessonCancelled,
  rowsForDay,
} from "@/lib/homegroupPeriod";
import { homegroupRegisterDue } from "@/lib/attendanceLock";

describe("homegroup periods", () => {
  const insert = homegroupMeeting("INTERCALARY", 4)!;
  const replace = homegroupMeeting("HOMEGROUP_PERIOD", 4)!;

  it("recognises the two kinds of day, and nothing else", () => {
    expect(insert).toEqual({ period: 4, mode: "insert" });
    expect(replace).toEqual({ period: 4, mode: "replace" });
    expect(homegroupMeeting("INTERCALARY", null)).toEqual({ period: 8, mode: "insert" });
    expect(homegroupMeeting("EXCURSION", 1)).toBeNull();
    expect(homegroupMeeting(null, null)).toBeNull();
  });

  it("insert mode shifts lessons at and after the meeting period", () => {
    expect([1, 3, 4, 7].map((p) => shownPeriod(p, insert))).toEqual([1, 3, 5, 8]);
    expect([1, 3, 5, 8].map((p) => storedPeriodAt(p, insert))).toEqual([1, 3, 4, 7]);
    expect(isLessonCancelled(4, insert)).toBe(false);
  });

  it("replace mode cancels only the meeting period and shifts nothing", () => {
    expect([1, 4, 7].map((p) => shownPeriod(p, replace))).toEqual([1, 4, 7]);
    expect(isLessonCancelled(4, replace)).toBe(true);
    expect(isLessonCancelled(5, replace)).toBe(false);
  });

  it("finds the meeting row", () => {
    expect(isMeetingRow(4, insert)).toBe(true);
    expect(isMeetingRow(5, insert)).toBe(false);
    expect(isMeetingRow(4, null)).toBe(false);
  });

  it("counts rows so the last lesson is never dropped", () => {
    expect(rowsForDay(7, insert)).toBe(8); // P7 moves to row 8
    expect(rowsForDay(3, insert)).toBe(4); // lessons end before the meeting
    expect(rowsForDay(7, replace)).toBe(7);
    expect(rowsForDay(3, homegroupMeeting("HOMEGROUP_PERIOD", 6))).toBe(6);
    expect(rowsForDay(0, insert)).toBe(4);
    expect(rowsForDay(7, null)).toBe(7);
  });
});

describe("homegroupRegisterDue", () => {
  it("is owed until someone takes it, and not by an absent teacher", () => {
    expect(homegroupRegisterDue({ hasHomegroupRegister: true, alreadyMarked: false, teacherAbsent: false })).toBe(true);
    expect(homegroupRegisterDue({ hasHomegroupRegister: true, alreadyMarked: true, teacherAbsent: false })).toBe(false);
    expect(homegroupRegisterDue({ hasHomegroupRegister: true, alreadyMarked: false, teacherAbsent: true })).toBe(false);
    expect(homegroupRegisterDue({ hasHomegroupRegister: false, alreadyMarked: false, teacherAbsent: false })).toBe(false);
  });
});
