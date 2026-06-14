"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { writeAudit } from "@/server/audit";
import { utcMidnight } from "@/lib/dates";
import { canManageAnnouncements, resolvePinnedUntil } from "@/lib/announcements";

const MAX_LEN = 1000;

/** Post a daily announcement, surfaced on every educator's dashboard. */
export async function postAnnouncement(locale: string, formData: FormData) {
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login`);
  if (!canManageAnnouncements(auth.roles)) redirect(`/${locale}/teacher/noticeboard`);

  const title = (formData.get("title") as string | null)?.trim() || null;
  const body = (formData.get("body") as string | null)?.trim() ?? "";
  if (!body) redirect(`/${locale}/teacher/noticeboard?error=body`);

  const pinnedUntil = resolvePinnedUntil(formData.get("pinnedUntil") as string | null, utcMidnight());

  const created = await db.announcement.create({
    data: { title, body: body.slice(0, MAX_LEN), authorId: auth.userId, pinnedUntil },
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
  if (!auth) redirect(`/${locale}/login`);
  if (!canManageAnnouncements(auth.roles)) redirect(`/${locale}/teacher/noticeboard`);

  const id = (formData.get("id") as string | null)?.trim();
  if (id) {
    await db.announcement.deleteMany({ where: { id } });
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
