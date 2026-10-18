// Toilet-break logic (έξοδοι τουαλέτας) — pure helpers shared by the marking
// form and the duty-desk panel.

import { normalizeTime } from "@/lib/bellSchedule";

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

// ── Corrections (the recording teacher fixes a wrong tap or a forgotten return) ──

const TZ = "Asia/Nicosia";

/** Wall-clock "HH:MM" in Cyprus on `dateIso` (YYYY-MM-DD) as a UTC instant — DST-aware. */
export function nicosiaInstant(dateIso: string, hhmm: string): Date {
  const [y, mo, d] = dateIso.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const wanted = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const wallOf = (t: number) => {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    return Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!);
  };
  // Shift by the zone's offset; a second pass settles dates where DST changes.
  let t = wanted - (wallOf(wanted) - wanted);
  t = wanted - (wallOf(t) - t);
  return new Date(t);
}

export type BreakEditError = "badTime" | "returnBeforeLeave" | "future" | "openNotToday";

/**
 * Turn the correction form into instants, or say why it can't be saved:
 * malformed time, return not after the exit, a time in the future, or
 * "still out" on a past day (an exit from an earlier day must have ended).
 */
export function resolveBreakEdit(input: {
  dateIso: string;
  leftAt: string;
  returnedAt: string | null;
  now: Date;
  isToday: boolean;
}): { leftAt: Date; returnedAt: Date | null } | { error: BreakEditError } {
  const left = normalizeTime(input.leftAt);
  const back = input.returnedAt === null ? null : normalizeTime(input.returnedAt);
  if (!left || (input.returnedAt !== null && !back)) return { error: "badTime" };
  if (back === null && !input.isToday) return { error: "openNotToday" };
  const leftAt = nicosiaInstant(input.dateIso, left);
  const returnedAt = back ? nicosiaInstant(input.dateIso, back) : null;
  if (returnedAt && returnedAt.getTime() <= leftAt.getTime()) return { error: "returnBeforeLeave" };
  if (leftAt > input.now || (returnedAt && returnedAt > input.now)) return { error: "future" };
  return { leftAt, returnedAt };
}

/** "HH:MM" of an instant in Cyprus — prefills the correction form. */
export function nicosiaHhmm(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ });
}
