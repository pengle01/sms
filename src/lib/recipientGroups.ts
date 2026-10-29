// Choosing recipients of a staff notification: a sender's own saved groups
// («Οι ομάδες μου») and «Καθηγητές τμήματος» — everyone who teaches any
// student of a homegroup. Pure; unit-tested in recipientGroups.test.ts.

export const GROUP_NAME_MAX = 60;

export type GroupNameError = "err_groupName";

/** The trimmed name, or why it can't be one (empty or longer than GROUP_NAME_MAX). */
export function validateGroupName(raw: string): { ok: true; name: string } | { ok: false; error: GroupNameError } {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > GROUP_NAME_MAX) return { ok: false, error: "err_groupName" };
  return { ok: true, name };
}

/** Members still available as recipients (active educators other than the sender), each once, in order. */
export function keepAvailable(memberIds: readonly string[], recipientIds: Iterable<string>): string[] {
  const allowed = new Set(recipientIds);
  return [...new Set(memberIds)].filter((id) => allowed.has(id));
}

/**
 * Everyone who teaches any student of a homegroup: the teachers of the current
 * lessons of the homegroup itself and of every group its students attend
 * (electives, lesson groups, support). Teachers without an account are
 * skipped. User ids, each once.
 */
export function homegroupTeacherUserIds(
  homegroupId: string,
  students: readonly { homegroupId: string | null; groupIds: readonly string[] }[],
  slots: readonly { groupId: string; userId: string | null }[],
): string[] {
  const groups = new Set<string>();
  for (const s of students) {
    if (s.homegroupId !== homegroupId) continue;
    groups.add(homegroupId);
    for (const g of s.groupIds) groups.add(g);
  }
  if (groups.size === 0) return [];
  const out = new Set<string>();
  for (const sl of slots) if (sl.userId && groups.has(sl.groupId)) out.add(sl.userId);
  return [...out];
}

/** «Καθηγητές τμήματος»: everyone who teaches any of the chosen homegroups, each once. */
export function classTeacherIds(
  homegroups: readonly { id: string; teacherIds: readonly string[] }[],
  chosen: Iterable<string>,
): string[] {
  const want = new Set(chosen);
  return [...new Set(homegroups.filter((h) => want.has(h.id)).flatMap((h) => h.teacherIds))];
}

/** «Υπεύθυνοι τμημάτων»: the homeroom teachers of the chosen years (1–3). */
export function homeroomTeacherIds(
  recipients: readonly { id: string; homeroomGrades: readonly number[] }[],
  years: Iterable<number>,
): string[] {
  const want = new Set(years);
  return recipients.filter((r) => r.homeroomGrades.some((g) => want.has(g))).map((r) => r.id);
}

/** Homegroups by year (1, 2, 3, then any other), in their given order. */
export function homegroupsByGrade<T extends { grade: number | null }>(homegroups: readonly T[]): [number, T[]][] {
  const out = new Map<number, T[]>();
  for (const h of homegroups) {
    const g = h.grade ?? 0;
    out.set(g, [...(out.get(g) ?? []), h]);
  }
  return [...out.entries()].sort(([a], [b]) => (a || 99) - (b || 99));
}
