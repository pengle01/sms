import { describe, it, expect } from "vitest";
import { newStaffProfileNames, splitTeacherBlocks } from "@/lib/timetableImport";

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
