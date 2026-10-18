import { describe, it, expect } from "vitest";
import {
  breakMinutes,
  isOverdue,
  breakSeverity,
  breakCounts,
  frequentStudentIds,
} from "@/lib/toilet";

const T = (min: number) => new Date(Date.UTC(2026, 2, 9, 9, min));

describe("Toilet breaks", () => {
  it("computes whole minutes for a completed break", () => {
    expect(breakMinutes(T(0), T(7), T(30))).toBe(7);
  });

  it("computes elapsed minutes against now while open", () => {
    expect(breakMinutes(T(0), null, T(12))).toBe(12);
  });

  it("accepts ISO strings", () => {
    expect(breakMinutes(T(0).toISOString(), null, T(4))).toBe(4);
  });

  it("never returns negative minutes", () => {
    expect(breakMinutes(T(10), null, T(5))).toBe(0);
  });

  it("flags overdue only past the threshold", () => {
    expect(isOverdue(T(0), T(10))).toBe(false); // exactly 10' is not overdue
    expect(isOverdue(T(0), T(11))).toBe(true);
    expect(isOverdue(T(0), T(8), 5)).toBe(true); // custom threshold
  });

  it("escalates severity ok → warn → overdue", () => {
    expect(breakSeverity(T(0), T(3))).toBe("ok");
    expect(breakSeverity(T(0), T(6))).toBe("warn");
    expect(breakSeverity(T(0), T(11))).toBe("overdue");
  });

  it("counts breaks per student", () => {
    const breaks = [
      { studentId: "a", leftAt: T(0), returnedAt: T(2) },
      { studentId: "a", leftAt: T(10), returnedAt: T(12) },
      { studentId: "b", leftAt: T(5), returnedAt: null },
    ];
    expect(breakCounts(breaks)).toEqual({ a: 2, b: 1 });
  });

  it("flags frequent students at the threshold", () => {
    const breaks = [
      { studentId: "a", leftAt: T(0), returnedAt: T(1) },
      { studentId: "a", leftAt: T(2), returnedAt: T(3) },
      { studentId: "a", leftAt: T(4), returnedAt: null },
      { studentId: "b", leftAt: T(0), returnedAt: T(1) },
    ];
    const frequent = frequentStudentIds(breaks);
    expect(frequent.has("a")).toBe(true);
    expect(frequent.has("b")).toBe(false);
  });

  it("handles an empty list", () => {
    expect(breakCounts([])).toEqual({});
    expect(frequentStudentIds([]).size).toBe(0);
  });
});

import { nicosiaInstant, resolveBreakEdit, nicosiaHhmm } from "@/lib/toilet";

describe("nicosiaInstant", () => {
  it("uses UTC+2 in winter and UTC+3 in summer", () => {
    expect(nicosiaInstant("2026-01-15", "10:00").toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(nicosiaInstant("2026-07-15", "10:00").toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });

  it("round-trips with nicosiaHhmm", () => {
    expect(nicosiaHhmm(nicosiaInstant("2026-10-19", "07:40"))).toBe("07:40");
    expect(nicosiaHhmm(nicosiaInstant("2026-03-16", "13:35"))).toBe("13:35");
  });
});

describe("resolveBreakEdit", () => {
  const now = new Date("2026-10-19T12:00:00.000Z"); // 15:00 in Cyprus
  const base = { dateIso: "2026-10-19", now, isToday: true };

  it("accepts a valid correction", () => {
    const r = resolveBreakEdit({ ...base, leftAt: "10.30", returnedAt: "10:36" });
    expect(r).toEqual({
      leftAt: new Date("2026-10-19T07:30:00.000Z"),
      returnedAt: new Date("2026-10-19T07:36:00.000Z"),
    });
  });

  it("allows still out on the same day", () => {
    expect(resolveBreakEdit({ ...base, leftAt: "10:30", returnedAt: null })).toEqual({
      leftAt: new Date("2026-10-19T07:30:00.000Z"),
      returnedAt: null,
    });
  });

  it("refuses a malformed time", () => {
    expect(resolveBreakEdit({ ...base, leftAt: "1030x", returnedAt: "10:36" })).toEqual({ error: "badTime" });
    expect(resolveBreakEdit({ ...base, leftAt: "10:30", returnedAt: "" })).toEqual({ error: "badTime" });
  });

  it("refuses a return that is not after the exit", () => {
    expect(resolveBreakEdit({ ...base, leftAt: "10:30", returnedAt: "10:30" })).toEqual({ error: "returnBeforeLeave" });
    expect(resolveBreakEdit({ ...base, leftAt: "10:30", returnedAt: "10:20" })).toEqual({ error: "returnBeforeLeave" });
  });

  it("refuses times in the future", () => {
    expect(resolveBreakEdit({ ...base, leftAt: "14:50", returnedAt: "15:10" })).toEqual({ error: "future" });
  });

  it("refuses still out on an earlier day", () => {
    expect(resolveBreakEdit({ ...base, dateIso: "2026-10-16", isToday: false, leftAt: "10:30", returnedAt: null })).toEqual({ error: "openNotToday" });
  });
});
