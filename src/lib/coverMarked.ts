// Which covered lessons already have their register taken. A substitute's
// attendance is saved under the absent teacher's timetable slot, so a cover
// counts as done when rows exist for that slot on that date.

/** Key a slot + date the same way the schedule's `markedSet` does. */
export function markedKey(slotId: string, date: Date): string {
  return `${slotId}::${date.toISOString().slice(0, 10)}`;
}

export function coverMarkedKeys(rows: { timetableSlotId: string | null; date: Date }[]): Set<string> {
  const keys = new Set<string>();
  for (const r of rows) {
    if (r.timetableSlotId) keys.add(markedKey(r.timetableSlotId, r.date));
  }
  return keys;
}

/** A class I covered ad hoc («Αναπλήρωση τμήματος») — its register is in my name. */
export interface AdHocCover {
  slotId: string;
  period: number;
  groupId: string;
  groupName: string;
  courseName: string;
  /** The lesson's timetable teacher — the one I covered for. */
  teacherName: string;
  /** «Δικό μου μάθημα»: the subject of mine I taught instead of covering. */
  addedCourseName?: string;
}

/**
 * The ad-hoc covers among the attendance rows I recorded: rows on someone
 * else's lesson that no finalized substitution plan assigned (plan covers and
 * study halls are shown elsewhere). `planSlots` holds `markedKey(slot, date)`
 * of every plan entry. One cover per lesson and date, keyed "YYYY-MM-DD:period".
 */
export function adHocCovers(
  rows: (AdHocCover & { date: Date; slotStaffId: string | null })[],
  myStaffId: string,
  planSlots: Set<string>,
): Map<string, AdHocCover[]> {
  const seen = new Set<string>();
  const out = new Map<string, AdHocCover[]>();
  for (const r of rows) {
    if (r.slotStaffId === myStaffId) continue;
    const slotKey = markedKey(r.slotId, r.date);
    if (planSlots.has(slotKey) || seen.has(slotKey)) continue;
    seen.add(slotKey);
    const key = `${r.date.toISOString().slice(0, 10)}:${r.period}`;
    const cover: AdHocCover = {
      slotId: r.slotId,
      period: r.period,
      groupId: r.groupId,
      groupName: r.groupName,
      courseName: r.courseName,
      teacherName: r.teacherName,
      ...(r.addedCourseName ? { addedCourseName: r.addedCourseName } : {}),
    };
    const list = out.get(key);
    if (list) list.push(cover);
    else out.set(key, [cover]);
  }
  return out;
}
