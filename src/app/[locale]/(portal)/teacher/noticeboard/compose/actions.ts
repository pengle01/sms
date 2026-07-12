"use server";

import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { isManagement, EDUCATOR_ROLES } from "@/lib/rbac";
import { writeAudit } from "@/server/audit";

export async function sendStaffNotification(locale: string, formData: FormData) {
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  // Fresh role check — only management (headmaster / headteachers) may compose
  if (!auth.roles.some((r) => isManagement(r))) redirect(`/${locale}/teacher/noticeboard`);

  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const body = (formData.get("body") as string | null)?.trim() ?? "";
  const mode = formData.get("mode") as string | null;
  const picked = formData.getAll("to").map(String);

  const back = `/${locale}/teacher/noticeboard/compose`;
  if (!title) redirect(`${back}?error=title`);
  if (!body) redirect(`${back}?error=body`);
  if (mode !== "all" && picked.length === 0) redirect(`${back}?error=recipients`);

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

  // Sign the message so recipients see who sent it
  const sender = await db.user.findUnique({
    where: { id: auth.userId },
    select: { name: true, staffProfile: { select: { scheduleName: true } } },
  });
  const signature = sender?.staffProfile?.scheduleName ?? sender?.name ?? "";

  await db.notification.createMany({
    data: recipients.map((r) => ({
      userId: r.id,
      senderId: auth.userId,
      type: "STAFF_MESSAGE",
      title,
      body: signature ? `${body}\n— ${signature}` : body,
      read: false,
    })),
  });

  await writeAudit({
    userId: auth.userId,
    action: "notification.staffSend",
    resource: "Notification",
    details: { title, recipients: recipients.length, mode: mode === "all" ? "all" : "picked" },
  });

  redirect(`${back}?sent=${recipients.length}`);
}
