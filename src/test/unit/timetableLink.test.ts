import { describe, it, expect } from "vitest";
import { slotLinkAssignments, slotRelinks, sameStaffName } from "@/lib/timetableLink";

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

describe("slotRelinks", () => {
  const profiles = [
    { id: "p-larmou", scheduleName: "Μ-ΛΑΡΜΟΥ Κ.", userId: "u1" },
    { id: "p-other", scheduleName: "Μ-ΑΛΛΟΣ Α.", userId: "u2" },
    { id: "p-nologin", scheduleName: "Μ-ΧΩΡΙΣ Λ.", userId: null },
    { id: "p-dupA", scheduleName: "Μ-ΔΙΠΛΟ Δ.", userId: "u3" },
    { id: "p-dupB", scheduleName: "Μ-ΔΙΠΛΟ Δ.", userId: "u4" },
  ];

  it("moves a lesson attached to the wrong account to the right one", () => {
    const r = slotRelinks([{ id: "s1", staffName: "Μ-ΑΛΛΟΣ Α.", staffId: "p-larmou" }], profiles);
    expect(r).toEqual({ release: ["s1"], link: [{ slotId: "s1", profileId: "p-other" }] });
  });

  it("leaves a correctly attached lesson alone, ignoring stray spaces", () => {
    const r = slotRelinks(
      [
        { id: "s1", staffName: "Μ-ΛΑΡΜΟΥ Κ.", staffId: "p-larmou" },
        { id: "s2", staffName: " Μ-ΛΑΡΜΟΥ  Κ. ", staffId: "p-larmou" },
      ],
      profiles,
    );
    expect(r).toEqual({ release: [], link: [] });
  });

  it("releases but never guesses an ambiguous or login-less name", () => {
    const r = slotRelinks(
      [
        { id: "s1", staffName: "Μ-ΔΙΠΛΟ Δ.", staffId: "p-larmou" },
        { id: "s2", staffName: "Μ-ΧΩΡΙΣ Λ.", staffId: "p-larmou" },
      ],
      profiles,
    );
    expect(r.release).toEqual(["s1", "s2"]);
    expect(r.link).toEqual([]);
  });

  it("releases a lesson attached to a profile that no longer exists", () => {
    const r = slotRelinks([{ id: "s1", staffName: "Μ-ΛΑΡΜΟΥ Κ.", staffId: "gone" }], profiles);
    expect(r).toEqual({ release: ["s1"], link: [{ slotId: "s1", profileId: "p-larmou" }] });
  });

  it("still links plain unclaimed lessons", () => {
    const r = slotRelinks([{ id: "s1", staffName: "Μ-ΛΑΡΜΟΥ Κ.", staffId: null }], profiles);
    expect(r).toEqual({ release: [], link: [{ slotId: "s1", profileId: "p-larmou" }] });
  });
});

describe("sameStaffName", () => {
  it("ignores stray spaces but not a different name", () => {
    expect(sameStaffName("Μ-ΛΑΡΜΟΥ Κ.", " Μ-ΛΑΡΜΟΥ  Κ. ")).toBe(true);
    expect(sameStaffName("Μ-ΛΑΡΜΟΥ Κ.", "Μ-ΑΛΛΟΣ Α.")).toBe(false);
    expect(sameStaffName(null, "Μ-ΛΑΡΜΟΥ Κ.")).toBe(false);
  });
});
