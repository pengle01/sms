// Pure parsers for the timetable Excel import. No DB / IO — unit-tested in
// src/test/unit/timetableParse.test.ts.

/**
 * Parse a timetable detail cell into { room, courseName }.
 *
 * Two shapes occur in the ministry export:
 *   "112 / Ψηφ.Ηλεκτρονικά I (2)"  → regular lesson; the "(2)" (weekly hours)
 *                                     is stripped.
 *   "8/Στηριξή"                    → support (ΣΤΗΡ) lesson; NO parenthetical,
 *                                     and often no space around the slash.
 *
 * The trailing "(…)" is therefore OPTIONAL — requiring it silently dropped the
 * parenthesis-less support periods on import. Returns null when there is no
 * "room / course" separator at all (blank / summary cells).
 */
export function parseCourseCell(cell: string): { room: string; courseName: string } | null {
  const m = cell.match(/^(.+?)\s*\/\s*(.+?)\s*(?:\(.*\))?\s*$/);
  if (!m) return null;
  return { room: m[1]!.trim(), courseName: m[2]!.trim() };
}
