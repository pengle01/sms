// What an attendance row keeps for itself: the subject held and whether its
// register was a lesson or a substitution. Saved when the register is taken, so
// a later timetable re-import cannot rewrite history. The teacher shown is always
// Attendance.staff, whoever marked it. Pure; unit-tested.

import type { MarkKind } from "@/lib/attendanceMarker";

export type LessonKind = "LESSON" | "SUBSTITUTION";

/** A register on a timetable slot: the slot's own teacher, or their own subject, is a lesson. */
export function lessonKindForSlot(o: {
  markerStaffId: string;
  slotStaffId: string | null;
  /** «Δικό μου μάθημα»: the marker held their own subject with the group. */
  addedLesson: boolean;
}): LessonKind {
  return o.addedLesson || o.slotStaffId === o.markerStaffId ? "LESSON" : "SUBSTITUTION";
}

/**
 * Whose lesson it was, saved only when someone else took the register. The name
 * comes from the lesson as the timetable has it at that moment.
 */
export function lessonTeacherNameFor(o: {
  markerStaffId: string;
  slotStaffId: string | null;
  slotStaffName: string | null;
  linkedScheduleName: string | null | undefined;
}): string | null {
  if (o.slotStaffId === o.markerStaffId) return null;
  return o.linkedScheduleName ?? o.slotStaffName ?? null;
}

/** A homegroup-period or excursion register: the homegroup's own staff hold it as a lesson. */
export function lessonKindForHomegroup(markerStaffId: string, ownStaffIds: readonly (string | null)[]): LessonKind {
  return ownStaffIds.includes(markerStaffId) ? "LESSON" : "SUBSTITUTION";
}

/**
 * The kind a staff view shows. A row with a saved kind keeps it however the
 * timetable changed since; an older row is worked out from the current lesson. A
 * permit's pre-marked absence is no register at all.
 */
export function shownLessonKind(o: {
  saved: LessonKind | null | undefined;
  permitPremarked: boolean | null | undefined;
  markerStaffId: string;
  slotStaffId: string | null | undefined;
  hasSlot: boolean;
}): LessonKind | null {
  if (o.permitPremarked) return null;
  if (o.saved) return o.saved;
  if (!o.hasSlot) return null;
  return lessonKindForSlot({ markerStaffId: o.markerStaffId, slotStaffId: o.slotStaffId ?? null, addedLesson: false });
}

/**
 * The office's detailed label, kept in line with the saved kind: the detail
 * (planned cover, swap, …) is still worked out, but it cannot contradict what
 * was recorded when the register was taken.
 */
export function resolveMarkKind(
  computed: MarkKind | null,
  saved: LessonKind | null | undefined,
  permitPremarked: boolean | null | undefined,
): MarkKind | null {
  if (permitPremarked) return null;
  if (saved === "LESSON") return computed === "ADDED_LESSON" ? computed : null;
  if (saved === "SUBSTITUTION") return computed && computed !== "ADDED_LESSON" ? computed : "CLAIM";
  return computed;
}
