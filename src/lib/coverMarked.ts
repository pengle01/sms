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
