"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { writeAudit } from "@/server/audit";
import { utcMidnight } from "@/lib/dates";
import { canManageAnnouncements, resolvePinnedUntil } from "@/lib/announcements";
import { removeUpload } from "@/server/uploads";
import { ATTACHMENT_MAX_COUNT } from "@/lib/attachments";

const MAX_LEN = 1000;

/** Post a daily announcement, surfaced on every educator's dashboard. */
export async function postAnnouncement(locale: string, formData: FormData) {
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  if (!canManageAnnouncements(auth.roles)) redirect(`/${locale}/teacher/noticeboard`);

  const title = (formData.get("title") as string | null)?.trim() || null;
  const body = (formData.get("body") as string | null)?.trim() ?? "";
  if (!body) redirect(`/${locale}/teacher/noticeboard?error=body`);

  const pinnedUntil = resolvePinnedUntil(formData.get("pinnedUntil") as string | null, utcMidnight());

  // Every attachment must be one this user just uploaded. Without this an author
  // could attach any file by id, including one from a staff-only notice.
  const fileIds = [...new Set(formData.getAll("fileId").map(String).filter(Boolean))];
  if (fileIds.length > 0) {
    const owned = await db.storedFile.count({
      where: { id: { in: fileIds }, uploadedById: auth.userId },
    });
    if (fileIds.length > ATTACHMENT_MAX_COUNT || owned !== fileIds.length) {
      redirect(`/${locale}/teacher/noticeboard?error=attachment`);
    }
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

  revalidatePath(`/${locale}/teacher/dashboard`);
  redirect(`/${locale}/teacher/noticeboard`);
}

/** Remove an announcement (management only — peers may clear any). */
export async function deleteAnnouncement(locale: string, formData: FormData) {
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  if (!canManageAnnouncements(auth.roles)) redirect(`/${locale}/teacher/noticeboard`);

  const id = (formData.get("id") as string | null)?.trim();
  if (id) {
    const existing = await db.announcement.findUnique({
      where: { id },
      select: { files: { select: { id: true } } },
    });
    await db.announcement.deleteMany({ where: { id } });

    // Announcements are short-lived and deleted routinely. Drop the attachments
    // with the post, or every deletion leaves unreachable files on disk. A file
    // still referenced elsewhere (a notice, another message) is left alone.
    for (const { id: fileId } of existing?.files ?? []) {
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

    await writeAudit({
      userId: auth.userId,
      action: "announcement.delete",
      resource: "Announcement",
      resourceId: id,
    });
  }

  revalidatePath(`/${locale}/teacher/dashboard`);
  redirect(`/${locale}/teacher/noticeboard`);
}
