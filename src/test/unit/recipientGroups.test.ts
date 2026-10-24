import { describe, it, expect } from "vitest";
import { homegroupTeacherUserIds, keepAvailable, validateGroupName, GROUP_NAME_MAX } from "@/lib/recipientGroups";

describe("homegroupTeacherUserIds", () => {
  const students = [
    { homegroupId: "B31", groupIds: ["B31_FYS"] }, // takes an elective
    { homegroupId: "B31", groupIds: [] },
    { homegroupId: "B32", groupIds: ["B3_GEO"] }, // another class's elective
  ];
  const slots = [
    { groupId: "B31", userId: "math" },
    { groupId: "B31", userId: "greek" },
    { groupId: "B31_FYS", userId: "physics" },
    { groupId: "B31_FYS", userId: "math" }, // teaches both — once
    { groupId: "B3_GEO", userId: "geo" },
    { groupId: "B31", userId: null }, // a teacher without an account
  ];

  it("includes the class's own teachers and those of electives its students attend, each once", () => {
    expect(homegroupTeacherUserIds("B31", students, slots).sort()).toEqual(["greek", "math", "physics"]);
  });

  it("leaves out electives only other classes' students attend", () => {
    expect(homegroupTeacherUserIds("B31", students, slots)).not.toContain("geo");
    expect(homegroupTeacherUserIds("B32", students, slots)).toEqual(["geo"]);
  });

  it("is empty for a class with no students", () => {
    expect(homegroupTeacherUserIds("A11", students, slots)).toEqual([]);
  });
});

describe("validateGroupName", () => {
  it("trims and tidies the name", () => {
    expect(validateGroupName("  Επιτροπή   εκδρομής ")).toEqual({ ok: true, name: "Επιτροπή εκδρομής" });
  });

  it("rejects an empty or too long name", () => {
    expect(validateGroupName("   ")).toEqual({ ok: false, error: "err_groupName" });
    expect(validateGroupName("x".repeat(GROUP_NAME_MAX + 1))).toEqual({ ok: false, error: "err_groupName" });
    expect(validateGroupName("x".repeat(GROUP_NAME_MAX)).ok).toBe(true);
  });
});

describe("keepAvailable", () => {
  it("keeps only members who can still receive, each once, in order", () => {
    expect(keepAvailable(["a", "gone", "b", "a"], ["b", "a", "c"])).toEqual(["a", "b"]);
    expect(keepAvailable([], ["a"])).toEqual([]);
  });
});
