import { describe, it, expect } from "vitest";
import { coverMarkedKeys, markedKey, adHocCovers } from "@/lib/coverMarked";

describe("coverMarkedKeys", () => {
  it("builds keys from slot id and UTC date", () => {
    const keys = coverMarkedKeys([
      { timetableSlotId: "s1", date: new Date("2026-03-16T00:00:00.000Z") },
      { timetableSlotId: "s2", date: new Date("2026-03-17T00:00:00.000Z") },
    ]);
    expect(keys).toEqual(new Set(["s1::2026-03-16", "s2::2026-03-17"]));
    expect(keys.has(markedKey("s1", new Date("2026-03-16T00:00:00.000Z")))).toBe(true);
  });

  it("skips rows without a slot", () => {
    expect(coverMarkedKeys([{ timetableSlotId: null, date: new Date("2026-03-16T00:00:00.000Z") }]).size).toBe(0);
  });

  it("returns an empty set for no rows", () => {
    expect(coverMarkedKeys([]).size).toBe(0);
  });

  it("does not mark another date of the same slot", () => {
    const keys = coverMarkedKeys([{ timetableSlotId: "s1", date: new Date("2026-03-16T00:00:00.000Z") }]);
    expect(keys.has(markedKey("s1", new Date("2026-03-17T00:00:00.000Z")))).toBe(false);
  });
});

describe("adHocCovers", () => {
  const d16 = new Date("2026-03-16T00:00:00.000Z");
  const d17 = new Date("2026-03-17T00:00:00.000Z");
  const row = (over: Partial<Parameters<typeof adHocCovers>[0][number]> = {}) => ({
    slotId: "s1",
    period: 3,
    groupId: "g1",
    groupName: "Α1",
    courseName: "Μαθηματικά",
    teacherName: "ΠΑΠΑΣ",
    date: d16,
    slotStaffId: "other",
    ...over,
  });

  it("keeps a cover of someone else's lesson, keyed by date and period", () => {
    const covers = adHocCovers([row()], "me", new Set());
    expect([...covers.keys()]).toEqual(["2026-03-16:3"]);
    expect(covers.get("2026-03-16:3")![0]).toMatchObject({ slotId: "s1", groupName: "Α1", teacherName: "ΠΑΠΑΣ" });
  });

  it("keeps a lesson with no linked teacher", () => {
    expect(adHocCovers([row({ slotStaffId: null })], "me", new Set()).size).toBe(1);
  });

  it("drops my own lessons", () => {
    expect(adHocCovers([row({ slotStaffId: "me" })], "me", new Set()).size).toBe(0);
  });

  it("drops a lesson in that date's plan but keeps it on another date", () => {
    const plan = new Set([markedKey("s1", d16)]);
    const covers = adHocCovers([row(), row({ date: d17 })], "me", plan);
    expect([...covers.keys()]).toEqual(["2026-03-17:3"]);
  });

  it("makes one cover from many student rows of the same lesson", () => {
    const covers = adHocCovers([row(), row(), row()], "me", new Set());
    expect(covers.get("2026-03-16:3")).toHaveLength(1);
  });

  it("stacks two classes covered in the same period", () => {
    const covers = adHocCovers([row(), row({ slotId: "s2", groupId: "g2", groupName: "Α2" })], "me", new Set());
    expect(covers.get("2026-03-16:3")!.map((c) => c.groupName)).toEqual(["Α1", "Α2"]);
  });
});
