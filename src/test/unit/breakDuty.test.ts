import { describe, it, expect } from "vitest";
import {
  splitTeachers,
  dutyNameKey,
  isPlaceholderName,
  parseDutyWorkbook,
  dayBreaks,
  currentBreakNo,
  reportGrid,
  breakProgress,
} from "@/lib/breakDuty";
import { DEFAULT_BELL_SCHEDULE } from "@/lib/bellSchedule";

describe("splitTeachers", () => {
  it("splits two names padded with spaces", () => {
    expect(splitTeachers("Α-ΝΕΟΚΛΕΟΥΣ  Μ.                     Τ-ΜΥΛΩΝΑΚΗΣ Α.")).toEqual(["Α-ΝΕΟΚΛΕΟΥΣ Μ.", "Τ-ΜΥΛΩΝΑΚΗΣ Α."]);
  });

  it("splits names separated by a slash", () => {
    expect(splitTeachers("Φ-ΚΑΡΑΚΩΣΤΟΠΟΥΛΟΣ / ΗΛ-ΣΤΕΛΙΟΥ Σ.")).toEqual(["Φ-ΚΑΡΑΚΩΣΤΟΠΟΥΛΟΣ", "ΗΛ-ΣΤΕΛΙΟΥ Σ."]);
  });

  it("tidies spaces around the dash", () => {
    expect(splitTeachers("ΗΥ- ΘΕΟΔΟΡΟΥ Α.                              Ξ-ΜΙΧΑΗΛΙΔΗΣ Μ.  ")).toEqual(["ΗΥ-ΘΕΟΔΟΡΟΥ Α.", "Ξ-ΜΙΧΑΗΛΙΔΗΣ Μ."]);
    expect(splitTeachers("Μ - ΜΑΚΡΗΣ Π.")).toEqual(["Μ-ΜΑΚΡΗΣ Π."]);
  });

  it("keeps a single name and an empty cell", () => {
    expect(splitTeachers("Δ-ΚΑΤΤΟΥ Ρ.    ")).toEqual(["Δ-ΚΑΤΤΟΥ Ρ."]);
    expect(splitTeachers("")).toEqual([]);
    expect(splitTeachers(undefined)).toEqual([]);
  });
});

describe("dutyNameKey", () => {
  it("ignores dots, spacing and case", () => {
    expect(dutyNameKey("Α-ΒΑΣΙΛΟΥ Ν")).toBe(dutyNameKey("Α-ΒΑΣΙΛΟΥ Ν."));
    expect(dutyNameKey("ΗΥ- ΘΕΟΔΟΡΟΥ  Α.")).toBe(dutyNameKey("ΗΥ-ΘΕΟΔΟΡΟΥ Α."));
  });

  it("drops the deputies' ΒΔ suffix", () => {
    expect(dutyNameKey("ΗΥ-ΜΑΣΙΑ Μ. ΒΔ")).toBe(dutyNameKey("ΗΥ-ΜΑΣΙΑ Μ."));
  });

  it("keeps different people apart", () => {
    expect(dutyNameKey("Ε-ΙΩΑΝΝΟΥ Α.")).not.toBe(dutyNameKey("Ε-ΙΩΑΝΝΟΥ Ε."));
  });
});

describe("isPlaceholderName", () => {
  it("recognises unfilled places", () => {
    expect(isPlaceholderName("Μ-X1")).toBe(true);
    expect(isPlaceholderName("Φ-Χ")).toBe(true);
    expect(isPlaceholderName("Ξ-Χ.")).toBe(true);
    expect(isPlaceholderName("Β-Χ2")).toBe(true);
  });

  it("does not flag real names", () => {
    expect(isPlaceholderName("Ξ-ΧΑΡΑΛΑΜΠΟΥΣ Α.")).toBe(false);
    expect(isPlaceholderName("Χ-ΑΡΑΜΠΑΝΤΖΗΣ Ν.")).toBe(false);
  });
});

describe("parseDutyWorkbook", () => {
  const header = ["", "ΗΜΕΡΑ", "ΔΕΥΤΕΡΑ", "ΤΡΙΤΗ", "ΤΕΤΑΡΤΗ", "ΠΕΜΠΤΗ", "ΠΑΡΑΣΚΕΥΗ"];
  const rows = [
    ["", "", "ΤΕΣΕΚ"],
    ["ΠΡΟΓΡΑΜΜΑ ΕΦΗΜΕΡΕΥΣΗΣ 2026 – 2027"],
    header,
    ["Α/Α"],
    ["", "ΧΩΡΟΣ ΕΦΗΜΕΡΕΥΣΗΣ"],
    ["", "ΒΟΗΘΟΙ ΔΙΕΥΘΥΝΤΕΣ Α΄", "ΑΝΤΩΝΙΑΔΗΣ ΑΝΔΡΕΑΣ", "", "", "", "ΤΣΑΓΓΑΡΙΔΗ ΜΑΡΙΝΑ"],
    [1, "Κεντρική Είσοδος"],
    [2, "Ξενοδοχειακά", "Ξ-ΠΕΡΙΚΛΕΟΥΣ Ο.", "Μ-X1", "", "", "Ε-ΙΩΑΝΝΟΥ Ε"],
    ["5Α", "Γωνιά Γηπέδου", "Ξ-ΙΕΡΕΙΔΗΣ Σ.   Θ-ΚΑΡΑΜΑΝΗ Μ."],
    [],
    header,
    ["", "ΧΩΡΟΣ ΕΦΗΜΕΡΕΥΣΗΣ"],
    ["7 – 8 ", "Παράθυρα Καντίνας –  Χώρος", "Ε-ΞΑΝΘΟΥΔΑΚΗ Ε."],
  ];

  it("reads posts, teachers and the deputy cells across a repeated header", () => {
    const r = parseDutyWorkbook(rows);
    expect(r.warnings).toEqual([]);
    expect(r.posts.map((p) => p.code)).toEqual(["1", "2", "5Α", "7 – 8"]);
    expect(r.posts[0]!.days[1]).toEqual([]);
    expect(r.posts[1]!.days).toEqual({ 1: ["Ξ-ΠΕΡΙΚΛΕΟΥΣ Ο."], 2: ["Μ-X1"], 3: [], 4: [], 5: ["Ε-ΙΩΑΝΝΟΥ Ε"] });
    expect(r.posts[2]!.days[1]).toEqual(["Ξ-ΙΕΡΕΙΔΗΣ Σ.", "Θ-ΚΑΡΑΜΑΝΗ Μ."]);
    expect(r.posts[3]!.name).toBe("Παράθυρα Καντίνας – Χώρος");
    expect(r.deputies[1]).toEqual(["ΑΝΤΩΝΙΑΔΗΣ ΑΝΔΡΕΑΣ"]);
    expect(r.deputies[5]).toEqual(["ΤΣΑΓΓΑΡΙΔΗ ΜΑΡΙΝΑ"]);
  });

  it("warns when there is no weekday header", () => {
    expect(parseDutyWorkbook([["x", "y"]]).warnings).toHaveLength(1);
  });

  it("keeps the first of a repeated post", () => {
    const r = parseDutyWorkbook([header, [3, "Α"], [3, "Β"]]);
    expect(r.posts).toHaveLength(1);
    expect(r.warnings).toHaveLength(1);
  });
});

describe("dayBreaks", () => {
  it("follows the 8-period day on Monday", () => {
    expect(dayBreaks(DEFAULT_BELL_SCHEDULE, 1)).toEqual([
      { no: 1, from: "09:00", to: "09:15", minutes: 15 },
      { no: 2, from: "10:35", to: "10:50", minutes: 15 },
      { no: 3, from: "12:10", to: "12:15", minutes: 5 },
    ]);
  });

  it("follows the 7-period day on Tuesday", () => {
    expect(dayBreaks(DEFAULT_BELL_SCHEDULE, 2).map((b) => b.minutes)).toEqual([20, 15, 10]);
  });
});

describe("currentBreakNo", () => {
  const breaks = dayBreaks(DEFAULT_BELL_SCHEDULE, 2);
  it("picks the running or next break, else the last", () => {
    expect(currentBreakNo(breaks, "08:00")).toBe(1);
    expect(currentBreakNo(breaks, "09:20")).toBe(1);
    expect(currentBreakNo(breaks, "09:31")).toBe(2);
    expect(currentBreakNo(breaks, "14:00")).toBe(3);
    expect(currentBreakNo([], "10:00")).toBeNull();
  });
});

describe("reportGrid", () => {
  const posts = [
    { code: "1", name: "Είσοδος", teachers: [] },
    { code: "5", name: "Στέγαστρο", teachers: ["Τ-ΚΟΚΟΝΗΣ Κ.", "Ε-ΖΩΓΡΑΦΟΥ Α."] },
  ];
  const breaks = [{ no: 1 }, { no: 2 }];

  it("places checks and leaves unchecked breaks empty", () => {
    const rows = reportGrid(
      posts,
      [
        { breakNo: 1, postCode: "5", teacherName: "Τ-ΚΟΚΟΝΗΣ Κ", present: true, comment: null, checkedBy: "ΒΔ" },
        { breakNo: 2, postCode: "5", teacherName: "Ε-ΖΩΓΡΑΦΟΥ Α.", present: false, comment: "Δεν ήρθε", checkedBy: "ΒΔ" },
      ],
      breaks,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!.cells[1]).toEqual({ present: true, comment: null, checkedBy: "ΒΔ" });
    expect(rows[0]!.cells[2]).toBeNull();
    expect(rows[1]!.cells[2]).toEqual({ present: false, comment: "Δεν ήρθε", checkedBy: "ΒΔ" });
    expect(breakProgress(rows, 1)).toEqual({ checked: 1, total: 2, absent: 0 });
    expect(breakProgress(rows, 2)).toEqual({ checked: 1, total: 2, absent: 1 });
  });

  it("keeps checks of a teacher no longer in the programme", () => {
    const rows = reportGrid(posts, [{ breakNo: 1, postCode: "5", teacherName: "Α-ΑΛΛΟΣ Β.", present: false, comment: null }], breaks);
    expect(rows.map((r) => r.teacherName)).toEqual(["Τ-ΚΟΚΟΝΗΣ Κ.", "Ε-ΖΩΓΡΑΦΟΥ Α.", "Α-ΑΛΛΟΣ Β."]);
  });
});
