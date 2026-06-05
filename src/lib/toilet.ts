// Toilet-break logic (έξοδοι τουαλέτας) — pure helpers shared by the marking
// form and the duty-desk panel.

export type BreakLike = {
  studentId: string;
  leftAt: Date | string;
  returnedAt: Date | string | null;
};

const asDate = (d: Date | string) => (typeof d === "string" ? new Date(d) : d);

/** Whole minutes a break has lasted (until returnedAt, or `now` while open). */
export function breakMinutes(leftAt: Date | string, end: Date | string | null, now: Date): number {
  const from = asDate(leftAt).getTime();
  const to = end ? asDate(end).getTime() : now.getTime();
  return Math.max(0, Math.floor((to - from) / 60000));
}

/** An open break is overdue once it exceeds the threshold (default 10′). */
export function isOverdue(leftAt: Date | string, now: Date, thresholdMin = 10): boolean {
  return breakMinutes(leftAt, null, now) > thresholdMin;
}

/** Escalation bucket for the duty panel: ok → warn (>5′) → overdue (>10′). */
export function breakSeverity(leftAt: Date | string, now: Date): "ok" | "warn" | "overdue" {
  const m = breakMinutes(leftAt, null, now);
  if (m > 10) return "overdue";
  if (m > 5) return "warn";
  return "ok";
}

/** Per-student break count (today's list) — powers the "3η έξοδος" badge. */
export function breakCounts(breaks: BreakLike[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const b of breaks) counts[b.studentId] = (counts[b.studentId] ?? 0) + 1;
  return counts;
}

/** Students with `min`+ breaks today — the duty desk flags frequent leavers. */
export function frequentStudentIds(breaks: BreakLike[], min = 3): Set<string> {
  const counts = breakCounts(breaks);
  return new Set(Object.keys(counts).filter((id) => counts[id]! >= min));
}
