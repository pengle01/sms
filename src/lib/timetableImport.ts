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

/**
 * The teacher claim a re-imported lesson keeps. A lesson the file now gives to
 * someone else must drop the previous teacher's profile — otherwise the old
 * teacher keeps seeing it and the new one never does (the post-import re-link
 * only hands out unclaimed lessons). Same teacher → the claim stands.
 */
export function claimAfterUpdate(
  existing: { staffId: string | null; staffName: string | null },
  importedStaffName: string,
): string | null {
  if (!existing.staffId) return null;
  return existing.staffName?.trim() === importedStaffName.trim() ? existing.staffId : null;
}

/** A file that covers less than this share of the current timetable is not trusted to remove anything. */
export const REMOVAL_MIN_SHARE = 0.5;

export type RemovalSkipReason = "cellErrors" | "fileTooSmall";

/**
 * Whether the import may remove the lessons the file doesn't contain. The file
 * is the whole timetable, so anything missing from it goes — unless the file
 * looks incomplete: a cell failed to import (its lesson would be "missing" and
 * wrongly removed), or it holds far fewer lessons than the timetable does now
 * (a partial or wrong workbook). Then nothing is removed and the admin is told.
 */
export function removalGuard(input: {
  cellErrors: number;
  importedLessons: number;
  activeLessons: number;
}): RemovalSkipReason | null {
  if (input.cellErrors > 0) return "cellErrors";
  if (input.activeLessons > 0 && input.importedLessons < input.activeLessons * REMOVAL_MIN_SHARE) {
    return "fileTooSmall";
  }
  return null;
}

/**
 * Split the current lessons the file no longer contains into those to delete
 * and those to hide. A lesson with attendance is hidden (`removedAt`), because
 * attendance carries its period and course through the lesson — deleting it
 * would strip that history. One without attendance has nothing to protect.
 */
export function planRemovals(
  active: { id: string; hasAttendance: boolean }[],
  seen: ReadonlySet<string>,
): { deleteIds: string[]; hideIds: string[] } {
  const deleteIds: string[] = [];
  const hideIds: string[] = [];
  for (const slot of active) {
    if (seen.has(slot.id)) continue;
    (slot.hasAttendance ? hideIds : deleteIds).push(slot.id);
  }
  return { deleteIds, hideIds };
}
