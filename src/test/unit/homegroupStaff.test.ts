import { describe, it, expect } from "vitest";
import { homegroupCandidates, type HomegroupProfile } from "@/lib/homegroupStaff";

const p = (id: string, scheduleName: string | null, role: HomegroupProfile["role"] = null, leftTimetable = false): HomegroupProfile =>
  ({ id, scheduleName, role, leftTimetable });

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("homegroupCandidates", () => {
  it("places staff with an account by their role", () => {
    const r = homegroupCandidates([
      p("t", "Μ-ΑΛΦΑ Α.", "TEACHER"),
      p("h", "Φ-ΒΗΤΑ Β. ΒΔ", "HEADTEACHER_B"),
      p("c", "ΣΕΑ-ΓΑΜΜΑ Γ.", "STUDENT_COUNSELOR"),
      p("a", "Χ-ΔΕΛΤΑ Δ. ΒΔΑ", "HEADTEACHER_A"),
    ]);
    expect(ids(r.teachers)).toEqual(["t"]);
    expect(ids(r.headteachers)).toEqual(["h"]);
    expect(ids(r.counselors)).toEqual(["c"]);
    expect(r.teachers[0]!.hasAccount).toBe(true);
  });

  it("places staff without an account by their timetable name", () => {
    const r = homegroupCandidates([
      p("t", "Μ-ΑΛΦΑ Α."),
      p("h", "Φ-ΒΗΤΑ Β. ΒΔ"),
      p("c", "ΣΕΑ-ΓΑΜΜΑ Γ."),
    ]);
    expect(ids(r.teachers)).toEqual(["t"]);
    expect(ids(r.headteachers)).toEqual(["h"]);
    expect(ids(r.counselors)).toEqual(["c"]);
    expect(r.headteachers[0]!.hasAccount).toBe(false);
  });

  it("keeps the headmaster and deputy A out of the teacher list", () => {
    const r = homegroupCandidates([p("d", "Ξ-ΑΝΔΡΕΟΥ Ι. Δ"), p("a", "Χ-ΔΕΛΤΑ Δ. ΒΔΑ"), p("e", "Ε-ΛΑΜΠΡΟΥ Δ.")]);
    expect(ids(r.teachers)).toEqual(["e"]); // "Δ." is an initial, not the marker
    expect(r.headteachers).toEqual([]);
  });

  it("skips profiles that left the timetable or have no name", () => {
    const r = homegroupCandidates([p("x", "Μ-ΠΑΛΙΟΣ Α.", null, true), p("y", null)]);
    expect(r.teachers).toEqual([]);
  });
});
