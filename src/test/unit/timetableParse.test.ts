import { describe, it, expect } from "vitest";
import { parseCourseCell } from "@/lib/timetableParse";

describe("parseCourseCell", () => {
  it("parses a regular lesson and strips the weekly-hours parenthetical", () => {
    expect(parseCourseCell("112 / Ψηφ.Ηλεκτρονικά I (2)")).toEqual({
      room: "112",
      courseName: "Ψηφ.Ηλεκτρονικά I",
    });
  });

  it("parses a support (ΣΤΗΡ) lesson with NO parenthetical and no spacing", () => {
    // Regression: this was dropped before — the trailing "(…)" was mandatory.
    expect(parseCourseCell("8/Στηριξή")).toEqual({ room: "8", courseName: "Στηριξή" });
  });

  it("tolerates spacing around the slash either way", () => {
    expect(parseCourseCell("24 / Ψηφ.Ηλεκτρονικά I (2)")).toEqual({
      room: "24",
      courseName: "Ψηφ.Ηλεκτρονικά I",
    });
    expect(parseCourseCell("12 / Στηριξή")).toEqual({ room: "12", courseName: "Στηριξή" });
  });

  it("returns null for cells without a room/course separator", () => {
    expect(parseCourseCell("Στηριξή")).toBeNull();
    expect(parseCourseCell("")).toBeNull();
  });
});
