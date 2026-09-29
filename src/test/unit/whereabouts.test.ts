import { describe, it, expect } from "vitest";
import {
  cell,
  teacherWeek,
  roomWeek,
  freeRoomsWeek,
  unknownTimetableRooms,
  findTeachers,
  type WeekSlot,
} from "@/lib/whereabouts";

const slot = (over: Partial<WeekSlot>): WeekSlot => ({
  dayOfWeek: 1,
  period: 1,
  room: "101",
  staffName: "Μ-ΠΑΠΑΣ Α.",
  groupName: "Α1",
  courseName: "Μαθηματικά",
  ...over,
});

const PPD = { 1: 3, 2: 2, 3: 2, 4: 2, 5: 2 };

describe("teacherWeek", () => {
  it("places a teacher's lessons by day and period, matched by timetable name", () => {
    const grid = teacherWeek(
      [slot({}), slot({ dayOfWeek: 2, period: 3, staffName: " Μ-ΠΑΠΑΣ Α. " }), slot({ staffName: "Φ-ΑΛΛΟΣ Β.", period: 2 })],
      "Μ-ΠΑΠΑΣ Α.",
    );
    expect(cell(grid, 1, 1).map((s) => s.groupName)).toEqual(["Α1"]);
    expect(cell(grid, 2, 3)).toHaveLength(1);
    expect(cell(grid, 1, 2)).toEqual([]);
  });

  it("keeps two lessons in the same period (combined groups)", () => {
    const grid = teacherWeek([slot({ groupName: "Α1" }), slot({ groupName: "Α2" })], "Μ-ΠΑΠΑΣ Α.");
    expect(cell(grid, 1, 1).map((s) => s.groupName)).toEqual(["Α1", "Α2"]);
  });

  it("is empty for a teacher with no lessons", () => {
    expect(teacherWeek([slot({})], "ΚΑΝΕΙΣ").size).toBe(0);
  });
});

describe("roomWeek", () => {
  it("lists the lessons held in one room", () => {
    const grid = roomWeek([slot({ room: " 101 " }), slot({ room: "102", period: 2 })], "101");
    expect(cell(grid, 1, 1)).toHaveLength(1);
    expect(cell(grid, 1, 2)).toEqual([]);
  });
});

describe("freeRoomsWeek", () => {
  const rooms = ["101", "102", "κιόσκια"];

  it("an occupied room is not free that period, and free in the others", () => {
    const grid = freeRoomsWeek(rooms, [slot({ room: "101" })], PPD);
    expect(cell(grid, 1, 1)).toEqual(["102"]);
    expect(cell(grid, 1, 2)).toEqual(["101", "102"]);
    expect(cell(grid, 2, 1)).toEqual(["101", "102"]);
  });

  it("respects each day's period count", () => {
    const grid = freeRoomsWeek(rooms, [], PPD);
    expect(cell(grid, 1, 3)).toEqual(["101", "102"]);
    expect(cell(grid, 2, 3)).toEqual([]);
  });

  it("a lesson with no room or an unknown room frees and takes nothing", () => {
    const grid = freeRoomsWeek(rooms, [slot({ room: null }), slot({ room: "999" })], PPD);
    expect(cell(grid, 1, 1)).toEqual(["101", "102"]);
  });

  it("never lists «κιόσκια» as a room", () => {
    const grid = freeRoomsWeek(rooms, [], PPD);
    expect(cell(grid, 5, 1)).not.toContain("κιόσκια");
  });

  it("with an empty timetable every room is free every period", () => {
    const grid = freeRoomsWeek(["101"], [], PPD);
    expect(cell(grid, 4, 2)).toEqual(["101"]);
  });
});

describe("unknownTimetableRooms", () => {
  it("lists timetable rooms missing from the room list, once, in order", () => {
    const slots = [slot({ room: "999" }), slot({ room: "8" }), slot({ room: " 999 " }), slot({ room: "101" }), slot({ room: "κιόσκια" }), slot({ room: null })];
    expect(unknownTimetableRooms(["101"], slots)).toEqual(["8", "999"]);
  });
});

describe("findTeachers", () => {
  const roster = [
    { scheduleName: "Μ-ΠΑΠΑΣ Α.", accountName: "Ανδρέας Παπάς", phone: null },
    { scheduleName: "Μ-ΠΑΠΑΣΑΒΒΑΣ Κ.", accountName: null, phone: null },
    { scheduleName: "Φ-ΓΕΩΡΓΙΟΥ Μ.", accountName: null, phone: null },
  ];

  it("an exact name picks one teacher even if it's part of a longer name", () => {
    expect(findTeachers(roster, "μ-παπας α.").map((t) => t.scheduleName)).toEqual(["Μ-ΠΑΠΑΣ Α."]);
  });

  it("partial text returns every match, accent-insensitive, account name included", () => {
    expect(findTeachers(roster, "παπα").map((t) => t.scheduleName)).toEqual(["Μ-ΠΑΠΑΣ Α.", "Μ-ΠΑΠΑΣΑΒΒΑΣ Κ."]);
    expect(findTeachers(roster, "Ανδρεας").map((t) => t.scheduleName)).toEqual(["Μ-ΠΑΠΑΣ Α."]);
  });

  it("empty text finds nobody", () => {
    expect(findTeachers(roster, "  ")).toEqual([]);
  });
});
