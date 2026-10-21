// «Ανταλλαγή περιόδων»: which of a teacher's weekly lessons can be swapped with
// another teacher's lesson to the same group. Teacher A (me) teaches group G at
// (d1, p1); teacher B teaches G at (d2, p2). They can exchange when A has no
// lesson at (d2, p2) and B has none at (d1, p1) — the group itself stays busy
// in the same two cells, so the students are unaffected. Fixed weekly
// timetable only; any day of the week.

export interface ExchangeSlot {
  id: string;
  groupId: string;
  dayOfWeek: number;
  period: number;
  staffId: string | null;
  /** Raw timetable name — identifies a teacher who hasn't claimed their slots yet. */
  staffName: string | null;
}

/** Who teaches a slot: the claimed staff profile, else the timetable name. */
export function slotTeacherKey(s: Pick<ExchangeSlot, "staffId" | "staffName">): string | null {
  if (s.staffId) return `id:${s.staffId}`;
  const name = s.staffName?.trim();
  return name ? `name:${name}` : null;
}

const cell = (dow: number, period: number) => dow * 100 + period;

export interface ExchangeOption<T extends ExchangeSlot> {
  mine: T;
  /** The other teacher's lessons to the same group that can be swapped with `mine`. */
  options: T[];
}

/**
 * Every lesson of mine with the lessons it can be exchanged with.
 * `myKeys` are my teacher keys (my staff id, plus my timetable name for slots
 * not yet claimed); `allSlots` is the school's whole weekly timetable.
 * Lessons are ordered by day and period; a lesson with no option is kept, with
 * an empty list.
 */
export function findExchanges<T extends ExchangeSlot>(myKeys: string[], allSlots: T[]): ExchangeOption<T>[] {
  const mine = new Set(myKeys);
  const busy = new Map<string, Set<number>>(); // teacher key → occupied cells
  for (const s of allSlots) {
    const key = slotTeacherKey(s);
    if (!key) continue;
    if (!busy.has(key)) busy.set(key, new Set());
    busy.get(key)!.add(cell(s.dayOfWeek, s.period));
  }
  const myBusy = new Set<number>();
  for (const k of mine) for (const c of busy.get(k) ?? []) myBusy.add(c);

  const byGroup = new Map<string, T[]>();
  for (const s of allSlots) byGroup.set(s.groupId, [...(byGroup.get(s.groupId) ?? []), s]);

  const order = (a: T, b: T) => a.dayOfWeek - b.dayOfWeek || a.period - b.period;
  return allSlots
    .filter((s) => {
      const k = slotTeacherKey(s);
      return k !== null && mine.has(k);
    })
    .sort(order)
    .map((m) => ({
      mine: m,
      options: (byGroup.get(m.groupId) ?? [])
        .filter((o) => {
          const other = slotTeacherKey(o);
          if (!other || mine.has(other)) return false;
          // I must be free at their time, and they at mine.
          if (myBusy.has(cell(o.dayOfWeek, o.period))) return false;
          return !busy.get(other)!.has(cell(m.dayOfWeek, m.period));
        })
        .sort(order),
    }));
}
