"use server";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";

/** Soft-erase (διαγραφή) toggle: the absence stays on record but stops
 *  counting towards any totals. Office-admin only. */
export async function toggleWaivedAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    redirect("/");
  }

  const id = formData.get("attendanceId") as string | null;
  const back = (formData.get("back") as string | null) ?? "/";
  if (!id) redirect(back);

  const rec = await db.attendance.findUnique({
    where: { id },
    select: { id: true, waived: true, studentId: true, date: true },
  });
  if (!rec) redirect(back);

  const waived = !rec.waived;
  await db.attendance.update({
    where: { id: rec.id },
    data: {
      waived,
      waivedAt: waived ? new Date() : null,
      waivedById: waived ? session.user.id : null,
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: waived ? "attendance.waive" : "attendance.unwaive",
    resource: "Attendance",
    resourceId: rec.id,
    details: { studentId: rec.studentId, date: rec.date.toISOString().slice(0, 10) },
  });

  redirect(back);
}
