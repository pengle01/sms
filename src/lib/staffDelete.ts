// Deleting a timetable person (StaffProfile) from Χρήστες — only when nothing
// uses it, e.g. the names a wrong timetable import added. Pure; unit-tested in
// staffDelete.test.ts.

export type StaffDeleteBlocker = "hasAccount" | "inTimetable" | "homegroup" | "history" | "designation";

export interface StaffUsage {
  hasAccount: boolean;
  /** Lessons (current or removed) attached to the record or carrying its name. */
  lessons: number;
  homegroups: number;
  /** Everything recorded under the record: attendance, referrals, tests, … */
  historyCounts: number[];
  designations: boolean[];
}

/** Why this record can't be deleted; empty means it may be. */
export function staffDeleteBlockers(u: StaffUsage): StaffDeleteBlocker[] {
  const out: StaffDeleteBlocker[] = [];
  if (u.hasAccount) out.push("hasAccount");
  if (u.lessons > 0) out.push("inTimetable");
  if (u.homegroups > 0) out.push("homegroup");
  if (u.historyCounts.some((n) => n > 0)) out.push("history");
  if (u.designations.some(Boolean)) out.push("designation");
  return out;
}
