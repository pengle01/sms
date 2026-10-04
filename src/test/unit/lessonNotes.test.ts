import { describe, it, expect } from "vitest";
import { normalizeNoteBody, isNoteDate, filterNotes, registerFor, LESSON_NOTE_MAX, type RegisterRow } from "@/lib/lessonNotes";

describe("normalizeNoteBody", () => {
  it("trims, and treats empty as delete", () => {
    expect(normalizeNoteBody("  Κεφ. 3, ασκ. 1-4  ")).toEqual({ ok: true, body: "Κεφ. 3, ασκ. 1-4" });
    expect(normalizeNoteBody("   \n ")).toEqual({ ok: true, body: null });
  });
  it("keeps line breaks and refuses over the limit", () => {
    expect(normalizeNoteBody("α\r\nβ")).toEqual({ ok: true, body: "α\nβ" });
    expect(normalizeNoteBody("x".repeat(LESSON_NOTE_MAX + 1))).toEqual({ ok: false, error: "tooLong" });
  });
});

describe("isNoteDate", () => {
  it("accepts real dates only", () => {
    expect(isNoteDate("2026-03-16")).toBe(true);
    expect(isNoteDate("2026-02-30")).toBe(false);
    expect(isNoteDate("16/03/2026")).toBe(false);
  });
});

describe("filterNotes", () => {
  const notes = [
    { groupName: "ΕΓ1", courseName: "Μαθηματικά", body: "Τελειώσαμε τις παραγώγους" },
    { groupName: "ΘΒΣ2", courseName: "Φυσική", body: "Πείραμα με εκκρεμές" },
  ];
  it("matches text, class or lesson, ignoring accents", () => {
    expect(filterNotes(notes, "παραγωγους").map((n) => n.groupName)).toEqual(["ΕΓ1"]);
    expect(filterNotes(notes, "θβσ2").map((n) => n.groupName)).toEqual(["ΘΒΣ2"]);
    expect(filterNotes(notes, "φυσικη").map((n) => n.groupName)).toEqual(["ΘΒΣ2"]);
  });
  it("returns everything for an empty search", () => {
    expect(filterNotes(notes, "")).toHaveLength(2);
  });
});

describe("registerFor", () => {
  const row = (o: Partial<RegisterRow>): RegisterRow => ({
    dateIso: "2026-03-16", status: "ABSENT", isAutoAbsent: false, waived: false, studentName: "Χ",
    slotGroupId: "g1", slotPeriod: 2, intercalaryGroupId: null, intercalaryPeriod: null, ...o,
  });
  const note = { groupId: "g1", period: 2, dateIso: "2026-03-16" };

  it("splits absent (incl. auto-absent) and late, sorted", () => {
    const rows = [
      row({ studentName: "Πέτρου" }),
      row({ studentName: "Αντωνίου", status: "LATE" }),
      row({ studentName: "Βασιλείου", status: "LATE", isAutoAbsent: true }),
    ];
    expect(registerFor(note, rows)).toEqual({ absent: ["Βασιλείου", "Πέτρου"], late: ["Αντωνίου"] });
  });

  it("ignores other dates, classes, periods and erased absences", () => {
    const rows = [
      row({ studentName: "Α", dateIso: "2026-03-17" }),
      row({ studentName: "Β", slotGroupId: "g2" }),
      row({ studentName: "Γ", slotPeriod: 3 }),
      row({ studentName: "Δ", waived: true }),
    ];
    expect(registerFor(note, rows)).toEqual({ absent: [], late: [] });
  });

  it("matches an intercalary register by class and period", () => {
    const rows = [row({ studentName: "Ε", slotGroupId: null, slotPeriod: null, intercalaryGroupId: "g1", intercalaryPeriod: 2 })];
    expect(registerFor(note, rows).absent).toEqual(["Ε"]);
  });
});
