// Pure logic for syncing a student's subject-group enrollment to their import
// row. No DB — unit-tested in src/test/unit/enrollmentSync.test.ts.

/**
 * Plan the per-student enrollment sync. Given the student's CURRENT subject-group
 * links and the TARGET group set resolved from their file row, return which links
 * to add and which stale links to remove so the DB matches the file.
 *
 * Removal is SUPPRESSED (toRemove is empty) when:
 *  - `rowComplete` is false — the row had an unresolved/unknown group code, so the
 *    target set is incomplete and must not delete real links; or
 *  - the target set is empty — never wipe a student's whole enrollment from a
 *    blank or garbled row.
 *
 * The enrollment file is the canonical roster (it lists academic AND support
 * `ΣΤ_`/`ΑΣΤ_` groups), so a complete row is authoritative for that student.
 */
export function enrollmentSyncPlan(
  currentGroupIds: string[],
  targetGroupIds: string[],
  rowComplete: boolean,
): { toAdd: string[]; toRemove: string[] } {
  const current = new Set(currentGroupIds);
  const target = new Set(targetGroupIds);

  const toAdd = [...target].filter((g) => !current.has(g));

  const canRemove = rowComplete && target.size > 0;
  const toRemove = canRemove ? [...current].filter((g) => !target.has(g)) : [];

  return { toAdd, toRemove };
}
