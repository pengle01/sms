import { describe, it, expect } from "vitest";
import { weeklyOccurrences } from "@/lib/activities";

describe("weeklyOccurrences", () => {
  it("returns just the start date when there is no repeat-until", () => {
    expect(weeklyOccurrences("2026-03-16", null)).toEqual(["2026-03-16"]);
  });

  it("returns just the start date when until is before the start", () => {
    expect(weeklyOccurrences("2026-03-16", "2026-03-09")).toEqual(["2026-03-16"]);
  });

  it("returns just the start date when until equals the start", () => {
    expect(weeklyOccurrences("2026-03-16", "2026-03-16")).toEqual(["2026-03-16"]);
  });

  it("steps weekly on the same weekday, inclusive of the end", () => {
    expect(weeklyOccurrences("2026-03-16", "2026-04-06")).toEqual([
      "2026-03-16",
      "2026-03-23",
      "2026-03-30",
      "2026-04-06",
    ]);
  });

  it("stops before an end date that falls mid-week", () => {
    expect(weeklyOccurrences("2026-03-16", "2026-03-31")).toEqual([
      "2026-03-16",
      "2026-03-23",
      "2026-03-30",
    ]);
  });
});
