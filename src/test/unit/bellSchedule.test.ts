import { describe, it, expect } from "vitest";
import {
  DEFAULT_BELL_SCHEDULE,
  normalizeTime,
  bellProblems,
  breaksOf,
  dayMismatches,
  parseBellSchedule,
  normalizeBellSchedule,
  type BellScheduleConfig,
} from "@/lib/bellSchedule";

const clone = (c: BellScheduleConfig): BellScheduleConfig => JSON.parse(JSON.stringify(c));

describe("bell schedule defaults", () => {
  it("match the printed schedule", () => {
    expect(DEFAULT_BELL_SCHEDULE.schedules.seven).toHaveLength(7);
    expect(DEFAULT_BELL_SCHEDULE.schedules.eight).toHaveLength(8);
    expect(DEFAULT_BELL_SCHEDULE.schedules.seven[2]).toEqual({ start: "09:30", end: "10:15" });
    expect(DEFAULT_BELL_SCHEDULE.schedules.eight[7]).toEqual({ start: "12:55", end: "13:35" });
    expect(DEFAULT_BELL_SCHEDULE.days).toEqual({ 1: "eight", 2: "seven", 3: "seven", 4: "eight", 5: "seven" });
  });

  it("are valid", () => {
    expect(bellProblems(DEFAULT_BELL_SCHEDULE)).toEqual([]);
  });

  it("give the printed breaks", () => {
    expect(breaksOf(DEFAULT_BELL_SCHEDULE.schedules.seven)).toEqual([
      { afterPeriod: 2, minutes: 20 },
      { afterPeriod: 4, minutes: 15 },
      { afterPeriod: 6, minutes: 10 },
    ]);
    expect(breaksOf(DEFAULT_BELL_SCHEDULE.schedules.eight)).toEqual([
      { afterPeriod: 2, minutes: 15 },
      { afterPeriod: 4, minutes: 15 },
      { afterPeriod: 6, minutes: 5 },
    ]);
  });
});

describe("normalizeTime", () => {
  it("accepts dots, colons and missing separators", () => {
    expect(normalizeTime("7.40")).toBe("07:40");
    expect(normalizeTime("07:40")).toBe("07:40");
    expect(normalizeTime("0740")).toBe("07:40");
    expect(normalizeTime(" 13.35 ")).toBe("13:35");
  });

  it("rejects impossible or malformed times", () => {
    expect(normalizeTime("24:00")).toBeNull();
    expect(normalizeTime("12:60")).toBeNull();
    expect(normalizeTime("7")).toBeNull();
    expect(normalizeTime("")).toBeNull();
  });
});

describe("bellProblems", () => {
  it("flags a malformed time", () => {
    const c = clone(DEFAULT_BELL_SCHEDULE);
    c.schedules.seven[0]!.start = "7:4";
    expect(bellProblems(c)).toEqual([{ kind: "badTime", schedule: "seven", period: 1 }]);
  });

  it("flags an end not after its start", () => {
    const c = clone(DEFAULT_BELL_SCHEDULE);
    c.schedules.eight[3]!.end = "09:55";
    expect(bellProblems(c)).toContainEqual({ kind: "endBeforeStart", schedule: "eight", period: 4 });
  });

  it("flags a period starting before the previous one ends", () => {
    const c = clone(DEFAULT_BELL_SCHEDULE);
    c.schedules.seven[1]!.start = "08:20";
    expect(bellProblems(c)).toEqual([{ kind: "overlap", schedule: "seven", period: 2 }]);
  });
});

describe("dayMismatches", () => {
  it("lists days whose schedule length differs from periods per day", () => {
    expect(dayMismatches(DEFAULT_BELL_SCHEDULE, { 1: 8, 2: 7, 3: 7, 4: 8, 5: 7 })).toEqual([]);
    expect(dayMismatches(DEFAULT_BELL_SCHEDULE, { 1: 7, 2: 7, 3: 8, 4: 8, 5: 7 })).toEqual([1, 3]);
  });
});

describe("parseBellSchedule", () => {
  it("falls back to the defaults for missing or broken values", () => {
    expect(parseBellSchedule(null)).toEqual(DEFAULT_BELL_SCHEDULE);
    expect(parseBellSchedule("not json")).toEqual(DEFAULT_BELL_SCHEDULE);
  });

  it("keeps valid parts and defaults the rest", () => {
    const stored = { schedules: { seven: DEFAULT_BELL_SCHEDULE.schedules.seven.map(() => ({ start: "08:00", end: "08:40" })), eight: [] }, days: { 1: "seven", 2: "bogus" } };
    const c = parseBellSchedule(JSON.stringify(stored));
    expect(c.schedules.seven[0]).toEqual({ start: "08:00", end: "08:40" });
    expect(c.schedules.eight).toEqual(DEFAULT_BELL_SCHEDULE.schedules.eight);
    expect(c.days[1]).toBe("seven");
    expect(c.days[2]).toBe("seven");
    expect(c.days[4]).toBe("eight");
  });
});

describe("normalizeBellSchedule", () => {
  it("writes every time as HH:MM", () => {
    const c = clone(DEFAULT_BELL_SCHEDULE);
    c.schedules.seven[0] = { start: "7.40", end: "8.25" };
    expect(normalizeBellSchedule(c).schedules.seven[0]).toEqual({ start: "07:40", end: "08:25" });
  });
});

import { periodTime } from "@/lib/bellSchedule";

describe("periodTime", () => {
  it("uses each day's own schedule", () => {
    expect(periodTime(DEFAULT_BELL_SCHEDULE, 1, 3)).toEqual({ start: "09:15", end: "09:55" });
    expect(periodTime(DEFAULT_BELL_SCHEDULE, 2, 3)).toEqual({ start: "09:30", end: "10:15" });
  });

  it("follows the 8-period times on a day with an inserted homegroup period", () => {
    expect(periodTime(DEFAULT_BELL_SCHEDULE, 2, 3, { mode: "insert" })).toEqual({ start: "09:15", end: "09:55" });
    expect(periodTime(DEFAULT_BELL_SCHEDULE, 2, 8, { mode: "insert" })).toEqual({ start: "12:55", end: "13:35" });
    expect(periodTime(DEFAULT_BELL_SCHEDULE, 1, 9, { mode: "insert" })).toBeNull();
  });

  it("keeps the day's own times when the homegroup period replaces a lesson", () => {
    expect(periodTime(DEFAULT_BELL_SCHEDULE, 2, 3, { mode: "replace" })).toEqual({ start: "09:30", end: "10:15" });
  });

  it("has no time past the last period or on a weekend", () => {
    expect(periodTime(DEFAULT_BELL_SCHEDULE, 2, 8)).toBeNull();
    expect(periodTime(DEFAULT_BELL_SCHEDULE, 6, 1)).toBeNull();
    expect(periodTime(DEFAULT_BELL_SCHEDULE, 0, 1)).toBeNull();
  });

  it("follows a changed day mapping", () => {
    const c = { ...DEFAULT_BELL_SCHEDULE, days: { ...DEFAULT_BELL_SCHEDULE.days, 2: "eight" as const } };
    expect(periodTime(c, 2, 3)).toEqual({ start: "09:15", end: "09:55" });
  });
});
