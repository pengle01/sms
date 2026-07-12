"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/server/auth";
import { isEducator } from "@/lib/rbac";
import { db } from "@/server/db";
import type { Role } from "@/generated/prisma/client";
import { utcMidnight, normalizeIsoDate } from "@/lib/dates";
import { weeklyOccurrences } from "@/lib/activities";
import { getSchoolYear } from "@/lib/schoolConfig";
import { findDdkCategory, clampPoints, schoolYearLabel } from "@/lib/ddk";
import { writeAudit } from "@/server/audit";

async function requireStaff() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isEducator(session.user.role as Role)) redirect("/");
  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) redirect("/");
  return staff;
}

// Only the staff member who created an activity may edit it, change its
// participants, repeat/delete it, or convert it to ΔΔΚ.
async function requireActivityOwner(activityId: string) {
  const staff = await requireStaff();
  const activity = await db.activity.findUnique({
    where: { id: activityId },
    select: { id: true, filerId: true },
  });
  if (!activity || activity.filerId !== staff.id) redirect("/");
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
  // Optional weekly repeat — same weekday each week until this date.
  const repeatUntil = normalizeIsoDate(formData.get("repeatUntil") as string);

  if (!name || !dateStr || isNaN(startPeriod) || isNaN(endPeriod)) return;

  const start = Math.min(startPeriod, endPeriod);
  const end = Math.max(startPeriod, endPeriod);
  const dates = weeklyOccurrences(dateStr, repeatUntil);

  let firstId = "";
  for (const d of dates) {
    const activity = await db.activity.create({
      data: { name, date: utcMidnight(d), startPeriod: start, endPeriod: end, location, filerId: staff.id },
    });
    if (!firstId) firstId = activity.id;
    if (studentIds.length > 0) {
      await db.activityParticipant.createMany({
        data: studentIds.map((studentId) => ({ activityId: activity.id, studentId })),
        skipDuplicates: true,
      });
    }
  }

  redirect(dates.length > 1 ? `/${locale}/teacher/activities` : `/${locale}/teacher/activities/${firstId}`);
}

// Edit an activity's core details (name, date, periods, location).
export async function updateActivity(formData: FormData) {
  const locale = formData.get("locale") as string;
  const activityId = formData.get("activityId") as string;
  const name = (formData.get("name") as string).trim();
  const dateStr = formData.get("date") as string;
  const startPeriod = parseInt(formData.get("startPeriod") as string);
  const endPeriod = parseInt(formData.get("endPeriod") as string);
  const location = ((formData.get("location") as string) ?? "").trim() || null;
  if (!activityId || !name || !dateStr || isNaN(startPeriod) || isNaN(endPeriod)) return;
  await requireActivityOwner(activityId);

  await db.activity.update({
    where: { id: activityId },
    data: {
      name,
      date: utcMidnight(dateStr),
      startPeriod: Math.min(startPeriod, endPeriod),
      endPeriod: Math.max(startPeriod, endPeriod),
      location,
    },
  });

  redirect(`/${locale}/teacher/activities/${activityId}`);
}

// Turn an existing activity into a weekly series: create same-weekday copies
// (same details + participants) after its date, up to `repeatUntil`.
export async function repeatActivity(formData: FormData) {
  const locale = formData.get("locale") as string;
  const activityId = formData.get("activityId") as string;
  const repeatUntil = normalizeIsoDate(formData.get("repeatUntil") as string);
  if (!activityId || !repeatUntil) return;
  await requireActivityOwner(activityId);

  const activity = await db.activity.findUnique({
    where: { id: activityId },
    include: { participants: { select: { studentId: true } } },
  });
  if (!activity) return;

  const startIso = activity.date.toISOString().slice(0, 10);
  // Skip the first entry — that's this activity, which already exists.
  const occurrences = weeklyOccurrences(startIso, repeatUntil).slice(1);
  if (occurrences.length === 0) redirect(`/${locale}/teacher/activities/${activityId}`);

  for (const d of occurrences) {
    const copy = await db.activity.create({
      data: {
        name: activity.name,
        date: utcMidnight(d),
        startPeriod: activity.startPeriod,
        endPeriod: activity.endPeriod,
        location: activity.location,
        filerId: activity.filerId,
      },
    });
    if (activity.participants.length > 0) {
      await db.activityParticipant.createMany({
        data: activity.participants.map((p) => ({ activityId: copy.id, studentId: p.studentId })),
        skipDuplicates: true,
      });
    }
  }

  redirect(`/${locale}/teacher/activities`);
}

// Delete an activity and everything tied to it (participants + ΔΔΚ awards;
// chaperone links cascade in the schema).
export async function deleteActivity(formData: FormData) {
  const locale = formData.get("locale") as string;
  const activityId = formData.get("activityId") as string;
  if (!activityId) return;
  await requireActivityOwner(activityId);

  await db.$transaction([
    db.ddkAward.deleteMany({ where: { activityId } }),
    db.activityParticipant.deleteMany({ where: { activityId } }),
    db.activity.delete({ where: { id: activityId } }),
  ]);

  redirect(`/${locale}/teacher/activities`);
}

export async function addParticipants(formData: FormData) {
  const activityId = formData.get("activityId") as string;
  const studentIds = formData.getAll("studentId") as string[];
  if (!activityId || studentIds.length === 0) return;
  await requireActivityOwner(activityId);

  await db.activityParticipant.createMany({
    data: studentIds.map((studentId) => ({ activityId, studentId })),
    skipDuplicates: true,
  });

  revalidatePath("/", "layout");
}

export async function removeParticipant(formData: FormData) {
  const activityId = formData.get("activityId") as string;
  const studentId = formData.get("studentId") as string;
  if (!activityId || !studentId) return;
  await requireActivityOwner(activityId);

  await db.activityParticipant.deleteMany({
    where: { activityId, studentId },
  });

  revalidatePath("/", "layout");
}

// ─── ΔΔΚ conversion ───────────────────────────────────────────────────────────

// Award ΔΔΚ points to selected participants of a filed activity. One category
// is chosen for the batch; points default to the guide's value but can be
// overridden per student (e.g. theatre roles), so points come in as points_<id>.
export async function convertActivityToDdk(formData: FormData) {
  const activityId = formData.get("activityId") as string;
  const categoryCode = formData.get("categoryCode") as string;
  const note = ((formData.get("note") as string) ?? "").trim() || null;
  const studentIds = formData.getAll("studentId") as string[];

  const category = findDdkCategory(categoryCode);
  // No hand-awarding of auto-only categories (e.g. Πλήρης Φοίτηση).
  if (!activityId || !category || category.autoOnly || studentIds.length === 0) return;
  // Only the activity's creator may convert it to ΔΔΚ.
  const staff = await requireActivityOwner(activityId);

  // Only award to genuine participants of this activity.
  const participants = await db.activityParticipant.findMany({
    where: { activityId, studentId: { in: studentIds } },
    select: { studentId: true },
  });
  const validIds = new Set(participants.map((p) => p.studentId));

  const ranges = await getSchoolYear();
  const schoolYear = schoolYearLabel(ranges.yearStart.getUTCFullYear());

  const rows = studentIds
    .filter((id) => validIds.has(id))
    .map((studentId) => {
      // Only the points the guide allows: clampPoints pins fixed/per categories
      // to their value and keeps ranges within bounds (NaN → the guide default).
      const raw = parseInt(formData.get(`points_${studentId}`) as string);
      const points = clampPoints(category.spec, raw);
      return { studentId, categoryCode, points, note, activityId, awardedById: staff.id, schoolYear };
    });

  if (rows.length === 0) return;
  await db.ddkAward.createMany({ data: rows });
  await writeAudit({
    userId: staff.userId ?? "",
    action: "ddk.convert",
    resource: "Activity",
    resourceId: activityId,
    details: { categoryCode, count: rows.length },
  });

  revalidatePath("/", "layout");
}

export async function removeDdkAward(formData: FormData) {
  const staff = await requireStaff();
  const id = formData.get("awardId") as string;
  if (!id) return;
  const award = await db.ddkAward.findUnique({
    where: { id },
    select: { id: true, awardedById: true, activity: { select: { filerId: true } } },
  });
  if (!award) return;
  // Only the activity's creator (= the awarder) may remove the award.
  const owns = award.activity ? award.activity.filerId === staff.id : award.awardedById === staff.id;
  if (!owns) redirect("/");
  await db.ddkAward.delete({ where: { id } });
  await writeAudit({
    userId: staff.userId ?? "",
    action: "ddk.remove",
    resource: "DdkAward",
    resourceId: id,
  });
  revalidatePath("/", "layout");
}
