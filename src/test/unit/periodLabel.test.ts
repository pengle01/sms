import { describe, it, expect } from "vitest";
import { periodLabel } from "@/lib/periods";
import { groupByPeriod } from "@/lib/periods";

describe("periodLabel", () => {
  it("uses the Greek prefix for el", () => {
    expect(periodLabel(1, "el")).toBe("Π1");
    expect(periodLabel(7, "el")).toBe("Π7");
  });

  it("uses the Latin prefix for English", () => {
    expect(periodLabel(1, "en")).toBe("P1");
    expect(periodLabel(3, "en")).toBe("P3");
  });

  it("defaults to the Latin prefix for unknown locales", () => {
    expect(periodLabel(2, "fr")).toBe("P2");
  });
});

describe("groupByPeriod", () => {
  it("keeps every lesson of a period, ordered by class", () => {
    const slots = [
      { id: "a", period: 4, group: { name: "ΜΠ1_ΜΕ1" } },
      { id: "b", period: 4, group: { name: "ΘΗΜ1_ΘΗΥ1" } },
      { id: "c", period: 7, group: { name: "ΕΜ2" } },
    ];
    const m = groupByPeriod(slots);
    expect(m.get(4)!.map((s) => s.id)).toEqual(["b", "a"]);
    expect(m.get(7)!.map((s) => s.id)).toEqual(["c"]);
    expect(m.get(1)).toBeUndefined();
  });
});
