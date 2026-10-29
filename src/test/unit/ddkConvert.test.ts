import { describe, it, expect } from "vitest";
import { pointsToAward } from "@/lib/ddk";

describe("ΔΔΚ conversion points", () => {
  it("skips a student left blank or at 0", () => {
    expect(pointsToAward({ kind: "range", min: 1, max: 3 }, "")).toBeNull();
    expect(pointsToAward({ kind: "range", min: 1, max: 3 }, "0")).toBeNull();
    expect(pointsToAward({ kind: "fixed", value: 2 }, null)).toBeNull();
  });

  it("keeps the points within what the guide allows", () => {
    expect(pointsToAward({ kind: "range", min: 1, max: 3 }, "2")).toBe(2);
    expect(pointsToAward({ kind: "range", min: 1, max: 3 }, "9")).toBe(3);
    expect(pointsToAward({ kind: "range", min: 2, max: 5 }, "1")).toBe(2);
    expect(pointsToAward({ kind: "fixed", value: 2 }, "1")).toBe(2);
  });
});
