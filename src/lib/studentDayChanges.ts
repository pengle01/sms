// What changes in a student's lessons on a day — from the FINAL substitution
// plan's entries — for the student's own timetable and a chaperone's view of
// it. Pure (no DB) so the matching rule is unit-tested.

import type { SubstitutionKind } from "@/generated/prisma/enums";

/** How a change reads to a student / chaperone (a `mySchedule` text key each). */
export type LessonChangeKind =
  | "substitute" // another teacher takes the lesson (COVER / SWAP)
  | "released" // the class goes home (RELEASE)
  | "studyHall" // Φ/δι with the on-duty deputy
  | "chaperoneHall" // Φ/δι Συνοδοί — the chaperones keep the class
  | "roomChanged" // same lesson, another room
  | "supportMerge"; // a support lesson's students join their regular class

export interface PlanEntryLite {
  kind: SubstitutionKind;
  period: number | null;
  groupId: string | null;
  timetableSlotId: string | null;
  substituteName: string | null;
  newRoom: string | null;
}

export interface LessonLite {
  id: string;
  groupId: string;
  period: number;
}

export interface LessonChange {
  kind: LessonChangeKind;
  substituteName: string | null;
  newRoom: string | null;
}

const KIND: Record<SubstitutionKind, LessonChangeKind> = {
  COVER: "substitute",
  SWAP: "substitute",
  RELEASE: "released",
  STUDY_HALL: "studyHall",
  CHAPERONE_HALL: "chaperoneHall",
  ROOM_CHANGE: "roomChanged",
  SUPPORT_MERGE: "supportMerge",
};

/**
 * The change to one of the student's lessons, or null. An entry belongs to the
 * lesson when it names that timetable slot, or — naming none — the lesson's
 * group in that period; so a homegroup's change never lands on the subject-group
 * lesson the student actually attends then. A room change next to another
 * change only adds its room.
 */
export function changeForLesson(entries: readonly PlanEntryLite[], lesson: LessonLite): LessonChange | null {
  const mine = entries.filter(
    (e) =>
      e.period === lesson.period &&
      (e.timetableSlotId ? e.timetableSlotId === lesson.id : e.groupId === lesson.groupId),
  );
  if (mine.length === 0) return null;
  const main = mine.find((e) => e.kind !== "ROOM_CHANGE") ?? mine[0]!;
  return {
    kind: KIND[main.kind],
    substituteName: main.substituteName,
    newRoom: mine.find((e) => e.newRoom)?.newRoom ?? null,
  };
}
