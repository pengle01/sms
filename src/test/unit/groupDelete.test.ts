import { describe, it, expect } from "vitest";
import { groupDeleteBlockers, looksDeletable } from "@/lib/groupDelete";

const unused = { students: 0, enrolled: 0, lessons: 0, historyCounts: [0, 0, 0] };

describe("groupDeleteBlockers", () => {
  it("allows a group nothing uses", () => {
    expect(groupDeleteBlockers(unused)).toEqual([]);
    expect(groupDeleteBlockers({ ...unused, historyCounts: [] })).toEqual([]);
  });

  it("refuses a group with students or enrolments", () => {
    expect(groupDeleteBlockers({ ...unused, students: 3 })).toEqual(["students"]);
    expect(groupDeleteBlockers({ ...unused, enrolled: 1 })).toEqual(["enrolled"]);
  });

  it("protects a group with lessons in the current timetable", () => {
    expect(groupDeleteBlockers({ ...unused, lessons: 4 })).toEqual(["inTimetable"]);
  });

  it("refuses a group with any history, and lists every reason", () => {
    expect(groupDeleteBlockers({ ...unused, historyCounts: [0, 2, 0] })).toEqual(["history"]);
    expect(groupDeleteBlockers({ students: 1, enrolled: 1, lessons: 1, historyCounts: [1] })).toEqual([
      "students", "enrolled", "inTimetable", "history",
    ]);
  });
});

describe("looksDeletable", () => {
  it("offers the button only for groups without students, enrolments and lessons", () => {
    expect(looksDeletable({ students: 0, enrolled: 0, lessons: 0 })).toBe(true);
    expect(looksDeletable({ students: 0, enrolled: 0, lessons: 2 })).toBe(false);
    expect(looksDeletable({ students: 0, enrolled: 5, lessons: 0 })).toBe(false);
    expect(looksDeletable({ students: 1, enrolled: 0, lessons: 0 })).toBe(false);
  });
});
