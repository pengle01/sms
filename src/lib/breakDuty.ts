// «Εφημερίες εκπαιδευτικών» — the teachers' break duty. Pure helpers (no DB):
// parsing the school's Excel programme, matching its names to the timetable,
// the day's breaks from the bell schedule, and the report grid.

import { breaksOf, BELL_PERIOD_COUNT, type BellScheduleConfig } from "@/lib/bellSchedule";

export const WEEKDAY_HEADERS: Record<string, number> = {
  ΔΕΥΤΕΡΑ: 1,
  ΤΡΙΤΗ: 2,
  ΤΕΤΑΡΤΗ: 3,
  ΠΕΜΠΤΗ: 4,
  ΠΑΡΑΣΚΕΥΗ: 5,
};

/** Upper-case, accents dropped, single spaces — for recognising the file's labels. */
function plain(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v)).normalize("NFC");

/** A teacher name as written, tidied: "ΗΥ- ΘΕΟΔΟΡΟΥ Α." → "ΗΥ-ΘΕΟΔΟΡΟΥ Α." */
export function tidyName(raw: string): string {
  return raw.normalize("NFC").replace(/\s*-\s*/, "-").replace(/\s+/g, " ").trim();
}

// A name starts with a department prefix of 1–3 capitals and a dash, at the
// start of the cell or after whitespace or a slash: "Ξ-…", "ΗΥ- …", "Μ - …".
const NAME_START = /(?:^|[\s/])((?:[Α-ΩΆ-ΏA-Z]{1,3})\s*-\s*)/g;

/**
 * The teachers in one cell: one or two names padded with spaces (or, in older
 * files, separated by " / ").
 */
export function splitTeachers(cell: unknown): string[] {
  const text = cellText(cell).trim();
  if (!text) return [];
  const starts: number[] = [];
  for (const m of text.matchAll(NAME_START)) starts.push(m.index! + m[0].indexOf(m[1]!));
  if (starts.length === 0) return [tidyName(text)];
  const out: string[] = [];
  starts.forEach((start, i) => {
    const piece = text.slice(start, starts[i + 1] ?? text.length).replace(/[\s/]+$/, "");
    const name = tidyName(piece);
    if (name) out.push(name);
  });
  return out;
}

/** How a duty name is compared with a timetable name: no dots, spacing or «ΒΔ» suffix. */
export function dutyNameKey(name: string): string {
  return plain(name)
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+ΒΔ$/, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Μ-X1", "Φ-Χ", "Β-Χ2": an unfilled place in the programme. */
export function isPlaceholderName(name: string): boolean {
  const after = dutyNameKey(name).split("-").slice(1).join("-");
  return /^[XΧ]\d*$/.test(after);
}

export interface ParsedPost {
  code: string;
  name: string;
  /** Weekday 1–5 → teacher names. */
  days: Record<number, string[]>;
}

export interface ParsedDutyFile {
  posts: ParsedPost[];
  /** Weekday 1–5 → the file's deputy cells for that day, as written (both deputy rows). */
  deputies: Record<number, string[]>;
  warnings: string[];
}

const emptyDays = (): Record<number, string[]> => ({ 1: [], 2: [], 3: [], 4: [], 5: [] });

/**
 * Read the programme from a sheet's rows (as sheet_to_json with header: 1).
 * Weekday columns are found from the header row; the block may repeat lower
 * down. Rows naming «ΒΟΗΘΟΙ ΔΙΕΥΘΥΝΤΕΣ» are the deputies; every other row with
 * an Α/Α and a place is a post, kept even when it has no teachers.
 */
export function parseDutyWorkbook(rows: unknown[][]): ParsedDutyFile {
  const warnings: string[] = [];
  const posts: ParsedPost[] = [];
  const deputies = emptyDays();
  let dayCols: Map<number, number> | null = null;
  const seen = new Set<string>();

  for (const [i, row] of rows.entries()) {
    const cells = row.map((c) => cellText(c));
    // A header row names the weekdays: (re)read the column of each.
    const header = new Map<number, number>();
    cells.forEach((c, col) => {
      const dow = WEEKDAY_HEADERS[plain(c)];
      if (dow) header.set(dow, col);
    });
    if (header.size >= 3) {
      dayCols = header;
      continue;
    }
    if (!dayCols) continue;

    const code = (cells[0] ?? "").replace(/\s+/g, " ").trim();
    const place = (cells[1] ?? "").replace(/\s+/g, " ").trim();
    if (plain(place).startsWith("ΒΟΗΘΟΙ ΔΙΕΥΘΥΝΤΕΣ")) {
      // Kept as written, only for comparing with the roster in the preview —
      // full names run together with single spaces, so they can't be split.
      for (const [dow, col] of dayCols) {
        const text = (cells[col] ?? "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
        if (text) deputies[dow]!.push(text);
      }
      continue;
    }
    if (!code || !place || plain(place) === "ΧΩΡΟΣ ΕΦΗΜΕΡΕΥΣΗΣ") continue;

    if (seen.has(code)) {
      warnings.push(`Γραμμή ${i + 1}: ο χώρος «${code}» εμφανίζεται ξανά — κρατήθηκε ο πρώτος.`);
      continue;
    }
    seen.add(code);
    const days = emptyDays();
    for (const [dow, col] of dayCols) days[dow] = splitTeachers(cells[col]);
    posts.push({ code, name: place, days });
  }

  if (!dayCols) warnings.push("Δεν βρέθηκε γραμμή με τις ημέρες (ΔΕΥΤΕΡΑ … ΠΑΡΑΣΚΕΥΗ).");
  else if (posts.length === 0) warnings.push("Δεν βρέθηκαν χώροι εφημέρευσης.");
  return { posts, deputies, warnings };
}

export interface DayBreak {
  no: number;
  /** Start and end, "HH:MM". */
  from: string;
  to: string;
  minutes: number;
}

/** The breaks of a weekday, numbered from 1, from the bell schedule. */
export function dayBreaks(bell: BellScheduleConfig, dow: number): DayBreak[] {
  const id = bell.days[dow] ?? "seven";
  const periods = bell.schedules[id].slice(0, BELL_PERIOD_COUNT[id]);
  return breaksOf(periods).map((b, i) => ({
    no: i + 1,
    from: periods[b.afterPeriod - 1]!.end,
    to: periods[b.afterPeriod]!.start,
    minutes: b.minutes,
  }));
}

/** The break running at `hhmm`, else the next one, else the last. */
export function currentBreakNo(breaks: DayBreak[], hhmm: string): number | null {
  if (breaks.length === 0) return null;
  const now = breaks.find((b) => hhmm < b.to);
  return (now ?? breaks[breaks.length - 1]!).no;
}

export interface GridPost {
  code: string;
  name: string;
  teachers: string[];
}

export interface GridCheck {
  breakNo: number;
  postCode: string;
  teacherName: string;
  present: boolean | null;
  comment: string | null;
  checkedBy?: string | null;
}

export interface GridRow {
  postCode: string;
  postName: string;
  teacherName: string;
  /** Break no. → the check, or null if nobody recorded it. */
  cells: Record<number, { present: boolean | null; comment: string | null; checkedBy: string | null } | null>;
}

const checkKey = (breakNo: number, postCode: string, teacher: string) => `${breakNo}|${postCode}|${dutyNameKey(teacher)}`;

/**
 * One row per post and teacher, with each break's check. Checks of teachers no
 * longer in the programme (a re-import) are still shown, after their post.
 */
export function reportGrid(posts: GridPost[], checks: GridCheck[], breaks: { no: number }[]): GridRow[] {
  const byKey = new Map(checks.map((c) => [checkKey(c.breakNo, c.postCode, c.teacherName), c]));
  const used = new Set<string>();
  const rows: GridRow[] = [];
  const rowFor = (postCode: string, postName: string, teacherName: string): GridRow => {
    const cells: GridRow["cells"] = {};
    for (const b of breaks) {
      const k = checkKey(b.no, postCode, teacherName);
      const c = byKey.get(k);
      if (c) used.add(k);
      cells[b.no] = c ? { present: c.present, comment: c.comment, checkedBy: c.checkedBy ?? null } : null;
    }
    return { postCode, postName, teacherName, cells };
  };
  for (const p of posts) {
    for (const t of p.teachers) rows.push(rowFor(p.code, p.name, t));
    // Checks for this post whose teacher isn't in today's programme any more.
    const extra = new Set(
      checks
        .filter((c) => c.postCode === p.code && !used.has(checkKey(c.breakNo, c.postCode, c.teacherName)))
        .map((c) => c.teacherName),
    );
    for (const t of extra) rows.push(rowFor(p.code, p.name, t));
  }
  return rows;
}

/** How many teacher slots of a break were checked (present or absent recorded). */
export function breakProgress(rows: GridRow[], breakNo: number): { checked: number; total: number; absent: number } {
  let checked = 0;
  let absent = 0;
  for (const r of rows) {
    const c = r.cells[breakNo];
    if (c && c.present !== null) checked++;
    if (c && c.present === false) absent++;
  }
  return { checked, total: rows.length, absent };
}
