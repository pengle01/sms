import { describe, it, expect } from "vitest";
import { changeForLesson, type PlanEntryLite } from "@/lib/studentDayChanges";

const entry = (e: Partial<PlanEntryLite>): PlanEntryLite => ({
  kind: "COVER",
  period: 3,
  groupId: "home",
  timetableSlotId: null,
  substituteName: null,
  newRoom: null,
  ...e,
});
const lesson = { id: "slot-math", groupId: "home", period: 3 };

describe("changeForLesson", () => {
  it("returns null when nothing touches the lesson", () => {
    expect(changeForLesson([], lesson)).toBeNull();
    expect(changeForLesson([entry({ period: 4 })], lesson)).toBeNull();
    expect(changeForLesson([entry({ groupId: "other" })], lesson)).toBeNull();
  });

  it("matches the lesson's own slot, and not another slot in the same period", () => {
    expect(changeForLesson([entry({ timetableSlotId: "slot-math", substituteName: "ΠΑΠΑΣ" })], lesson)).toEqual({
      kind: "substitute",
      substituteName: "ΠΑΠΑΣ",
      newRoom: null,
    });
    expect(changeForLesson([entry({ timetableSlotId: "slot-other" })], lesson)).toBeNull();
  });

  it("does not put the homegroup's change on the subject-group lesson the student attends", () => {
    const subjectLesson = { id: "slot-it", groupId: "it-group", period: 3 };
    expect(changeForLesson([entry({ kind: "RELEASE" })], subjectLesson)).toBeNull();
  });

  it("names each kind of change", () => {
    const kinds = (["COVER", "SWAP", "RELEASE", "STUDY_HALL", "CHAPERONE_HALL", "ROOM_CHANGE", "SUPPORT_MERGE"] as const).map(
      (kind) => changeForLesson([entry({ kind })], lesson)!.kind,
    );
    expect(kinds).toEqual(["substitute", "substitute", "released", "studyHall", "chaperoneHall", "roomChanged", "supportMerge"]);
  });

  it("keeps the main change and adds a room change's room", () => {
    const got = changeForLesson(
      [entry({ kind: "ROOM_CHANGE", newRoom: "Β12" }), entry({ kind: "COVER", substituteName: "ΚΩΣΤΑ" })],
      lesson,
    );
    expect(got).toEqual({ kind: "substitute", substituteName: "ΚΩΣΤΑ", newRoom: "Β12" });
  });
});
