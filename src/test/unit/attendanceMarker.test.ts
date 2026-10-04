import { describe, it, expect } from "vitest";
import { managementTag, registerLabel, markKind } from "@/lib/attendanceMarker";

describe("attendance marker", () => {
  it("tags management roles only", () => {
    expect(managementTag("HEADTEACHER_B")).toBe("HEADTEACHER_B");
    expect(managementTag("HEADTEACHER_A")).toBe("HEADTEACHER_A");
    expect(managementTag("HEADMASTER")).toBe("HEADMASTER");
    expect(managementTag("TEACHER")).toBeNull();
    expect(managementTag(null)).toBeNull();
  });

  it("labels the register a row came from", () => {
    expect(registerLabel({ hasSlot: true, dayType: "INTERCALARY" })).toBe("lesson");
    expect(registerLabel({ hasSlot: false, dayType: "HOMEGROUP_PERIOD" })).toBe("homegroupPeriod");
    expect(registerLabel({ hasSlot: false, dayType: "INTERCALARY" })).toBe("homegroupPeriod");
    expect(registerLabel({ hasSlot: false, dayType: "EXCURSION" })).toBe("excursion");
  });

  it("is null for the lesson's own teacher", () => {
    expect(markKind({ markerStaffId: "a", slotStaffId: "a", plannedKind: null, homegroupStaffIds: null })).toBeNull();
  });

  it("names a planned substitution, else an ad-hoc claim", () => {
    expect(markKind({ markerStaffId: "b", slotStaffId: "a", plannedKind: "COVER", homegroupStaffIds: null })).toBe("COVER");
    expect(markKind({ markerStaffId: "d", slotStaffId: "a", plannedKind: "STUDY_HALL", homegroupStaffIds: null })).toBe("STUDY_HALL");
    expect(markKind({ markerStaffId: "b", slotStaffId: "a", plannedKind: null, homegroupStaffIds: null })).toBe("CLAIM");
  });

  it("flags a homegroup register taken by someone outside the homegroup's staff", () => {
    expect(markKind({ markerStaffId: "t", slotStaffId: null, plannedKind: null, homegroupStaffIds: ["t", "d", null] })).toBeNull();
    expect(markKind({ markerStaffId: "d", slotStaffId: null, plannedKind: null, homegroupStaffIds: ["t", "d", null] })).toBeNull();
    expect(markKind({ markerStaffId: "x", slotStaffId: null, plannedKind: null, homegroupStaffIds: ["t", "d", null] })).toBe("HOMEGROUP_COVER");
  });
});
