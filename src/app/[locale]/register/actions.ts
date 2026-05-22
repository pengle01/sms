"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import type { Role } from "@/generated/prisma";

const CLAIMABLE_ROLES: Role[] = ["TEACHER", "SCHOOL_ADMIN", "CHAPERONE"];

export async function registerAction(formData: FormData) {
  const name = ((formData.get("name") as string) ?? "").trim();
  const email = ((formData.get("email") as string) ?? "").toLowerCase().trim();
  const password = (formData.get("password") as string) ?? "";
  const confirm = (formData.get("confirmPassword") as string) ?? "";
  const role = (formData.get("role") as Role) ?? "";
  const staffName = ((formData.get("staffName") as string) ?? "").trim();
  const locale = ((formData.get("locale") as string) ?? "el");

  const base = `/${locale}/register`;

  if (!name || !email || !password) redirect(`${base}?error=errorGeneric`);
  if (password !== confirm) redirect(`${base}?error=errorPasswordMismatch`);
  if (!CLAIMABLE_ROLES.includes(role)) redirect(`${base}?error=errorInvalidRole`);

  if (role === "TEACHER") {
    if (!staffName) redirect(`${base}?error=errorStaffNameRequired`);
    // Verify the name exists in the timetable and hasn't been claimed
    const slot = await db.timetableSlot.findFirst({
      where: { staffName, staffId: null },
    });
    if (!slot) redirect(`${base}?error=errorStaffNameNotFound`);
    const existing = await db.teacherClaim.findFirst({
      where: { staffName, status: { not: "REJECTED" } },
    });
    if (existing) redirect(`${base}?error=errorStaffNameTaken`);
  }

  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) redirect(`${base}?error=errorEmailExists`);

  const passwordHash = await bcrypt.hash(password, 12);

  if (role === "TEACHER") {
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, email, passwordHash, role, isActive: false },
      });
      await tx.teacherClaim.create({
        data: { userId: user.id, staffName },
      });
    });
  } else {
    await db.user.create({
      data: { name, email, passwordHash, role, isActive: false },
    });
  }

  redirect(`${base}?success=1`);
}
