"use server";

import { db } from "@/server/db";
import { redirect } from "next/navigation";
import { Gender } from "@/generated/prisma/enums";
import { isOfficeAdmin, isAdminStaff } from "@/lib/rbac";
import { getActiveAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";

export async function updateStudent(id: string, locale: string, formData: FormData) {
  const auth = await getActiveAuth();
  // Effective roles: extra SUPER_ADMIN grants count.
  if (!auth || !auth.roles.some((r) => isOfficeAdmin(r) || isAdminStaff(r))) {
    throw new Error("Unauthorized");
  }

  const registryId    = (formData.get("studentId") as string).trim();
  const name          = (formData.get("name") as string).trim();
  const email         = (formData.get("email") as string).trim().toLowerCase();
  const groupId       = (formData.get("groupId") as string) || null;
  const gender        = (formData.get("gender") as string) || null;
  const dobRaw        = (formData.get("dateOfBirth") as string) || null;
  const placeOfBirth  = (formData.get("placeOfBirth") as string).trim() || null;
  const nationality   = (formData.get("nationality") as string).trim() || null;
  const address       = (formData.get("address") as string).trim() || null;
  const idCardNumber  = (formData.get("idCardNumber") as string).trim() || null;
  const passportNumber= (formData.get("passportNumber") as string).trim() || null;
  const isActive      = formData.get("isActive") === "true";

  const dateOfBirth = dobRaw ? new Date(dobRaw) : null;

  // Registry number is the unique import key — guard against collisions.
  const current = await db.studentProfile.findUnique({ where: { id }, select: { studentId: true } });
  if (registryId && current && registryId !== current.studentId) {
    const taken = await db.studentProfile.findUnique({ where: { studentId: registryId }, select: { id: true } });
    if (taken) throw new Error("Registry number already in use by another student.");
  }

  await db.studentProfile.update({
    where: { id },
    data: {
      ...(registryId ? { studentId: registryId } : {}),
      gender:         (gender === "MALE" || gender === "FEMALE") ? (gender as Gender) : null,
      dateOfBirth:    dateOfBirth ?? null,
      placeOfBirth:   placeOfBirth,
      nationality:    nationality,
      address:        address,
      idCardNumber:   idCardNumber,
      passportNumber: passportNumber,
      ...(groupId ? { group: { connect: { id: groupId } } } : { group: { disconnect: true } }),
      user: {
        update: {
          name,
          email,
          isActive,
        },
      },
    },
  });

  // Parents / guardians (imported). Update each linked profile that was edited.
  for (const role of ["FATHER", "MOTHER", "GUARDIAN"]) {
    const pid = (formData.get(`parent_${role}_id`) as string) || "";
    if (!pid) continue;
    const pName  = ((formData.get(`parent_${role}_name`)  as string) ?? "").trim();
    const pPhone = ((formData.get(`parent_${role}_phone`) as string) ?? "").trim();
    const pEmail = ((formData.get(`parent_${role}_email`) as string) ?? "").trim().toLowerCase();

    const parent = await db.parentProfile.findUnique({ where: { id: pid }, select: { userId: true } });
    if (!parent) continue;

    // Email change: never collide with another user's email.
    let emailUpdate: { email: string } | undefined;
    if (pEmail) {
      const other = await db.user.findUnique({ where: { email: pEmail }, select: { id: true } });
      if (other && other.id !== parent.userId) {
        throw new Error(`Email ${pEmail} is already in use by another account.`);
      }
      emailUpdate = { email: pEmail };
    }

    await db.parentProfile.update({
      where: { id: pid },
      data: {
        phone: pPhone || null,
        user: { update: { ...(pName ? { name: pName } : {}), ...(emailUpdate ?? {}) } },
      },
    });

    // Keep the student's SMS recipients in sync with the parent's phone.
    if (pPhone) {
      await db.smsContact.updateMany({ where: { studentId: id, parentProfileId: pid }, data: { phone: pPhone } });
    }
  }

  const meta = await requestMeta();
  await writeAudit({
    userId: auth.userId,
    action: "student.update",
    resource: "StudentProfile",
    resourceId: id,
    details: { fields: ["registryId", "name", "email", "group", "gender", "dob", "address", "idCard", "passport", "isActive", "parents"] },
    ...meta,
  });

  redirect(`/${locale}/admin/students/${id}`);
}
