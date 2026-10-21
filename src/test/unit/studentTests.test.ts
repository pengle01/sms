import { describe, it, expect } from "vitest";
import { testAudience, audienceGroupIds, type TaughtStudent } from "@/lib/studentTests";

// My groups: homegroup B31 (a, b, c) and the elective FYS (a, d from B32).
const students: TaughtStudent[] = [
  { id: "a", groupIds: ["B31", "FYS"] },
  { id: "b", groupIds: ["B31", "CHEM"] },
  { id: "c", groupIds: ["B31"] },
  { id: "d", groupIds: ["B32", "FYS"] },
];
const mine = ["B31", "FYS"];

describe("testAudience", () => {
  it("marks a test for my whole group as not partial", () => {
    // …and it also reaches "a" in my FYS elective group.
    expect(testAudience("B31", mine, students)).toEqual([
      { groupId: "B31", studentIds: ["a", "b", "c"], total: 3, partial: false },
      { groupId: "FYS", studentIds: ["a"], total: 2, partial: true },
    ]);
  });

  it("marks an elective test reaching only some of my group as partial", () => {
    expect(testAudience("CHEM", mine, students)).toEqual([
      { groupId: "B31", studentIds: ["b"], total: 3, partial: true },
    ]);
  });

  it("reports every group of mine the test reaches", () => {
    // B32's test reaches d, who is in my FYS group but not in B31.
    expect(testAudience("B32", mine, students)).toEqual([
      { groupId: "FYS", studentIds: ["d"], total: 2, partial: true },
    ]);
    const fys = testAudience("FYS", mine, students);
    expect(fys.map((r) => [r.groupId, r.partial])).toEqual([["B31", true], ["FYS", false]]);
  });

  it("returns nothing when none of my students sit the test", () => {
    expect(testAudience("G99", mine, students)).toEqual([]);
  });
});

describe("audienceGroupIds", () => {
  it("collects every group my students belong to, once", () => {
    expect(audienceGroupIds(students).sort()).toEqual(["B31", "B32", "CHEM", "FYS"]);
    expect(audienceGroupIds([])).toEqual([]);
  });
});
