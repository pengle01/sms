import { describe, it, expect } from "vitest";
import { printTarget, canPrintTimetable, safeBack, timetablePrintHref } from "@/lib/timetablePrint";
import { weekGrid, cell } from "@/lib/whereabouts";

describe("printTarget", () => {
  it("parses teacher, room and student targets", () => {
    expect(printTarget({ kind: "teacher", name: " ΠΑΠΑΣ Γ. " })).toEqual({ kind: "teacher", key: "ΠΑΠΑΣ Γ." });
    expect(printTarget({ kind: "room", name: "Α12" })).toEqual({ kind: "room", key: "Α12" });
    expect(printTarget({ kind: "student", id: "sp1" })).toEqual({ kind: "student", key: "sp1" });
  });

  it("rejects an unknown kind or a missing key", () => {
    expect(printTarget({ kind: "group", name: "Α1" })).toBeNull();
    expect(printTarget({ kind: "teacher" })).toBeNull();
    expect(printTarget({ kind: "student", name: "sp1" })).toBeNull();
    expect(printTarget({ kind: "room", name: "  " })).toBeNull();
  });
});

describe("canPrintTimetable", () => {
  it("lets educators, office and admin print a teacher or a room", () => {
    for (const kind of ["teacher", "room"] as const) {
      expect(canPrintTimetable(kind, ["TEACHER"])).toBe(true);
      expect(canPrintTimetable(kind, ["HEADMASTER"])).toBe(true);
      expect(canPrintTimetable(kind, ["SCHOOL_ADMIN"])).toBe(true);
      expect(canPrintTimetable(kind, ["SUPER_ADMIN"])).toBe(true);
    }
  });

  it("refuses students and parents a teacher or a room", () => {
    expect(canPrintTimetable("teacher", ["STUDENT"])).toBe(false);
    expect(canPrintTimetable("room", ["PARENT"])).toBe(false);
  });

  it("lets educators, admin and the student themself print a student", () => {
    expect(canPrintTimetable("student", ["TEACHER"])).toBe(true);
    expect(canPrintTimetable("student", ["SUPER_ADMIN"])).toBe(true);
    expect(canPrintTimetable("student", ["STUDENT"], { selfStudent: true })).toBe(true);
  });

  it("lets the office print a student (it sees the timetable on the student page)", () => {
    expect(canPrintTimetable("student", ["SCHOOL_ADMIN"])).toBe(true);
  });

  it("refuses another student and a parent a student", () => {
    expect(canPrintTimetable("student", ["STUDENT"], { selfStudent: false })).toBe(false);
    expect(canPrintTimetable("student", ["PARENT"], { selfStudent: true })).toBe(false);
  });
});

describe("safeBack", () => {
  it("keeps a path inside the locale", () => {
    expect(safeBack("/el/teacher/whereabouts?tab=rooms&room=Α12", "el")).toBe("/el/teacher/whereabouts?tab=rooms&room=Α12");
  });

  it("drops external, protocol-relative and other-locale paths", () => {
    expect(safeBack("https://evil.example/el/", "el")).toBeNull();
    expect(safeBack("//evil.example/el/x", "el")).toBeNull();
    expect(safeBack("/en/teacher", "el")).toBeNull();
    expect(safeBack("/el/\\evil", "el")).toBeNull();
    expect(safeBack(undefined, "el")).toBeNull();
  });
});

describe("timetablePrintHref", () => {
  it("puts the key under id for a student and name otherwise", () => {
    expect(timetablePrintHref("el", { kind: "student", key: "sp1" })).toBe("/el/print/timetable?kind=student&id=sp1&auto=1");
    const href = timetablePrintHref("el", { kind: "room", key: "Α 12" }, "/el/office/whereabouts");
    const q = new URLSearchParams(href.split("?")[1]);
    expect(q.get("name")).toBe("Α 12");
    expect(q.get("back")).toBe("/el/office/whereabouts");
  });
});

describe("weekGrid", () => {
  it("stacks lessons that share a period and leaves empty cells absent", () => {
    const grid = weekGrid([
      { dayOfWeek: 1, period: 2, id: "a" },
      { dayOfWeek: 1, period: 2, id: "b" },
      { dayOfWeek: 3, period: 5, id: "c" },
    ]);
    expect(cell(grid, 1, 2).map((s) => s.id)).toEqual(["a", "b"]);
    expect(cell(grid, 3, 5).map((s) => s.id)).toEqual(["c"]);
    expect(cell(grid, 2, 1)).toEqual([]);
  });
});
