import { describe, it, expect } from "vitest";
import {
  normRegistry,
  missingStudents,
  parentsLeftWithoutActiveChild,
  reactivatedByImport,
  looksPartial,
} from "@/lib/studentImportSync";

describe("normRegistry", () => {
  it("normalises numbers, text and spaces", () => {
    expect(normRegistry(1234)).toBe("1234");
    expect(normRegistry(" 1234 ")).toBe("1234");
    expect(normRegistry(null)).toBe("");
    expect(normRegistry(undefined)).toBe("");
  });
});

describe("missingStudents", () => {
  const active = [
    { profileId: "a", registry: "100" },
    { profileId: "b", registry: "200" },
    { profileId: "c", registry: " 300 " },
  ];

  it("returns active students absent from the file", () => {
    expect(missingStudents(active, new Set(["100", "300"])).map((s) => s.profileId)).toEqual(["b"]);
  });

  it("matches registry numbers regardless of stray spaces", () => {
    expect(missingStudents(active, new Set(["100", "200", "300"]))).toEqual([]);
  });

  it("an empty file removes nobody", () => {
    expect(missingStudents(active, new Set())).toEqual([]);
  });
});

describe("parentsLeftWithoutActiveChild", () => {
  it("deactivates a parent whose only child is removed", () => {
    const parents = [{ parentUserId: "p1", parentActive: true, children: [{ profileId: "a", active: true }] }];
    expect(parentsLeftWithoutActiveChild(parents, new Set(["a"]))).toEqual(["p1"]);
  });

  it("keeps a parent with another active child", () => {
    const parents = [{
      parentUserId: "p1", parentActive: true,
      children: [{ profileId: "a", active: true }, { profileId: "b", active: true }],
    }];
    expect(parentsLeftWithoutActiveChild(parents, new Set(["a"]))).toEqual([]);
  });

  it("deactivates a parent whose other children are already inactive", () => {
    const parents = [{
      parentUserId: "p1", parentActive: true,
      children: [{ profileId: "a", active: true }, { profileId: "b", active: false }],
    }];
    expect(parentsLeftWithoutActiveChild(parents, new Set(["a"]))).toEqual(["p1"]);
  });

  it("leaves parents untouched when none of their children is removed, or they are already inactive", () => {
    const parents = [
      { parentUserId: "p1", parentActive: true, children: [{ profileId: "b", active: false }] },
      { parentUserId: "p2", parentActive: false, children: [{ profileId: "a", active: true }] },
    ];
    expect(parentsLeftWithoutActiveChild(parents, new Set(["a"]))).toEqual([]);
  });
});

describe("reactivatedByImport", () => {
  it("brings back only accounts the import switched off", () => {
    expect(reactivatedByImport({ active: false, deactivatedByImport: new Date() })).toBe(true);
    expect(reactivatedByImport({ active: false, deactivatedByImport: null })).toBe(false);
    expect(reactivatedByImport({ active: true, deactivatedByImport: null })).toBe(false);
  });
});

describe("looksPartial", () => {
  it("warns when the file holds less than half the active students", () => {
    expect(looksPartial(72, 980)).toBe(true);
    expect(looksPartial(950, 980)).toBe(false);
    expect(looksPartial(10, 0)).toBe(false);
  });
});
