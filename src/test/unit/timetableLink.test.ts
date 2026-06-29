import { describe, it, expect } from "vitest";
import { slotLinkAssignments } from "@/lib/timetableLink";

describe("slotLinkAssignments (re-link imported slots to approved staff)", () => {
  const profiles = [
    { id: "p_anna", scheduleName: "ΑΝ-ΑΝΤΩΝΙΟΥ Α." },
    { id: "p_bob", scheduleName: "ΗΥ-ΠΙΚΡΙΔΗΣ Χ." },
  ];

  it("links a newly-imported unclaimed slot to the matching profile", () => {
    const slots = [{ id: "s1", staffName: "ΑΝ-ΑΝΤΩΝΙΟΥ Α.", staffId: null }];
    expect(slotLinkAssignments(slots, profiles)).toEqual([{ slotId: "s1", profileId: "p_anna" }]);
  });

  it("never overwrites a slot that is already claimed", () => {
    const slots = [{ id: "s1", staffName: "ΑΝ-ΑΝΤΩΝΙΟΥ Α.", staffId: "p_other" }];
    expect(slotLinkAssignments(slots, profiles)).toEqual([]);
  });

  it("skips slots whose name matches no profile", () => {
    const slots = [{ id: "s1", staffName: "ΞΞ-ΑΓΝΩΣΤΟΣ", staffId: null }];
    expect(slotLinkAssignments(slots, profiles)).toEqual([]);
  });

  it("skips ambiguous names shared by more than one profile (never guesses)", () => {
    const dupes = [
      { id: "p1", scheduleName: "ΚΟΙΝΟ ΟΝΟΜΑ" },
      { id: "p2", scheduleName: "ΚΟΙΝΟ ΟΝΟΜΑ" },
    ];
    const slots = [{ id: "s1", staffName: "ΚΟΙΝΟ ΟΝΟΜΑ", staffId: null }];
    expect(slotLinkAssignments(slots, dupes)).toEqual([]);
  });

  it("ignores blank staffName / scheduleName and trims surrounding whitespace", () => {
    const slots = [
      { id: "s_blank", staffName: "", staffId: null },
      { id: "s_pad", staffName: " ΗΥ-ΠΙΚΡΙΔΗΣ Χ. ", staffId: null },
    ];
    expect(slotLinkAssignments(slots, profiles)).toEqual([{ slotId: "s_pad", profileId: "p_bob" }]);
  });

  it("links many slots for the same teacher (a full added day)", () => {
    const slots = [
      { id: "s1", staffName: "ΑΝ-ΑΝΤΩΝΙΟΥ Α.", staffId: null },
      { id: "s2", staffName: "ΑΝ-ΑΝΤΩΝΙΟΥ Α.", staffId: null },
    ];
    expect(slotLinkAssignments(slots, profiles)).toEqual([
      { slotId: "s1", profileId: "p_anna" },
      { slotId: "s2", profileId: "p_anna" },
    ]);
  });
});
