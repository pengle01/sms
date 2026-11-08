import { describe, it, expect } from "vitest";
import {
  lessonKindForHomegroup,
  lessonKindForSlot,
  lessonTeacherNameFor,
  resolveMarkKind,
  shownLessonKind,
} from "@/lib/attendanceLesson";

describe("lessonKindForSlot", () => {
  it("is a lesson for the slot's own teacher", () => {
    expect(lessonKindForSlot({ markerStaffId: "a", slotStaffId: "a", addedLesson: false })).toBe("LESSON");
  });

  it("is a substitution for anyone else, including on a slot with no linked teacher", () => {
    expect(lessonKindForSlot({ markerStaffId: "b", slotStaffId: "a", addedLesson: false })).toBe("SUBSTITUTION");
    expect(lessonKindForSlot({ markerStaffId: "b", slotStaffId: null, addedLesson: false })).toBe("SUBSTITUTION");
  });

  it("is a lesson when the marker held their own subject", () => {
    expect(lessonKindForSlot({ markerStaffId: "b", slotStaffId: "a", addedLesson: true })).toBe("LESSON");
  });
});

describe("lessonKindForHomegroup", () => {
  it("separates the homegroup's own staff from anyone else", () => {
    expect(lessonKindForHomegroup("a", ["a", null, "c"])).toBe("LESSON");
    expect(lessonKindForHomegroup("x", ["a", null, "c"])).toBe("SUBSTITUTION");
  });
});

describe("shownLessonKind", () => {
  const base = { saved: null, permitPremarked: false, markerStaffId: "a", slotStaffId: "a", hasSlot: true };

  it("keeps the saved kind even if the slot's teacher changed since", () => {
    expect(shownLessonKind({ ...base, saved: "LESSON", slotStaffId: "new" })).toBe("LESSON");
    expect(shownLessonKind({ ...base, saved: "SUBSTITUTION" })).toBe("SUBSTITUTION");
  });

  it("works out an older row from the current lesson", () => {
    expect(shownLessonKind(base)).toBe("LESSON");
    expect(shownLessonKind({ ...base, slotStaffId: "b" })).toBe("SUBSTITUTION");
  });

  it("shows nothing for a permit's pre-marked absence or an older row with no lesson", () => {
    expect(shownLessonKind({ ...base, permitPremarked: true, saved: "LESSON" })).toBeNull();
    expect(shownLessonKind({ ...base, hasSlot: false })).toBeNull();
  });
});

describe("resolveMarkKind", () => {
  it("clears the label on a saved lesson, except the marker's own subject", () => {
    expect(resolveMarkKind("CLAIM", "LESSON", false)).toBeNull();
    expect(resolveMarkKind("ADDED_LESSON", "LESSON", false)).toBe("ADDED_LESSON");
  });

  it("keeps a saved substitution labelled even when the timetable now names the marker", () => {
    expect(resolveMarkKind(null, "SUBSTITUTION", false)).toBe("CLAIM");
    expect(resolveMarkKind("COVER", "SUBSTITUTION", false)).toBe("COVER");
  });

  it("leaves an older row as computed, and never labels a pre-marked absence", () => {
    expect(resolveMarkKind("SWAP", null, false)).toBe("SWAP");
    expect(resolveMarkKind("CLAIM", null, true)).toBeNull();
  });
});

describe("lessonTeacherNameFor", () => {
  const base = { markerStaffId: "b", slotStaffId: "a", slotStaffName: "ΜΑΘ-ΚΩΣΤΑ", linkedScheduleName: "ΜΑΘ-ΚΩΣΤΑ Γ." };

  it("names the lesson's teacher when someone else took the register", () => {
    expect(lessonTeacherNameFor(base)).toBe("ΜΑΘ-ΚΩΣΤΑ Γ.");
  });

  it("falls back to the timetable's name when the teacher has no linked account", () => {
    expect(lessonTeacherNameFor({ ...base, slotStaffId: null, linkedScheduleName: null })).toBe("ΜΑΘ-ΚΩΣΤΑ");
  });

  it("saves nothing for the lesson's own teacher", () => {
    expect(lessonTeacherNameFor({ ...base, markerStaffId: "a" })).toBeNull();
  });
});
