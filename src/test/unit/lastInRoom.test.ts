import { describe, it, expect } from "vitest";
import { heldRooms, lastLessonRoom, roomKey, type DayLesson, type DayPlanEntry } from "@/lib/lastInRoom";

const lesson = (id: string, period: number, room: string | null, groupId = id): DayLesson => ({ id, groupId, period, room });
const entry = (o: Partial<DayPlanEntry>): DayPlanEntry => ({ kind: "COVER", period: 1, groupId: null, timetableSlotId: null, newRoom: null, ...o });

describe("roomKey", () => {
  it("treats spacing and case as the same room", () => {
    expect(roomKey(" Β 12 ")).toBe(roomKey("β12"));
    expect(roomKey("")).toBeNull();
    expect(roomKey(null)).toBeNull();
  });
});

describe("lastLessonRoom", () => {
  const day = [lesson("a", 3, "Β12"), lesson("b", 6, "Β12"), lesson("c", 7, "Γ1"), lesson("d", 2, null)];

  it("marks only the latest lesson in each room", () => {
    expect(lastLessonRoom("b", day, [])).toBe("Β12");
    expect(lastLessonRoom("a", day, [])).toBeNull();
    expect(lastLessonRoom("c", day, [])).toBe("Γ1");
  });

  it("says nothing for a lesson with no room", () => {
    expect(lastLessonRoom("d", day, [])).toBeNull();
  });

  it("treats two classes sharing the room in its last period as both last", () => {
    const shared = [lesson("x", 7, "Εργ1"), lesson("y", 7, "εργ 1"), lesson("z", 4, "Εργ1")];
    expect(lastLessonRoom("x", shared, [])).toBe("Εργ1");
    expect(lastLessonRoom("y", shared, [])).toBe("εργ 1");
  });

  it("moves the reminder when the last class leaves early or joins another", () => {
    const released = [entry({ kind: "RELEASE", period: 6, timetableSlotId: "b" })];
    expect(lastLessonRoom("b", day, released)).toBeNull();
    expect(lastLessonRoom("a", day, released)).toBe("Β12");
    const merged = [entry({ kind: "SUPPORT_MERGE", period: 6, groupId: "b" })];
    expect(lastLessonRoom("a", day, merged)).toBe("Β12");
  });

  it("follows a room change to the new room", () => {
    const moved = [entry({ kind: "ROOM_CHANGE", period: 6, timetableSlotId: "b", newRoom: "Γ1" })];
    expect(lastLessonRoom("a", day, moved)).toBe("Β12");
    expect(lastLessonRoom("c", day, moved)).toBe("Γ1");
    expect(lastLessonRoom("b", day, moved)).toBeNull();
  });

  it("keeps a covered lesson in its room, and takes a study hall's class out of it", () => {
    expect(lastLessonRoom("b", day, [entry({ kind: "COVER", period: 6, timetableSlotId: "b" })])).toBe("Β12");
    expect(lastLessonRoom("a", day, [entry({ kind: "STUDY_HALL", period: 6, timetableSlotId: "b" })])).toBe("Β12");
  });

  it("matches a plan entry by group and period when it names no lesson", () => {
    expect(heldRooms([lesson("b", 6, "Β12", "g")], [entry({ kind: "RELEASE", period: 6, groupId: "g" })]).get("b")).toBeNull();
    expect(heldRooms([lesson("b", 6, "Β12", "g")], [entry({ kind: "RELEASE", period: 5, groupId: "g" })]).get("b")).toBe("Β12");
  });
});
