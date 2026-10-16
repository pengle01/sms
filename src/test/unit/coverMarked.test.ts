import { describe, it, expect } from "vitest";
import { coverMarkedKeys, markedKey } from "@/lib/coverMarked";

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
