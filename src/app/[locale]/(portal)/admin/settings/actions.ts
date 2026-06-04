"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { DUTY_ELIGIBLE_ROLES } from "@/lib/dutyRoster";
import { GRADES_UNLOCKED_KEY, GRADE_PERIODS, type GradesUnlocked } from "@/lib/grades";

export type SaveRosterResult = { ok: true } | { ok: false; error: string };

/**
 * Unlock/lock grade entry per term (Α΄/Β΄ τετράμηνο). Terms stay frozen for
 * everyone until unlocked here.
 */
export async function saveGradesUnlocked(unlocked: GradesUnlocked): Promise<SaveRosterResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Forbidden" };

  // Only known terms, only booleans.
  const value: GradesUnlocked = { TERM1: false, TERM2: false };
  for (const p of GRADE_PERIODS) value[p] = unlocked[p] === true;

  await db.globalSetting.upsert({
    where: { key: GRADES_UNLOCKED_KEY },
    create: { key: GRADES_UNLOCKED_KEY, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });

  await writeAudit({
    userId: auth.userId,
    action: "settings.gradesUnlock",
    resource: "GlobalSetting",
    resourceId: GRADES_UNLOCKED_KEY,
    details: value,
    ...(await requestMeta()),
  });
  revalidatePath("/[locale]/(portal)/admin/settings", "page");
  return { ok: true };
}

/**
 * Replace the whole fixed weekly on-duty schedule (Εφημερεύοντες Βοηθοί).
 * Entries: which deputy is on duty on which weekday (1 Mon – 5 Fri).
 */
export async function saveDutyRoster(
  entries: Array<{ dayOfWeek: number; staffProfileId: string }>
): Promise<SaveRosterResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Forbidden" };

  if (entries.some((e) => !Number.isInteger(e.dayOfWeek) || e.dayOfWeek < 1 || e.dayOfWeek > 5)) {
    return { ok: false, error: "Invalid weekday" };
  }

  // Only headteachers may hold the duty.
  const staffIds = [...new Set(entries.map((e) => e.staffProfileId))];
  if (staffIds.length > 0) {
    const eligible = await db.staffProfile.count({
      where: {
        id: { in: staffIds },
        user: { is: { role: { in: DUTY_ELIGIBLE_ROLES }, isActive: true } },
      },
    });
    if (eligible !== staffIds.length) {
      return { ok: false, error: "Only active headteachers can be assigned duty" };
    }
  }

  // Dedupe (the [dayOfWeek, staffProfileId] pair is unique in the DB).
  const unique = new Map(entries.map((e) => [`${e.dayOfWeek}:${e.staffProfileId}`, e]));

  await db.$transaction([
    db.dutyRosterEntry.deleteMany({}),
    db.dutyRosterEntry.createMany({ data: [...unique.values()] }),
  ]);

  await writeAudit({
    userId: auth.userId,
    action: "duty.rosterSave",
    resource: "DutyRosterEntry",
    details: { entries: unique.size },
    ...(await requestMeta()),
  });
  revalidatePath("/[locale]/(portal)/admin/settings", "page");
  return { ok: true };
}
