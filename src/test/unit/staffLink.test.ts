import { describe, it, expect } from "vitest";
import { staffProfilePlan } from "@/lib/staffLink";

describe("staffProfilePlan (approval: attach user to a StaffProfile)", () => {
  const NAME = "ΗΥ-ΑΝΔΡΕΟΥ Α. ΒΔ";

  it("keeps the user's own profile when the schedule name already matches", () => {
    expect(staffProfilePlan({ id: "p1", scheduleName: NAME }, null, NAME)).toEqual({
      kind: "keep",
      id: "p1",
    });
  });

  it("renames the user's own profile to the claimed schedule name", () => {
    expect(staffProfilePlan({ id: "p1", scheduleName: "ΠΑΛΙΟ" }, null, NAME)).toEqual({
      kind: "rename",
      id: "p1",
    });
  });

  it("prefers the user's own profile over an unclaimed one with the same name", () => {
    expect(
      staffProfilePlan({ id: "p_own", scheduleName: NAME }, { id: "p_seed", scheduleName: NAME }, NAME),
    ).toEqual({ kind: "keep", id: "p_own" });
  });

  it("adopts a pre-seeded / detached unclaimed profile instead of duplicating it", () => {
    // e.g. HEADTEACHER_B self-registers: sp_headteacher_b_XX already exists
    // with this scheduleName and no user. A duplicate would make the name
    // ambiguous and the timetable re-link would skip it forever.
    expect(staffProfilePlan(null, { id: "sp_headteacher_b_03", scheduleName: NAME }, NAME)).toEqual({
      kind: "adopt",
      id: "sp_headteacher_b_03",
    });
  });

  it("adopts the roster profile the timetable import created — the normal path", () => {
    // Since the import writes a profile for every name in the Καθηγητής column,
    // an approving admin almost always finds one waiting. "create" is now the
    // fallback for a name that predates the roster, not the usual case.
    expect(staffProfilePlan(null, { id: "p_roster", scheduleName: "ΣΕΑ-ΜΙΧΑΗΛ Χ." }, "ΣΕΑ-ΜΙΧΑΗΛ Χ."))
      .toEqual({ kind: "adopt", id: "p_roster" });
  });

  it("creates a fresh profile when the user has none and the name is unclaimed", () => {
    expect(staffProfilePlan(null, null, NAME)).toEqual({ kind: "create" });
  });
});
