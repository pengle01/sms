"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/server/auth";
import { isEducator } from "@/lib/rbac";
import { db } from "@/server/db";
import type { Role } from "@/generated/prisma";
import { utcMidnight } from "@/lib/dates";

async function requireStaff() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isEducator(session.user.role as Role)) redirect("/");
  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) redirect("/");
  return staff;
}

export async function createActivity(formData: FormData) {
  const staff = await requireStaff();
  const locale = formData.get("locale") as string;
  const name = (formData.get("name") as string).trim();
  const dateStr = formData.get("date") as string;
  const startPeriod = parseInt(formData.get("startPeriod") as string);
  const endPeriod = parseInt(formData.get("endPeriod") as string);
  const location = ((formData.get("location") as string) ?? "").trim() || null;
  const studentIds = formData.getAll("studentId") as string[];

  if (!name || !dateStr || isNaN(startPeriod) || isNaN(endPeriod)) return;

  const activity = await db.activity.create({
    data: {
      name,
      date: utcMidnight(dateStr),
      startPeriod: Math.min(startPeriod, endPeriod),
      endPeriod: Math.max(startPeriod, endPeriod),
      location,
      filerId: staff.id,
    },
  });

  if (studentIds.length > 0) {
    await db.activityParticipant.createMany({
      data: studentIds.map((studentId) => ({ activityId: activity.id, studentId })),
      skipDuplicates: true,
    });
  }

  redirect(`/${locale}/teacher/activities/${activity.id}`);
}

export async function addParticipants(formData: FormData) {
  await requireStaff();
  const activityId = formData.get("activityId") as string;
  const studentIds = formData.getAll("studentId") as string[];
  if (!activityId || studentIds.length === 0) return;

  await db.activityParticipant.createMany({
    data: studentIds.map((studentId) => ({ activityId, studentId })),
    skipDuplicates: true,
  });

  revalidatePath("/", "layout");
}

export async function removeParticipant(formData: FormData) {
  await requireStaff();
  const activityId = formData.get("activityId") as string;
  const studentId = formData.get("studentId") as string;
  if (!activityId || !studentId) return;

  await db.activityParticipant.deleteMany({
    where: { activityId, studentId },
  });

  revalidatePath("/", "layout");
}
