import { db } from "@/server/db";
import { EDUCATOR_ROLES } from "@/lib/rbac";
import { homegroupTeacherUserIds } from "@/lib/recipientGroups";

/**
 * The accounts a homegroup teacher's notification goes to: active educators who
 * teach the homegroup or a subject group its students attend — not support
 * (ΣΤ_/ΑΣΤ_) teachers, never the sender. One source for the composer and the send.
 */
export async function homegroupRecipientIds(homegroupId: string, senderUserId: string): Promise<string[]> {
  const [students, slots] = await Promise.all([
    db.studentProfile.findMany({
      where: { groupId: homegroupId, user: { isActive: true } },
      select: { groupId: true, subjectGroups: { select: { groupId: true } } },
    }),
    db.timetableSlot.findMany({
      select: { groupId: true, group: { select: { name: true } }, staff: { select: { userId: true } } },
    }),
  ]);
  const ids = homegroupTeacherUserIds(
    homegroupId,
    students.map((s) => ({ homegroupId: s.groupId, groupIds: s.subjectGroups.map((g) => g.groupId) })),
    slots.map((s) => ({ groupId: s.groupId, groupName: s.group.name, userId: s.staff?.userId ?? null })),
    { skipSupport: true },
  ).filter((id) => id !== senderUserId);
  if (ids.length === 0) return [];
  const active = await db.user.findMany({
    where: { id: { in: ids }, isActive: true, role: { in: EDUCATOR_ROLES } },
    select: { id: true },
  });
  return active.map((u) => u.id);
}

/** The homegroups this account is the homegroup teacher (Υπεύθυνος/η) of. */
export async function myHomegroups(userId: string): Promise<{ id: string; name: string }[]> {
  const staff = await db.staffProfile.findUnique({
    where: { userId },
    select: { homeroomGroups: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
  });
  return staff?.homeroomGroups ?? [];
}
