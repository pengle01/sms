// «Τελευταίο μάθημα στην αίθουσα»: which lesson is the last one held in each room
// on a day, so its teacher is reminded to switch everything off. The day's final
// substitution plan is taken into account: a lesson moved to another room, a
// class that leaves, a support lesson merged into its class. Pure; tested.

export interface DayLesson {
  id: string;
  groupId: string;
  period: number;
  room: string | null;
}

export interface DayPlanEntry {
  kind: string;
  period: number | null;
  groupId: string | null;
  timetableSlotId: string | null;
  newRoom: string | null;
}

/** «Β 12», «β12 » and «Β12» are one room. */
export function roomKey(room: string | null | undefined): string | null {
  const k = (room ?? "").replace(/\s+/g, "").toUpperCase();
  return k || null;
}

/** Plan entries that cancel the lesson in its room: the class leaves or joins another. */
const NOT_HELD = new Set(["RELEASE", "SUPPORT_MERGE"]);

/**
 * Where each of the day's lessons is held, after the plan: null when it isn't
 * held in any room. A plan entry belongs to a lesson by its slot, or — naming no
 * slot — by the lesson's group in that period.
 */
export function heldRooms(lessons: readonly DayLesson[], entries: readonly DayPlanEntry[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const l of lessons) {
    const mine = entries.filter(
      (e) => e.period === l.period && (e.timetableSlotId ? e.timetableSlotId === l.id : e.groupId === l.groupId),
    );
    if (mine.some((e) => NOT_HELD.has(e.kind))) {
      out.set(l.id, null);
      continue;
    }
    // A study hall sends the class elsewhere; a room change or a cover may name a room.
    const moved = mine.find((e) => e.newRoom)?.newRoom;
    const away = mine.some((e) => e.kind === "STUDY_HALL");
    out.set(l.id, moved ?? (away ? null : l.room));
  }
  return out;
}

/**
 * The room this lesson is the last one in, or null. Two classes sharing the
 * room in its last period are both last.
 */
export function lastLessonRoom(
  lessonId: string,
  lessons: readonly DayLesson[],
  entries: readonly DayPlanEntry[],
): string | null {
  const rooms = heldRooms(lessons, entries);
  const room = rooms.get(lessonId);
  const key = roomKey(room);
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!key || !lesson) return null;
  const lastPeriod = Math.max(
    ...lessons.filter((l) => roomKey(rooms.get(l.id)) === key).map((l) => l.period),
  );
  return lesson.period === lastPeriod ? room!.trim() : null;
}
