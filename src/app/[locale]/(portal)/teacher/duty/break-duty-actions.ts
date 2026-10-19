"use server";

import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { writeAudit } from "@/server/audit";
import { utcMidnight, localDateStr, getNow } from "@/lib/dates";
import { dutyDowFor, isOnDuty } from "@/lib/dutyRoster";
import { dutyNameKey, dayBreaks } from "@/lib/breakDuty";
import { dutyPostsForDay } from "@/server/breakDuty";
import { getBellSchedule } from "@/lib/schoolConfig";

type Result = { ok: true } | { ok: false; error: "notOnDuty" | "notToday" | "unknown" };

const MAX_COMMENT = 1000;

/** The caller, if they are on today's duty roster, and today's date — or why not. */
async function onDutyToday(dateIso: string) {
  const auth = await getActiveAuth();
  if (!auth) return { error: "notOnDuty" as const };
  const todayIso = localDateStr(getNow());
  if (dateIso !== todayIso) return { error: "notToday" as const };
  const today = utcMidnight(todayIso);
  const dow = dutyDowFor(today);
  const [staff, roster] = await Promise.all([
    db.staffProfile.findUnique({ where: { userId: auth.userId }, select: { id: true } }),
    dow ? db.dutyRosterEntry.findMany({ where: { dayOfWeek: dow }, select: { dayOfWeek: true, staffProfileId: true } }) : [],
  ]);
  if (!staff || !dow || !isOnDuty(roster, dow, staff.id)) return { error: "notOnDuty" as const };
  return { auth, staffId: staff.id, today, dow };
}

/**
 * Record a teacher at a post for one break: present/absent, and/or a comment.
 * Only an on-duty deputy, only today, only for a post and teacher in today's
 * programme. `present: null` keeps the attendance and sets just the comment.
 */
export async function recordDutyCheck(input: {
  dateIso: string;
  breakNo: number;
  postCode: string;
  teacherName: string;
  present?: boolean | null;
  comment?: string | null;
}): Promise<Result> {
  const ctx = await onDutyToday(input.dateIso);
  if ("error" in ctx) return { ok: false, error: ctx.error! };

  const [posts, bell] = await Promise.all([dutyPostsForDay(ctx.dow), getBellSchedule()]);
  const post = posts.find((p) => p.code === input.postCode);
  const teacher = post?.teachers.find((t) => dutyNameKey(t) === dutyNameKey(input.teacherName));
  const validBreak = dayBreaks(bell, ctx.dow).some((b) => b.no === input.breakNo);
  if (!post || !teacher || !validBreak) return { ok: false, error: "unknown" };

  const comment = input.comment === undefined ? undefined : (input.comment ?? "").trim().slice(0, MAX_COMMENT) || null;
  const key = { date: ctx.today, breakNo: input.breakNo, postCode: post.code, teacherName: teacher };
  await db.dutyCheck.upsert({
    where: { date_breakNo_postCode_teacherName: key },
    create: {
      ...key,
      postName: post.name,
      staffProfileId: post.staffIds[teacher] ?? null,
      present: input.present ?? null,
      comment: comment ?? null,
      checkedById: ctx.staffId,
    },
    update: {
      ...(input.present !== undefined && input.present !== null ? { present: input.present } : {}),
      ...(comment !== undefined ? { comment } : {}),
      checkedById: ctx.staffId,
      checkedAt: new Date(),
    },
  });

  await writeAudit({
    userId: ctx.auth.userId,
    action: "breakDuty.check",
    resource: "DutyCheck",
    details: { date: input.dateIso, breakNo: input.breakNo, post: post.code, teacher, present: input.present ?? null, comment: comment !== undefined },
  });
  return { ok: true };
}

/** The day's general incidents («Συμβάντα ημέρας»). */
export async function saveDayReport(input: { dateIso: string; comments: string }): Promise<Result> {
  const ctx = await onDutyToday(input.dateIso);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  const comments = input.comments.trim().slice(0, 5000) || null;
  await db.dutyDayReport.upsert({
    where: { date: ctx.today },
    create: { date: ctx.today, comments, updatedById: ctx.staffId },
    update: { comments, updatedById: ctx.staffId },
  });
  await writeAudit({
    userId: ctx.auth.userId,
    action: "breakDuty.dayReport",
    resource: "DutyDayReport",
    details: { date: input.dateIso },
  });
  return { ok: true };
}
