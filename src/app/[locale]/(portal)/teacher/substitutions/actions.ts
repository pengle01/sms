"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { isEducator } from "@/lib/rbac";
import { utcMidnight, fmtDisplayDate } from "@/lib/dates";
import { sendSms } from "@/lib/sms";
import { isKnownRoom } from "@/lib/rooms";
import type { SubstitutionRequestType } from "@/generated/prisma";

export type RequestResult = { ok: true } | { ok: false; error: string };

const REVALIDATE = () => revalidatePath("/[locale]/(portal)/teacher/substitutions", "page");

async function requireEducatorStaff() {
  const auth = await getActiveAuth();
  if (!auth || !isEducator(auth.role)) return null;
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { id: true, phone: true, scheduleName: true, user: { select: { name: true } } },
  });
  if (!staff) return null;
  return { auth, staff };
}

/** Tell the coordinators a finalized plan may be stale after a request change. */
async function notifyCoordinatorsIfFinal(dates: Date[], message: string) {
  const finals = await db.substitutionPlan.findMany({
    where: { date: { in: dates }, status: "FINAL" },
    select: { date: true },
  });
  if (finals.length === 0) return;
  const coordinators = await db.staffProfile.findMany({
    where: { substitutionCoordinator: true, userId: { not: null } },
    select: { userId: true },
  });
  for (const c of coordinators) {
    await db.notification.create({
      data: {
        userId: c.userId!,
        type: "SUBSTITUTION_PLAN_STALE",
        title: "Αλλαγή σε οριστικοποιημένο πλάνο αναπληρώσεων",
        body: `${message} — ${finals.map((f) => fmtDisplayDate(f.date)).join(", ")}`,
        linkUrl: `/teacher/substitutions/plan`,
        read: false,
      },
    });
  }
}

function datesBetween(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime() && out.length < 60; t += 86_400_000) {
    out.push(new Date(t));
  }
  return out;
}

const TYPE_LABEL: Record<SubstitutionRequestType, string> = {
  ABSENCE: "Απουσία",
  EXEMPTION: "Εξαίρεση από αναπλήρωση",
  ROOM_CHANGE: "Αλλαγή αίθουσας",
};

export async function createSubstitutionRequest(input: {
  type: SubstitutionRequestType;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null;
  periods?: number[];
  reason?: string | null;
  reasonDetails?: string | null;
  groupId?: string | null;
  newRoom?: string | null;
}): Promise<RequestResult> {
  const ctx = await requireEducatorStaff();
  if (!ctx) return { ok: false, error: "errForbidden" };

  const today = utcMidnight();
  const start = utcMidnight(input.startDate);
  if (isNaN(start.getTime())) return { ok: false, error: "errDate" };
  if (start < today) return { ok: false, error: "errPast" };

  let end: Date | null = null;
  const periods = (input.periods ?? []).filter((p) => Number.isInteger(p) && p >= 1 && p <= 8);

  if (input.type === "ABSENCE") {
    if (input.endDate) {
      end = utcMidnight(input.endDate);
      if (isNaN(end.getTime()) || end < start) return { ok: false, error: "errRange" };
    }
    if (!input.reason) return { ok: false, error: "errReason" };
  } else if (input.type === "ROOM_CHANGE") {
    if (periods.length !== 1) return { ok: false, error: "errPeriod" };
    if (!input.groupId || !input.newRoom?.trim()) return { ok: false, error: "errRoomChange" };
    if (!isKnownRoom(input.newRoom)) return { ok: false, error: "errUnknownRoom" };
  }

  const request = await db.substitutionRequest.create({
    data: {
      staffId: ctx.staff.id,
      type: input.type,
      startDate: start,
      endDate: end,
      periods,
      reason: input.reason?.trim() || null,
      reasonDetails: input.reasonDetails?.trim() || null,
      groupId: input.type === "ROOM_CHANGE" ? input.groupId : null,
      newRoom: input.type === "ROOM_CHANGE" ? input.newRoom?.trim() : null,
    },
  });

  // Confirmation SMS to the filing teacher (best effort)
  if (ctx.staff.phone) {
    const range = end ? `${fmtDisplayDate(start)}–${fmtDisplayDate(end)}` : fmtDisplayDate(start);
    const sms = await sendSms(
      ctx.staff.phone,
      `Το αίτημά σας (${TYPE_LABEL[input.type]}) για ${range} καταχωρήθηκε.`
    );
    if (sms.success) {
      await db.substitutionRequest.update({ where: { id: request.id }, data: { smsSent: true } });
    }
  }

  await notifyCoordinatorsIfFinal(
    datesBetween(start, end ?? start),
    `Νέο αίτημα (${TYPE_LABEL[input.type]}) από ${ctx.staff.scheduleName ?? ctx.staff.user?.name ?? ""}`
  );

  await writeAudit({
    userId: ctx.auth.userId,
    action: "substitution.request",
    resource: "SubstitutionRequest",
    resourceId: request.id,
    details: { type: input.type, startDate: input.startDate, endDate: input.endDate ?? null },
    ...(await requestMeta()),
  });
  REVALIDATE();
  return { ok: true };
}

export async function cancelSubstitutionRequest(requestId: string): Promise<RequestResult> {
  const ctx = await requireEducatorStaff();
  if (!ctx) return { ok: false, error: "errForbidden" };

  const request = await db.substitutionRequest.findFirst({
    where: { id: requestId, staffId: ctx.staff.id },
  });
  if (!request) return { ok: false, error: "errNotFound" };
  const today = utcMidnight();
  if ((request.endDate ?? request.startDate) < today) {
    return { ok: false, error: "errPastCancel" };
  }

  await db.substitutionRequest.delete({ where: { id: request.id } });

  await notifyCoordinatorsIfFinal(
    datesBetween(request.startDate, request.endDate ?? request.startDate),
    `Ακυρώθηκε αίτημα (${TYPE_LABEL[request.type]}) από ${ctx.staff.scheduleName ?? ctx.staff.user?.name ?? ""}`
  );

  await writeAudit({
    userId: ctx.auth.userId,
    action: "substitution.requestCancel",
    resource: "SubstitutionRequest",
    resourceId: request.id,
    details: { type: request.type },
    ...(await requestMeta()),
  });
  REVALIDATE();
  return { ok: true };
}
