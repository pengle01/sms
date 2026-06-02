import { describe, it, expect } from "vitest";
import {
  periodsForDow,
  maxPeriodCount,
  totalPeriodsForDays,
  DEFAULT_PERIODS_PER_DAY,
  DEFAULT_MAX_TESTS_PER_WEEK,
} from "@/lib/schoolConfig";
import { expulsionDaysInPast } from "@/lib/periods";

describe("DEFAULT_PERIODS_PER_DAY", () => {
  it("has 7 periods for each weekday", () => {
    for (const dow of [1, 2, 3, 4, 5]) {
      expect(DEFAULT_PERIODS_PER_DAY[dow]).toBe(7);
    }
  });
});

describe("DEFAULT_MAX_TESTS_PER_WEEK", () => {
  it("defaults to 4", () => {
    expect(DEFAULT_MAX_TESTS_PER_WEEK).toBe(4);
  });
});

describe("periodsForDow", () => {
  it("returns an array of period numbers 1..count for a standard day", () => {
    expect(periodsForDow(DEFAULT_PERIODS_PER_DAY, 1)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("respects a custom period count for a given day", () => {
    const config = { ...DEFAULT_PERIODS_PER_DAY, 5: 5 };
    expect(periodsForDow(config, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("falls back to 7 for an unknown day of week", () => {
    expect(periodsForDow(DEFAULT_PERIODS_PER_DAY, 6)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("returns a single period for a day configured with 1", () => {
    const config = { ...DEFAULT_PERIODS_PER_DAY, 3: 1 };
    expect(periodsForDow(config, 3)).toEqual([1]);
  });
});

describe("maxPeriodCount", () => {
  it("returns 7 for the default config", () => {
    expect(maxPeriodCount(DEFAULT_PERIODS_PER_DAY)).toBe(7);
  });

  it("returns the highest value across all days", () => {
    const config = { 1: 6, 2: 8, 3: 7, 4: 5, 5: 7 };
    expect(maxPeriodCount(config)).toBe(8);
  });

  it("handles a uniform config", () => {
    const config = { 1: 5, 2: 5, 3: 5, 4: 5, 5: 5 };
    expect(maxPeriodCount(config)).toBe(5);
  });
});

describe("totalPeriodsForDays", () => {
  // 2026-06-01 is a Monday → Mon-Fri run through 2026-06-05 (Fri)
  it("sums periods for consecutive weekdays", () => {
    const days = ["2026-06-01", "2026-06-02", "2026-06-03"]; // Mon, Tue, Wed
    expect(totalPeriodsForDays(DEFAULT_PERIODS_PER_DAY, days)).toBe(21);
  });

  it("returns zero for an empty list", () => {
    expect(totalPeriodsForDays(DEFAULT_PERIODS_PER_DAY, [])).toBe(0);
  });

  it("ignores weekend days", () => {
    const days = ["2026-06-06", "2026-06-07"]; // Sat, Sun
    expect(totalPeriodsForDays(DEFAULT_PERIODS_PER_DAY, days)).toBe(0);
  });

  it("uses the configured period count per day", () => {
    const config = { ...DEFAULT_PERIODS_PER_DAY, 5: 4 }; // Friday has 4
    const days = ["2026-06-04", "2026-06-05"]; // Thu (7) + Fri (4)
    expect(totalPeriodsForDays(config, days)).toBe(11);
  });

  it("accepts Date objects as well as ISO strings", () => {
    const days = [new Date("2026-06-01T12:00:00"), new Date("2026-06-02T12:00:00")];
    expect(totalPeriodsForDays(DEFAULT_PERIODS_PER_DAY, days)).toBe(14);
  });

  it("falls back to 7 periods for a weekday missing from config", () => {
    const config = { 1: 7 }; // only Monday defined
    expect(totalPeriodsForDays(config, ["2026-06-02"])).toBe(7); // Tuesday → fallback 7
  });
});

describe("expulsionDaysInPast", () => {
  const today = "2026-06-02";

  it("returns days before today", () => {
    expect(expulsionDaysInPast(["2026-06-01", "2026-05-30"], today)).toEqual([
      "2026-06-01",
      "2026-05-30",
    ]);
  });

  it("treats today as not in the past", () => {
    expect(expulsionDaysInPast([today], today)).toEqual([]);
  });

  it("allows future days", () => {
    expect(expulsionDaysInPast(["2026-06-03", "2026-12-01"], today)).toEqual([]);
  });

  it("returns only the past subset from a mixed list", () => {
    expect(
      expulsionDaysInPast(["2026-05-31", "2026-06-02", "2026-06-05"], today)
    ).toEqual(["2026-05-31"]);
  });

  it("returns empty for an empty list", () => {
    expect(expulsionDaysInPast([], today)).toEqual([]);
  });
});
