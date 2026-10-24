"use server";

import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { EDUCATOR_ROLES } from "@/lib/rbac";
import { canSendStaffNotifications } from "@/lib/staffNotifications";
import { keepAvailable, validateGroupName } from "@/lib/recipientGroups";
import { writeAudit, requestMeta } from "@/server/audit";

export type RecipientGroupResult =
  | { ok: true; id: string }
  | { ok: false; error: "err_forbidden" | "err_groupName" | "err_groupNameTaken" | "err_groupEmpty" | "err_notFound" };

async function sender() {
  const auth = await getActiveAuth();
  return auth && canSendStaffNotifications(auth.roles) ? auth : null;
}

/**
 * Save the current selection as one of the sender's own groups — a new one,
 * or (with `groupId`) overwrite a group they own. Only active educators other
 * than the sender are kept, the same people the composer can pick.
 */
export async function saveRecipientGroup(
  rawName: string,
  memberIds: string[],
  groupId?: string,
): Promise<RecipientGroupResult> {
  const auth = await sender();
  if (!auth) return { ok: false, error: "err_forbidden" };
  const v = validateGroupName(rawName);
  if (!v.ok) return { ok: false, error: v.error };

  const recipients = await db.user.findMany({
    where: { isActive: true, role: { in: EDUCATOR_ROLES }, id: { not: auth.userId, in: memberIds } },
    select: { id: true },
  });
  const members = keepAvailable(memberIds, recipients.map((r) => r.id));
  if (members.length === 0) return { ok: false, error: "err_groupEmpty" };

  const clash = await db.staffRecipientGroup.findUnique({
    where: { ownerId_name: { ownerId: auth.userId, name: v.name } },
    select: { id: true },
  });
  if (clash && clash.id !== groupId) return { ok: false, error: "err_groupNameTaken" };

  let id: string;
  if (groupId) {
    const own = await db.staffRecipientGroup.updateMany({
      where: { id: groupId, ownerId: auth.userId },
      data: { name: v.name, memberIds: members },
    });
    if (own.count === 0) return { ok: false, error: "err_notFound" };
    id = groupId;
  } else {
    id = (await db.staffRecipientGroup.create({
      data: { ownerId: auth.userId, name: v.name, memberIds: members },
      select: { id: true },
    })).id;
  }
  await writeAudit({
    ...(await requestMeta()),
    userId: auth.userId,
    action: "notification.groupSave",
    resource: "StaffRecipientGroup",
    resourceId: id,
    details: { name: v.name, members: members.length, updated: !!groupId },
  });
  return { ok: true, id };
}

/** Delete one of the sender's own groups. */
export async function deleteRecipientGroup(groupId: string): Promise<RecipientGroupResult> {
  const auth = await sender();
  if (!auth) return { ok: false, error: "err_forbidden" };
  const gone = await db.staffRecipientGroup.deleteMany({ where: { id: groupId, ownerId: auth.userId } });
  if (gone.count === 0) return { ok: false, error: "err_notFound" };
  await writeAudit({
    ...(await requestMeta()),
    userId: auth.userId,
    action: "notification.groupDelete",
    resource: "StaffRecipientGroup",
    resourceId: groupId,
  });
  return { ok: true, id: groupId };
}
