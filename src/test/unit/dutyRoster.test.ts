import { describe, it, expect } from "vitest";
import { DUTY_ELIGIBLE_ROLES, isDutyEligible, dutyDowFor, rosterByDay, isOnDuty } from "@/lib/dutyRoster";

describe("isDutyEligible", () => {
  it("accepts both headteacher roles", () => {
    expect(isDutyEligible("HEADTEACHER_A")).toBe(true);
    expect(isDutyEligible("HEADTEACHER_B")).toBe(true);
  });

  it("rejects every other role", () => {
    expect(isDutyEligible("TEACHER")).toBe(false);
    expect(isDutyEligible("HEADMASTER")).toBe(false);
    expect(isDutyEligible("SUPER_ADMIN")).toBe(false);
    expect(isDutyEligible("STUDENT_COUNSELOR")).toBe(false);
  });

  it("only lists the headteacher roles as eligible", () => {
    expect(DUTY_ELIGIBLE_ROLES).toEqual(["HEADTEACHER_A", "HEADTEACHER_B"]);
  });
});

describe("dutyDowFor", () => {
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

  it("maps school days to 1–5", () => {
    expect(dutyDowFor(utc(2026, 6, 1))).toBe(1); // Monday
    expect(dutyDowFor(utc(2026, 6, 3))).toBe(3); // Wednesday
    expect(dutyDowFor(utc(2026, 6, 5))).toBe(5); // Friday
  });

  it("returns null on weekends", () => {
    expect(dutyDowFor(utc(2026, 6, 6))).toBeNull(); // Saturday
    expect(dutyDowFor(utc(2026, 6, 7))).toBeNull(); // Sunday
  });
});

describe("rosterByDay", () => {
  it("buckets entries by weekday and keeps every weekday key", () => {
    const entries = [
      { dayOfWeek: 1, staffProfileId: "a" },
      { dayOfWeek: 3, staffProfileId: "b" },
      { dayOfWeek: 3, staffProfileId: "c" },
    ];
    const byDay = rosterByDay(entries);
    expect(byDay[1]).toEqual([{ dayOfWeek: 1, staffProfileId: "a" }]);
    expect(byDay[3].map((e) => e.staffProfileId)).toEqual(["b", "c"]);
    expect(byDay[2]).toEqual([]);
    expect(byDay[4]).toEqual([]);
    expect(byDay[5]).toEqual([]);
  });

  it("returns empty buckets for an empty roster", () => {
    expect(rosterByDay([])).toEqual({ 1: [], 2: [], 3: [], 4: [], 5: [] });
  });

  it("ignores out-of-range weekdays", () => {
    const byDay = rosterByDay([{ dayOfWeek: 6, staffProfileId: "x" }]);
    expect(Object.values(byDay).flat()).toEqual([]);
  });
});

describe("isOnDuty", () => {
  const entries = [
    { dayOfWeek: 1, staffProfileId: "a" },
    { dayOfWeek: 1, staffProfileId: "b" },
    { dayOfWeek: 4, staffProfileId: "a" },
  ];

  it("matches the staff profile on its roster day", () => {
    expect(isOnDuty(entries, 1, "a")).toBe(true);
    expect(isOnDuty(entries, 4, "a")).toBe(true);
  });

  it("returns false on a day the profile is not rostered", () => {
    expect(isOnDuty(entries, 4, "b")).toBe(false);
    expect(isOnDuty(entries, 2, "a")).toBe(false);
  });

  it("returns false on weekends (null dow) or without a staff profile", () => {
    expect(isOnDuty(entries, null, "a")).toBe(false);
    expect(isOnDuty(entries, 1, null)).toBe(false);
    expect(isOnDuty(entries, 1, undefined)).toBe(false);
  });
});
