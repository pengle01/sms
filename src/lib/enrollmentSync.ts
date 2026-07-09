// Pure logic for syncing a student's subject-group enrollment to their import
// row. No DB — unit-tested in src/test/unit/enrollmentSync.test.ts.

/**
 * Plan the per-student enrollment sync. Given the student's CURRENT subject-group
 * links, the TARGET group set resolved from their file row, and the set of ALL
 * group ids the file mentions anywhere (`fileGroupIds`), return which links to
 * add and which stale links to remove so the DB matches the file.
 *
 * Removal is scoped to `fileGroupIds`: the file is only authoritative for the
 * kinds of groups it carries. A link to a group the file never mentions — e.g.
 * a support group assigned by hand or by another tool — is out of the file's
 * knowledge and is always kept.
 *
 * Removal is additionally SUPPRESSED entirely (toRemove is empty) when:
 *  - `rowComplete` is false — the row had an unresolved/unknown group code, so the
 *    target set is incomplete and must not delete real links; or
 *  - the target set is empty — never wipe a student's whole enrollment from a
 *    blank or garbled row.
 */
export function enrollmentSyncPlan(
  currentGroupIds: string[],
  targetGroupIds: string[],
  rowComplete: boolean,
  fileGroupIds: ReadonlySet<string>,
): { toAdd: string[]; toRemove: string[] } {
  const current = new Set(currentGroupIds);
  const target = new Set(targetGroupIds);

  const toAdd = [...target].filter((g) => !current.has(g));

  const canRemove = rowComplete && target.size > 0;
  const toRemove = canRemove
    ? [...current].filter((g) => !target.has(g) && fileGroupIds.has(g))
    : [];

  return { toAdd, toRemove };
}
