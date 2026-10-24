import { describe, it, expect } from "vitest";
import { parseMonth, monthParam, shiftMonth, monthBounds, monthWeeks, byDay, closedDays } from "@/lib/testCalendar";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("parseMonth / monthParam / shiftMonth", () => {
  it("reads a YYYY-MM month, else the month of today", () => {
    expect(parseMonth("2026-11", d("2026-10-24"))).toEqual({ year: 2026, month: 11 });
    expect(parseMonth("2026-13", d("2026-10-24"))).toEqual({ year: 2026, month: 10 });
    expect(parseMonth(undefined, d("2027-01-05"))).toEqual({ year: 2027, month: 1 });
  });

  it("writes and moves months across years", () => {
    expect(monthParam({ year: 2026, month: 3 })).toBe("2026-03");
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("bounds a month by its first and last day", () => {
    expect(monthBounds({ year: 2026, month: 2 })).toEqual({ from: d("2026-02-01"), to: d("2026-02-28") });
  });
});

describe("monthWeeks", () => {
  it("lays a month out as Monday–Friday weeks", () => {
    const weeks = monthWeeks({ year: 2026, month: 10 }); // 1 Oct 2026 is a Thursday
    expect(weeks[0]!.map((x) => x.iso)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(weeks[0]!.map((x) => x.inMonth)).toEqual([false, false, false, true, true]);
    expect(weeks.at(-1)!.map((x) => x.iso)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
    expect(weeks.every((w) => w.length === 5)).toBe(true);
  });

  it("skips a first week that is all weekend", () => {
    const weeks = monthWeeks({ year: 2026, month: 11 }); // 1 Nov 2026 is a Sunday
    expect(weeks[0]![0]!.iso).toBe("2026-11-02");
  });
});

describe("byDay / closedDays", () => {
  it("groups items by their day, keeping order", () => {
    const m = byDay([{ id: "a", at: d("2026-10-05") }, { id: "b", at: d("2026-10-06") }, { id: "c", at: d("2026-10-05") }], (x) => x.at);
    expect(m.get("2026-10-05")!.map((x) => x.id)).toEqual(["a", "c"]);
    expect(m.get("2026-10-06")!.map((x) => x.id)).toEqual(["b"]);
  });

  it("lists the holiday days that fall in the window", () => {
    const set = closedDays([{ startDate: d("2026-10-27"), endDate: d("2026-11-02") }], d("2026-10-01"), d("2026-10-31"));
    expect([...set]).toEqual(["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]);
  });
});
