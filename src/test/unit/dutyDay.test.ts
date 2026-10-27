import { describe, it, expect } from "vitest";
import {
  parseDutyDay,
  dutyDayMode,
  shiftSchoolDay,
  parseDutyView,
  permitSearchRange,
  permitStudentWhere,
} from "@/lib/dutyDay";

const TODAY = "2026-10-27"; // a Tuesday

describe("duty day", () => {
  it("parses a real day and falls back to today", () => {
    expect(parseDutyDay("2026-10-20", TODAY)).toBe("2026-10-20");
    expect(parseDutyDay("2026-02-30", TODAY)).toBe(TODAY);
    expect(parseDutyDay("20/10/26", TODAY)).toBe(TODAY);
    expect(parseDutyDay(undefined, TODAY)).toBe(TODAY);
  });

  it("tells today, past and future apart", () => {
    expect(dutyDayMode(TODAY, TODAY)).toBe("today");
    expect(dutyDayMode("2026-10-26", TODAY)).toBe("past");
    expect(dutyDayMode("2026-10-28", TODAY)).toBe("future");
  });

  it("steps over weekends", () => {
    expect(shiftSchoolDay("2026-10-26", -1)).toBe("2026-10-23"); // Mon → Fri
    expect(shiftSchoolDay("2026-10-23", 1)).toBe("2026-10-26"); // Fri → Mon
    expect(shiftSchoolDay(TODAY, 1)).toBe("2026-10-28");
  });

  it("reads the open tab, including the older tab= links", () => {
    expect(parseDutyView("toilet")).toBe("toilet");
    expect(parseDutyView(undefined, "plan")).toBe("plan");
    expect(parseDutyView(undefined, "name")).toBeUndefined();
    expect(parseDutyView("bogus")).toBeUndefined();
  });
});

describe("permit search", () => {
  it("defaults to the last 30 days", () => {
    expect(permitSearchRange(undefined, undefined, TODAY)).toEqual({ from: "2026-09-27", to: TODAY });
  });

  it("keeps a given range and puts it in order", () => {
    expect(permitSearchRange("2026-09-01", "2026-09-30", TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(permitSearchRange("2026-09-30", "2026-09-01", TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("matches by name or registry number, former students too", () => {
    expect(permitStudentWhere("  ")).toBeNull();
    expect(permitStudentWhere(" 1234 ")).toEqual({
      OR: [
        { user: { name: { contains: "1234", mode: "insensitive" } } },
        { studentId: { contains: "1234", mode: "insensitive" } },
      ],
    });
  });
});
