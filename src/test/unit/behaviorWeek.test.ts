import { describe, it, expect } from "vitest";
import { weekMonday, parseBehaviorWeek, weekRange } from "@/lib/behaviorWeek";

const TODAY = "2026-10-29"; // a Thursday

describe("Τμήμα μου by week", () => {
  it("finds the Monday of a day's week", () => {
    expect(weekMonday("2026-10-26")).toBe("2026-10-26"); // Monday
    expect(weekMonday(TODAY)).toBe("2026-10-26");
    expect(weekMonday("2026-11-01")).toBe("2026-10-26"); // Sunday
  });

  it("defaults to this week and never goes past it", () => {
    expect(parseBehaviorWeek(undefined, TODAY)).toBe("2026-10-26");
    expect(parseBehaviorWeek("garbage", TODAY)).toBe("2026-10-26");
    expect(parseBehaviorWeek("2026-10-15", TODAY)).toBe("2026-10-12");
    expect(parseBehaviorWeek("2026-11-20", TODAY)).toBe("2026-10-26");
  });

  it("spans Monday to Sunday", () => {
    expect(weekRange("2026-10-26")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });
});
