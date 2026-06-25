import { describe, it, expect } from "vitest";
import {
  parseAttendanceLock,
  attendanceLockStartIso,
  schoolWeekdaysBetween,
  addDaysIso,
  DEFAULT_ATTENDANCE_LOCK,
} from "@/lib/attendanceLock";

describe("parseAttendanceLock", () => {
  it("returns the disabled default for empty/garbage input", () => {
    expect(parseAttendanceLock(null)).toEqual(DEFAULT_ATTENDANCE_LOCK);
    expect(parseAttendanceLock("")).toEqual(DEFAULT_ATTENDANCE_LOCK);
    expect(parseAttendanceLock("{not json")).toEqual(DEFAULT_ATTENDANCE_LOCK);
  });

  it("reads enabled + a valid window", () => {
    expect(parseAttendanceLock('{"enabled":true,"window":"term"}')).toEqual({ enabled: true, window: "term" });
  });

  it("coerces enabled to a strict boolean and falls back on an unknown window", () => {
    expect(parseAttendanceLock('{"enabled":1,"window":"decade"}')).toEqual({ enabled: false, window: "week" });
    expect(parseAttendanceLock('{"enabled":true}')).toEqual({ enabled: true, window: "week" });
  });
});

describe("attendanceLockStartIso", () => {
  const today = "2026-03-16";
  it("uses the year/term boundaries", () => {
    expect(attendanceLockStartIso("year", today, "2025-09-01", "2026-02-01")).toBe("2025-09-01");
    expect(attendanceLockStartIso("term", today, "2025-09-01", "2026-02-01")).toBe("2026-02-01");
  });
  it("looks back 7 days for day/week", () => {
    expect(attendanceLockStartIso("week", today, "2025-09-01", "2026-02-01")).toBe("2026-03-09");
    expect(attendanceLockStartIso("day", today, "2025-09-01", "2026-02-01")).toBe("2026-03-09");
  });
});

describe("schoolWeekdaysBetween", () => {
  it("lists Mon–Fri and excludes the end date", () => {
    // 2026-03-09 is a Monday; end 2026-03-16 (Mon) is excluded
    expect(schoolWeekdaysBetween("2026-03-09", "2026-03-16")).toEqual([
      "2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13",
    ]);
  });
  it("drops weekends", () => {
    // 2026-03-14 Sat, 2026-03-15 Sun
    expect(schoolWeekdaysBetween("2026-03-14", "2026-03-17")).toEqual(["2026-03-16"]);
  });
  it("returns empty when start is not before end", () => {
    expect(schoolWeekdaysBetween("2026-03-16", "2026-03-16")).toEqual([]);
    expect(schoolWeekdaysBetween("2026-03-20", "2026-03-16")).toEqual([]);
  });
});

describe("addDaysIso", () => {
  it("crosses month boundaries in UTC", () => {
    expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });
});
