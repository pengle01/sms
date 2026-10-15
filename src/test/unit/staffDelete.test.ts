import { describe, it, expect } from "vitest";
import { staffDeleteBlockers, type StaffUsage } from "@/lib/staffDelete";

const empty: StaffUsage = { hasAccount: false, lessons: 0, homegroups: 0, historyCounts: [0, 0, 0], designations: [false, false] };

describe("staffDeleteBlockers", () => {
  it("allows an unused record", () => {
    expect(staffDeleteBlockers(empty)).toEqual([]);
  });

  it("blocks each kind of use on its own", () => {
    expect(staffDeleteBlockers({ ...empty, hasAccount: true })).toEqual(["hasAccount"]);
    expect(staffDeleteBlockers({ ...empty, lessons: 1 })).toEqual(["inTimetable"]);
    expect(staffDeleteBlockers({ ...empty, homegroups: 2 })).toEqual(["homegroup"]);
    expect(staffDeleteBlockers({ ...empty, historyCounts: [0, 5, 0] })).toEqual(["history"]);
    expect(staffDeleteBlockers({ ...empty, designations: [false, true] })).toEqual(["designation"]);
  });

  it("lists every reason at once", () => {
    expect(staffDeleteBlockers({ hasAccount: true, lessons: 3, homegroups: 1, historyCounts: [1], designations: [true] }))
      .toEqual(["hasAccount", "inTimetable", "homegroup", "history", "designation"]);
  });
});
