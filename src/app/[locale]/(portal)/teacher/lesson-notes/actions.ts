"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { isEducator } from "@/lib/rbac";
import { normalizeNoteBody, isNoteDate } from "@/lib/lessonNotes";
import { dutyDowFor } from "@/lib/dutyRoster";
import { utcMidnight } from "@/lib/dates";

export type LessonNoteResult = { ok: true; saved: boolean } | { ok: false; error: "forbidden" | "invalid" | "tooLong" };

/**
 * Save (or, when empty, delete) the caller's private note for one lesson.
 * Always the caller's own note — the author is the session, never the client.
 */
export async function saveLessonNote(input: {
  groupId: string;
  period: number;
  date: string;
  body: string;
}): Promise<LessonNoteResult> {
  const auth = await getActiveAuth();
  if (!auth || !auth.roles.some(isEducator)) return { ok: false, error: "forbidden" };
  if (!isNoteDate(input.date) || !Number.isInteger(input.period) || input.period < 1 || input.period > 12) {
    return { ok: false, error: "invalid" };
  }
  const parsed = normalizeNoteBody(input.body ?? "");
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const date = utcMidnight(input.date);
  if (parsed.body === null) {
    await db.lessonNote.deleteMany({ where: { authorId: auth.userId, groupId: input.groupId, period: input.period, date } });
    revalidatePath("/[locale]/(portal)/teacher/lesson-notes", "page");
    return { ok: true, saved: false };
  }

  const group = await db.group.findUnique({ where: { id: input.groupId }, select: { name: true } });
  if (!group) return { ok: false, error: "invalid" };
  // The lesson's name, from the timetable — none on intercalary/excursion days.
  const dow = dutyDowFor(date);
  const slot = dow
    ? await db.timetableSlot.findFirst({
        where: { groupId: input.groupId, dayOfWeek: dow, period: input.period },
        select: { course: { select: { name: true, nameEl: true } } },
      })
    : null;
  const courseName = slot ? slot.course.nameEl || slot.course.name : null;

  await db.lessonNote.upsert({
    where: { authorId_groupId_period_date: { authorId: auth.userId, groupId: input.groupId, period: input.period, date } },
    create: {
      authorId: auth.userId, groupId: input.groupId, groupName: group.name, courseName,
      period: input.period, date, body: parsed.body,
    },
    update: { body: parsed.body, groupName: group.name, courseName },
  });
  revalidatePath("/[locale]/(portal)/teacher/lesson-notes", "page");
  return { ok: true, saved: true };
}

/** Delete one of the caller's own notes. */
export async function deleteLessonNote(id: string): Promise<LessonNoteResult> {
  const auth = await getActiveAuth();
  if (!auth || !auth.roles.some(isEducator)) return { ok: false, error: "forbidden" };
  await db.lessonNote.deleteMany({ where: { id, authorId: auth.userId } });
  revalidatePath("/[locale]/(portal)/teacher/lesson-notes", "page");
  return { ok: true, saved: false };
}
