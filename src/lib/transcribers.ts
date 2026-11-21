// «Μεταγραφείς»: a student whose special-ed record carries διευκόλυνση 7 is
// entitled to a teacher who writes their test at dictation. The deputy
// responsible for special education uploads the list of teachers who may do
// it and picks one, free in the test's period(s), per student per test.
// Pure — unit-tested in transcribers.test.ts.

import { foldName, parseStaffCode } from "@/lib/visitHours";

/** The accommodation code that entitles a student to a transcriber. */
export const TRANSCRIBER_ACCOMMODATION = "7";

export interface TranscriberEntry {
  /** The teacher as written in the sheet, e.g. «Μ-ΑΡΝΟΣ Σ.». */
  name: string;
  /** The sheet's «ΠΕΡΙΟΔΟΙ» — informational only. */
  periods: number | null;
}

export type TranscriberSheet =
  | { ok: true; entries: TranscriberEntry[] }
  | { ok: false; error: "noNameColumn" | "empty" };

/**
 * The sheet's rows (as arrays): a header row with a «ΜΕΤΑΓΡΑΦΕΙΣ» column and,
 * optionally, a «ΠΕΡΙΟΔΟΙ» one; one teacher per row below it.
 */
export function parseTranscriberRows(rows: readonly (readonly unknown[])[]): TranscriberSheet {
  let header = -1;
  let nameCol = -1;
  for (let i = 0; i < rows.length && header < 0; i++) {
    nameCol = rows[i]!.findIndex((c) => foldName(c).includes("ΜΕΤΑΓΡΑΦ"));
    if (nameCol >= 0) header = i;
  }
  if (header < 0) return { ok: false, error: "noNameColumn" };
  const periodsCol = rows[header]!.findIndex((c) => foldName(c).includes("ΠΕΡΙΟΔ"));

  const entries: TranscriberEntry[] = [];
  for (const row of rows.slice(header + 1)) {
    const name = String(row[nameCol] ?? "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    const n = periodsCol >= 0 ? Number(row[periodsCol]) : NaN;
    entries.push({ name, periods: Number.isInteger(n) && n > 0 ? n : null });
  }
  return entries.length > 0 ? { ok: true, entries } : { ok: false, error: "empty" };
}

export interface TranscriberMatch {
  matched: { staffId: string; name: string; periods: number | null }[];
  /** Names in the sheet that point at no teacher, or at more than one. */
  unmatched: string[];
  /** Names listed again for a teacher already matched; the first row counts. */
  repeated: string[];
}

/**
 * Each sheet name's staff record. The whole timetable coding must agree
 * (ignoring accents, case, spacing and Latin look-alike letters); failing
 * that, subject + surname + initial must point at exactly one teacher — which
 * also finds a deputy whose coding ends in «ΒΔ».
 */
export function matchTranscribers(
  entries: readonly TranscriberEntry[],
  staff: readonly { id: string; scheduleName: string | null }[],
): TranscriberMatch {
  const named = staff.flatMap((s) => (s.scheduleName ? [{ id: s.id, scheduleName: s.scheduleName }] : []));
  const find = (name: string): string | null => {
    const whole = foldName(name);
    const exact = named.filter((s) => foldName(s.scheduleName) === whole);
    if (exact.length === 1) return exact[0]!.id;
    const code = parseStaffCode(name);
    if (!code) return null;
    const hits = named.filter((s) => {
      const c = parseStaffCode(s.scheduleName);
      return !!c && c.subject === code.subject && c.surname === code.surname && c.initial === code.initial;
    });
    return hits.length === 1 ? hits[0]!.id : null;
  };

  const out: TranscriberMatch = { matched: [], unmatched: [], repeated: [] };
  const seen = new Set<string>();
  for (const e of entries) {
    const id = find(e.name);
    if (!id) out.unmatched.push(e.name);
    else if (seen.has(id)) out.repeated.push(e.name);
    else {
      seen.add(id);
      out.matched.push({ staffId: id, name: e.name, periods: e.periods });
    }
  }
  return out;
}

/** The periods a test occupies. */
export function testPeriods(period: number, periodCount: number): number[] {
  return Array.from({ length: Math.max(1, periodCount) }, (_, i) => period + i);
}

/** What a teacher already has on the day of a test. */
export interface DayCommitments {
  /** Reported absent, or exempt from covers, for the whole day. */
  awayAllDay: boolean;
  /** Periods of a part-day absence or exemption. */
  awayPeriods: readonly number[];
  /** Own lessons that take place that day. */
  lessonPeriods: readonly number[];
  /** Covers assigned by the day's finalized substitution plan. */
  coverPeriods: readonly number[];
  /** Periods already spent transcribing for another student. */
  transcribingPeriods: readonly number[];
}

export type BusyReason = "away" | "lesson" | "cover" | "transcribing";

/** Why the teacher can't take the periods, or null when free in all of them. */
export function busyReason(periods: readonly number[], c: DayCommitments): BusyReason | null {
  const hits = (list: readonly number[]) => periods.some((p) => list.includes(p));
  if (c.awayAllDay || hits(c.awayPeriods)) return "away";
  if (hits(c.lessonPeriods)) return "lesson";
  if (hits(c.coverPeriods)) return "cover";
  if (hits(c.transcribingPeriods)) return "transcribing";
  return null;
}

/** One student of one test who is entitled to a transcriber. */
export interface TranscriberNeed<A = unknown> {
  testId: string;
  studentId: string;
  /** The assignment, when a transcriber has been picked. */
  assignment: A | null;
}

/** The needs still waiting for a transcriber, and those already covered. */
export function splitTranscriberNeeds<N extends TranscriberNeed>(needs: readonly N[]): { pending: N[]; assigned: N[] } {
  return {
    pending: needs.filter((n) => n.assignment === null),
    assigned: needs.filter((n) => n.assignment !== null),
  };
}

/** «16/03/26 · Π3–4 · Μαθηματικά (Β1)» — a test, for notification texts. */
export function transcriberTestLine(t: {
  dateLabel: string;
  period: number;
  periodCount: number;
  courseName: string;
  groupName: string;
}): string {
  const p = testPeriods(t.period, t.periodCount);
  const periods = p.length > 1 ? `Π${p[0]}–${p[p.length - 1]}` : `Π${p[0]}`;
  return `${t.dateLabel} · ${periods} · ${t.courseName} (${t.groupName})`;
}

/** True when nothing else uses the room in any of the periods. */
export function roomIsFree(
  room: string,
  periods: readonly number[],
  occupied: ReadonlyMap<number, ReadonlySet<string>>,
): boolean {
  return periods.every((p) => !occupied.get(p)?.has(room));
}

/** Does a test's transcription cover the period? */
export function coversPeriod(test: { period: number; periodCount: number }, period: number): boolean {
  return testPeriods(test.period, test.periodCount).includes(period);
}
