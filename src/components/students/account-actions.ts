"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";

export type AccountActionResult = { ok: true } | { ok: false; error: string };

const MIN_PASSWORD_LENGTH = 8;

function revalidateStudent() {
  revalidatePath("/[locale]/(portal)/admin/students/[id]", "page");
}

/** Set (or reset) a linked account's email+password sign-in credential. */
export async function setAccountPassword(userId: string, password: string): Promise<AccountActionResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Forbidden" };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { ok: false, error: "Account not found" };

  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });
  await writeAudit({
    userId: auth.userId,
    action: "account.setPassword",
    resource: "User",
    resourceId: userId,
    ...(await requestMeta()),
  });
  revalidateStudent();
  return { ok: true };
}

/**
 * Un-claim a student's own account: clear the password and the access code's
 * "claimed" mark so the student can re-activate with their code. All student
 * data (records, grades, attendance) is kept — only the login is reset and the
 * student slot on the code is freed. Mirrors unlinkGuardian (frees a slot).
 */
export async function unclaimStudent(studentProfileId: string): Promise<AccountActionResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Forbidden" };

  const student = await db.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: { userId: true, accessCode: { select: { id: true } } },
  });
  if (!student) return { ok: false, error: "Student not found" };

  await db.$transaction([
    db.user.update({ where: { id: student.userId }, data: { passwordHash: null } }),
    ...(student.accessCode
      ? [db.studentAccessCode.update({ where: { id: student.accessCode.id }, data: { studentClaimedAt: null } })]
      : []),
  ]);
  await writeAudit({
    userId: auth.userId,
    action: "account.unclaimStudent",
    resource: "StudentProfile",
    resourceId: studentProfileId,
    ...(await requestMeta()),
  });
  revalidateStudent();
  return { ok: true };
}

/**
 * Unlink a guardian from a student: remove the ParentStudent link and free a
 * guardian slot (decrement guardianClaims, never below 0). The guardian's own
 * account is left intact (it may be linked to other children).
 */
export async function unlinkGuardian(
  studentProfileId: string,
  parentProfileId: string,
): Promise<AccountActionResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Forbidden" };

  const link = await db.parentStudent.findUnique({
    where: { parentProfileId_studentProfileId: { parentProfileId, studentProfileId } },
    select: { id: true },
  });
  if (!link) return { ok: false, error: "Link not found" };

  const access = await db.studentAccessCode.findUnique({
    where: { studentProfileId },
    select: { id: true, guardianClaims: true },
  });

  await db.$transaction([
    db.parentStudent.delete({ where: { id: link.id } }),
    ...(access && access.guardianClaims > 0
      ? [db.studentAccessCode.update({ where: { id: access.id }, data: { guardianClaims: access.guardianClaims - 1 } })]
      : []),
  ]);

  await writeAudit({
    userId: auth.userId,
    action: "account.unlinkGuardian",
    resource: "StudentProfile",
    resourceId: studentProfileId,
    details: { parentProfileId },
    ...(await requestMeta()),
  });
  revalidateStudent();
  return { ok: true };
}
