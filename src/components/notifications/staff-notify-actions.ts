"use server";

import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { EDUCATOR_ROLES } from "@/lib/rbac";
import { canSendHomegroupNotifications, canSendStaffNotifications } from "@/lib/staffNotifications";
import { homegroupRecipientIds, myHomegroups } from "@/server/homegroupTeachers";
import { writeAudit, requestMeta } from "@/server/audit";
import { ATTACHMENT_MAX_COUNT } from "@/lib/attachments";

/**
 * Send an ad-hoc notification to the teaching staff.
 *
 * `backTo` is the composer to return to — management composes from the teacher
 * noticeboard, the office from its own notifications page, and a secretary must
 * not be redirected into a portal her layout refuses.
 */
export async function sendStaffNotification(locale: string, backTo: string, formData: FormData) {
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  // Fresh role check — management and the school office may compose
  if (!canSendStaffNotifications(auth.roles)) redirect(backTo);

  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const body = (formData.get("body") as string | null)?.trim() ?? "";
  const mode = formData.get("mode") as string | null;
  const picked = formData.getAll("to").map(String);

  const back = backTo;
  if (!title) redirect(`${back}?error=title`);
  if (!body) redirect(`${back}?error=body`);
  if (mode !== "all" && picked.length === 0) redirect(`${back}?error=recipients`);

  const fileIds = await ownedFileIds(formData, auth.userId, back);

  // Resolve recipients server-side: active educators only, never the sender
  const recipients = await db.user.findMany({
    where: {
      isActive: true,
      role: { in: EDUCATOR_ROLES },
      id: { not: auth.userId, ...(mode === "all" ? {} : { in: picked }) },
    },
    select: { id: true },
  });
  if (recipients.length === 0) redirect(`${back}?error=recipients`);

  await deliver(auth.userId, title, body, fileIds, recipients.map((r) => r.id));
  await writeAudit({
    ...(await requestMeta()),
    userId: auth.userId,
    action: "notification.staffSend",
    resource: "Notification",
    details: {
      title,
      recipients: recipients.length,
      mode: mode === "all" ? "all" : "picked",
      ...(fileIds.length > 0 ? { fileIds } : {}),
    },
  });

  redirect(`${back}?sent=${recipients.length}`);
}

/**
 * A homegroup teacher's notification to the teachers of one of their homegroups.
 * The recipients are always all of them, worked out here — whatever the form sends.
 */
export async function sendHomegroupNotification(locale: string, backTo: string, formData: FormData) {
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  const homegroups = await myHomegroups(auth.userId);
  if (!canSendHomegroupNotifications(homegroups.length)) redirect(backTo);

  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const body = (formData.get("body") as string | null)?.trim() ?? "";
  const homegroupId = (formData.get("homegroupId") as string | null) ?? "";
  if (!title) redirect(`${backTo}?error=title`);
  if (!body) redirect(`${backTo}?error=body`);
  const group = homegroups.find((g) => g.id === homegroupId);
  if (!group) redirect(`${backTo}?error=recipients`);

  const fileIds = await ownedFileIds(formData, auth.userId, backTo);
  const recipients = await homegroupRecipientIds(group.id, auth.userId);
  if (recipients.length === 0) redirect(`${backTo}?error=recipients`);

  await deliver(auth.userId, title, body, fileIds, recipients);
  await writeAudit({
    ...(await requestMeta()),
    userId: auth.userId,
    action: "notification.homegroupSend",
    resource: "Notification",
    details: {
      title,
      homegroup: group.name,
      recipients: recipients.length,
      ...(fileIds.length > 0 ? { fileIds } : {}),
    },
  });
  redirect(`${backTo}?sent=${recipients.length}`);
}

/**
 * Every attachment must be one this sender just uploaded — otherwise any file id
 * could be pushed to teachers, including one from a staff-only notice.
 */
async function ownedFileIds(formData: FormData, userId: string, back: string): Promise<string[]> {
  const fileIds = [...new Set(formData.getAll("fileId").map(String).filter(Boolean))];
  if (fileIds.length > 0) {
    const owned = await db.storedFile.count({ where: { id: { in: fileIds }, uploadedById: userId } });
    if (fileIds.length > ATTACHMENT_MAX_COUNT || owned !== fileIds.length) redirect(`${back}?error=attachment`);
  }
  return fileIds;
}

/**
 * One notification per recipient, signed with the sender's timetable coding.
 * createMany cannot write relations, so attachments force one create each; in a
 * transaction so a partial send is impossible (at most ~130 teachers).
 */
async function deliver(senderUserId: string, title: string, body: string, fileIds: string[], recipientIds: string[]) {
  const sender = await db.user.findUnique({
    where: { id: senderUserId },
    select: { name: true, staffProfile: { select: { scheduleName: true } } },
  });
  const signature = sender?.staffProfile?.scheduleName ?? sender?.name ?? "";
  const signedBody = signature ? `${body}\n— ${signature}` : body;
  await db.$transaction(
    recipientIds.map((id) =>
      db.notification.create({
        data: {
          userId: id,
          senderId: senderUserId,
          type: "STAFF_MESSAGE",
          title,
          body: signedBody,
          read: false,
          // The files are stored once; every recipient's row links to the same rows.
          files: { connect: fileIds.map((f) => ({ id: f })) },
        },
        select: { id: true },
      }),
    ),
  );
}
