// Students missing from a newly uploaded student file: who would be removed,
// which parents go with them, and who a re-upload brings back. Pure — the
// server side is src/server/studentImportSync.ts.
//
// Removal is always DEACTIVATION (User.isActive=false): records stay for
// reports, and it is reversible. `deactivatedByImport` marks accounts the import
// switched off, so only those are switched back on — never a student or parent
// the office deactivated on purpose.

/** Registry numbers as the import reads them: Excel may give 1234 or "1234 ". */
export function normRegistry(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export interface ActiveStudent {
  profileId: string;
  registry: string;
}

/** Active students whose registry number is not in the file. An empty file removes nobody. */
export function missingStudents<T extends ActiveStudent>(active: T[], fileRegistries: ReadonlySet<string>): T[] {
  if (fileRegistries.size === 0) return [];
  return active.filter((s) => !fileRegistries.has(normRegistry(s.registry)));
}

export interface ParentLinks {
  parentUserId: string;
  parentActive: boolean;
  children: { profileId: string; active: boolean }[];
}

/**
 * Parents to deactivate along with the removed students: active parents with
 * at least one removed child and no child left active.
 */
export function parentsLeftWithoutActiveChild(
  parents: ParentLinks[],
  removedProfileIds: ReadonlySet<string>,
): string[] {
  return parents
    .filter((p) => p.parentActive)
    .filter((p) => p.children.some((c) => removedProfileIds.has(c.profileId)))
    .filter((p) => !p.children.some((c) => c.active && !removedProfileIds.has(c.profileId)))
    .map((p) => p.parentUserId);
}

export interface AccountState {
  active: boolean;
  deactivatedByImport: Date | null;
}

/** Only an account the import switched off is switched back on by it. */
export function reactivatedByImport(a: AccountState): boolean {
  return !a.active && a.deactivatedByImport !== null;
}

/**
 * A file much smaller than the school looks partial (one class, the wrong
 * export). The admin still decides — this only drives the warning.
 */
export function looksPartial(fileCount: number, activeCount: number): boolean {
  return activeCount > 0 && fileCount < activeCount * 0.5;
}
