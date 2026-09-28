import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/client";
import { db } from "@/server/db";
import {
  toHistoryCounts,
  historyBlockers,
  studentUserDisposition,
  type StudentHistoryCounts,
  type StudentUserDisposition,
} from "@/lib/studentDelete";

/**
 * Count a student's history in one query — used by the detail pages to decide
 * whether to offer Delete, and again inside the delete transaction so a record
 * written in between cannot slip past the check.
 */
export async function loadStudentHistory(
  studentProfileId: string,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<StudentHistoryCounts | null> {
  const raw = await client.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: {
      _count: {
        select: {
          attendance: true,
          grades: true,
          testGrades: true,
          referrals: true,
          referralStudents: true,
          exitPermits: true,
          activityParticipations: true,
          smsLogs: true,
          conversations: true,
          ddkAwards: true,
          toiletBreaks: true,
        },
      },
      specialEd: { select: { id: true } },
    },
  });
  return raw ? toHistoryCounts(raw) : null;
}

export type EraseOutcome = "missing" | "blocked" | StudentUserDisposition;

/**
 * Delete a student record and its login, in one transaction — or refuse.
 *
 * No authorisation here: callers (the server action) check who may do this and
 * the typed confirmation first. This is the data half only, kept separate so it
 * can be exercised directly.
 *
 * Returns "blocked" and changes nothing if any history exists. Otherwise removes
 * pending activation codes (they reference the profile by plain id, so nothing
 * cascades them), then the profile — which cascades group memberships, guardian
 * links, SMS recipients, the access code and chaperone-request rows — and then
 * handles the login per studentUserDisposition.
 */
export async function eraseStudentRecord(
  studentProfileId: string,
  userId: string,
  role: Role,
): Promise<EraseOutcome> {
  return db.$transaction(async (tx) => {
    const counts = await loadStudentHistory(studentProfileId, tx);
    if (!counts) return "missing";
    if (historyBlockers(counts).length > 0) return "blocked";

    await tx.emailOtp.deleteMany({ where: { studentProfileId } });
    await tx.studentProfile.delete({ where: { id: studentProfileId } });

    const auditRows = await tx.auditLog.count({ where: { userId } });
    const disposition = studentUserDisposition(role, auditRows);
    if (disposition === "delete") {
      await tx.user.delete({ where: { id: userId } });
    } else if (disposition === "deactivate") {
      await tx.user.update({ where: { id: userId }, data: { isActive: false, passwordHash: null } });
    }
    return disposition;
  });
}
