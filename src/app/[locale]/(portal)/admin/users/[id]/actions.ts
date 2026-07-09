"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { validateAdminGrant, validateAdminRevoke, validateUserDelete } from "@/lib/roleAssignment";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** A Prisma FK-constraint violation (the row has restricted dependent records). */
function isForeignKeyError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    ((e as { code?: string }).code === "P2003" || (e as { code?: string }).code === "P2014")
  );
}

const MIN_PASSWORD_LENGTH = 8;

function revalidateUsers() {
  revalidatePath("/[locale]/(portal)/admin/users", "page");
  revalidatePath("/[locale]/(portal)/admin/users/[id]", "page");
}

/**
 * Set (or reset) a user's password so they can sign in with email + password.
 * Useful for staff whose accounts were created without one (import / claim) —
 * e.g. to test the dev password sign-in.
 */
export async function setUserPassword(targetUserId: string, password: string): Promise<ActionResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Δεν επιτρέπεται" };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Ο κωδικός πρόσβασης πρέπει να έχει τουλάχιστον ${MIN_PASSWORD_LENGTH} χαρακτήρες.` };
  }

  const target = await db.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!target) return { ok: false, error: "Ο χρήστης δεν βρέθηκε" };

  await db.user.update({
    where: { id: targetUserId },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });
  // Never log the password; only that one was set, for whom, by whom.
  await writeAudit({
    userId: auth.userId,
    action: "user.setPassword",
    resource: "User",
    resourceId: targetUserId,
    ...(await requestMeta()),
  });
  revalidateUsers();
  return { ok: true };
}

/** Count of ACTIVE users who are super admins by primary or extra role. */
async function countEffectiveSuperAdmins(): Promise<number> {
  return db.user.count({
    where: {
      isActive: true,
      OR: [{ role: "SUPER_ADMIN" }, { extraRoles: { has: "SUPER_ADMIN" } }],
    },
  });
}

/** Grant SUPER_ADMIN as an EXTRA role — the user's primary role stays as is. */
export async function grantSuperAdmin(targetUserId: string): Promise<ActionResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Δεν επιτρέπεται" };

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { role: true, extraRoles: true, isActive: true },
  });
  if (!target) return { ok: false, error: "Ο χρήστης δεν βρέθηκε" };

  const check = validateAdminGrant({
    actorId: auth.userId,
    targetId: targetUserId,
    targetPrimary: target.role,
    targetExtra: target.extraRoles,
    targetActive: target.isActive,
  });
  if (!check.ok) return { ok: false, error: GRANT_ERRORS[check.error] };

  await db.user.update({
    where: { id: targetUserId },
    data: { extraRoles: { push: "SUPER_ADMIN" } },
  });
  await writeAudit({
    userId: auth.userId,
    action: "user.grantSuperAdmin",
    resource: "User",
    resourceId: targetUserId,
    details: { primaryRole: target.role },
    ...(await requestMeta()),
  });
  revalidateUsers();
  return { ok: true };
}

/** Revoke an extra SUPER_ADMIN role. Primary roles are never changed here. */
export async function revokeSuperAdmin(targetUserId: string): Promise<ActionResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Δεν επιτρέπεται" };

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { role: true, extraRoles: true },
  });
  if (!target) return { ok: false, error: "Ο χρήστης δεν βρέθηκε" };

  const check = validateAdminRevoke({
    actorId: auth.userId,
    targetId: targetUserId,
    targetPrimary: target.role,
    targetExtra: target.extraRoles,
    effectiveSuperAdmins: await countEffectiveSuperAdmins(),
  });
  if (!check.ok) return { ok: false, error: REVOKE_ERRORS[check.error] };

  await db.user.update({
    where: { id: targetUserId },
    data: { extraRoles: { set: target.extraRoles.filter((r) => r !== "SUPER_ADMIN") } },
  });
  await writeAudit({
    userId: auth.userId,
    action: "user.revokeSuperAdmin",
    resource: "User",
    resourceId: targetUserId,
    details: { primaryRole: target.role },
    ...(await requestMeta()),
  });
  revalidateUsers();
  return { ok: true };
}

/** Toggle the "deputy B responsible for special education" designation. */
export async function setSpecialEducation(
  targetUserId: string,
  value: boolean
): Promise<ActionResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Δεν επιτρέπεται" };

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { staffProfile: { select: { id: true } } },
  });
  if (!target?.staffProfile) return { ok: false, error: "Δεν υπάρχει συνδεδεμένο προφίλ προσωπικού" };

  await db.staffProfile.update({
    where: { id: target.staffProfile.id },
    data: { specialEducation: value },
  });
  await writeAudit({
    userId: auth.userId,
    action: "staff.specialEducation",
    resource: "StaffProfile",
    resourceId: target.staffProfile.id,
    details: { value },
    ...(await requestMeta()),
  });
  revalidateUsers();
  return { ok: true };
}

const DELETE_ERRORS: Record<string, string> = {
  errSelf: "Δεν μπορείτε να διαγράψετε τον δικό σας λογαριασμό.",
  errLastSuperAdmin: "Αυτός είναι ο τελευταίος ενεργός διαχειριστής συστήματος — δεν μπορεί να διαγραφεί.",
};

/**
 * Permanently delete a user's login. Cascades sign-in rows (Account / Session),
 * notifications and the TeacherClaim. A linked StaffProfile is **kept but
 * detached** (userId → null) so its attendance / referral / substitution /
 * message history is preserved — the profile is NOT deleted (several of its
 * relations would cascade and silently lose that history). Its timetable name
 * and homeroom/headteacher/counselor assignments are released so the role can
 * be re-claimed and referrals stop routing to it. A user that still owns its
 * own restricted activity (audit log, resolved referrals, substitution plans,
 * attendance exports, or a student/parent record with grades/attendance) is
 * refused atomically — nothing is partially deleted.
 */
export async function deleteUser(targetUserId: string): Promise<ActionResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Δεν επιτρέπεται" };

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, email: true, role: true, extraRoles: true },
  });
  if (!target) return { ok: false, error: "Ο χρήστης δεν βρέθηκε" };

  const check = validateUserDelete({
    actorId: auth.userId,
    targetId: targetUserId,
    targetPrimary: target.role,
    targetExtra: target.extraRoles,
    effectiveSuperAdmins: await countEffectiveSuperAdmins(),
  });
  if (!check.ok) return { ok: false, error: DELETE_ERRORS[check.error] };

  try {
    // Release the role and detach (do NOT delete) the staff profile so history
    // is preserved, then delete the login. Releasing = unlink timetable slots
    // and clear homeroom/headteacher/counselor assignments so the name can be
    // re-claimed and referrals stop routing here. Atomic: if the *user* still
    // owns restricted activity (audit log, resolved referrals, substitution
    // plans, attendance exports) the relation rolls it all back and the delete
    // is refused below — nothing is partially applied.
    await db.$transaction(async (tx) => {
      const profile = await tx.staffProfile.findUnique({
        where: { userId: targetUserId },
        select: { id: true },
      });
      if (profile) {
        await tx.timetableSlot.updateMany({ where: { staffId: profile.id }, data: { staffId: null } });
        await tx.group.updateMany({ where: { homeroomTeacherId: profile.id }, data: { homeroomTeacherId: null } });
        await tx.group.updateMany({ where: { homeroomHeadteacherId: profile.id }, data: { homeroomHeadteacherId: null } });
        await tx.group.updateMany({ where: { counselorId: profile.id }, data: { counselorId: null } });
        await tx.staffProfile.update({ where: { id: profile.id }, data: { userId: null } });
      }
      await tx.user.delete({ where: { id: targetUserId } });
    });
  } catch (e) {
    if (isForeignKeyError(e)) {
      return {
        ok: false,
        error:
          "Αυτός ο λογαριασμός έχει δική του δραστηριότητα στο σύστημα (αρχείο καταγραφής, διεκπεραιωμένες παραπομπές ή πλάνα αναπληρώσεων) και δεν μπορεί να διαγραφεί. Ανακαλέστε την πρόσβασή του αντί για διαγραφή.",
      };
    }
    throw e;
  }

  await writeAudit({
    userId: auth.userId,
    action: "user.delete",
    resource: "User",
    resourceId: targetUserId,
    details: { name: target.name, email: target.email, role: target.role },
    ...(await requestMeta()),
  });
  revalidateUsers();
  return { ok: true };
}

const GRANT_ERRORS: Record<string, string> = {
  errSelf: "Δεν μπορείτε να αλλάξετε τη δική σας πρόσβαση.",
  errAlreadyAdmin: "Αυτός ο χρήστης είναι ήδη διαχειριστής συστήματος.",
  errInactive: "Δεν είναι δυνατή η παραχώρηση πρόσβασης διαχειριστή σε ανενεργούς λογαριασμούς.",
};

const REVOKE_ERRORS: Record<string, string> = {
  errSelf: "Δεν μπορείτε να αλλάξετε τη δική σας πρόσβαση.",
  errPrimaryAdmin: "Ο κύριος ρόλος αυτού του χρήστη είναι Υπερδιαχειριστής — δεν μπορεί να ανακληθεί εδώ.",
  errNotGranted: "Αυτός ο χρήστης δεν έχει παραχωρημένη πρόσβαση διαχειριστή.",
  errLastSuperAdmin: "Αυτός είναι ο τελευταίος ενεργός διαχειριστής συστήματος — η πρόσβαση δεν μπορεί να ανακληθεί.",
};

/** Toggle the "substitution coordinator" designation. */
export async function setSubstitutionCoordinator(
  targetUserId: string,
  value: boolean
): Promise<ActionResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Δεν επιτρέπεται" };

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { staffProfile: { select: { id: true } } },
  });
  if (!target?.staffProfile) return { ok: false, error: "Δεν υπάρχει συνδεδεμένο προφίλ προσωπικού" };

  await db.staffProfile.update({
    where: { id: target.staffProfile.id },
    data: { substitutionCoordinator: value },
  });
  await writeAudit({
    userId: auth.userId,
    action: "staff.substitutionCoordinator",
    resource: "StaffProfile",
    resourceId: target.staffProfile.id,
    details: { value },
    ...(await requestMeta()),
  });
  revalidateUsers();
  return { ok: true };
}

/** Toggle the "ΔΔΚ coordinator" designation. */
export async function setDdkCoordinator(
  targetUserId: string,
  value: boolean
): Promise<ActionResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Δεν επιτρέπεται" };

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { staffProfile: { select: { id: true } } },
  });
  if (!target?.staffProfile) return { ok: false, error: "Δεν υπάρχει συνδεδεμένο προφίλ προσωπικού" };

  await db.staffProfile.update({
    where: { id: target.staffProfile.id },
    data: { ddkCoordinator: value },
  });
  await writeAudit({
    userId: auth.userId,
    action: "staff.ddkCoordinator",
    resource: "StaffProfile",
    resourceId: target.staffProfile.id,
    details: { value },
    ...(await requestMeta()),
  });
  revalidateUsers();
  return { ok: true };
}
