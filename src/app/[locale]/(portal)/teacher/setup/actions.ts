"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";

export async function submitTeacherClaimAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "TEACHER") redirect("/");

  const staffName = (formData.get("staffName") as string ?? "").trim();
  const locale = (formData.get("locale") as string) ?? "el";

  if (!staffName) redirect(`/${locale}/teacher/setup?error=missing`);

  const slot = await db.timetableSlot.findFirst({ where: { staffName, staffId: null } });
  if (!slot) redirect(`/${locale}/teacher/setup?error=notfound`);

  await db.teacherClaim.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, staffName, status: "PENDING" },
    update: { staffName, status: "PENDING" },
  });

  redirect(`/${locale}/teacher/setup?submitted=1`);
}
