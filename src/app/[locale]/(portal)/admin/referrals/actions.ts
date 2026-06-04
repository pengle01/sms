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
          resolution: { select: { id: true } },
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
      // Delete the decision (expulsion days cascade) and reopen the student.
      await tx.referralStudentResolution.delete({ where: { id: rs.resolution.id } });
      await tx.referralStudent.update({
        where: { id: rs.id },
        data: { status: "PENDING" },
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
