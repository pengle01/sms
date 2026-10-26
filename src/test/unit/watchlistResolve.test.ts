import { describe, it, expect } from "vitest";
import type { Flag } from "@/lib/behaviorFlags";
import { flagKey, flagSnapshot, parseFlagSnapshot, stillResolved, canResolveWatchlist } from "@/lib/watchlistResolve";

const flag = (code: Flag["code"], count: number, extra: Partial<Flag> = {}): Flag => ({
  code,
  count,
  severity: "medium",
  ...extra,
});

describe("watchlist resolution", () => {
  it("keys a pattern by its code and its lesson or weekday", () => {
    expect(flagKey(flag("LATENESS", 4))).toBe("LATENESS||");
    expect(flagKey(flag("REPEATED_COURSE_SKIP", 3, { course: "Μαθηματικά" }))).toBe("REPEATED_COURSE_SKIP|Μαθηματικά|");
    expect(flagKey(flag("WEEKDAY_CLUSTER", 3, { weekday: 1 }))).toBe("WEEKDAY_CLUSTER||1");
  });

  it("stays resolved while nothing is new or bigger", () => {
    const snap = flagSnapshot([flag("LATENESS", 4), flag("REPEATED_COURSE_SKIP", 3, { course: "Φυσική" })]);
    expect(stillResolved([flag("LATENESS", 4)], snap)).toBe(true);
    expect(stillResolved([flag("LATENESS", 2), flag("REPEATED_COURSE_SKIP", 3, { course: "Φυσική" })], snap)).toBe(true);
    expect(stillResolved([], snap)).toBe(true);
  });

  it("comes back when a pattern grows", () => {
    const snap = flagSnapshot([flag("LATENESS", 4)]);
    expect(stillResolved([flag("LATENESS", 5)], snap)).toBe(false);
  });

  it("comes back on a new pattern, including the same code for another lesson", () => {
    const snap = flagSnapshot([flag("REPEATED_COURSE_SKIP", 3, { course: "Φυσική" })]);
    expect(stillResolved([flag("TOILET_LONG", 2)], snap)).toBe(false);
    expect(stillResolved([flag("REPEATED_COURSE_SKIP", 3, { course: "Χημεία" })], snap)).toBe(false);
  });

  it("reads a stored snapshot defensively", () => {
    expect(parseFlagSnapshot({ "LATENESS||": 4, bad: "x" })).toEqual({ "LATENESS||": 4 });
    expect(parseFlagSnapshot(null)).toEqual({});
    expect(parseFlagSnapshot([1, 2])).toEqual({});
  });

  it("lets only the homegroup's deputy resolve", () => {
    expect(canResolveWatchlist(["head"])).toBe(true);
    expect(canResolveWatchlist(["teacher", "head"])).toBe(true);
    expect(canResolveWatchlist(["teacher"])).toBe(false);
    expect(canResolveWatchlist(["counselor"])).toBe(false);
  });
});
