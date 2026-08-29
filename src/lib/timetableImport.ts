// Pure logic for reading the ministry's teacher-schedule workbook.
// No DB, no xlsx — unit-tested in src/test/unit/timetableImport.test.ts.

/** Greek-aware ordering, so a picker built from these names reads naturally. */
const byGreekName = (a: string, b: string) => a.localeCompare(b, "el");

export type TeacherBlock = {
  /** Row index of the teacher row, for error messages that name the offender. */
  rowIndex: number;
  teacherRow: string[];
  detailRow: string[];
  staffName: string;
};

/**
 * Split the sheet into teacher/detail row pairs.
 *
 * The layout gives every teacher exactly two rows: the first carries their name
 * in column A and a group code per lesson, the second carries "room / course".
 * The walk is therefore a fixed stride of two, which means a single inserted or
 * deleted row shifts every later block by one and silently attributes each
 * lesson to the wrong teacher. `desyncRows` reports that: a detail row is only
 * ever blank in column A, so a name there is proof the pairing has slipped.
 * Reported, never repaired — guessing where the file went wrong would put bad
 * lessons in the timetable with no warning at all.
 */
export function splitTeacherBlocks(
  rows: string[][],
  startRow = 2, // rows 0-1 are the sheet's own headers
): { blocks: TeacherBlock[]; desyncRows: number[] } {
  const blocks: TeacherBlock[] = [];
  const desyncRows: number[] = [];

  for (let i = startRow; i < rows.length; i += 2) {
    const teacherRow = rows[i] ?? [];
    // A trailing teacher row with no detail row is legitimate: someone with no
    // lessons at the end of the file has nothing to pair with.
    const detailRow = rows[i + 1] ?? [];

    if (String(detailRow[0] ?? "").trim()) desyncRows.push(i + 1);

    const staffName = String(teacherRow[0] ?? "").trim();
    if (!staffName) continue; // blank separator or summary row

    blocks.push({ rowIndex: i, teacherRow, detailRow, staffName });
  }

  return { blocks, desyncRows };
}

/**
 * Which of the workbook's staff names have no StaffProfile yet.
 *
 * The Καθηγητής column is the school's staff roster, not just a label on a
 * lesson: a counselor, or anyone else without teaching hours, appears there and
 * produces no timetable slot at all. Deriving the roster from slots loses them.
 */
export function newStaffProfileNames(
  imported: Iterable<string>,
  existing: (string | null)[],
): string[] {
  const have = new Set(
    existing.map((n) => n?.trim()).filter((n): n is string => !!n),
  );
  const out = new Set<string>();
  for (const raw of imported) {
    const name = raw?.trim();
    if (name && !have.has(name)) out.add(name);
  }
  return [...out].sort(byGreekName);
}
