import { describe, it, expect } from "vitest";
import {
  busyReason,
  coversPeriod,
  roomIsFree,
  matchTranscribers,
  parseTranscriberRows,
  splitTranscriberNeeds,
  testPeriods,
  transcriberTestLine,
  type DayCommitments,
} from "@/lib/transcribers";

const free: DayCommitments = {
  awayAllDay: false,
  awayPeriods: [],
  lessonPeriods: [],
  coverPeriods: [],
  transcribingPeriods: [],
};

describe("parseTranscriberRows", () => {
  it("reads the name and periods columns under the header", () => {
    const r = parseTranscriberRows([
      ["ΜΕΤΑΓΡΑΦΕΙΣ", "ΠΕΡΙΟΔΟΙ"],
      ["Μ-ΑΡΝΟΣ Σ.", 2],
      ["Ε-ΙΩΑΝΝΟΥ Έ.", "1"],
    ]);
    expect(r).toEqual({
      ok: true,
      entries: [
        { name: "Μ-ΑΡΝΟΣ Σ.", periods: 2 },
        { name: "Ε-ΙΩΑΝΝΟΥ Έ.", periods: 1 },
      ],
    });
  });

  it("skips blank rows and tidies doubled spaces", () => {
    const r = parseTranscriberRows([["Μεταγραφείς", "Περίοδοι"], ["", null], ["Φ-ΚΑΡΑΚΩΣΤΑ  Α.", 1], [null, null]]);
    expect(r.ok && r.entries).toEqual([{ name: "Φ-ΚΑΡΑΚΩΣΤΑ Α.", periods: 1 }]);
  });

  it("finds a header that is not on the first row", () => {
    const r = parseTranscriberRows([["Λίστα 2026"], [], ["α/α", "ΜΕΤΑΓΡΑΦΕΙΣ"], [1, "Α-ΒΑΣΙΛΟΥ Ν."]]);
    expect(r.ok && r.entries).toEqual([{ name: "Α-ΒΑΣΙΛΟΥ Ν.", periods: null }]);
  });

  it("leaves periods empty when the cell is not a positive whole number", () => {
    const r = parseTranscriberRows([["ΜΕΤΑΓΡΑΦΕΙΣ", "ΠΕΡΙΟΔΟΙ"], ["Α", ""], ["Β", "δύο"], ["Γ", 0], ["Δ", 1.5]]);
    expect(r.ok && r.entries.map((e) => e.periods)).toEqual([null, null, null, null]);
  });

  it("refuses a sheet without the names column", () => {
    expect(parseTranscriberRows([["ΟΝΟΜΑ", "ΠΕΡΙΟΔΟΙ"], ["Χ", 1]])).toEqual({ ok: false, error: "noNameColumn" });
  });

  it("refuses a sheet with a header and no teachers", () => {
    expect(parseTranscriberRows([["ΜΕΤΑΓΡΑΦΕΙΣ", "ΠΕΡΙΟΔΟΙ"], ["", ""]])).toEqual({ ok: false, error: "empty" });
    expect(parseTranscriberRows([])).toEqual({ ok: false, error: "noNameColumn" });
  });
});

describe("matchTranscribers", () => {
  const staff = [
    { id: "a", scheduleName: "Α-ΒΑΣΙΛΟΥ Ν." },
    { id: "m", scheduleName: "Μ-ΑΡΝΟΣ Σ." },
    { id: "p", scheduleName: "Μ-ΠΑΝΑΓΙΩΤΟΥ Ε." },
    { id: "d", scheduleName: "Φ-ΣΑΡΡΟΥ Ι. ΒΔ" },
    { id: "x1", scheduleName: "Ε-ΓΕΩΡΓΙΟΥ Μ." },
    { id: "x2", scheduleName: "Ε-ΓΕΩΡΓΙΟΥ Μ. ΒΔ" },
    { id: "n", scheduleName: null },
  ];
  const e = (name: string, periods: number | null = 1) => ({ name, periods });

  it("matches a name typed with Latin look-alike letters", () => {
    // "A" and "M" below are Latin.
    const r = matchTranscribers([e("A-ΒΑΣΙΛΟΥ Ν."), e("M-ΑΡΝΟΣ Σ.", 2)], staff);
    expect(r.matched).toEqual([
      { staffId: "a", name: "A-ΒΑΣΙΛΟΥ Ν.", periods: 1 },
      { staffId: "m", name: "M-ΑΡΝΟΣ Σ.", periods: 2 },
    ]);
    expect(r.unmatched).toEqual([]);
  });

  it("ignores accents, case and doubled spaces", () => {
    expect(matchTranscribers([e("μ-Άρνος  σ.")], staff).matched.map((m) => m.staffId)).toEqual(["m"]);
  });

  it("finds a deputy whose coding ends in ΒΔ", () => {
    expect(matchTranscribers([e("Φ-ΣΑΡΡΟΥ Ι.")], staff).matched.map((m) => m.staffId)).toEqual(["d"]);
  });

  it("reports a name listed twice and keeps the first row", () => {
    const r = matchTranscribers([e("M-ΠΑΝΑΓΙΩΤΟΥ  Ε.", 1), e("M-ΠΑΝΑΓΙΩΤΟΥ Ε.", 3)], staff);
    expect(r.matched).toEqual([{ staffId: "p", name: "M-ΠΑΝΑΓΙΩΤΟΥ  Ε.", periods: 1 }]);
    expect(r.repeated).toEqual(["M-ΠΑΝΑΓΙΩΤΟΥ Ε."]);
  });

  it("reports names that match nobody", () => {
    const r = matchTranscribers([e("Χ-ΑΓΝΩΣΤΟΣ Α."), e("ΧΩΡΙΣ ΚΩΔΙΚΟ")], staff);
    expect(r.matched).toEqual([]);
    expect(r.unmatched).toEqual(["Χ-ΑΓΝΩΣΤΟΣ Α.", "ΧΩΡΙΣ ΚΩΔΙΚΟ"]);
  });

  it("does not match a different subject or initial", () => {
    expect(matchTranscribers([e("Φ-ΑΡΝΟΣ Σ."), e("Μ-ΑΡΝΟΣ Κ.")], staff).unmatched).toHaveLength(2);
  });

  it("takes the exact coding when a namesake differs only by ΒΔ", () => {
    expect(matchTranscribers([e("Ε-ΓΕΩΡΓΙΟΥ Μ.")], staff).matched.map((m) => m.staffId)).toEqual(["x1"]);
  });
});

describe("testPeriods", () => {
  it("lists one period for a single-period test", () => {
    expect(testPeriods(3, 1)).toEqual([3]);
  });
  it("lists both periods of a two-period test", () => {
    expect(testPeriods(3, 2)).toEqual([3, 4]);
  });
  it("never returns an empty list", () => {
    expect(testPeriods(5, 0)).toEqual([5]);
  });
});

describe("busyReason", () => {
  it("is null when nothing falls in the test's periods", () => {
    expect(busyReason([3], { ...free, lessonPeriods: [1, 2, 4], coverPeriods: [5] })).toBeNull();
  });
  it("reports a lesson", () => {
    expect(busyReason([3], { ...free, lessonPeriods: [3] })).toBe("lesson");
  });
  it("reports a cover", () => {
    expect(busyReason([3], { ...free, coverPeriods: [3] })).toBe("cover");
  });
  it("reports another transcription", () => {
    expect(busyReason([3], { ...free, transcribingPeriods: [3] })).toBe("transcribing");
  });
  it("reports a whole-day absence even with no lessons", () => {
    expect(busyReason([3], { ...free, awayAllDay: true })).toBe("away");
  });
  it("reports a part-day absence only in its periods", () => {
    expect(busyReason([3], { ...free, awayPeriods: [3, 4] })).toBe("away");
    expect(busyReason([2], { ...free, awayPeriods: [3, 4] })).toBeNull();
  });
  it("puts absence before the lesson it empties", () => {
    expect(busyReason([3], { ...free, awayAllDay: true, lessonPeriods: [3] })).toBe("away");
  });
  it("is busy when only the second period of a two-period test is taken", () => {
    expect(busyReason([3, 4], { ...free, lessonPeriods: [4] })).toBe("lesson");
  });
});

describe("splitTranscriberNeeds", () => {
  it("separates the needs waiting for a transcriber from the covered ones", () => {
    const needs = [
      { testId: "t1", studentId: "s1", assignment: null },
      { testId: "t1", studentId: "s2", assignment: { staffId: "a" } },
      { testId: "t2", studentId: "s1", assignment: null },
    ];
    const r = splitTranscriberNeeds(needs);
    expect(r.pending.map((n) => `${n.testId}/${n.studentId}`)).toEqual(["t1/s1", "t2/s1"]);
    expect(r.assigned.map((n) => `${n.testId}/${n.studentId}`)).toEqual(["t1/s2"]);
  });
  it("handles no needs", () => {
    expect(splitTranscriberNeeds([])).toEqual({ pending: [], assigned: [] });
  });
});

describe("transcriberTestLine", () => {
  const base = { dateLabel: "16/03/26", courseName: "Μαθηματικά", groupName: "Β1" };
  it("shows a single period", () => {
    expect(transcriberTestLine({ ...base, period: 3, periodCount: 1 })).toBe("16/03/26 · Π3 · Μαθηματικά (Β1)");
  });
  it("shows the range of a two-period test", () => {
    expect(transcriberTestLine({ ...base, period: 3, periodCount: 2 })).toBe("16/03/26 · Π3–4 · Μαθηματικά (Β1)");
  });
});

describe("roomIsFree", () => {
  const occupied = new Map([[3, new Set(["Α1", "Β2"])], [4, new Set(["Γ3"])]]);
  it("is free when no period uses the room", () => {
    expect(roomIsFree("Δ4", [3, 4], occupied)).toBe(true);
    expect(roomIsFree("Α1", [5], occupied)).toBe(true);
  });
  it("is taken when a lesson is in the room that period", () => {
    expect(roomIsFree("Α1", [3], occupied)).toBe(false);
  });
  it("is taken when only the second period of the test uses it", () => {
    expect(roomIsFree("Γ3", [3, 4], occupied)).toBe(false);
  });
});

describe("coversPeriod", () => {
  it("covers the test's own period", () => {
    expect(coversPeriod({ period: 3, periodCount: 1 }, 3)).toBe(true);
  });
  it("covers the second period of a two-period test", () => {
    expect(coversPeriod({ period: 3, periodCount: 2 }, 4)).toBe(true);
  });
  it("does not cover the periods around it", () => {
    expect(coversPeriod({ period: 3, periodCount: 2 }, 2)).toBe(false);
    expect(coversPeriod({ period: 3, periodCount: 2 }, 5)).toBe(false);
  });
});
