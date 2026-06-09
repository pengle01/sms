import { describe, it, expect } from "vitest";
import {
  reachableStaffIds,
  oversightStaffIds,
  isUnreadForStaff,
  isUnreadForFamily,
} from "@/lib/messaging";

describe("reachableStaffIds", () => {
  it("combines subject teachers with homegroup roles, deduped", () => {
    const ids = reachableStaffIds({
      subjectTeacherIds: ["t1", "t2", "t1"],
      homeroomTeacherId: "t2", // also a subject teacher → not duplicated
      homeroomHeadteacherId: "h1",
      counselorId: "c1",
    });
    expect(ids.sort()).toEqual(["c1", "h1", "t1", "t2"]);
  });

  it("drops null/undefined ids", () => {
    const ids = reachableStaffIds({
      subjectTeacherIds: ["t1", null, undefined],
      homeroomTeacherId: null,
      homeroomHeadteacherId: undefined,
      counselorId: "c1",
    });
    expect(ids.sort()).toEqual(["c1", "t1"]);
  });

  it("is empty when nobody is linked", () => {
    expect(reachableStaffIds({ subjectTeacherIds: [] })).toEqual([]);
  });
});

describe("oversightStaffIds", () => {
  it("returns only the homegroup roles, deduped", () => {
    expect(
      oversightStaffIds({ homeroomTeacherId: "t1", homeroomHeadteacherId: "t1", counselorId: "c1" }).sort()
    ).toEqual(["c1", "t1"]);
  });
  it("excludes subject teachers (not passed)", () => {
    expect(oversightStaffIds({})).toEqual([]);
  });
});

describe("unread computation", () => {
  const older = new Date("2026-06-09T10:00:00Z");
  const newer = new Date("2026-06-09T11:00:00Z");

  it("is unread when never read", () => {
    expect(isUnreadForStaff({ lastMessageAt: older, staffReadAt: null })).toBe(true);
    expect(isUnreadForFamily({ lastMessageAt: older, familyReadAt: null })).toBe(true);
  });
  it("is unread when a newer message arrived after last read", () => {
    expect(isUnreadForStaff({ lastMessageAt: newer, staffReadAt: older })).toBe(true);
  });
  it("is read when last read is at or after the last message", () => {
    expect(isUnreadForStaff({ lastMessageAt: older, staffReadAt: older })).toBe(false);
    expect(isUnreadForFamily({ lastMessageAt: older, familyReadAt: newer })).toBe(false);
  });
});
