// Homegroup periods («Υπευθυνότητα Τμήματος») — the period of a day when every
// homegroup meets its homegroup teacher. Two kinds, both set by the admin as a
// calendar day with a meeting period:
//   • INTERCALARY (Εμβόλιμη) — the period is INSERTED; that day's lessons from
//     the meeting period on happen one period later.
//   • HOMEGROUP_PERIOD — the period REPLACES the lessons at that period, which
//     are cancelled for everyone.
// Lessons keep their stored timetable period either way; these helpers map
// between stored periods and the rows shown on a day. Pure — unit-tested in
// homegroupPeriod.test.ts.

export type HomegroupMeeting = { period: number; mode: "insert" | "replace" };

export const DEFAULT_MEETING_PERIOD = 8;

/** The day's homegroup meeting, or null when the day has none. */
export function homegroupMeeting(
  dayType: string | null | undefined,
  meetingPeriod: number | null | undefined,
): HomegroupMeeting | null {
  if (dayType === "INTERCALARY") return { period: meetingPeriod ?? DEFAULT_MEETING_PERIOD, mode: "insert" };
  if (dayType === "HOMEGROUP_PERIOD") return { period: meetingPeriod ?? DEFAULT_MEETING_PERIOD, mode: "replace" };
  return null;
}

/** The row a stored lesson period is shown on that day. */
export function shownPeriod(stored: number, m: HomegroupMeeting | null): number {
  return m?.mode === "insert" && stored >= m.period ? stored + 1 : stored;
}

/** The stored lesson period behind a shown row (the meeting row maps to itself). */
export function storedPeriodAt(shown: number, m: HomegroupMeeting | null): number {
  return m?.mode === "insert" && shown > m.period ? shown - 1 : shown;
}

/** True when the shown row is the homegroup meeting. */
export function isMeetingRow(shown: number, m: HomegroupMeeting | null): boolean {
  return m !== null && shown === m.period;
}

/** A lesson that doesn't happen that day: replaced by the homegroup period. */
export function isLessonCancelled(stored: number, m: HomegroupMeeting | null): boolean {
  return m?.mode === "replace" && stored === m.period;
}

/** How many rows a day shows, given the teacher's last stored lesson period. */
export function rowsForDay(maxStored: number, m: HomegroupMeeting | null): number {
  if (!m) return maxStored;
  return Math.max(maxStored > 0 ? shownPeriod(maxStored, m) : 0, m.period);
}
