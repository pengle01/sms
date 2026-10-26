import { describe, it, expect } from "vitest";
import { printTarget, canPrintTimetable, safeBack, timetablePrintHref, specialtyCode, specialtyGroups } from "@/lib/timetablePrint";
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

  it("keeps the «Εφημερίες» tab a daily-sheet print was opened from", () => {
    const back = new URLSearchParams(`back=${encodeURIComponent("/el/teacher/duty?tab=plan&planDate=2026-03-16")}`).get("back") ?? undefined;
    expect(safeBack(back, "el")).toBe("/el/teacher/duty?tab=plan&planDate=2026-03-16");
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

describe("specialty printing", () => {
  it("parses a specialty target and allows it to the same people as a teacher's", () => {
    expect(printTarget({ kind: "specialty", name: " ΗΥ " })).toEqual({ kind: "specialty", key: "ΗΥ" });
    expect(printTarget({ kind: "specialty" })).toBeNull();
    expect(canPrintTimetable("specialty", ["TEACHER"])).toBe(true);
    expect(canPrintTimetable("specialty", ["STUDENT"])).toBe(false);
  });

  it("reads the specialty code from a timetable name", () => {
    expect(specialtyCode("ΗΥ-ΜΑΣΙΑ Μ. ΒΔ")).toBe("ΗΥ");
    expect(specialtyCode(" Μ - ΠΑΠΑΣ Α. ")).toBe("Μ");
    expect(specialtyCode("ΓΕΩΡΓΙΟΥ Μ.")).toBeNull();
  });

  it("groups names by code, each name once, in Greek order", () => {
    expect(specialtyGroups(["Μ-ΠΑΠΑΣ Α.", "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ", "Μ-ΑΡΝΟΣ Σ.", " Μ-ΠΑΠΑΣ Α. ", "ΓΕΩΡΓΙΟΥ Μ."])).toEqual([
      { code: "ΗΥ", names: ["ΗΥ-ΜΑΣΙΑ Μ. ΒΔ"] },
      { code: "Μ", names: ["Μ-ΑΡΝΟΣ Σ.", "Μ-ΠΑΠΑΣ Α."] },
    ]);
  });
});
