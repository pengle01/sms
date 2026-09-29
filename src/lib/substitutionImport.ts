// Import of the daily substitution plan exported by SchoolAbsence (the school's
// existing substitution program). Pure and unit-tested: parsing, the mapping
// onto plan entries, and every reason to refuse a file live here. The server
// module only supplies the timetable lookups and writes the result.
//
// The school decided (2026-09-29) that SchoolAbsence keeps deciding the
// substitutions and the app publishes them; the import is STRICT — if any class,
// teacher or lesson in the file doesn't match the app's timetable, nothing is
// imported and every mismatch is listed.
import { z } from "zod";

/**
 * Teachers file absence, exemption and room-change requests in SchoolAbsence,
 * not in the app. While this is false the app's own request form is hidden and
 * its action refuses. Flip it back if the school ever returns to the app's
 * generator.
 */
export const SUBSTITUTION_REQUESTS_IN_APP = false;

export const SCHOOL_ABSENCE_SOURCE = "SCHOOL_ABSENCE";

/** Largest file accepted — the sample export is ~15 KB. */
export const IMPORT_MAX_BYTES = 256 * 1024;

// ─── The file ────────────────────────────────────────────────────────────────

const text = z.string();
const maybe = z.string().nullable().optional();

const SubstitutionRow = z.object({
  class: text,
  teacher: text,
  period: z.number().int(),
  substituteTeacher: maybe,
  comments: maybe,
  room: maybe,
  newRoom: maybe,
});

const RoomChangeRow = z.object({
  class: text,
  period: z.number().int(),
  teacher: text,
  comments: maybe,
  newRoom: maybe,
});

const TeacherReason = z.object({ teacher: text, reason: maybe });

const FileSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dayName: maybe,
  exportedAt: maybe,
  source: maybe,
  sectionA_substitutions: z.array(SubstitutionRow).default([]),
  sectionB_noSeventhPeriod: z.object({ classes: z.array(text).default([]) }).nullable().optional(),
  sectionC_roomChanges: z.array(RoomChangeRow).default([]),
  sectionD_absentTeachers: z.array(TeacherReason).default([]),
  sectionE_exceptions: z.array(TeacherReason).default([]),
  sectionF_dutyAndAbsence: z.array(z.object({ teacher: text, message: text })).default([]),
});

export type SchoolAbsenceFile = z.infer<typeof FileSchema>;

export type ImportIssue = { code: string; params?: Record<string, string | number> };

export function parseSchoolAbsence(
  raw: string,
): { ok: true; file: SchoolAbsenceFile } | { ok: false; error: ImportIssue } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: { code: "badJson" } };
  }
  const parsed = FileSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: { code: "badShape", params: { path: first?.path.join(".") ?? "" } } };
  }
  return { ok: true, file: parsed.data };
}

// ─── Names ───────────────────────────────────────────────────────────────────

/** How names are compared: Unicode-normalised, trimmed, single-spaced. */
export function normName(s: string): string {
  return s.normalize("NFC").trim().replace(/\s+/g, " ");
}

/** Accent- and case-insensitive text for recognising the program's phrases. */
function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const GREEK_DAYS = ["Κυριακή", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο"];

/** Is this a real calendar date? «2026-02-30» is not (JS would roll it to 2 March). */
export function isRealDate(isoDate: string): boolean {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === isoDate;
}

/** 1 = Monday … 5 = Friday for an ISO date, null at the weekend or for an invalid date (matches TimetableSlot.dayOfWeek). */
export function weekdayOf(isoDate: string): number | null {
  if (!isRealDate(isoDate)) return null;
  const dow = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
  return dow >= 1 && dow <= 5 ? dow : null;
}

/** «6,7» → [6, 7]; empty or missing → [] (the whole day). */
export function parsePeriods(s: string | null | undefined): number[] {
  return (s ?? "")
    .split(",")
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * Section E's reason is `periods + "  " + reason`: «6,7  Ασθένεια Παιδιού»,
 * «  Erasmus». Split it back into its two parts.
 */
export function splitExceptionReason(s: string | null | undefined): { periods: number[]; reason: string } {
  const m = (s ?? "").match(/^\s*((?:\d+\s*,\s*)*\d+)?\s*(.*)$/);
  return { periods: parsePeriods(m?.[1]), reason: (m?.[2] ?? "").trim() };
}

// ─── Resolution against the timetable ────────────────────────────────────────

export interface StaffRef {
  id: string;
  /** Has an active login — needed to be notified. */
  hasLogin: boolean;
}

/** The app's timetable for the file's weekday, keyed by normalised names. */
export interface ImportLookups {
  /** Group name → id. */
  groups: ReadonlyMap<string, string>;
  /** `${groupId}:${period}` → that weekday's lesson. */
  slots: ReadonlyMap<string, { id: string; staffName: string | null }>;
  /** Timetable code (scheduleName) → staff; "ambiguous" when two profiles share it. */
  staff: ReadonlyMap<string, StaffRef | "ambiguous">;
  /** The weekday's last period (7, or 8 on Mon/Thu) — when classes leave early. */
  lastPeriod: number;
}

export type ImportKind = "COVER" | "SWAP" | "STUDY_HALL" | "RELEASE" | "ROOM_CHANGE" | "SUPPORT_MERGE";

/** One plan entry, ready for SubstitutionPlanEntry.createMany. */
export interface ImportEntry {
  kind: ImportKind;
  period: number;
  groupId: string;
  timetableSlotId: string | null;
  absentStaffId: string | null;
  substituteStaffId: string | null;
  room: string | null;
  newRoom: string | null;
  note: string | null;
}

export interface ImportedTeacher {
  teacher: string;
  staffId: string;
  /** Empty = the whole day. */
  periods: number[];
  reason: string;
}

/** Stored as SubstitutionPlan.importMeta. */
export interface ImportMeta {
  exportedAt: string | null;
  absences: ImportedTeacher[];
  /** Present but excused from covering (in section E, not in section D). */
  exemptions: ImportedTeacher[];
  /** Break-duty posts left uncovered by an absent teacher (section F). */
  duty: { teacher: string; staffId: string; message: string }[];
}

export interface ImportResult {
  date: string;
  weekday: number | null;
  entries: ImportEntry[];
  meta: ImportMeta;
  /** Any error refuses the whole file. */
  errors: ImportIssue[];
  /** Import proceeds, but the coordinator should know. */
  warnings: ImportIssue[];
}

const empty = (s: string | null | undefined) => (s && s.trim() !== "" ? s.trim() : null);

/**
 * Map a parsed file onto plan entries, checking every name against the
 * timetable. Nothing here is written; `errors` non-empty means refuse.
 */
export function resolveImport(file: SchoolAbsenceFile, lookups: ImportLookups): ImportResult {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const entries: ImportEntry[] = [];
  const weekday = weekdayOf(file.date);
  const result = (): ImportResult => ({
    date: file.date,
    weekday,
    entries,
    meta: { exportedAt: file.exportedAt ?? null, absences, exemptions, duty },
    errors,
    warnings,
  });
  const absences: ImportedTeacher[] = [];
  const exemptions: ImportedTeacher[] = [];
  const duty: ImportMeta["duty"] = [];

  if (weekday === null) {
    errors.push({ code: isRealDate(file.date) ? "weekend" : "badDate", params: { date: file.date } });
    return result();
  }
  if (file.dayName && plain(file.dayName) !== plain(GREEK_DAYS[weekday])) {
    errors.push({ code: "dayMismatch", params: { dayName: file.dayName.trim(), date: file.date } });
  }

  // Report each unknown or ambiguous name once, however often it appears.
  const reported = new Set<string>();
  const once = (issue: ImportIssue, key: string) => {
    if (reported.has(key)) return;
    reported.add(key);
    errors.push(issue);
  };
  const noLogin = new Set<string>();

  const staffOf = (rawName: string): StaffRef | null => {
    const name = normName(rawName);
    const s = lookups.staff.get(name);
    if (s === "ambiguous") {
      once({ code: "ambiguousTeacher", params: { name } }, `amb:${name}`);
      return null;
    }
    if (!s) {
      once({ code: "unknownTeacher", params: { name } }, `unk:${name}`);
      return null;
    }
    return s;
  };
  const groupOf = (rawClass: string): string | null => {
    const cls = normName(rawClass);
    const id = lookups.groups.get(cls);
    if (!id) once({ code: "unknownClass", params: { cls } }, `cls:${cls}`);
    return id ?? null;
  };
  /** The class's lesson at that period, checked to be taught by `teacher`. */
  const lessonOf = (groupId: string, cls: string, period: number, teacher: string | null) => {
    const slot = lookups.slots.get(`${groupId}:${period}`);
    if (!slot) {
      errors.push({ code: "noLesson", params: { cls: normName(cls), period } });
      return null;
    }
    if (teacher !== null && normName(slot.staffName ?? "") !== normName(teacher)) {
      errors.push({
        code: "teacherMismatch",
        params: { cls: normName(cls), period, file: normName(teacher), timetable: normName(slot.staffName ?? "—") },
      });
      return null;
    }
    return slot;
  };

  const released = new Set<string>(); // normalised class names that leave early
  const swaps: { cls: string; period: number; teacher: string }[] = [];

  // ── Section A ──
  for (const row of file.sectionA_substitutions) {
    const sub = empty(row.substituteTeacher);
    const comments = empty(row.comments);
    const isSupport = !!sub && plain(sub).startsWith("να πανε");
    const isStudyHall = !!sub && plain(sub).startsWith("φ/δι");
    // A teacher. «#» marks a cover from the program's own list; the teacher is
    // matched and notified like any other, and the comment is kept.
    const code = sub && !isSupport && !isStudyHall ? sub.replace(/^#/, "").trim() : null;

    // Check every name in the row before giving up on it, so one pass lists
    // every problem instead of revealing them a few at a time.
    const groupId = groupOf(row.class);
    const absent = staffOf(row.teacher);
    const substitute = code ? staffOf(code) : null;
    const slot = groupId ? lessonOf(groupId, row.class, row.period, row.teacher) : null;
    if (!groupId || !absent || !slot || (code && !substitute)) continue;

    const base = {
      period: row.period,
      groupId,
      timetableSlotId: slot.id,
      absentStaffId: absent.id,
      room: empty(row.room),
    };

    if (!sub) {
      entries.push({ ...base, kind: "RELEASE", substituteStaffId: null, newRoom: null, note: comments });
      released.add(normName(row.class));
      continue;
    }
    if (isSupport) {
      entries.push({ ...base, kind: "SUPPORT_MERGE", substituteStaffId: null, newRoom: null, note: sub });
      continue;
    }
    if (isStudyHall) {
      entries.push({ ...base, kind: "STUDY_HALL", substituteStaffId: null, newRoom: empty(row.newRoom) ?? "κιόσκια", note: sub });
      continue;
    }
    if (!code || !substitute) continue; // unreachable: a non-empty sub is one of the three
    if (!substitute.hasLogin) noLogin.add(normName(code));

    const swap = plain(comments ?? "").match(/αλλαγη\s+απο\s+(\d+)\s+σε\s+(\d+)/);
    entries.push({
      ...base,
      kind: swap ? "SWAP" : "COVER",
      substituteStaffId: substitute.id,
      newRoom: empty(row.newRoom) ?? base.room,
      note: comments,
    });
    if (swap) {
      // The moved teacher's own lesson at period X is now empty: the class
      // leaves early then.
      const from = parseInt(swap[1], 10);
      swaps.push({ cls: normName(row.class), period: row.period, teacher: normName(code) });
      const vacated = lessonOf(groupId, row.class, from, code);
      if (vacated) {
        entries.push({
          kind: "RELEASE",
          period: from,
          groupId,
          timetableSlotId: vacated.id,
          absentStaffId: substitute.id,
          substituteStaffId: null,
          room: null,
          newRoom: null,
          note: comments,
        });
        released.add(normName(row.class));
      }
    }
  }

  // ── Section B: every class that leaves early must be accounted for ──
  for (const raw of file.sectionB_noSeventhPeriod?.classes ?? []) {
    const cls = normName(raw);
    if (released.has(cls)) continue;
    const groupId = groupOf(raw);
    if (!groupId) continue;
    const slot = lessonOf(groupId, raw, lookups.lastPeriod, null);
    if (!slot) continue;
    entries.push({
      kind: "RELEASE",
      period: lookups.lastPeriod,
      groupId,
      timetableSlotId: slot.id,
      absentStaffId: null,
      substituteStaffId: null,
      room: null,
      newRoom: null,
      note: null,
    });
    released.add(cls);
  }

  // ── Section C: room changes (a swap appears here too — skip it) ──
  for (const row of file.sectionC_roomChanges) {
    const cls = normName(row.class);
    const teacher = normName(row.teacher);
    if (swaps.some((s) => s.cls === cls && s.period === row.period && s.teacher === teacher)) continue;
    const groupId = groupOf(row.class);
    const who = staffOf(row.teacher);
    const slot = groupId ? lessonOf(groupId, row.class, row.period, row.teacher) : null;
    if (!groupId || !who || !slot) continue;
    // substituteStaffId, not absentStaffId: the teacher still teaches — marking
    // them absent would show their lesson as «καλύπτεται» everywhere.
    entries.push({
      kind: "ROOM_CHANGE",
      period: row.period,
      groupId,
      timetableSlotId: null,
      absentStaffId: null,
      substituteStaffId: who.id,
      room: null,
      newRoom: empty(row.newRoom),
      note: empty(row.comments),
    });
  }

  // ── Sections D + E: absent teachers, and exemptions ──
  const reasons = new Map<string, { periods: number[]; reason: string }>();
  for (const e of file.sectionE_exceptions) reasons.set(normName(e.teacher), splitExceptionReason(e.reason));
  const absentNames = new Set<string>();
  for (const d of file.sectionD_absentTeachers) {
    const teacher = normName(d.teacher);
    const who = staffOf(d.teacher);
    if (!who || absentNames.has(teacher)) continue;
    absentNames.add(teacher);
    const e = reasons.get(teacher);
    const periods = parsePeriods(d.reason);
    absences.push({ teacher, staffId: who.id, periods: periods.length ? periods : (e?.periods ?? []), reason: e?.reason ?? "" });
  }
  for (const [teacher, e] of reasons) {
    if (absentNames.has(teacher)) continue;
    const who = staffOf(teacher);
    if (who) exemptions.push({ teacher, staffId: who.id, periods: e.periods, reason: e.reason });
  }

  // ── Section F: break-duty posts left uncovered ──
  for (const f of file.sectionF_dutyAndAbsence) {
    const who = staffOf(f.teacher);
    if (who) duty.push({ teacher: normName(f.teacher), staffId: who.id, message: f.message.trim() });
  }

  for (const name of noLogin) warnings.push({ code: "noLogin", params: { name } });
  return result();
}

/** Entries per kind, for the preview. */
export function countByKind(entries: readonly ImportEntry[]): Record<ImportKind, number> {
  const counts: Record<ImportKind, number> = {
    COVER: 0, SWAP: 0, STUDY_HALL: 0, RELEASE: 0, ROOM_CHANGE: 0, SUPPORT_MERGE: 0,
  };
  for (const e of entries) counts[e.kind]++;
  return counts;
}

/** Read an ImportMeta back from the plan's JSON column, tolerating anything malformed. */
export function readImportMeta(value: unknown): ImportMeta | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<ImportMeta>;
  return {
    exportedAt: typeof v.exportedAt === "string" ? v.exportedAt : null,
    absences: Array.isArray(v.absences) ? v.absences : [],
    exemptions: Array.isArray(v.exemptions) ? v.exemptions : [],
    duty: Array.isArray(v.duty) ? v.duty : [],
  };
}
