import { describe, it, expect } from "vitest";
import { availableStaffNames } from "@/lib/staffRoster";

const call = (input: Partial<Parameters<typeof availableStaffNames>[0]>) =>
  availableStaffNames({ profiles: [], slotNames: [], claimedNames: [], ...input });

describe("availableStaffNames", () => {
  it("offers a roster profile that has no user yet", () => {
    expect(call({ profiles: [{ scheduleName: "ΣΕΑ-ΜΙΧΑΗΛ Χ.", userId: null }] }))
      .toEqual(["ΣΕΑ-ΜΙΧΑΗΛ Χ."]);
  });

  it("still offers a slot name that has no profile yet", () => {
    // A database whose timetable was imported before the roster existed.
    expect(call({ slotNames: ["ΗΥ-ΠΑΟΣ Μ."] })).toEqual(["ΗΥ-ΠΑΟΣ Μ."]);
  });

  it("does not offer a name whose profile has a user", () => {
    expect(call({ profiles: [{ scheduleName: "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ", userId: "u1" }] })).toEqual([]);
  });

  it("does not offer a slot name held by a profile with a user", () => {
    // The slot is unlinked but the person exists — an admin linked the profile
    // by hand, or a later import added a lesson the re-link has not caught.
    expect(call({
      profiles: [{ scheduleName: "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ", userId: "u1" }],
      slotNames: ["ΗΥ-ΜΑΣΙΑ Μ. ΒΔ"],
    })).toEqual([]);
  });

  it("excludes a name with a pending or approved claim", () => {
    expect(call({
      profiles: [{ scheduleName: "Μ-ΑΡΝΟΣ Σ.", userId: null }],
      claimedNames: ["Μ-ΑΡΝΟΣ Σ."],
    })).toEqual([]);
  });

  it("offers a name again once its claim was rejected", () => {
    // Rejected claims are simply not passed in.
    expect(call({ profiles: [{ scheduleName: "Μ-ΑΡΝΟΣ Σ.", userId: null }], claimedNames: [] }))
      .toEqual(["Μ-ΑΡΝΟΣ Σ."]);
  });

  it("lists a name present in both sources once", () => {
    expect(call({
      profiles: [{ scheduleName: "Ε-ΛΑΜΠΡΟΥ Δ.", userId: null }],
      slotNames: ["Ε-ΛΑΜΠΡΟΥ Δ.", "Ε-ΛΑΜΠΡΟΥ Δ."],
    })).toEqual(["Ε-ΛΑΜΠΡΟΥ Δ."]);
  });

  it("trims names and drops null, empty and whitespace-only ones", () => {
    expect(call({
      profiles: [
        { scheduleName: "  Α-ΚΥΡΜΙΖΗ Η.  ", userId: null },
        { scheduleName: null, userId: null },
        { scheduleName: "   ", userId: null },
      ],
      slotNames: [null, ""],
    })).toEqual(["Α-ΚΥΡΜΙΖΗ Η."]);
  });

  it("matches a claim against the trimmed name", () => {
    expect(call({
      profiles: [{ scheduleName: " Μ-ΑΡΝΟΣ Σ. ", userId: null }],
      claimedNames: [" Μ-ΑΡΝΟΣ Σ. "],
    })).toEqual([]);
  });

  it("sorts with Greek collation", () => {
    expect(call({ slotNames: ["Β-ΔΙΟΝΥΣΙΟΥ Δ.", "Α-ΚΥΡΜΙΖΗ Η.", "Γ-ΦΕΛΛΑ Μ."] }))
      .toEqual(["Α-ΚΥΡΜΙΖΗ Η.", "Β-ΔΙΟΝΥΣΙΟΥ Δ.", "Γ-ΦΕΛΛΑ Μ."]);
  });

  it("returns an empty list when there is nothing to offer", () => {
    expect(call({})).toEqual([]);
  });
});
