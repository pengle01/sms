import { describe, it, expect } from "vitest";
import { slipPages, activationUrl, type Slip } from "@/lib/codeSlips";

const s = (n: string, g: string): Slip => ({ studentName: n, groupName: g, code: "482913057316" });

describe("code slips", () => {
  it("puts two students per sheet, leaving the bottom half empty for an odd count", () => {
    const pages = slipPages([{ groupName: "ΗΥ3", slips: [s("Α", "ΗΥ3"), s("Β", "ΗΥ3"), s("Γ", "ΗΥ3")] }]);
    expect(pages.map(([a, b]) => [a.studentName, b?.studentName ?? null])).toEqual([["Α", "Β"], ["Γ", null]]);
  });

  it("starts every homegroup on a new sheet and skips empty ones", () => {
    const pages = slipPages([
      { groupName: "ΗΥ3", slips: [s("Α", "ΗΥ3")] },
      { groupName: "ΗΥ4", slips: [] },
      { groupName: "ΜΕ1", slips: [s("Δ", "ΜΕ1"), s("Ε", "ΜΕ1")] },
    ]);
    expect(pages.map(([a, b]) => [a.groupName, b?.groupName ?? null])).toEqual([["ΗΥ3", null], ["ΜΕ1", "ΜΕ1"]]);
  });

  it("builds the activation link with the code after #", () => {
    expect(activationUrl("https://tesek-mak-lef-sms.org/", "482 913 057 316"))
      .toBe("https://tesek-mak-lef-sms.org/el/activate#code=482913057316");
  });
});
