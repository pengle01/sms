import { describe, it, expect } from "vitest";
import { slotLinkAssignments } from "@/lib/timetableLink";

describe("slotLinkAssignments (re-link imported slots to approved staff)", () => {
  const profiles = [
    { id: "p_anna", scheduleName: "ΑΝ-ΑΝΤΩΝΙΟΥ Α.", userId: "u_anna" },
    { id: "p_bob", scheduleName: "ΗΥ-ΠΙΚΡΙΔΗΣ Χ.", userId: "u_bob" },
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
      { id: "p1", scheduleName: "ΚΟΙΝΟ ΟΝΟΜΑ", userId: "u1" },
      { id: "p2", scheduleName: "ΚΟΙΝΟ ΟΝΟΜΑ", userId: "u2" },
    ];
    const slots = [{ id: "s1", staffName: "ΚΟΙΝΟ ΟΝΟΜΑ", staffId: null }];
    expect(slotLinkAssignments(slots, dupes)).toEqual([]);
  });

  it("never links to a profile without a login (detached by user deletion / seeded)", () => {
    // deleteUser frees the slots and detaches the profile (userId → null) but
    // keeps its scheduleName; a re-import must NOT re-grab the freed slots for
    // the dead profile, or the name can never be re-claimed at registration.
    const orphaned = [{ id: "p_ghost", scheduleName: "ΑΝ-ΑΝΤΩΝΙΟΥ Α.", userId: null }];
    const slots = [{ id: "s1", staffName: "ΑΝ-ΑΝΤΩΝΙΟΥ Α.", staffId: null }];
    expect(slotLinkAssignments(slots, orphaned)).toEqual([]);
  });

  it("a login-less profile does not make a live profile's name ambiguous", () => {
    const mixed = [
      { id: "p_ghost", scheduleName: "ΑΝ-ΑΝΤΩΝΙΟΥ Α.", userId: null },
      { id: "p_anna", scheduleName: "ΑΝ-ΑΝΤΩΝΙΟΥ Α.", userId: "u_anna" },
    ];
    const slots = [{ id: "s1", staffName: "ΑΝ-ΑΝΤΩΝΙΟΥ Α.", staffId: null }];
    expect(slotLinkAssignments(slots, mixed)).toEqual([{ slotId: "s1", profileId: "p_anna" }]);
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
