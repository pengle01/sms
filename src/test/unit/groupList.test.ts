import { describe, it, expect } from "vitest";
import { groupKind, canSeeGroupList, parseGroupFilters, filterGroups, groupStudents, groupListPrintHref } from "@/lib/groupList";

describe("groupKind", () => {
  it("tells support groups by name, homegroups by their members, the rest are lesson groups", () => {
    expect(groupKind("ΣΤ_Β3_ΕΛΛ", 0)).toBe("support");
    expect(groupKind("ΑΣΤ_Β3_ΜΑΘ", 0)).toBe("support");
    expect(groupKind("Β31", 27)).toBe("homegroup");
    expect(groupKind("Β31_ΦΥΣ", 0)).toBe("lesson");
  });

  it("keeps a support name a support group even if it had homegroup members", () => {
    expect(groupKind("ΣΤ_Α1", 3)).toBe("support");
  });
});

describe("canSeeGroupList", () => {
  it("lets every staff portal see homegroups and lesson groups", () => {
    for (const role of ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN", "HEADTEACHER_B"] as const) {
      expect(canSeeGroupList([role], "homegroup", false)).toBe(true);
      expect(canSeeGroupList([role], "lesson", false)).toBe(true);
    }
  });

  it("keeps support groups to full special-education access", () => {
    expect(canSeeGroupList(["TEACHER"], "support", false)).toBe(false);
    expect(canSeeGroupList(["TEACHER"], "support", true)).toBe(true);
  });

  it("refuses students, parents and chaperones", () => {
    for (const role of ["STUDENT", "PARENT", "CHAPERONE"] as const) {
      expect(canSeeGroupList([role], "homegroup", true)).toBe(false);
    }
  });
});

describe("parseGroupFilters", () => {
  it("reads year, kind and name from the URL", () => {
    expect(parseGroupFilters({ q: " β3 ", grade: "2", kind: "lesson" })).toEqual({ q: "β3", grade: 2, kind: "lesson" });
  });

  it("treats anything unknown as no filter", () => {
    expect(parseGroupFilters({ grade: "7", kind: "club" })).toEqual({ q: "", grade: null, kind: null });
    expect(parseGroupFilters({})).toEqual({ q: "", grade: null, kind: null });
  });
});

describe("filterGroups", () => {
  const G = [
    { id: "1", name: "Β31_ΦΥΣ", kind: "lesson" as const, grade: 2 },
    { id: "2", name: "Β32", kind: "homegroup" as const, grade: 2 },
    { id: "3", name: "Β31", kind: "homegroup" as const, grade: 2 },
    { id: "4", name: "Α11", kind: "homegroup" as const, grade: 1 },
    { id: "5", name: "ΣΤ_Β3_ΕΛΛ", kind: "support" as const, grade: 2 },
  ];
  const none = { q: "", grade: null, kind: null };

  it("lists every group with no filter: homegroups first, then by name", () => {
    expect(filterGroups(G, none).map((g) => g.name)).toEqual(["Α11", "Β31", "Β32", "Β31_ΦΥΣ", "ΣΤ_Β3_ΕΛΛ"]);
  });

  it("narrows by year, by kind and by name, together", () => {
    expect(filterGroups(G, { ...none, grade: 1 }).map((g) => g.id)).toEqual(["4"]);
    expect(filterGroups(G, { ...none, kind: "lesson" }).map((g) => g.id)).toEqual(["1"]);
    expect(filterGroups(G, { ...none, q: "β31" }).map((g) => g.id)).toEqual(["3", "1"]);
    expect(filterGroups(G, { q: "φυσ", grade: 2, kind: "lesson" }).map((g) => g.id)).toEqual(["1"]);
    expect(filterGroups(G, { q: "φυσ", grade: 1, kind: null })).toEqual([]);
  });
});

describe("groupStudents", () => {
  it("merges homegroup and enrolled members once each, in Greek order", () => {
    const rows = [
      { id: "b", studentId: "2", name: "Βασιλείου Νίκος", homegroup: "Β31" },
      { id: "a", studentId: "1", name: "Αντωνίου Μαρία", homegroup: "Β32" },
      { id: "b", studentId: "2", name: "Βασιλείου Νίκος", homegroup: "Β31" },
    ];
    expect(groupStudents(rows).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("is empty for no students", () => {
    expect(groupStudents([])).toEqual([]);
  });
});

describe("groupListPrintHref", () => {
  it("opens the print sheet with the way back and auto-print", () => {
    expect(groupListPrintHref("el", "g1", "/el/teacher/whereabouts?tab=groups")).toBe(
      "/el/print/group?id=g1&back=%2Fel%2Fteacher%2Fwhereabouts%3Ftab%3Dgroups&auto=1",
    );
  });
});
