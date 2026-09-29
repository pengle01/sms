"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { logger, errInfo } from "@/server/logger";
import { eraseStudentRecord } from "@/server/studentDelete";
import { canDeleteStudent } from "@/lib/rbac";
import { confirmsDeletion } from "@/lib/studentDelete";
import { reactivateWithParents } from "@/server/studentImportSync";

// Error values are keys in the "studentDelete" message namespace, so the card
// can show them in either language.
export type StudentActionError =
  | "errNotAllowed"
  | "errNotFound"
  | "errConfirm"
  | "errHasRecords"
  | "errGeneric";
export type StudentActionResult = { ok: true } | { ok: false; error: StudentActionError };

/** A Prisma FK-constraint violation — the row still has restricted dependents. */
function isForeignKeyError(e: unknown): boolean {
  const code = typeof e === "object" && e !== null && "code" in e ? (e as { code?: string }).code : undefined;
  return code === "P2003" || code === "P2014";
}

function revalidateStudentPages() {
  revalidatePath("/[locale]/(portal)/admin/students", "page");
  revalidatePath("/[locale]/(portal)/admin/students/[id]", "page");
  revalidatePath("/[locale]/(portal)/office/students", "page");
  revalidatePath("/[locale]/(portal)/office/students/[id]", "page");
}

/**
 * Permanently delete a student who has no history.
 *
 * Refuses when any attendance, grade, referral, SMS or other history exists —
 * those students are deactivated instead, so records are never lost by
 * accident. The history is re-counted inside the transaction, so something
 * written between page load and confirmation cannot slip past the check.
 *
 * Removed with the record: group memberships, guardian links (the guardian's own
 * account stays — it may belong to other children), SMS recipients, the access
 * code and pending activation codes. The login account is deleted too, unless
 * it has its own audit trail, which must be kept: then it is locked instead.
 */
export async function deleteStudent(
  studentProfileId: string,
  typedConfirmation: string,
): Promise<StudentActionResult> {
  const auth = await getActiveAuth();
  if (!auth || !canDeleteStudent(auth.roles)) return { ok: false, error: "errNotAllowed" };

  const student = await db.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: {
      studentId: true,
      userId: true,
      user: { select: { name: true, role: true } },
      group: { select: { name: true } },
    },
  });
  if (!student) return { ok: false, error: "errNotFound" };
  if (!confirmsDeletion(typedConfirmation, student.studentId)) return { ok: false, error: "errConfirm" };

  let account: "delete" | "deactivate" | "keep";
  try {
    const outcome = await eraseStudentRecord(studentProfileId, student.userId, student.user.role);
    if (outcome === "missing") return { ok: false, error: "errNotFound" };
    if (outcome === "blocked") return { ok: false, error: "errHasRecords" };
    account = outcome;
  } catch (e) {
    if (isForeignKeyError(e)) return { ok: false, error: "errHasRecords" };
    logger.error({ event: "student.delete.failed", err: errInfo(e) }, "Student delete failed");
    return { ok: false, error: "errGeneric" };
  }

  // The record is gone, so the audit entry keeps enough to say who it was.
  await writeAudit({
    userId: auth.userId,
    action: "student.delete",
    resource: "StudentProfile",
    resourceId: studentProfileId,
    details: {
      studentId: student.studentId,
      name: student.user.name,
      group: student.group?.name ?? null,
      account,
    },
    ...(await requestMeta()),
  });
  revalidateStudentPages();
  return { ok: true };
}

/**
 * Deactivate or reactivate a student. Deactivated students disappear from lists
 * and registers and cannot sign in; every record stays. Fully reversible — the
 * option offered when a student has history and so cannot be deleted.
 */
export async function setStudentActive(
  studentProfileId: string,
  active: boolean,
): Promise<StudentActionResult> {
  const auth = await getActiveAuth();
  if (!auth || !canDeleteStudent(auth.roles)) return { ok: false, error: "errNotAllowed" };

  const student = await db.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: { studentId: true, userId: true },
  });
  if (!student) return { ok: false, error: "errNotFound" };

  if (active) {
    // Also brings back parents a student-file import deactivated with them.
    await reactivateWithParents([studentProfileId], [student.userId]);
  } else {
    // A manual deactivation is the office's decision — a later import must not undo it.
    await db.user.update({ where: { id: student.userId }, data: { isActive: false, deactivatedByImport: null } });
  }
  await writeAudit({
    userId: auth.userId,
    action: active ? "student.reactivate" : "student.deactivate",
    resource: "StudentProfile",
    resourceId: studentProfileId,
    details: { studentId: student.studentId },
    ...(await requestMeta()),
  });
  revalidateStudentPages();
  return { ok: true };
}
