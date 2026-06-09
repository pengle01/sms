// Messaging helpers — who a student can reach, who may oversee a thread, and
// unread computation. Pure (no DB/React) so the rules are unit-testable.

interface HomeroomRoles {
  homeroomTeacherId?: string | null;
  homeroomHeadteacherId?: string | null;
  counselorId?: string | null;
}

/** Staff a student (and their parents) may message: every subject teacher who
 *  teaches them, plus their homegroup teacher, headteacher and counselor. */
export function reachableStaffIds(
  params: { subjectTeacherIds: (string | null | undefined)[] } & HomeroomRoles
): string[] {
  const set = new Set<string>();
  for (const id of params.subjectTeacherIds) if (id) set.add(id);
  for (const id of [params.homeroomTeacherId, params.homeroomHeadteacherId, params.counselorId]) {
    if (id) set.add(id);
  }
  return [...set];
}

/** Staff who may read (oversee) a student's threads for safeguarding: the
 *  homegroup teacher, headteacher and counselor. (Super-admin is handled by role.) */
export function oversightStaffIds(params: HomeroomRoles): string[] {
  const set = new Set<string>();
  for (const id of [params.homeroomTeacherId, params.homeroomHeadteacherId, params.counselorId]) {
    if (id) set.add(id);
  }
  return [...set];
}

interface ReadState {
  lastMessageAt: Date;
  readAt: Date | null;
}

/** A thread is unread for a side when there's a message newer than that side's
 *  last read (or it was never read). Read timestamps are bumped on open/send,
 *  so a side never sees its own message as unread. */
export function isUnread({ lastMessageAt, readAt }: ReadState): boolean {
  return !readAt || lastMessageAt.getTime() > readAt.getTime();
}

export function isUnreadForStaff(c: { lastMessageAt: Date; staffReadAt: Date | null }): boolean {
  return isUnread({ lastMessageAt: c.lastMessageAt, readAt: c.staffReadAt });
}

export function isUnreadForFamily(c: { lastMessageAt: Date; familyReadAt: Date | null }): boolean {
  return isUnread({ lastMessageAt: c.lastMessageAt, readAt: c.familyReadAt });
}
