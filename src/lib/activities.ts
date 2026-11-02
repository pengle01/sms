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

/**
 * Step-1 values of «Νέα Δραστηριότητα» when copying an activity: what's in the
 * URL wins (the teacher already confirmed it), else the copied activity's.
 * The date is never copied — a copy is a new event.
 */
export function copyDefaults(
  source: { name: string; startPeriod: number; endPeriod: number; location: string | null } | null,
  url: { name?: string; startPeriod?: string; endPeriod?: string; location?: string },
): { name?: string; startPeriod?: string; endPeriod?: string; location?: string } {
  return {
    name: url.name ?? source?.name,
    startPeriod: url.startPeriod ?? (source ? String(source.startPeriod) : undefined),
    endPeriod: url.endPeriod ?? (source ? String(source.endPeriod) : undefined),
    location: url.location ?? source?.location ?? undefined,
  };
}

/** Activities by student and date — which of a student's absences were due to one. */
export type ActivityIndex = Map<string, { name: string; from: number; to: number }[]>;

/** Index activities (with their participants) by `studentId|yyyy-mm-dd`, earliest start first. */
export function buildActivityIndex(
  activities: readonly { name: string; date: Date | string; startPeriod: number; endPeriod: number; studentIds: readonly string[] }[],
): ActivityIndex {
  const index: ActivityIndex = new Map();
  for (const a of activities) {
    const iso = typeof a.date === "string" ? a.date.slice(0, 10) : a.date.toISOString().slice(0, 10);
    for (const studentId of a.studentIds) {
      const key = `${studentId}|${iso}`;
      const list = index.get(key) ?? [];
      list.push({ name: a.name, from: a.startPeriod, to: a.endPeriod });
      index.set(key, list);
    }
  }
  for (const list of index.values()) list.sort((x, y) => x.from - y.from);
  return index;
}

/**
 * The activity a student was on during an absence: one they take part in on
 * that date whose periods include the absence's. Worked out when a report is
 * built, so an activity edited or deleted later changes old reports.
 */
export function activityForAbsence(
  index: ActivityIndex,
  studentId: string,
  isoDate: string,
  period: number | null,
): string | null {
  if (period == null) return null;
  const hit = index.get(`${studentId}|${isoDate}`)?.find((a) => a.from <= period && period <= a.to);
  return hit?.name ?? null;
}
