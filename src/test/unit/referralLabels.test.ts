import { describe, it, expect } from "vitest";
import { referralRecommendations, recommendationsLabel } from "@/lib/referralLabels";

describe("referralRecommendations", () => {
  it("uses the list when it has entries", () => {
    expect(referralRecommendations({ recommendations: ["OBSERVATION", "NOTIFY_PARENTS"], recommendation: "EXPULSION" }))
      .toEqual(["OBSERVATION", "NOTIFY_PARENTS"]);
  });

  it("falls back to the legacy single value for older referrals", () => {
    expect(referralRecommendations({ recommendations: [], recommendation: "EXPULSION" })).toEqual(["EXPULSION"]);
  });

  it("treats «Καμία εισήγηση» and nothing as no recommendation", () => {
    expect(referralRecommendations({ recommendations: [], recommendation: "NO_RECOMMENDATION" })).toEqual([]);
    expect(referralRecommendations({})).toEqual([]);
  });
});

describe("recommendationsLabel", () => {
  it("joins the Greek labels in order", () => {
    expect(recommendationsLabel(["STRICT_OBSERVATION", "NOTIFY_PARENTS"])).toBe("Αυστηρή παρατήρηση · Ενημέρωση γονέων");
  });

  it("is empty for none and keeps an unknown value as is", () => {
    expect(recommendationsLabel([])).toBe("");
    expect(recommendationsLabel(["SOMETHING_NEW"])).toBe("SOMETHING_NEW");
  });
});
