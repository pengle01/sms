// «Δικό μου μάθημα»: instead of covering another teacher's lesson, a teacher
// holds their own lesson with one of their own groups in that period. The
// register stays on the period's slot (like a cover); an AddedLesson row records
// that the subject taught was the teacher's own. Pure, unit-tested.

/** A timetable lesson, as far as "which subjects do I teach this group" goes. */
export interface TeachingSlot {
  staffId: string | null;
  groupId: string;
  courseId: string;
  courseName: string;
}

/** The subjects this teacher teaches this group, each once, in Greek order. */
export function myCoursesWithGroup(
  slots: readonly TeachingSlot[],
  staffId: string,
  groupId: string,
): { id: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const s of slots) {
    if (s.staffId === staffId && s.groupId === groupId) byId.set(s.courseId, s.courseName);
  }
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "el"));
}

/** May this teacher record this subject as their own lesson with this group? */
export function canAddLesson(
  slots: readonly TeachingSlot[],
  staffId: string,
  groupId: string,
  courseId: string,
): boolean {
  return myCoursesWithGroup(slots, staffId, groupId).some((c) => c.id === courseId);
}
