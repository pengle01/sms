import { describe, it, expect } from "vitest";
import { permitCoversPeriod, permitByStudent, permitContactLabel, permitAbsenceSlots } from "@/lib/exitPermit";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("permitCoversPeriod", () => {
  const permit = { date: day("2026-06-04"), fromPeriod: 3, active: true };

  it("covers the leave period and everything after it", () => {
    expect(permitCoversPeriod(permit, day("2026-06-04"), 3)).toBe(true); // boundary
    expect(permitCoversPeriod(permit, day("2026-06-04"), 7)).toBe(true);
  });

  it("does not cover periods before the student leaves", () => {
    expect(permitCoversPeriod(permit, day("2026-06-04"), 2)).toBe(false);
    expect(permitCoversPeriod(permit, day("2026-06-04"), 1)).toBe(false);
  });

  it("does not cover other days", () => {
    expect(permitCoversPeriod(permit, day("2026-06-05"), 5)).toBe(false);
    expect(permitCoversPeriod(permit, day("2026-06-03"), 5)).toBe(false);
  });

  it("ignores cancelled permits", () => {
    expect(
      permitCoversPeriod({ ...permit, active: false }, day("2026-06-04"), 5)
    ).toBe(false);
  });
});

describe("permitByStudent", () => {
  const today = day("2026-06-04");
  const permits = [
    { studentId: "a", date: today, fromPeriod: 3, active: true },
    { studentId: "b", date: today, fromPeriod: 6, active: true },
    { studentId: "c", date: today, fromPeriod: 2, active: false }, // cancelled
    { studentId: "d", date: day("2026-06-03"), fromPeriod: 1, active: true }, // yesterday
  ];

  it("maps only students whose permit covers the period", () => {
    const map = permitByStudent(permits, today, 4);
    expect(Object.keys(map)).toEqual(["a"]);
    expect(map["a"]!.fromPeriod).toBe(3);
  });

  it("includes later-leaving students once their period arrives", () => {
    const map = permitByStudent(permits, today, 6);
    expect(Object.keys(map).sort()).toEqual(["a", "b"]);
  });

  it("returns an empty map when nothing covers", () => {
    expect(permitByStudent(permits, today, 1)).toEqual({});
    expect(permitByStudent([], today, 5)).toEqual({});
  });

  it("prefers the earliest-leaving permit on duplicates", () => {
    const dup = [
      { studentId: "a", date: today, fromPeriod: 5, active: true },
      { studentId: "a", date: today, fromPeriod: 2, active: true },
    ];
    expect(permitByStudent(dup, today, 6)["a"]!.fromPeriod).toBe(2);
  });
});

describe("permitContactLabel", () => {
  it("formats the picked contact with the Greek role label", () => {
    expect(
      permitContactLabel({ name: "ΓΕΩΡΓΙΟΥ ΜΑΡΙΑ", role: "MOTHER", phone: "99123456" }, null)
    ).toBe("ΓΕΩΡΓΙΟΥ ΜΑΡΙΑ (Μητέρα) · 99123456");
  });

  it("keeps unknown roles as-is", () => {
    expect(
      permitContactLabel({ name: "X", role: "AUNT", phone: "1" }, null)
    ).toBe("X (AUNT) · 1");
  });

  it("falls back to the free-text note, trimmed", () => {
    expect(permitContactLabel(null, "  Θείος — 99000000  ")).toBe("Θείος — 99000000");
    expect(permitContactLabel(undefined, "note")).toBe("note");
  });

  it("returns null when nothing was recorded", () => {
    expect(permitContactLabel(null, null)).toBeNull();
    expect(permitContactLabel(null, "   ")).toBeNull();
  });

  it("prefers the contact over the note", () => {
    expect(
      permitContactLabel({ name: "A", role: "FATHER", phone: "2" }, "ignored")
    ).toBe("A (Πατέρας) · 2");
  });
});

describe("permitAbsenceSlots", () => {
  const slot = (id: string, groupId: string, period: number) => ({ id, groupId, period });

  it("keeps one slot per period, sorted by period", () => {
    const out = permitAbsenceSlots([slot("b", "hg", 5), slot("a", "hg", 3)], "hg");
    expect(out.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("lets the subject-group slot override the homegroup slot in the same period", () => {
    const out = permitAbsenceSlots([slot("hg4", "hg", 4), slot("math4", "g-math", 4)], "hg");
    expect(out.map((s) => s.id)).toEqual(["math4"]);
  });

  it("does not let the homegroup slot override a subject-group slot", () => {
    const out = permitAbsenceSlots([slot("math4", "g-math", 4), slot("hg4", "hg", 4)], "hg");
    expect(out.map((s) => s.id)).toEqual(["math4"]);
  });

  it("handles empty input and missing homegroup", () => {
    expect(permitAbsenceSlots([], "hg")).toEqual([]);
    expect(permitAbsenceSlots([slot("a", "g1", 2)], null).map((s) => s.id)).toEqual(["a"]);
  });
});
