import { utcMidnight } from "@/lib/dates";

// Weekly occurrences on the same weekday, from start to `until` (inclusive).
// A missing/earlier `until` yields just the single start date. Used by the
// repeating-activity option when constructing an activity.
export function weeklyOccurrences(startIso: string, untilIso: string | null): string[] {
  const start = utcMidnight(startIso);
  if (!untilIso) return [startIso];
  const until = utcMidnight(untilIso);
  if (until <= start) return [startIso];
  const dates: string[] = [];
  for (let d = new Date(start); d <= until; d = new Date(d.getTime() + 7 * 86400000)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** A test on the activity's date and periods, with the students it concerns. */
export interface ActivityTestConflict {
  id: string;
  courseName: string;
  groupName: string;
  staffName: string | null;
  type: "BIG" | "SMALL";
  periodLabel: string;
  studentIds: string[];
}

/**
 * The tests that clash with the activity for the students picked so far, each
 * with how many of them it affects. Tests none of them sit are left out.
 */
export function conflictsForSelection(
  tests: ActivityTestConflict[],
  selectedIds: readonly string[],
): (Omit<ActivityTestConflict, "studentIds"> & { affectedCount: number })[] {
  const picked = new Set(selectedIds);
  return tests
    .map(({ studentIds, ...t }) => ({ ...t, affectedCount: studentIds.filter((id) => picked.has(id)).length }))
    .filter((t) => t.affectedCount > 0);
}
