// Deleting a group from Admin → Τμήματα — only when nothing uses it, e.g. the
// groups a wrong import left behind. A group with lessons in the current
// timetable is protected: a wrong timetable import is fixed by re-importing
// the timetable, which removes its lessons. Pure; unit-tested in groupDelete.test.ts.

export type GroupDeleteBlocker = "students" | "enrolled" | "inTimetable" | "history";

export interface GroupUsage {
  /** Students whose homegroup it is. */
  students: number;
  /** Students enrolled in it as a subject group. */
  enrolled: number;
  /** Lessons in the current timetable. */
  lessons: number;
  /** Everything recorded under it: attendance, tests, referrals, substitutions, notes, … */
  historyCounts: number[];
}

/** Why this group can't be deleted; empty means it may be. */
export function groupDeleteBlockers(u: GroupUsage): GroupDeleteBlocker[] {
  const out: GroupDeleteBlocker[] = [];
  if (u.students > 0) out.push("students");
  if (u.enrolled > 0) out.push("enrolled");
  if (u.lessons > 0) out.push("inTimetable");
  if (u.historyCounts.some((n) => n > 0)) out.push("history");
  return out;
}

/** Whether the list offers the delete button at all (the server re-checks history). */
export function looksDeletable(c: { students: number; enrolled: number; lessons: number }): boolean {
  return c.students === 0 && c.enrolled === 0 && c.lessons === 0;
}
