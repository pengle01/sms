import { describe, it, expect } from "vitest";
import { compactReferralTitle, COMPACT_DESCRIPTION_CHARS } from "@/lib/referralLabels";

describe("compactReferralTitle", () => {
  it("shows the referral's title", () => {
    expect(compactReferralTitle({ title: "  Βία στο διάλειμμα ", description: "Κάτι άλλο" })).toEqual({
      text: "Βία στο διάλειμμα",
      fromTitle: true,
    });
  });

  it("falls back to the description on one line when there is no title", () => {
    expect(compactReferralTitle({ title: null, description: "Χτύπησε\n  συμμαθητή" })).toEqual({
      text: "Χτύπησε συμμαθητή",
      fromTitle: false,
    });
    expect(compactReferralTitle({ title: "   ", description: "Αργοπορία" }).fromTitle).toBe(false);
  });

  it("shortens a long description with an ellipsis", () => {
    const long = "λ".repeat(COMPACT_DESCRIPTION_CHARS + 20);
    const out = compactReferralTitle({ title: null, description: long });
    expect(out.text.length).toBe(COMPACT_DESCRIPTION_CHARS);
    expect(out.text.endsWith("…")).toBe(true);
  });

  it("shows a dash when there is nothing at all", () => {
    expect(compactReferralTitle({ title: null, description: "  " })).toEqual({ text: "—", fromTitle: false });
  });
});
