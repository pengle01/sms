import { describe, it, expect } from "vitest";
import {
  periodsForDow,
  maxPeriodCount,
  DEFAULT_PERIODS_PER_DAY,
  DEFAULT_MAX_TESTS_PER_WEEK,
} from "@/lib/schoolConfig";

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
