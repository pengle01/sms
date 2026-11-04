"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";

// Decide a headteacher's resolution-unlock request. The admin only approves
// the UNLOCKING: approval deletes the resolution and moves the student back
// to PENDING (the referral returns to the examine tab to be redone). Deny
// keeps the original. Either way the requester is notified.
export async function decideResolutionUnlock(requestId: string, approve: boolean) {
  const auth = await getSuperAdminAuth();
  if (!auth) throw new Error("Forbidden");

  const request = await db.resolutionUnlockRequest.findFirst({
    where: { id: requestId, status: "PENDING" },
    include: {
      referralStudent: {
        include: {
          resolution: { select: { id: true, decidedLevel: true } },
          referral: { select: { number: true } },
          student: { include: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!request) return; // already decided or gone — refresh shows current state

  const rs = request.referralStudent;
  const studentName = rs.student.user?.name ?? "";

  await db.$transaction(async (tx) => {
    if (approve && rs.resolution) {
      // Delete the decision (expulsion days cascade) and reopen the student —
      // back at the level that chose the measure (the headmaster's or the
      // council's decision returns to them, not to the homegroup headteacher).
      await tx.referralStudentResolution.delete({ where: { id: rs.resolution.id } });
      await tx.referralStudent.update({
        where: { id: rs.id },
        data: { status: "PENDING", level: rs.resolution.decidedLevel },
      });
    }

    await tx.resolutionUnlockRequest.update({
      where: { id: request.id },
      data: {
        status: approve ? "APPROVED" : "REJECTED",
        decidedById: auth.userId,
        decidedAt: new Date(),
      },
    });

    await tx.notification.create({
      data: {
        userId: request.requestedById,
        type: approve ? "RESOLUTION_UNLOCK_APPROVED" : "RESOLUTION_UNLOCK_REJECTED",
        title: approve ? "Η απόφαση ξεκλειδώθηκε" : "Αίτημα ξεκλειδώματος απορρίφθηκε",
        body: approve
          ? `Καταγγελία #${rs.referral.number} · ${studentName} — επέστρεψε στις εκκρεμείς για νέα επίλυση`
          : `Καταγγελία #${rs.referral.number} · ${studentName}`,
        linkUrl: `/teacher/referrals`,
        read: false,
      },
    });
  });

  await writeAudit({
    userId: auth.userId,
    action: approve ? "referral.unlockApprove" : "referral.unlockReject",
    resource: "ResolutionUnlockRequest",
    resourceId: request.id,
    details: { referralStudentId: rs.id, snapshot: request.snapshot ?? undefined },
    ...(await requestMeta()),
  });
  revalidatePath("/[locale]/(portal)/admin/referrals", "page");
}

// Decide a teacher's request to edit a filed referral. Approval returns the
// referral to the teacher's drafts («Προσωρινή Αποθήκευση») — its decisions,
// levels and referrals-up stay — to edit and file again. Either way the
// teacher is notified.
export async function decideReferralEdit(requestId: string, approve: boolean) {
  const auth = await getSuperAdminAuth();
  if (!auth) throw new Error("Forbidden");

  const request = await db.referralEditRequest.findFirst({
    where: { id: requestId, status: "PENDING" },
    include: { referral: { select: { id: true, number: true } } },
  });
  if (!request) return; // already decided or gone — refresh shows current state

  await db.$transaction(async (tx) => {
    await tx.referralEditRequest.update({
      where: { id: request.id },
      data: { status: approve ? "APPROVED" : "REJECTED", decidedById: auth.userId, decidedAt: new Date() },
    });
    if (approve) {
      await tx.referral.update({ where: { id: request.referralId }, data: { isDraft: true } });
    }
    await tx.notification.create({
      data: {
        userId: request.requestedById,
        type: approve ? "REFERRAL_EDIT_APPROVED" : "REFERRAL_EDIT_REJECTED",
        title: approve
          ? `Η καταγγελία #${request.referral.number} επέστρεψε στα πρόχειρα για τροποποίηση`
          : `Αίτημα τροποποίησης της καταγγελίας #${request.referral.number} απορρίφθηκε`,
        body: approve ? "Τροποποιήστε την και υποβάλετέ την ξανά." : null,
        linkUrl: approve ? `/teacher/referrals/${request.referralId}/edit` : `/teacher/referrals`,
        read: false,
      },
    });
  });

  await writeAudit({
    userId: auth.userId,
    action: approve ? "referral.editApprove" : "referral.editReject",
    resource: "ReferralEditRequest",
    resourceId: request.id,
    details: { referralId: request.referralId, number: request.referral.number },
    ...(await requestMeta()),
  });
  revalidatePath("/[locale]/(portal)/admin/referrals", "page");
}

// Decide the headmaster's request to send a student referred to them by
// mistake back to the homegroup headteacher. Approval moves the student back
// to the homegroup level (the referral-up stays on the trail, marked
// returned); the headmaster and the homegroup headteacher are told.
export async function decideReferralReturn(requestId: string, approve: boolean) {
  const auth = await getSuperAdminAuth();
  if (!auth) throw new Error("Forbidden");

  const request = await db.referralReturnRequest.findFirst({
    where: { id: requestId, status: "PENDING" },
    include: {
      referralStudent: {
        select: {
          id: true,
          level: true,
          resolution: { select: { id: true } },
          referral: { select: { id: true, number: true } },
          student: { select: { user: { select: { name: true } } } },
          group: { select: { homeroomHeadteacher: { select: { user: { select: { id: true } } } } } },
        },
      },
    },
  });
  if (!request) return; // already decided or gone — refresh shows current state
  const rs = request.referralStudent;
  // Decided meanwhile, or no longer with the headmaster: nothing to return.
  const stillThere = rs.level === "HEADMASTER" && !rs.resolution;
  const doReturn = approve && stillThere;
  const studentName = rs.student.user?.name ?? "";

  await db.$transaction(async (tx) => {
    await tx.referralReturnRequest.update({
      where: { id: request.id },
      data: { status: doReturn ? "APPROVED" : "REJECTED", decidedById: auth.userId, decidedAt: new Date() },
    });
    if (doReturn) {
      await tx.referralStudent.update({ where: { id: rs.id }, data: { level: "HOMEGROUP" } });
      const last = await tx.referralEscalation.findFirst({
        where: { referralStudentId: rs.id, toLevel: "HEADMASTER", returnedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (last) await tx.referralEscalation.update({ where: { id: last.id }, data: { returnedAt: new Date() } });
      const headUserId = rs.group?.homeroomHeadteacher?.user?.id;
      if (headUserId) {
        await tx.notification.create({
          data: {
            userId: headUserId,
            type: "REFERRAL_RETURNED",
            title: `Η καταγγελία #${rs.referral.number} επέστρεψε σε εσάς`,
            body: `${studentName}: η παραπομπή στον/στη Διευθυντή/ντρια ακυρώθηκε.`,
            linkUrl: `/teacher/referrals`,
            read: false,
          },
        });
      }
    }
    await tx.notification.create({
      data: {
        userId: request.requestedById,
        type: doReturn ? "REFERRAL_RETURN_APPROVED" : "REFERRAL_RETURN_REJECTED",
        title: doReturn
          ? `Η παραπομπή της καταγγελίας #${rs.referral.number} ακυρώθηκε`
          : `Το αίτημα ακύρωσης παραπομπής (#${rs.referral.number}) απορρίφθηκε`,
        body: doReturn ? `${studentName} — επέστρεψε στον/στη Β.Δ. του τμήματος.` : studentName,
        linkUrl: `/teacher/referrals`,
        read: false,
      },
    });
  });

  await writeAudit({
    userId: auth.userId,
    action: doReturn ? "referral.returnApprove" : "referral.returnReject",
    resource: "ReferralReturnRequest",
    resourceId: request.id,
    details: { referralId: rs.referral.id, referralStudentId: rs.id, ...(approve && !stillThere ? { note: "no longer with the headmaster" } : {}) },
    ...(await requestMeta()),
  });
  revalidatePath("/[locale]/(portal)/admin/referrals", "page");
}
