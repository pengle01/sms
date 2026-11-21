import { describe, it, expect } from "vitest";
import { activityPeriods, splitActivities } from "@/lib/studentActivities";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("splitActivities", () => {
  const rows = [
    { id: "a", date: d("2026-11-10"), startPeriod: 3 },
    { id: "b", date: d("2026-11-19"), startPeriod: 5 },
    { id: "c", date: d("2026-11-19"), startPeriod: 1 },
    { id: "d", date: d("2026-12-02"), startPeriod: 2 },
    { id: "e", date: d("2026-10-01"), startPeriod: 1 },
  ];

  it("puts today and later in upcoming, soonest first", () => {
    expect(splitActivities(rows, d("2026-11-19")).upcoming.map((r) => r.id)).toEqual(["c", "b", "d"]);
  });

  it("puts earlier days in past, latest first", () => {
    expect(splitActivities(rows, d("2026-11-19")).past.map((r) => r.id)).toEqual(["a", "e"]);
  });

  it("handles no activities", () => {
    expect(splitActivities([], d("2026-11-19"))).toEqual({ upcoming: [], past: [] });
  });
});

describe("activityPeriods", () => {
  it("shows a single period or a range", () => {
    expect(activityPeriods(3, 3, "el")).toBe("Π3");
    expect(activityPeriods(3, 5, "el")).toBe("Π3–5");
    expect(activityPeriods(2, 4, "en")).toBe("P2–4");
  });
});
