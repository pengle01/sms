"use server";

import { db } from "@/server/db";
import { redirect } from "next/navigation";
import { Gender } from "@/generated/prisma/enums";
import { isOfficeAdmin, isAdminStaff } from "@/lib/rbac";
import { getActiveAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";

export async function updateStudent(id: string, locale: string, formData: FormData) {
  const auth = await getActiveAuth();
  if (!auth || (!isOfficeAdmin(auth.role) && !isAdminStaff(auth.role))) {
    throw new Error("Unauthorized");
  }

  const name          = (formData.get("name") as string).trim();
  const email         = (formData.get("email") as string).trim().toLowerCase();
  const groupId       = (formData.get("groupId") as string) || null;
  const gender        = (formData.get("gender") as string) || null;
  const dobRaw        = (formData.get("dateOfBirth") as string) || null;
  const placeOfBirth  = (formData.get("placeOfBirth") as string).trim() || null;
  const nationality   = (formData.get("nationality") as string).trim() || null;
  const idCardNumber  = (formData.get("idCardNumber") as string).trim() || null;
  const passportNumber= (formData.get("passportNumber") as string).trim() || null;
  const isActive      = formData.get("isActive") === "true";

  const dateOfBirth = dobRaw ? new Date(dobRaw) : null;

  await db.studentProfile.update({
    where: { id },
    data: {
      gender:         (gender === "MALE" || gender === "FEMALE") ? (gender as Gender) : null,
      dateOfBirth:    dateOfBirth ?? null,
      placeOfBirth:   placeOfBirth,
      nationality:    nationality,
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

  const meta = await requestMeta();
  await writeAudit({
    userId: auth.userId,
    action: "student.update",
    resource: "StudentProfile",
    resourceId: id,
    details: { fields: ["name", "email", "group", "gender", "dob", "idCard", "passport", "isActive"] },
    ...meta,
  });

  redirect(`/${locale}/admin/students/${id}`);
}
