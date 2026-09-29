import { describe, it, expect } from "vitest";
import {
  claimAfterUpdate,
  newStaffProfileNames,
  planRemovals,
  removalGuard,
  rosterChanges,
  splitTeacherBlocks,
} from "@/lib/timetableImport";

describe("newStaffProfileNames", () => {
  it("returns imported names that have no profile yet", () => {
    expect(newStaffProfileNames(["Α-ΝΕΟΣ Α."], ["Μ-ΑΡΝΟΣ Σ."])).toEqual(["Α-ΝΕΟΣ Α."]);
  });

  it("returns nothing on a second run with the same file", () => {
    expect(newStaffProfileNames(["Μ-ΑΡΝΟΣ Σ."], ["Μ-ΑΡΝΟΣ Σ."])).toEqual([]);
  });

  it("does not re-create a name already held by a profile", () => {
    // The caller passes every scheduleName, linked or not — a name owned by a
    // registered teacher must not gain a second, empty profile.
    expect(newStaffProfileNames(["ΗΥ-ΜΑΣΙΑ Μ. ΒΔ"], ["ΗΥ-ΜΑΣΙΑ Μ. ΒΔ"])).toEqual([]);
  });

  it("trims, deduplicates and drops blanks", () => {
    expect(newStaffProfileNames([" Α-ΝΕΟΣ Α. ", "Α-ΝΕΟΣ Α.", "  ", ""], [null, "  "]))
      .toEqual(["Α-ΝΕΟΣ Α."]);
  });

  it("returns a name that produced no lessons at all", () => {
    // The bug this exists for: a counselor has no teaching hours, so deriving
    // the roster from timetable slots loses them entirely.
    expect(newStaffProfileNames(["ΣΕΑ-ΜΙΧΑΗΛ Χ."], [])).toEqual(["ΣΕΑ-ΜΙΧΑΗΛ Χ."]);
  });

  it("sorts with Greek collation", () => {
    expect(newStaffProfileNames(["Γ-ΦΕΛΛΑ Μ.", "Α-ΚΥΡΜΙΖΗ Η."], []))
      .toEqual(["Α-ΚΥΡΜΙΖΗ Η.", "Γ-ΦΕΛΛΑ Μ."]);
  });
});

describe("splitTeacherBlocks", () => {
  const headers = [["Καθηγητής"], ["", "", "", "1"]];

  it("pairs each teacher row with the detail row below it", () => {
    const { blocks } = splitTeacherBlocks([
      ...headers,
      ["Μ-ΑΡΝΟΣ Σ.", "", "", "ΜΟ2α"],
      ["", "", "", "Α12 / Μαθηματικά (2)"],
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.staffName).toBe("Μ-ΑΡΝΟΣ Σ.");
    expect(blocks[0]!.rowIndex).toBe(2);
    expect(blocks[0]!.detailRow[3]).toBe("Α12 / Μαθηματικά (2)");
  });

  it("skips a block whose teacher row has no name", () => {
    const { blocks } = splitTeacherBlocks([...headers, ["", "", "", "ΜΟ2α"], ["", "", "", "x"]]);
    expect(blocks).toEqual([]);
  });

  it("keeps a teacher with no lessons", () => {
    const { blocks } = splitTeacherBlocks([...headers, ["ΣΕΑ-ΜΙΧΑΗΛ Χ.", "", "", ""], ["", "", "", ""]]);
    expect(blocks.map((b) => b.staffName)).toEqual(["ΣΕΑ-ΜΙΧΑΗΛ Χ."]);
  });

  it("tolerates a trailing teacher row with no detail row", () => {
    // Exactly where the counselor sits in the real workbook: last row of the file.
    const { blocks, desyncRows } = splitTeacherBlocks([...headers, ["ΣΕΑ-ΜΙΧΑΗΛ Χ."]]);
    expect(blocks.map((b) => b.staffName)).toEqual(["ΣΕΑ-ΜΙΧΑΗΛ Χ."]);
    expect(blocks[0]!.detailRow).toEqual([]);
    expect(desyncRows).toEqual([]);
  });

  it("reports a detail row that carries a teacher name", () => {
    // One inserted row shifts every later block, silently attributing lessons
    // to the wrong teacher.
    const { desyncRows } = splitTeacherBlocks([
      ...headers,
      ["Μ-ΑΡΝΟΣ Σ.", "", "", "ΜΟ2α"],
      ["Α-ΚΥΡΜΙΖΗ Η.", "", "", "ΑΓ1β"],
    ]);
    expect(desyncRows).toEqual([3]);
  });

  it("reports no desync for a well-formed sheet", () => {
    const { desyncRows } = splitTeacherBlocks([
      ...headers,
      ["Μ-ΑΡΝΟΣ Σ.", "", "", "ΜΟ2α"],
      ["", "", "", "Α12 / Μαθηματικά (2)"],
      ["Α-ΚΥΡΜΙΖΗ Η.", "", "", "ΑΓ1β"],
      ["", "", "", "Β03 / Αγγλικά (1)"],
    ]);
    expect(desyncRows).toEqual([]);
  });

  it("honours a custom start row", () => {
    const { blocks } = splitTeacherBlocks([["Μ-ΑΡΝΟΣ Σ."], [""]], 0);
    expect(blocks.map((b) => b.staffName)).toEqual(["Μ-ΑΡΝΟΣ Σ."]);
  });
});

describe("claimAfterUpdate", () => {
  it("keeps the claim when the file names the same teacher", () => {
    expect(claimAfterUpdate({ staffId: "sp1", staffName: "ΠΑΠΑΔΟΠΟΥΛΟΣ Γ." }, " ΠΑΠΑΔΟΠΟΥΛΟΣ Γ. ")).toBe("sp1");
  });

  it("drops the claim when the lesson moves to another teacher", () => {
    expect(claimAfterUpdate({ staffId: "sp1", staffName: "ΠΑΠΑΔΟΠΟΥΛΟΣ Γ." }, "ΓΕΩΡΓΙΟΥ Μ.")).toBeNull();
  });

  it("drops the claim when the stored name is missing", () => {
    expect(claimAfterUpdate({ staffId: "sp1", staffName: null }, "ΓΕΩΡΓΙΟΥ Μ.")).toBeNull();
  });

  it("stays unclaimed when there was no claim", () => {
    expect(claimAfterUpdate({ staffId: null, staffName: "ΓΕΩΡΓΙΟΥ Μ." }, "ΓΕΩΡΓΙΟΥ Μ.")).toBeNull();
  });
});

describe("removalGuard", () => {
  it("allows removal for a complete file", () => {
    expect(removalGuard({ cellErrors: 0, importedLessons: 2100, activeLessons: 2167 })).toBeNull();
  });

  it("skips removal when any cell failed to import", () => {
    expect(removalGuard({ cellErrors: 1, importedLessons: 2166, activeLessons: 2167 })).toBe("cellErrors");
  });

  it("skips removal when the file holds less than half the current lessons", () => {
    expect(removalGuard({ cellErrors: 0, importedLessons: 999, activeLessons: 2000 })).toBe("fileTooSmall");
  });

  it("allows removal at exactly half", () => {
    expect(removalGuard({ cellErrors: 0, importedLessons: 1000, activeLessons: 2000 })).toBeNull();
  });

  it("allows removal on an empty timetable", () => {
    expect(removalGuard({ cellErrors: 0, importedLessons: 0, activeLessons: 0 })).toBeNull();
  });
});

describe("planRemovals", () => {
  it("deletes unseen lessons without attendance and hides those with it", () => {
    const active = [
      { id: "a", hasAttendance: false },
      { id: "b", hasAttendance: true },
      { id: "c", hasAttendance: false },
      { id: "d", hasAttendance: true },
    ];
    expect(planRemovals(active, new Set(["c", "d"]))).toEqual({ deleteIds: ["a"], hideIds: ["b"] });
  });

  it("removes nothing when every lesson is in the file", () => {
    expect(planRemovals([{ id: "a", hasAttendance: true }], new Set(["a"]))).toEqual({ deleteIds: [], hideIds: [] });
  });

  it("handles an empty timetable", () => {
    expect(planRemovals([], new Set())).toEqual({ deleteIds: [], hideIds: [] });
  });
});

describe("rosterChanges", () => {
  const profiles = [
    { scheduleName: "Μ-ΜΕΝΕΙ Α.", leftTimetable: false },
    { scheduleName: "Φ-ΦΕΥΓΕΙ Β.", leftTimetable: false },
    { scheduleName: "Χ-ΕΠΙΣΤΡΕΦΕΙ Γ.", leftTimetable: true },
    { scheduleName: "Ζ-ΗΔΗ ΕΦΥΓΕ Δ.", leftTimetable: true },
    { scheduleName: null, leftTimetable: false },
  ];

  it("marks names missing from the file as left and returning names as back", () => {
    expect(rosterChanges(profiles, [" Μ-ΜΕΝΕΙ Α. ", "Χ-ΕΠΙΣΤΡΕΦΕΙ Γ."])).toEqual({
      left: ["Φ-ΦΕΥΓΕΙ Β."],
      back: ["Χ-ΕΠΙΣΤΡΕΦΕΙ Γ."],
    });
  });

  it("leaves profiles already in the right state alone", () => {
    expect(rosterChanges(profiles, ["Μ-ΜΕΝΕΙ Α.", "Φ-ΦΕΥΓΕΙ Β."])).toEqual({ left: [], back: [] });
  });
});
