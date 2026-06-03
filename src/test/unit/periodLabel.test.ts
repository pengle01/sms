import { describe, it, expect } from "vitest";
import { periodLabel } from "@/lib/periods";

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
