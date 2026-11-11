import { describe, it, expect } from "vitest";
import {
  CARRIED_UNTIL,
  carriedAppliesToRange,
  carriedAppliesToWindow,
  formatAbsenceTotal,
  parseCarriedAbsenceRows,
  summarizeCarriedChanges,
} from "@/lib/carriedAbsences";
import { carriedYearKey } from "@/server/carriedAbsences";

describe("formatAbsenceTotal", () => {
  it("shows old + new = total for staff", () => {
    expect(formatAbsenceTotal(12, 22)).toBe("12 + 22 = 34");
  });
  it("shows just the number when nothing was carried over", () => {
    expect(formatAbsenceTotal(0, 22)).toBe("22");
  });
});

describe("where the carried-over number counts", () => {
  it("counts in the school year, and the term only while it is the first", () => {
    expect(carriedAppliesToWindow("year", "TERM2")).toBe(true);
    expect(carriedAppliesToWindow("term", "TERM1")).toBe(true);
    expect(carriedAppliesToWindow("term", "TERM2")).toBe(false);
  });
  it("never counts in a week or the last 30 days", () => {
    expect(carriedAppliesToWindow("week", "TERM1")).toBe(false);
    expect(carriedAppliesToWindow("30", "TERM1")).toBe(false);
  });
  it("counts in a date range only when it reaches back before the cut-off", () => {
    expect(carriedAppliesToRange("2026-09-07", "2026-11-11", "2026-09-07")).toBe(true);
    expect(carriedAppliesToRange(CARRIED_UNTIL, "2026-11-11", "2026-09-07")).toBe(true);
    expect(carriedAppliesToRange("2026-10-19", "2026-11-11", "2026-09-07")).toBe(false);
    expect(carriedAppliesToRange("2026-09-07", "2026-09-01", "2026-09-07")).toBe(false);
  });
  it("is kept per school year, so a new year sees nothing", () => {
    expect(carriedYearKey({ yearStart: new Date("2026-09-07T00:00:00Z") })).toBe("2026-2027");
    expect(carriedYearKey({ yearStart: new Date("2027-09-06T00:00:00Z") })).toBe("2027-2028");
  });
});

describe("parseCarriedAbsenceRows", () => {
  it("finds the columns by header, ignoring accents", () => {
    expect(parseCarriedAbsenceRows([{ "Αρ. Μητρώου": "1001", "Απουσίες": 12 }, { "Αρ. Μητρώου": "1002", "Απουσίες": "0" }])).toEqual({
      ok: true,
      entries: [{ registry: "1001", periods: 12 }, { registry: "1002", periods: 0 }],
    });
    expect(parseCarriedAbsenceRows([{ "ΜΗΤΡΩΟ": "1", "Περίοδοι": 3 }]).ok).toBe(true);
  });
  it("skips fully blank rows", () => {
    expect(parseCarriedAbsenceRows([{ Μητρώο: "1", Απουσίες: 2 }, { Μητρώο: "", Απουσίες: "" }])).toEqual({
      ok: true,
      entries: [{ registry: "1", periods: 2 }],
    });
  });
  it("refuses the whole file on a bad number or a student listed twice", () => {
    const r = parseCarriedAbsenceRows([
      { Μητρώο: "1", Απουσίες: 2 },
      { Μητρώο: "2", Απουσίες: -1 },
      { Μητρώο: "3", Απουσίες: 2.5 },
      { Μητρώο: "4", Απουσίες: "" },
      { Μητρώο: "1", Απουσίες: 5 },
    ]);
    expect(r).toEqual({ ok: false, error: "badRows", rows: ["3: 2 -1", "4: 3 2.5", "5: 4 —", "6: 1 5"] });
  });
  it("reports missing columns or an empty sheet", () => {
    expect(parseCarriedAbsenceRows([])).toEqual({ ok: false, error: "empty" });
    expect(parseCarriedAbsenceRows([{ Όνομα: "x", Απουσίες: 1 }])).toEqual({ ok: false, error: "noRegistryColumn" });
    expect(parseCarriedAbsenceRows([{ Μητρώο: "1", Όνομα: "x" }])).toEqual({ ok: false, error: "noCountColumn" });
  });
});

describe("summarizeCarriedChanges", () => {
  it("counts new, changed, removed and unchanged numbers", () => {
    const existing = new Map([["1", 5], ["2", 3], ["3", 4]]);
    expect(
      summarizeCarriedChanges(
        [
          { registry: "1", periods: 5 },
          { registry: "2", periods: 7 },
          { registry: "3", periods: 0 },
          { registry: "4", periods: 2 },
          { registry: "5", periods: 0 },
        ],
        existing,
      ),
    ).toEqual({ added: 1, changed: 1, removed: 1, unchanged: 2 });
  });
});
