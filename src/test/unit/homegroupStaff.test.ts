import { describe, it, expect } from "vitest";
import { homegroupCandidates, roleNeededFor, roleFitsPosts, filterHomegroupRows, type HomegroupProfile } from "@/lib/homegroupStaff";

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
    expect(ids(r.headteachers)).toEqual(["h", "a"]); // Deputy A too
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

  it("offers Deputy A as a homegroup deputy, never the headmaster", () => {
    const r = homegroupCandidates([
      p("d", "Ξ-ΑΝΔΡΕΟΥ Ι. Δ"),
      p("a", "Χ-ΔΕΛΤΑ Δ. ΒΔΑ"),
      p("aa", "Μ-ΑΛΛΟΣ Α.", "HEADTEACHER_A"),
      { id: "ap", scheduleName: "Φ-ΧΩΡΙΣ ΣΗΜΑ Β.", role: null, plannedRole: "HEADTEACHER_A", leftTimetable: false },
      p("e", "Ε-ΛΑΜΠΡΟΥ Δ."),
    ]);
    expect(ids(r.headteachers)).toEqual(["a", "aa", "ap"]);
    expect(ids(r.teachers)).toEqual(["e"]); // "Δ." is an initial, not the marker
    expect([...ids(r.teachers), ...ids(r.headteachers), ...ids(r.counselors)]).not.toContain("d");
  });

  it("places an unmarked deputy as headteacher by account role or planned role", () => {
    const r = homegroupCandidates([
      p("acct", "Μ-ΧΩΡΙΣ ΣΗΜΑ Α.", "HEADTEACHER_B"),
      { id: "planned", scheduleName: "Φ-ΧΩΡΙΣ ΣΗΜΑ Β.", role: null, plannedRole: "HEADTEACHER_B", leftTimetable: false },
    ]);
    expect(ids(r.headteachers)).toEqual(["acct", "planned"]);
    expect(r.teachers).toEqual([]);
  });

  it("a planned role overrides the name marker", () => {
    const r = homegroupCandidates([{ id: "x", scheduleName: "Φ-ΒΗΤΑ Β. ΒΔ", role: null, plannedRole: "TEACHER", leftTimetable: false }]);
    expect(ids(r.teachers)).toEqual(["x"]);
  });

  it("skips profiles that left the timetable or have no name", () => {
    const r = homegroupCandidates([p("x", "Μ-ΠΑΛΙΟΣ Α.", null, true), p("y", null)]);
    expect(r.teachers).toEqual([]);
  });
});

describe("roleNeededFor", () => {
  it("asks for the counselor or deputy-B role when such posts are assigned", () => {
    expect(roleNeededFor({ teacherOf: [], headteacherOf: [], counselorOf: ["Α1"] })).toBe("STUDENT_COUNSELOR");
    expect(roleNeededFor({ teacherOf: [], headteacherOf: ["Β2"], counselorOf: [] })).toBe("HEADTEACHER_B");
  });

  it("needs no particular role for a homeroom teacher or no posts", () => {
    expect(roleNeededFor({ teacherOf: ["Α1"], headteacherOf: [], counselorOf: [] })).toBeNull();
    expect(roleNeededFor({ teacherOf: [], headteacherOf: [], counselorOf: [] })).toBeNull();
  });
});

describe("filterHomegroupRows", () => {
  const rows = [
    { groupName: "Α1", teacher: "Μ-ΠΑΠΑΣ Α.", headteacher: "Φ-ΒΗΤΑ Β. ΒΔ", counselor: "ΣΕΑ-ΓΑΜΜΑ Γ." },
    { groupName: "Β2", teacher: "Ε-ΛΑΜΠΡΟΥ Δ.", headteacher: null, counselor: null },
  ];

  it("matches by class and by any of the three names", () => {
    expect(filterHomegroupRows(rows, "β2").map((r) => r.groupName)).toEqual(["Β2"]);
    expect(filterHomegroupRows(rows, "παπας").map((r) => r.groupName)).toEqual(["Α1"]);
    expect(filterHomegroupRows(rows, "βητα").map((r) => r.groupName)).toEqual(["Α1"]);
    expect(filterHomegroupRows(rows, "γαμμα").map((r) => r.groupName)).toEqual(["Α1"]);
  });

  it("ignores accents and case", () => {
    expect(filterHomegroupRows(rows, "λαμπρού").map((r) => r.groupName)).toEqual(["Β2"]);
  });

  it("returns everything for an empty search", () => {
    expect(filterHomegroupRows(rows, "  ")).toHaveLength(2);
  });
});

describe("roleFitsPosts", () => {
  const none = { teacherOf: [], headteacherOf: [], counselorOf: [] };
  it("deputy posts suit Deputy A or B, not a teacher", () => {
    const deputy = { ...none, headteacherOf: ["Β2"] };
    expect(roleFitsPosts("HEADTEACHER_B", deputy)).toBe(true);
    expect(roleFitsPosts("HEADTEACHER_A", deputy)).toBe(true);
    expect(roleFitsPosts("TEACHER", deputy)).toBe(false);
  });
  it("counselor posts need the counselor role", () => {
    expect(roleFitsPosts("STUDENT_COUNSELOR", { ...none, counselorOf: ["Α1"] })).toBe(true);
    expect(roleFitsPosts("HEADTEACHER_B", { ...none, counselorOf: ["Α1"] })).toBe(false);
  });
  it("no posts: any role fits", () => {
    expect(roleFitsPosts("TEACHER", none)).toBe(true);
  });
});
