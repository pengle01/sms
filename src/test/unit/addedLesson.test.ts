import { describe, it, expect } from "vitest";
import { myCoursesWithGroup, canAddLesson, type TeachingSlot } from "@/lib/addedLesson";

const slot = (staffId: string | null, groupId: string, courseId: string, courseName: string): TeachingSlot =>
  ({ staffId, groupId, courseId, courseName });

const SLOTS: TeachingSlot[] = [
  slot("me", "B31", "fys", "Φυσική"),
  slot("me", "B31", "fys", "Φυσική"), // the same lesson on another day
  slot("me", "B31", "che", "Χημεία"),
  slot("me", "A12", "fys", "Φυσική"),
  slot("other", "B31", "mat", "Μαθηματικά"),
  slot(null, "B31", "art", "Τέχνη"),
];

describe("myCoursesWithGroup", () => {
  it("lists my subjects with that group once each, in Greek order", () => {
    expect(myCoursesWithGroup(SLOTS, "me", "B31")).toEqual([
      { id: "fys", name: "Φυσική" },
      { id: "che", name: "Χημεία" },
    ]);
  });

  it("is empty for a group I don't teach", () => {
    expect(myCoursesWithGroup(SLOTS, "me", "C20")).toEqual([]);
    expect(myCoursesWithGroup(SLOTS, "nobody", "B31")).toEqual([]);
  });

  it("is empty with no lessons at all", () => {
    expect(myCoursesWithGroup([], "me", "B31")).toEqual([]);
  });
});

describe("canAddLesson", () => {
  it("allows only one of my subjects with that very group", () => {
    expect(canAddLesson(SLOTS, "me", "B31", "che")).toBe(true);
    expect(canAddLesson(SLOTS, "me", "A12", "che")).toBe(false); // my subject, but not with A12
    expect(canAddLesson(SLOTS, "me", "B31", "mat")).toBe(false); // someone else's subject
    expect(canAddLesson(SLOTS, "other", "B31", "fys")).toBe(false);
  });
});
