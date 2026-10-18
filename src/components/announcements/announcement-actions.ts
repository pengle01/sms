"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { writeAudit } from "@/server/audit";
import { utcMidnight } from "@/lib/dates";
import {
  canManageAnnouncements,
  canEditAnnouncement,
  canDeleteAnnouncement,
  resolveAnnouncementDay,
  announcementFileIds,
} from "@/lib/announcements";
import { removeUpload } from "@/server/uploads";
import { ATTACHMENT_MAX_COUNT } from "@/lib/attachments";

const MAX_LEN = 1000;

/**
 * Delete each of these files that nothing points at any more — no notice,
 * announcement or notification — from the database and the disk.
 */
async function dropOrphanFiles(fileIds: string[]) {
  for (const fileId of fileIds) {
    const file = await db.storedFile.findUnique({
      where: { id: fileId },
      select: {
        path: true,
        _count: { select: { notices: true, announcements: true, notifications: true } },
      },
    });
    if (
      file &&
      file._count.notices === 0 &&
      file._count.announcements === 0 &&
      file._count.notifications === 0
    ) {
      await db.storedFile.delete({ where: { id: fileId } });
      await removeUpload(file.path);
    }
  }
}

/** Only files this user just uploaded may be attached (not any file by id). */
async function ownsAll(userId: string, fileIds: string[]): Promise<boolean> {
  if (fileIds.length === 0) return true;
  const owned = await db.storedFile.count({ where: { id: { in: fileIds }, uploadedById: userId } });
  return owned === fileIds.length;
}

/**
 * Post an «Ανακοίνωση ημέρας», shown on every staff dashboard on its day.
 *
 * `backTo` is the page to return to. It is bound by the caller because both the
 * teacher noticeboard and the office notifications page compose announcements,
 * and sending a secretary back into /teacher/… would bounce off that portal's
 * own gate.
 */
export async function postAnnouncement(locale: string, backTo: string, formData: FormData) {
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  if (!canManageAnnouncements(auth.roles)) redirect(backTo);

  const title = (formData.get("title") as string | null)?.trim() || null;
  const body = (formData.get("body") as string | null)?.trim() ?? "";
  if (!body) redirect(`${backTo}?error=body`);

  const pinnedUntil = resolveAnnouncementDay(formData.get("day") as string | null, utcMidnight());

  // Every attachment must be one this user just uploaded. Without this an author
  // could attach any file by id, including one from a staff-only notice.
  const fileIds = [...new Set(formData.getAll("fileId").map(String).filter(Boolean))];
  if (fileIds.length > ATTACHMENT_MAX_COUNT || !(await ownsAll(auth.userId, fileIds))) {
    redirect(`${backTo}?error=attachment`);
  }

  const created = await db.announcement.create({
    data: {
      title,
      body: body.slice(0, MAX_LEN),
      authorId: auth.userId,
      pinnedUntil,
      files: { connect: fileIds.map((id) => ({ id })) },
    },
  });

  await writeAudit({
    userId: auth.userId,
    action: "announcement.post",
    resource: "Announcement",
    resourceId: created.id,
    details: { pinnedUntil: pinnedUntil.toISOString().slice(0, 10) },
  });

  // Both dashboards render the active announcements.
  revalidatePath(`/${locale}/teacher/dashboard`);
  revalidatePath(`/${locale}/office/dashboard`);
  redirect(backTo);
}

/**
 * Edit an announcement — its author only (canEditAnnouncement), and only while
 * its day hasn't passed. Title, text, day and attachments: kept files are
 * listed as `keepFileId`, new uploads as `fileId`.
 */
export async function updateAnnouncement(locale: string, backTo: string, formData: FormData) {
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);

  const id = (formData.get("id") as string | null)?.trim() ?? "";
  const existing = id
    ? await db.announcement.findUnique({
        where: { id },
        select: { authorId: true, pinnedUntil: true, files: { select: { id: true } } },
      })
    : null;
  const today = utcMidnight();
  if (!existing || !canEditAnnouncement(auth.roles, existing.authorId, auth.userId) || existing.pinnedUntil < today) {
    redirect(backTo);
  }

  const title = (formData.get("title") as string | null)?.trim() || null;
  const body = (formData.get("body") as string | null)?.trim() ?? "";
  if (!body) redirect(`${backTo}?error=body`);
  const pinnedUntil = resolveAnnouncementDay(formData.get("day") as string | null, today);

  const added = [...new Set(formData.getAll("fileId").map(String).filter(Boolean))];
  const files = announcementFileIds({
    existing: existing.files.map((f) => f.id),
    keep: formData.getAll("keepFileId").map(String),
    added,
  });
  if ("error" in files || !(await ownsAll(auth.userId, added))) redirect(`${backTo}?error=attachment`);

  await db.announcement.update({
    where: { id },
    data: {
      title,
      body: body.slice(0, MAX_LEN),
      pinnedUntil,
      files: { set: files.final.map((fid) => ({ id: fid })) },
    },
  });
  await dropOrphanFiles(files.removed);

  await writeAudit({
    userId: auth.userId,
    action: "announcement.update",
    resource: "Announcement",
    resourceId: id,
    details: {
      dayBefore: existing.pinnedUntil.toISOString().slice(0, 10),
      dayAfter: pinnedUntil.toISOString().slice(0, 10),
      filesRemoved: files.removed.length,
      filesAdded: added.length,
    },
  });

  revalidatePath(`/${locale}/teacher/dashboard`);
  revalidatePath(`/${locale}/office/dashboard`);
  redirect(backTo);
}

/** Remove an announcement (its author, or management — see canDeleteAnnouncement). */
export async function deleteAnnouncement(locale: string, backTo: string, formData: FormData) {
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  if (!canManageAnnouncements(auth.roles)) redirect(backTo);

  const id = (formData.get("id") as string | null)?.trim();
  if (id) {
    const existing = await db.announcement.findUnique({
      where: { id },
      select: { authorId: true, files: { select: { id: true } } },
    });
    // The same rule the delete button follows: the author, or management.
    if (!existing || !canDeleteAnnouncement(auth.roles, existing.authorId, auth.userId)) redirect(backTo);
    await db.announcement.deleteMany({ where: { id } });

    // Announcements are short-lived and deleted routinely. Drop the attachments
    // with the post, or every deletion leaves unreachable files on disk. A file
    // still referenced elsewhere (a notice, another message) is left alone.
    await dropOrphanFiles(existing.files.map((f) => f.id));

    await writeAudit({
      userId: auth.userId,
      action: "announcement.delete",
      resource: "Announcement",
      resourceId: id,
    });
  }

  // Both dashboards render the active announcements.
  revalidatePath(`/${locale}/teacher/dashboard`);
  revalidatePath(`/${locale}/office/dashboard`);
  redirect(backTo);
}
