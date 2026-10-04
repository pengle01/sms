// Private lesson notes — pure rules, unit-tested in lessonNotes.test.ts.

import { matchesSearch } from "@/lib/textSearch";

export const LESSON_NOTE_MAX = 2000;

export type NoteBody = { ok: true; body: string | null } | { ok: false; error: "tooLong" };

/** Trim; empty means "delete the note". */
export function normalizeNoteBody(raw: string): NoteBody {
  const body = raw.replace(/\r\n/g, "\n").trim();
  if (body.length > LESSON_NOTE_MAX) return { ok: false, error: "tooLong" };
  return { ok: true, body: body === "" ? null : body };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date "YYYY-MM-DD" (rejects 2026-02-30). */
export function isNoteDate(v: string): boolean {
  if (!ISO.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export interface NoteRow {
  groupName: string;
  courseName: string | null;
  body: string;
}

/** Notes matching the search box: text, class or lesson, accent-insensitive. */
export function filterNotes<T extends NoteRow>(notes: T[], q: string): T[] {
  if (!q.trim()) return notes;
  return notes.filter((n) => [n.body, n.groupName, n.courseName].some((v) => matchesSearch(v, q)));
}

/** One attendance row of the dates shown (absent / late / auto-absent only). */
export interface RegisterRow {
  dateIso: string;
  status: string;
  isAutoAbsent: boolean;
  waived: boolean;
  studentName: string;
  /** Regular lesson: its class and period. */
  slotGroupId: string | null;
  slotPeriod: number | null;
  /** Intercalary / excursion register: class and period. */
  intercalaryGroupId: string | null;
  intercalaryPeriod: number | null;
}

/**
 * The absent and late students of the lesson a note is about, from its
 * register as it stands now. Erased (waived) absences are left out.
 */
export function registerFor(
  note: { groupId: string; period: number; dateIso: string },
  rows: RegisterRow[],
): { absent: string[]; late: string[] } {
  const mine = rows.filter(
    (r) =>
      r.dateIso === note.dateIso &&
      !r.waived &&
      ((r.slotGroupId === note.groupId && r.slotPeriod === note.period) ||
        (r.intercalaryGroupId === note.groupId && r.intercalaryPeriod === note.period)),
  );
  const byName = (a: string, b: string) => a.localeCompare(b, "el");
  const absent = mine.filter((r) => r.status === "ABSENT" || r.isAutoAbsent).map((r) => r.studentName).sort(byName);
  const late = mine.filter((r) => r.status === "LATE" && !r.isAutoAbsent).map((r) => r.studentName).sort(byName);
  return { absent, late };
}
